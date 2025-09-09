const readline = require("readline");
const { connect, disconnect } = require("./src/db");
const { exploreTree } = require("./src/foreignKeys");
const { generateInsert, clearCache } = require("./src/insert");
const { 
    getRequiredColumns, 
    insertData, 
    findFKReference, 
    findTableInDatabase,
    discoverAllSchemas,
    analyzeTableStructure
} = require("./src/queries");
const { getDefaultValue } = require("./src/generateRandomValues");

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

// Função inteligente para inserir na tabela principal
async function insertMainTable(tableName, insertedIds) {
    console.log(`\n🎯 INSERINDO NA TABELA PRINCIPAL: ${tableName}`);
    
    try {
        // Descobre automaticamente onde está a tabela
        const tableInfo = await findTableInDatabase(tableName);
        
        if (!tableInfo) {
            console.error(`❌ Tabela '${tableName}' não encontrada no banco de dados`);
            return null;
        }
        
        const { schema, table } = tableInfo;
        console.log(`✅ Tabela encontrada: ${schema}.${table}`);
        
        // Analisa a estrutura da tabela
        const analysis = await analyzeTableStructure(schema, table);
        console.log(`📊 Análise da tabela:`);
        console.log(`   📋 Colunas obrigatórias: ${analysis.requiredColumns.length}`);
        console.log(`   🔗 Colunas FK: ${analysis.fkColumns.length}`);
        console.log(`   ⚡ Colunas auto-geradas: ${analysis.autoColumns.length}`);
        
        // Busca todas as colunas necessárias (obrigatórias + FKs importantes)
        const requiredCols = await getRequiredColumns(schema, table);
        
        if (requiredCols.length === 0) {
            console.log(`ℹ️ Nenhuma coluna precisa ser preenchida para ${schema}.${table}`);
            return null;
        }
        
        const columns = [];
        const values = [];
        
        for (const col of requiredCols) {
            let fkValue = null;
            
            // Descobre automaticamente se a coluna é FK
            const fkInfo = await findFKReference(schema, table, col.column_name);
            
            if (fkInfo) {
                const targetTable = `${fkInfo.target_schema}.${fkInfo.target_table}`;
                console.log(`🔍 FK detectado: ${col.column_name} -> ${targetTable}`);
                
                // Usa ID do cache se disponível
                if (insertedIds.has(targetTable) && insertedIds.get(targetTable).length > 0) {
                    const cachedIds = insertedIds.get(targetTable);
                    fkValue = cachedIds[Math.floor(Math.random() * cachedIds.length)];
                    console.log(`🔄 Usando ID do cache: ${fkValue}`);
                } else {
                    console.log(`⚠️ Nenhum ID disponível no cache para ${targetTable}`);
                }
            }
            
            columns.push(col.column_name);
            const value = getDefaultValue(col.data_type, fkValue, col.data_limit);
            values.push(value);
        }
        
        if (columns.length > 0) {
            console.log(`   📋 Inserindo colunas: ${columns.join(', ')}`);
            const insertResult = await insertData(schema, table, columns, values);
            return insertResult;
        }
        
    } catch (error) {
        console.error(`❌ Erro ao inserir na tabela principal ${tableName}:`, error.message);
        return { success: false, error: error.message };
    }
    
    return null;
}

