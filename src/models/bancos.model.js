const { query } = require("../config/database");

async function listBancosRecords() {
  const result = await query(
    `SELECT id_banco, nombre_banco
     FROM bancos
     ORDER BY nombre_banco ASC`
  );

  return result.rows;
}

module.exports = {
  listBancosRecords
};