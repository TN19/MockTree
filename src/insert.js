const { getRequiredColumns, getRandomId, insertData, findFKReference } = require("./queries");
const { getDefaultValue } = require("./generateRandomValues");

// Cache para armazenar IDs inseridos durante a execução
const insertedIds = new Map(); // key: "schema.table", value: [ids...]

// Sistema inteligente de mapeamento de colunas FK
// Adicione aqui casos específicos conforme necessário
const intelligentColumnMapping = new Map([
    // Exemplo: nome da coluna FK -> nome da coluna PK referenciada
    ['EstadoCivilCaracteristicaId', 'CaracteristicaId'],
    ['EstadoCaracteristicaId', 'CaracteristicaId'],
    ['TipoCaracteristicaId', 'CaracteristicaId'],
    // Sistema vai tentar descobrir automaticamente outros casos
]);

// Função inteligente para descobrir relacionamentos FK
function findChildNodeIntelligent(node, schema, table, column) {
    // Busca direta na árvore
    const directResult = findChildNodeDirect(node, schema, table, column);
    if (directResult) return directResult;
    
    // Busca com mapeamento inteligente
    const mappedColumn = intelligentColumnMapping.get(column);
    if (mappedColumn) {
        console.log(`🧠 Mapeamento inteligente: ${column} -> ${mappedColumn}`);
        const mappedResult = findChildNodeDirect(node, schema, table, mappedColumn);
        if (mappedResult) return mappedResult;
    }
    
    // Busca por padrões comuns (remove sufixos Id, _Id, etc.)
    const patterns = [
        column.replace(/Id$/, ''),
        column.replace(/_[Ii]d$/, ''),
        column.replace(/[Ii]d$/, ''),
    ];
    
    for (const pattern of patterns) {
        if (pattern !== column && pattern.length > 2) {
            const patternResult = findChildNodeDirect(node, schema, table, pattern);
            if (patternResult) {
                console.log(`🔍 Padrão descoberto: ${column} -> ${pattern}`);
                return patternResult;
            }
        }
    }
    
    return null;
}

// Busca direta na árvore de nós
function findChildNodeDirect(node, schema, table, column) {
    const searchQueue = [...(node.children || [])];
    
    while (searchQueue.length > 0) {
        const child = searchQueue.shift();
        
        if (child.from_schema === schema && 
            child.from_table === table && 
            child.from_column === column) {
            return child;
        }
        
        // Adiciona filhos à fila de busca (busca em largura)
        if (child.children) {
            searchQueue.push(...child.children);
        }
    }
    
    return null;
}

// Função inteligente para resolver FK
async function resolveForeignKeyIntelligent(column_name, schema, table, childNode) {
    let fkValue = null;
    
    try {
        if (childNode) {
            const targetTable = `${childNode.to_schema}.${childNode.to_table}`;
            
            // 1. Prioridade: IDs inseridos nesta execução
            if (insertedIds.has(targetTable) && insertedIds.get(targetTable).length > 0) {
                const cachedIds = insertedIds.get(targetTable);
                fkValue = cachedIds[Math.floor(Math.random() * cachedIds.length)];
                console.log(`🔄 Cache hit: ${column_name} = ${fkValue}`);
            } 
            // 2. Busca no banco
            else {
                const randomIdResult = await getRandomId(childNode.to_schema, childNode.to_table);
                if (randomIdResult.length > 0) {
                    fkValue = randomIdResult[0].Id;
                    console.log(`🔗 DB hit: ${column_name} = ${fkValue}`);
                }
            }
        } 
        // 3. Descoberta automática via constraints
        else {
            console.log(`🔍 Auto-descobrindo FK para: ${column_name}`);
            const fkInfo = await findFKReference(schema, table, column_name);
            
            if (fkInfo) {
                console.log(`🎯 FK descoberto: ${column_name} -> ${fkInfo.target_schema}.${fkInfo.target_table}.${fkInfo.target_column}`);
                
                const targetTable = `${fkInfo.target_schema}.${fkInfo.target_table}`;
                
                // Verifica cache primeiro
                if (insertedIds.has(targetTable) && insertedIds.get(targetTable).length > 0) {
                    const cachedIds = insertedIds.get(targetTable);
                    fkValue = cachedIds[Math.floor(Math.random() * cachedIds.length)];
                    console.log(`🔄 Cache hit (descoberto): ${column_name} = ${fkValue}`);
                } else {
                    // Busca no banco
                    const randomIdResult = await getRandomId(fkInfo.target_schema, fkInfo.target_table);
                    if (randomIdResult.length > 0) {
                        fkValue = randomIdResult[0].Id;
                        console.log(`🔗 DB hit (descoberto): ${column_name} = ${fkValue}`);
                    } else {
                        console.warn(`⚠️ Tabela ${targetTable} está vazia - FK será NULL`);
                    }
                }
            } else {
                console.log(`ℹ️ Nenhum FK encontrado para ${column_name} - valor será gerado`);
            }
        }
    } catch (error) {
        console.error(`❌ Erro ao resolver FK para ${column_name}:`, error.message);
    }
    
    return fkValue;
}

