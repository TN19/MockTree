const { connect, disconnect } = require("./src/db");
const { typeScanner } = require("./src/queries");

async function main() {
    await connect();
    try {
        console.log(await typeScanner())
    } catch (err) {
        console.error("Erro:", err);
    } finally {
        await disconnect();
    }
}

main();