const { getForeignKeys } = require("./queries");

async function exploreTree(table, visited = new Set(), depth = 0, maxDepth = 10) {
    // Prevent infinite recursion
    if (depth > maxDepth) {
        console.warn(`⚠️ Profundidade máxima (${maxDepth}) atingida para tabela: ${table}`);
        return [];
    }

    try {
        const fks = await getForeignKeys(table);
        const result = [];

        for (const fk of fks) {
            const key = `${fk.source_schema}.${fk.source_table}->${fk.target_schema}.${fk.target_table}`;
            
            if (!visited.has(key)) {
                visited.add(key);

                const node = {
                    from_schema: fk.source_schema,
                    from_table: fk.source_table,
                    from_column: fk.source_column,
                    to_schema: fk.target_schema,
                    to_table: fk.target_table,
                    to_column: fk.target_column,
                    children: [],
                    depth: depth
                };

                // Recursively explore target table
                node.children = await exploreTree(fk.target_table, visited, depth + 1, maxDepth);
                result.push(node);
            }
        }

        return result;
    } catch (error) {
        console.error(`❌ Erro ao explorar FKs da tabela ${table}:`, error.message);
        return [];
    }
}

module.exports = { exploreTree };