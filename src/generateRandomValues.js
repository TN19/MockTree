// Generate UUID
function generateUUID() {
    return { raw: "gen_random_uuid()" };
}

// Generate random integer respecting bit limits
function generateInteger(bits = 32) {
    const safeBits = Math.max(1, Math.min(bits || 32, 31)); // Mais conservador para evitar overflow
    const max = Math.pow(2, safeBits - 1) - 1;
    const min = 1; // Sempre positivo para evitar problemas
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Generate decimal/numeric with precision
function generateNumeric(precision = 10, scale = 2) {
    const safePrec = Math.max(1, Math.min(precision || 10, 10));
    const safeScale = Math.max(0, Math.min(scale || 2, safePrec - 1));
    
    const integerPart = Math.pow(10, safePrec - safeScale - 1); // Mais conservador
    const randomNum = Math.random() * integerPart;
    return parseFloat(randomNum.toFixed(safeScale));
}

// Generate random string respecting length limit - MAIS CONSERVADOR
function generateString(limit = 10) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    
    // Limita o tamanho máximo para evitar strings muito grandes
    const maxLength = Math.min(limit || 10, 100);
    const minLength = Math.min(5, maxLength); // Pelo menos 5 caracteres
    
    const length = Math.floor(Math.random() * (maxLength - minLength + 1)) + minLength;
    
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

// Generate random boolean
function generateBoolean() {
    return Math.random() < 0.5;
}

// Generate current timestamp
function generateTimestamp() {
    return { raw: "NOW()" };
}

// Generate null value
function generateNull() {
    return { raw: "NULL" };
}

// Main function to get default value based on data type
function getDefaultValue(dataType, fkValue, limit) {
    // Se FK value é fornecido, usa ele (PRIORIDADE MÁXIMA)
    if (fkValue !== null && fkValue !== undefined) {
        console.log(`   🎯 Usando FK value: ${fkValue}`);
        return fkValue;
    }
    
    // Generate value based on data type
    const type = dataType?.toLowerCase() || 'unknown';
    
    switch (type) {
        case "uuid":
            return generateUUID();
            
        case "integer":
        case "int4":
            return generateInteger(32);
            
        case "bigint":
        case "int8":
            return generateInteger(63); // Mais conservador
            
        case "smallint":
        case "int2":
            return generateInteger(15);
            
        case "numeric":
        case "decimal":
            return generateNumeric(limit || 10, 2);
            
        case "character varying":
        case "varchar":
            return generateString(limit || 50);
            
        case "text":
            return generateString(Math.min(limit || 100, 200)); // Limita text muito grande
            
        case "char":
        case "character":
            return generateString(limit || 10);
            
        case "boolean":
        case "bool":
            return generateBoolean();
            
        case "timestamp":
        case "timestamp without time zone":
        case "timestamp with time zone":
        case "timestamptz":
        case "date":
            return generateTimestamp();
            
        case "json":
        case "jsonb":
            return '{"generated": true}'; // JSON mais válido
            
        case "array":
            return '{}';
            
        default:
            console.warn(`⚠️ Tipo de dados não reconhecido: ${dataType}, usando string genérica`);
            return generateString(10); // String ao invés de NULL para ser mais útil
    }
}

module.exports = { 
    generateUUID,
    generateInteger,
    generateNumeric, 
    generateString,
    generateBoolean,
    generateTimestamp,
    generateNull,
    getDefaultValue 
};