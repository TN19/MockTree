const { client } = require("./db");

// ========================
// FUNÇÕES DE DESCOBERTA INTELIGENTE
// ========================

// Descobre todos os schemas não-sistema no banco
async function discoverAllSchemas() {
    const query = `
        SELECT schema_name 
        FROM information_schema.schemata 
        WHERE schema_name NOT IN (
            'information_schema', 
            'pg_catalog', 
            'pg_toast',
            'pg_temp_1',
            'pg_toast_temp_1'
        )
        ORDER BY schema_name;
    `;
    
    try {
        const res = await client.query(query);
        return res.rows.map(row => row.schema_name);
    } catch (error) {
        console.error('❌ Erro ao descobrir schemas:', error.message);
        return ['public']; // fallback
    }
}

// Encontra uma tabela em qualquer schema do banco
async function findTableInDatabase(tableName) {
    const query = `
        SELECT table_schema as schema, table_name as table
        FROM information_schema.tables
        WHERE table_name ILIKE $1
            AND table_schema NOT IN ('information_schema', 'pg_catalog')
            AND table_type = 'BASE TABLE'
        ORDER BY 
            CASE WHEN table_name = $1 THEN 1 ELSE 2 END,  -- Prioriza match exato
            table_schema;
    `;
    
    try {
        const res = await client.query(query, [tableName]);
        
        if (res.rows.length === 0) {
            return null;
        }
        
        // Se encontrou múltiplas, mostra as opções
        if (res.rows.length > 1) {
            console.log(`🔍 Múltiplas tabelas encontradas para '${tableName}':`);
            res.rows.forEach((row, index) => {
                console.log(`   ${index + 1}. ${row.schema}.${row.table}`);
            });
            console.log(`📌 Usando: ${res.rows[0].schema}.${res.rows[0].table}`);
        }
        
        return res.rows[0];
    } catch (error) {
        console.error(`❌ Erro ao procurar tabela ${tableName}:`, error.message);
        return null;
    }
}

// Analisa a estrutura completa de uma tabela
async function analyzeTableStructure(schema, table) {
    const query = `
        SELECT 
            column_name,
            data_type,
            is_nullable,
            column_default,
            character_maximum_length,
            numeric_precision,
            datetime_precision,
            CASE 
                WHEN column_default LIKE '%nextval%' THEN 'auto_increment'
                WHEN column_default LIKE '%gen_random_uuid%' THEN 'auto_uuid'
                WHEN column_default LIKE '%now()%' THEN 'auto_timestamp'
                WHEN column_default IS NOT NULL THEN 'has_default'
                ELSE 'no_default'
            END as default_type
        FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = $2
        ORDER BY ordinal_position;
    `;
    
    try {
        const res = await client.query(query, [schema, table]);
        
        const analysis = {
            totalColumns: res.rows.length,
            requiredColumns: res.rows.filter(col => 
                col.is_nullable === 'NO' && 
                !col.default_type.startsWith('auto_') && 
                col.default_type === 'no_default'
            ),
            fkColumns: [],
            autoColumns: res.rows.filter(col => col.default_type.startsWith('auto_')),
            optionalColumns: res.rows.filter(col => 
                col.is_nullable === 'YES' || 
                col.default_type !== 'no_default'
            )
        };
        
        // Descobre FKs da tabela
        const fkQuery = `
            SELECT DISTINCT kcu.column_name
            FROM information_schema.table_constraints AS tc
            JOIN information_schema.key_column_usage AS kcu
                ON tc.constraint_name = kcu.constraint_name
            WHERE tc.constraint_type = 'FOREIGN KEY'
                AND kcu.table_schema = $1
                AND kcu.table_name = $2;
        `;
        
        const fkRes = await client.query(fkQuery, [schema, table]);
        analysis.fkColumns = fkRes.rows.map(row => row.column_name);
        
        return analysis;
    } catch (error) {
        console.error(`❌ Erro ao analisar tabela ${schema}.${table}:`, error.message);
        return {
            totalColumns: 0,
            requiredColumns: [],
            fkColumns: [],
            autoColumns: [],
            optionalColumns: []
        };
    }
}

// ========================
// FUNÇÕES ORIGINAIS MELHORADAS
// ========================

async function typeScanner() {
    const query = `
        SELECT DISTINCT
            data_type,
            CASE 
                WHEN data_type IN ('character varying', 'varchar', 'character', 'char', 'text') 
                    THEN character_maximum_length
                WHEN data_type IN ('numeric', 'decimal', 'integer', 'bigint', 'smallint') 
                    THEN numeric_precision
                WHEN data_type IN ('timestamp', 'timestamp with time zone', 'timestamp without time zone', 'date') 
                    THEN datetime_precision
                ELSE NULL
            END AS data_limit
        FROM information_schema.columns
        WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
        ORDER BY data_type, data_limit;
    `;
    
    try {
        const res = await client.query(query);
        return res.rows;
    } catch (error) {
        console.error('❌ Erro no typeScanner:', error.message);
        throw error;
    }
}

