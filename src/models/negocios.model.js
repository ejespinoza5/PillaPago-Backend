const { query } = require("../config/database");

async function listNegociosRecords() {
  const result = await query(
    `SELECT id_negocio, nombre_negocio, codigo_invitacion, fecha_creacion
     FROM negocios
     ORDER BY id_negocio DESC`
  );

  return result.rows;
}

async function getNegocioById(idNegocio) {
  const result = await query(
    `SELECT id_negocio, nombre_negocio, codigo_invitacion, fecha_creacion
     FROM negocios
     WHERE id_negocio = $1`,
    [idNegocio]
  );

  return result.rows[0] || null;
}

async function getNegocioByCodigoInvitacion(codigoInvitacion) {
  const result = await query(
    `SELECT id_negocio, nombre_negocio, codigo_invitacion, fecha_creacion
     FROM negocios
     WHERE codigo_invitacion = $1`,
    [codigoInvitacion]
  );

  return result.rows[0] || null;
}

async function createNegocioRecord({ nombreNegocio, codigoInvitacion }) {
  const result = await query(
    `INSERT INTO negocios (nombre_negocio, codigo_invitacion)
     VALUES ($1, $2)
     RETURNING id_negocio, nombre_negocio, codigo_invitacion, fecha_creacion`,
    [nombreNegocio, codigoInvitacion]
  );

  return result.rows[0];
}

module.exports = {
  createNegocioRecord,
  getNegocioByCodigoInvitacion,
  getNegocioById,
  listNegociosRecords
};
