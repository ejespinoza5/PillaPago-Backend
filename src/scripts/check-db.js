const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });

const { closePool, testConnection } = require("../config/database");

async function run() {
  try {
    const result = await testConnection();
    console.log("Conexion exitosa a PostgreSQL");
    console.log("Base de datos:", result.db);
    console.log("Hora servidor:", result.now);
  } catch (error) {
    console.error("No se pudo conectar a PostgreSQL");
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    await closePool();
  }
}

run();