async function main() {
    try {
        await connect();
        console.log("✅ Conectado ao banco de dados");
        
        // Descobre automaticamente a estrutura do banco
        console.log("🔍 Analisando estrutura do banco de dados...");
        const schemas = await discoverAllSchemas();
        console.log(`📊 Schemas encontrados: ${schemas.join(', ')}`);

        rl.question("Digite o nome da tabela inicial: ", async (table) => {
            if (!table?.trim()) {
                console.error("❌ Nome da tabela não pode estar vazio");
                await cleanup();
                return;
            }

            const tableName = table.trim();

            try {
                // Limpa cache antes de começar
                clearCache();
                
                console.log(`\n🎯 PROCESSANDO TABELA: ${tableName}`);
                
                // Verifica se a tabela existe
                const tableExists = await findTableInDatabase(tableName);
                if (!tableExists) {
                    console.error(`❌ Tabela '${tableName}' não foi encontrada no banco de dados`);
                    console.log(`💡 Verifique o nome da tabela e tente novamente`);
                    await cleanup();
                    return;
                }
                
                console.log(`🔍 Explorando dependências (FKs) da tabela...`);
                const tree = await exploreTree(tableName);
                
                let totalInserts = 0;
                let successfulInserts = 0;
                let failedInserts = 0;
                
                // Map para rastrear IDs inseridos
                const insertedIds = new Map();

                // FASE 1: Processar dependências se existirem
                if (tree.length > 0) {
                    console.log(`📊 Encontradas ${tree.length} dependências FK`);
                    console.log("\n🚀 FASE 1: Inserindo dependências...\n");
                    
                    for (const node of tree) {
                        console.log(`\n📋 Dependência: ${node.from_schema}.${node.from_table} -> ${node.to_schema}.${node.to_table}`);
                        
                        const results = await generateInsert(node);
                        totalInserts += results.length;
                        
                        results.forEach(result => {
                            if (result.success) {
                                successfulInserts++;
                                
                                // Armazena ID no map para usar na tabela principal
                                if (result.id && result.table) {
                                    if (!insertedIds.has(result.table)) {
                                        insertedIds.set(result.table, []);
                                    }
                                    insertedIds.get(result.table).push(result.id);
                                }
                            } else {
                                failedInserts++;
                            }
                        });
                    }
                } else {
                    console.log("ℹ️ Nenhuma dependência FK encontrada");
                }
                
                // FASE 2: Inserir na tabela principal
                console.log(`\n🚀 FASE 2: Inserindo na tabela principal...`);
                const mainResult = await insertMainTable(tableName, insertedIds);
                
                if (mainResult) {
                    totalInserts++;
                    if (mainResult.success) {
                        successfulInserts++;
                        console.log(`🎉 Tabela principal inserida com sucesso!`);
                        if (mainResult.id) {
                            console.log(`   🆔 ID gerado: ${mainResult.id}`);
                        }
                    } else {
                        failedInserts++;
                    }
                }
                
                // Relatório final
                console.log("\n" + "=".repeat(60));
                console.log("📊 RELATÓRIO FINAL");
                console.log("=".repeat(60));
                console.log(`🎯 Tabela alvo: ${tableName}`);
                console.log(`✅ INSERTs executados com sucesso: ${successfulInserts}`);
                console.log(`❌ INSERTs com falha: ${failedInserts}`);
                console.log(`📈 Total processado: ${totalInserts}`);
                
                if (successfulInserts > 0) {
                    const dependenciesCount = successfulInserts - (mainResult?.success ? 1 : 0);
                    const mainTableCount = mainResult?.success ? 1 : 0;
                    
                    console.log("\n🎊 RESUMO DOS SUCESSOS:");
                    if (dependenciesCount > 0) {
                        console.log(`   📋 Dependências inseridas: ${dependenciesCount}`);
                    }
                    if (mainTableCount > 0) {
                        console.log(`   🎯 Tabela principal inserida: ${mainTableCount}`);
                    }
                    console.log(`\n🚀 Total: ${successfulInserts} registros criados no banco!`);
                }
                
                if (failedInserts > 0) {
                    console.log(`\n⚠️ Atenção: ${failedInserts} INSERTs falharam`);
                    console.log(`💡 Verifique os logs acima para detalhes dos erros`);
                }
                
                console.log("=".repeat(60));
                
            } catch (err) {
                console.error("❌ Erro ao processar:", err.message);
                if (process.env.NODE_ENV === 'development') {
                    console.error(err.stack);
                }
            } finally {
                await cleanup();
            }
        });
    } catch (err) {
        console.error("❌ Erro na conexão:", err.message);
        process.exit(1);
    }
}

async function cleanup() {
    try {
        await disconnect();
        rl.close();
        console.log("\n👋 Sistema finalizado");
    } catch (err) {
        console.error("⚠️ Erro ao desconectar:", err.message);
    }
}

// Handle process termination gracefully
process.on('SIGINT', async () => {
    console.log('\n🛑 Interrompido pelo usuário');
    await cleanup();
    process.exit(0);
});

process.on('uncaughtException', async (err) => {
    console.error('💥 Erro não capturado:', err);
    await cleanup();
    process.exit(1);
});

main();