async function getForeignKeys(table) {
    // Tenta encontrar a tabela primeiro
    const tableInfo = await findTableInDatabase(table);
    
    if (!tableInfo) {
        console.warn(`⚠️ Tabela '${table}' não encontrada para buscar FKs`);
        return [];
    }
    
    const query = `
        SELECT
            kcu.table_schema AS source_schema,
            kcu.table_name AS source_table,
            kcu.column_name AS source_column,
            ccu.table_schema AS target_schema,
            ccu.table_name AS target_table,
            ccu.column_name AS target_column,
            tc.constraint_name AS fk_name
        FROM information_schema.table_constraints AS tc
        JOIN information_schema.key_column_usage AS kcu
            ON tc.constraint_name = kcu.constraint_name
        JOIN information_schema.constraint_column_usage AS ccu
            ON tc.constraint_name = ccu.constraint_name
        WHERE tc.constraint_type = 'FOREIGN KEY'
            AND kcu.table_schema = $1
            AND kcu.table_name = $2;
    `;
    
    try {
        const res = await client.query(query, [tableInfo.schema, tableInfo.table]);
        return res.rows;
    } catch (error) {
        console.error(`❌ Erro ao buscar FKs da tabela ${table}:`, error.message);
        return [];
    }
}

// Descobre FK para uma coluna específica
async function findFKReference(schema, table, column) {
    const query = `
        SELECT
            kcu.table_schema AS source_schema,
            kcu.table_name AS source_table,
            kcu.column_name AS source_column,
            ccu.table_schema AS target_schema,
            ccu.table_name AS target_table,
            ccu.column_name AS target_column,
            tc.constraint_name AS fk_name
        FROM information_schema.table_constraints AS tc
        JOIN information_schema.key_column_usage AS kcu
            ON tc.constraint_name = kcu.constraint_name
        JOIN information_schema.constraint_column_usage AS ccu
            ON tc.constraint_name = ccu.constraint_name
        WHERE tc.constraint_type = 'FOREIGN KEY'
            AND kcu.table_schema = $1
            AND kcu.table_name = $2
            AND kcu.column_name = $3;
    `;
    
    try {
        const res = await client.query(query, [schema, table, column]);
        return res.rows.length > 0 ? res.rows[0] : null;
    } catch (error) {
        console.error(`❌ Erro ao descobrir FK para ${schema}.${table}.${column}:`, error.message);
        return null;
    }
}

// Busca colunas inteligente - adapta-se à estrutura da tabela
async function getRequiredColumns(schema, table) {
    const query = `
        SELECT 
            c.column_name, 
            c.data_type,
            CASE 
                WHEN c.data_type IN ('character varying', 'character', 'varchar', 'char') 
                    THEN c.character_maximum_length
                WHEN c.data_type IN ('numeric', 'decimal') 
                    THEN c.numeric_precision
                WHEN c.data_type IN ('integer') 
                    THEN 32
                WHEN c.data_type IN ('bigint') 
                    THEN 64
                WHEN c.data_type IN ('smallint') 
                    THEN 16
                WHEN c.data_type IN ('timestamp', 'timestamp with time zone', 'timestamp without time zone') 
                    THEN c.datetime_precision
                ELSE NULL
            END AS data_limit,
            c.column_default,
            c.is_nullable,
            CASE 
                WHEN fk.column_name IS NOT NULL THEN 'fk'
                WHEN c.is_nullable = 'NO' AND c.column_default IS NULL THEN 'required'
                ELSE 'optional'
            END as column_type
        FROM information_schema.columns c
        LEFT JOIN (
            SELECT DISTINCT kcu.column_name
            FROM information_schema.table_constraints AS tc
            JOIN information_schema.key_column_usage AS kcu
                ON tc.constraint_name = kcu.constraint_name
            WHERE tc.constraint_type = 'FOREIGN KEY'
                AND kcu.table_schema = $1
                AND kcu.table_name = $2
        ) fk ON c.column_name = fk.column_name
        WHERE c.table_schema = $1
            AND c.table_name = $2
            AND (
                (c.is_nullable = 'NO' AND c.column_default IS NULL) OR  -- Colunas obrigatórias
                fk.column_name IS NOT NULL  -- Todas as FKs
            )
        ORDER BY 
            CASE 
                WHEN c.column_name ILIKE '%id' AND c.data_type = 'uuid' THEN 1  -- IDs primeiro
                WHEN fk.column_name IS NOT NULL THEN 2  -- FKs depois
                ELSE 3  -- Outros por último
            END,
            c.column_name;
    `;
    
    try {
        const res = await client.query(query, [schema, table]);
        
        console.log(`📋 Colunas necessárias para ${schema}.${table}:`);
        res.rows.forEach(row => {
            const icon = row.column_type === 'fk' ? '🔗' : 
                        row.column_type === 'required' ? '❗' : '📝';
            const type = row.column_type === 'fk' ? 'FK' : 
                        row.column_type === 'required' ? 'Obrigatória' : 'Opcional';
            console.log(`   ${icon} ${type}: ${row.column_name} (${row.data_type})`);
        });
        
        return res.rows;
    } catch (error) {
        console.error(`❌ Erro ao buscar colunas de ${schema}.${table}:`, error.message);
        throw error;
    }
}

