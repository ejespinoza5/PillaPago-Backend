const { query } = require("../config/database");

async function upsertDeviceTokenRecord({ idUsuario, token, plataforma }) {
  const result = await query(
    `INSERT INTO device_tokens (id_usuario, token, plataforma, activo)
     VALUES ($1, $2, $3, true)
     ON CONFLICT (id_usuario, token)
     DO UPDATE SET
       plataforma = EXCLUDED.plataforma,
       activo = true,
       updated_at = CURRENT_TIMESTAMP
     RETURNING *`,
    [idUsuario, token, plataforma]
  );

  return result.rows[0];
}

async function deactivateDeviceTokenRecord({ idUsuario, token }) {
  const result = await query(
    `UPDATE device_tokens
     SET activo = false,
         updated_at = CURRENT_TIMESTAMP
     WHERE id_usuario = $1
       AND token = $2
       AND activo = true`,
    [idUsuario, token]
  );

  return result.rowCount;
}

async function listActiveDeviceTokensByUsuario(idUsuario) {
  const result = await query(
    `SELECT id_device_token, id_usuario, token, plataforma, activo, created_at, updated_at
     FROM device_tokens
     WHERE id_usuario = $1
       AND activo = true
     ORDER BY updated_at DESC, id_device_token DESC`,
    [idUsuario]
  );

  return result.rows;
}

module.exports = {
  deactivateDeviceTokenRecord,
  listActiveDeviceTokensByUsuario,
  upsertDeviceTokenRecord
};
