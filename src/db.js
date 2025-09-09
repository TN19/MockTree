const { Client } = require("pg");
require("dotenv").config();

const client = new Client({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  port: parseInt(process.env.DB_PORT, 10),
  //ssl: { rejectUnauthorized: false },
});

async function connect() {
  await client.connect();
}

async function disconnect() {
  await client.end();
}

module.exports = { client, connect, disconnect };
