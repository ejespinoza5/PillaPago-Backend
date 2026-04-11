const { Pool } = require("pg");

let poolInstance;

function getDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL no esta definido en variables de entorno");
  }

  return databaseUrl;
}

function createPool() {
  const connectionString = getDatabaseUrl();

  return new Pool({
    connectionString,
    ssl: {
      rejectUnauthorized: false
    }
  });
}

function getPool() {
  if (!poolInstance) {
    poolInstance = createPool();
  }

  return poolInstance;
}

async function query(text, params = []) {
  return getPool().query(text, params);
}

async function closePool() {
  if (poolInstance) {
    await poolInstance.end();
    poolInstance = undefined;
  }
}

async function testConnection() {
  const result = await query("SELECT NOW() AS now, current_database() AS db");
  return result.rows[0];
}

module.exports = {
  closePool,
  getPool,
  createPool,
  query,
  testConnection
};