// Busca ID aleatório - inteligente para diferentes convenções
async function getRandomId(schema, table) {
    // Lista de possíveis nomes de coluna ID
    const idColumnNames = ['Id', 'id', 'ID', `${table}Id`, `${table}_id`, 'uuid', 'pk'];
    
    for (const idCol of idColumnNames) {
        try {
            const query = `SELECT "${idCol}" as Id FROM "${schema}"."${table}" ORDER BY random() LIMIT 1;`;
            const res = await client.query(query);
            
            if (res.rows && res.rows.length > 0) {
                return res.rows;
            }
        } catch (error) {
            // Tenta próximo nome de coluna
            continue;
        }
    }
    
    // Se não encontrou nenhuma coluna ID específica, pega a primeira coluna da primeira linha
    try {
        const query = `SELECT * FROM "${schema}"."${table}" ORDER BY random() LIMIT 1;`;
        const res = await client.query(query);
        
        if (res.rows && res.rows.length > 0) {
            const firstColumn = Object.keys(res.rows[0])[0];
            return [{ Id: res.rows[0][firstColumn] }];
        }
    } catch (error) {
        console.error(`❌ Erro final ao buscar ID em ${schema}.${table}:`, error.message);
    }
    
    console.warn(`⚠️ Nenhum registro encontrado em ${schema}.${table}`);
    return [];
}

// Verifica se tabela tem dados
async function tableHasData(schema, table) {
    try {
        const res = await client.query(`SELECT 1 FROM "${schema}"."${table}" LIMIT 1;`);
        return res.rows.length > 0;
    } catch (error) {
        console.error(`❌ Erro ao verificar dados em ${schema}.${table}:`, error.message);
        return false;
    }
}

// Executa INSERT com tratamento inteligente de erros
async function insertData(schema, table, columns, values) {
    const insertColumns = [];
    const placeholders = [];
    const queryValues = [];
    
    values.forEach((val, i) => {
        insertColumns.push(`"${columns[i]}"`);
        
        // Handle raw SQL values (like functions)
        if (val && typeof val === "object" && val.raw) {
            placeholders.push(val.raw);
        } else if (val === null || val === undefined) {
            placeholders.push("NULL");
        } else {
            queryValues.push(val);
            placeholders.push(`$${queryValues.length}`);
        }
    });

    const insertSQL = `INSERT INTO "${schema}"."${table}" (${insertColumns.join(", ")}) VALUES (${placeholders.join(", ")}) RETURNING *;`;
    
    try {
        console.log(`📝 Executando INSERT em: ${schema}.${table}`);
        
        const result = await client.query(insertSQL, queryValues);
        
        if (result.rows && result.rows.length > 0) {
            // Tenta encontrar a coluna ID dinamicamente
            const row = result.rows[0];
            let insertedId = null;
            
            // Procura por diferentes padrões de ID
            const idPatterns = ['Id', 'id', 'ID', `${table}Id`, `${table}_id`];
            for (const pattern of idPatterns) {
                if (row[pattern] !== undefined) {
                    insertedId = row[pattern];
                    break;
                }
            }
            
            // Se não encontrou, usa a primeira coluna
            if (!insertedId) {
                const firstColumn = Object.keys(row)[0];
                insertedId = row[firstColumn];
            }
            
            console.log(`✅ INSERT executado com sucesso! ID: ${insertedId}`);
            return { 
                success: true, 
                id: insertedId, 
                sql: insertSQL, 
                table: `${schema}.${table}`,
                data: row
            };
        } else {
            console.log(`✅ INSERT executado com sucesso!`);
            return { success: true, sql: insertSQL, table: `${schema}.${table}` };
        }
    } catch (error) {
        console.error(`❌ Erro ao executar INSERT em ${schema}.${table}:`);
        console.error(`   🚨 Erro: ${error.message}`);
        
        // Análise inteligente do erro
        if (error.code === '23503') {
            console.error(`   💡 Problema de Foreign Key`);
            if (error.detail) {
                console.error(`   🔍 Detalhe: ${error.detail}`);
            }
        } else if (error.code === '23505') {
            console.error(`   💡 Violação de constraint UNIQUE`);
        } else if (error.code === '23514') {
            console.error(`   💡 Violação de constraint CHECK`);
        }
        
        return { 
            success: false, 
            error: error.message, 
            sql: insertSQL, 
            table: `${schema}.${table}`,
            errorCode: error.code
        };
    }
}

module.exports = { 
    // Funções de descoberta
    discoverAllSchemas,
    findTableInDatabase,
    analyzeTableStructure,
    
    // Funções principais
    typeScanner, 
    getForeignKeys, 
    getRequiredColumns, 
    getRandomId, 
    insertData,
    findFKReference,
    tableHasData
};