async function generateInsert(node) {
    const results = [];
    
    try {
        // Processa filhos primeiro (ordem de dependência)
        for (const child of node.children || []) {
            const childResults = await generateInsert(child);
            results.push(...childResults);
        }

        // Insere tabela atual
        const requiredCols = await getRequiredColumns(node.to_schema, node.to_table);
        
        if (requiredCols.length === 0) {
            console.log(`ℹ️ Nenhuma coluna necessária para ${node.to_schema}.${node.to_table}`);
            return results;
        }

        console.log(`\n🚀 Preparando INSERT: ${node.to_schema}.${node.to_table}`);
        
        const columns = [];
        const values = [];

        for (const col of requiredCols) {
            // Resolve FK de forma inteligente
            const childNode = findChildNodeIntelligent(node, node.to_schema, node.to_table, col.column_name);
            const fkValue = await resolveForeignKeyIntelligent(col.column_name, node.to_schema, node.to_table, childNode);

            columns.push(col.column_name);
            const value = getDefaultValue(col.data_type, fkValue, col.data_limit);
            values.push(value);
        }

        if (columns.length > 0) {
            console.log(`   📝 Executando: ${columns.length} colunas`);
            
            // Executa INSERT
            const insertResult = await insertData(node.to_schema, node.to_table, columns, values);
            
            // Armazena ID no cache se bem-sucedido
            if (insertResult.success && insertResult.id) {
                const tableKey = `${node.to_schema}.${node.to_table}`;
                if (!insertedIds.has(tableKey)) {
                    insertedIds.set(tableKey, []);
                }
                insertedIds.get(tableKey).push(insertResult.id);
                console.log(`💾 ID cached: ${tableKey} = ${insertResult.id}`);
            }
            
            results.push(insertResult);
            
            // Pausa para não sobrecarregar o banco
            await new Promise(resolve => setTimeout(resolve, 50));
        }

    } catch (error) {
        console.error(`❌ Erro ao processar ${node.to_schema}.${node.to_table}:`, error.message);
        // Continua processando outras tabelas
        results.push({ 
            success: false, 
            error: error.message, 
            table: `${node.to_schema}.${node.to_table}`
        });
    }

    return results;
}

// Limpa cache (útil para reinicializações)
function clearCache() {
    const size = insertedIds.size;
    insertedIds.clear();
    if (size > 0) {
        console.log(`🧹 Cache limpo (${size} tabelas)`);
    }
}

// Adiciona mapeamento personalizado dinamicamente
function addColumnMapping(sourceColumn, targetColumn) {
    intelligentColumnMapping.set(sourceColumn, targetColumn);
    console.log(`🔧 Mapeamento adicionado: ${sourceColumn} -> ${targetColumn}`);
}

// Mostra estatísticas do cache
function showCacheStats() {
    console.log(`📊 Cache Statistics:`);
    console.log(`   📋 Tabelas no cache: ${insertedIds.size}`);
    
    for (const [table, ids] of insertedIds.entries()) {
        console.log(`   🔢 ${table}: ${ids.length} IDs`);
    }
}

module.exports = { 
    generateInsert, 
    clearCache, 
    addColumnMapping,
    showCacheStats
};