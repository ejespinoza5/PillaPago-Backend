const { query } = require("../config/database");

async function listUsuariosRecords({ idNegocio }) {
  const params = [];
  let whereClause = "";

  if (Number.isInteger(idNegocio)) {
    params.push(idNegocio);
    whereClause = "WHERE id_negocio = $1";
  }

  const result = await query(
    `SELECT id_usuario, nombre, email, email_verificado, google_id, foto_perfil_url, rol, id_negocio, fecha_registro
     FROM usuarios
     ${whereClause}
     ORDER BY id_usuario DESC`,
    params
  );

  return result.rows;
}

async function getUsuarioById(idUsuario) {
  const result = await query(
    `SELECT id_usuario, nombre, email, email_verificado, google_id, foto_perfil_url, rol, id_negocio, fecha_registro
     FROM usuarios
     WHERE id_usuario = $1`,
    [idUsuario]
  );

  return result.rows[0] || null;
}

async function getOwnerByNegocioId(idNegocio) {
  const result = await query(
    `SELECT id_usuario, nombre, email, email_verificado, google_id, foto_perfil_url, rol, id_negocio, fecha_registro
     FROM usuarios
     WHERE id_negocio = $1
       AND rol = 'dueno'
     ORDER BY id_usuario ASC
     LIMIT 1`,
    [idNegocio]
  );

  return result.rows[0] || null;
}

async function getUsuarioProfileById(idUsuario) {
  const result = await query(
    `SELECT
       u.id_usuario,
       u.nombre,
       u.email,
       u.email_verificado,
       u.google_id,
       u.foto_perfil_url,
       u.rol,
       u.id_negocio,
       u.fecha_registro,
       n.nombre_negocio,
       CASE
         WHEN u.rol = 'dueno' THEN n.codigo_invitacion
         ELSE NULL
       END AS codigo_negocio,
       COALESCE(stats.total_transferencias, 0) AS total_transferencias,
       COALESCE(stats.total_monto, 0) AS total_monto_transferencias,
       COALESCE(stats.transferencias_hoy, 0) AS transferencias_hoy,
       COALESCE(stats.monto_hoy, 0) AS monto_hoy,
       COALESCE(stats.transferencias_mes_actual, 0) AS transferencias_mes_actual,
       COALESCE(stats.monto_mes_actual, 0) AS monto_mes_actual,
       stats.ultima_transferencia_fecha
     FROM usuarios u
     LEFT JOIN negocios n ON n.id_negocio = u.id_negocio
     LEFT JOIN LATERAL (
       SELECT
         COUNT(*)::int AS total_transferencias,
         COALESCE(SUM(t.monto), 0)::numeric AS total_monto,
         COUNT(*) FILTER (
           WHERE DATE(t.fecha_transferencia) = CURRENT_DATE
         )::int AS transferencias_hoy,
         COALESCE(SUM(t.monto) FILTER (
           WHERE DATE(t.fecha_transferencia) = CURRENT_DATE
         ), 0)::numeric AS monto_hoy,
         COUNT(*) FILTER (
           WHERE date_trunc('month', t.fecha_transferencia) = date_trunc('month', NOW())
         )::int AS transferencias_mes_actual,
         COALESCE(SUM(t.monto) FILTER (
           WHERE date_trunc('month', t.fecha_transferencia) = date_trunc('month', NOW())
         ), 0)::numeric AS monto_mes_actual,
         MAX(t.fecha_transferencia) AS ultima_transferencia_fecha
       FROM transferencias t
       WHERE t.estado = 'ACTIVO'
         AND (
           (u.rol = 'dueno' AND u.id_negocio IS NOT NULL AND t.id_negocio = u.id_negocio)
           OR (u.rol <> 'dueno' AND t.id_usuario = u.id_usuario)
         )
     ) stats ON true
     WHERE u.id_usuario = $1`,
    [idUsuario]
  );

  return result.rows[0] || null;
}

async function createUsuarioRecord({ nombre, email, rol, idNegocio, passwordHash }) {
  const result = await query(
    `INSERT INTO usuarios (nombre, email, email_verificado, rol, id_negocio, password_hash, foto_perfil_url)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id_usuario, nombre, email, email_verificado, google_id, foto_perfil_url, rol, id_negocio, fecha_registro`,
    [nombre, email, false, rol, idNegocio, passwordHash, null]
  );

  return result.rows[0];
}

async function createUsuarioEmailRecord({ nombre, email, rol, idNegocio, passwordHash, fotoPerfilUrl }) {
  const result = await query(
    `INSERT INTO usuarios (nombre, email, email_verificado, rol, id_negocio, password_hash, foto_perfil_url)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id_usuario, nombre, email, email_verificado, google_id, foto_perfil_url, rol, id_negocio, fecha_registro`,
    [nombre, email, false, rol, idNegocio, passwordHash, fotoPerfilUrl]
  );

  return result.rows[0];
}

async function updateUsuarioRecord(idUsuario, { nombre, fotoPerfilUrl, rol, idNegocio }) {
  const result = await query(
    `UPDATE usuarios
     SET nombre = COALESCE($2, nombre),
         foto_perfil_url = COALESCE($3, foto_perfil_url),
         rol = COALESCE($4, rol),
         id_negocio = COALESCE($5, id_negocio)
     WHERE id_usuario = $1
     RETURNING id_usuario, nombre, email, email_verificado, google_id, foto_perfil_url, rol, id_negocio, fecha_registro`,
    [idUsuario, nombre, fotoPerfilUrl, rol, idNegocio]
  );

  return result.rows[0] || null;
}

async function upsertGoogleUsuario({ nombre, email, googleId, fotoPerfilUrl, rol, idNegocio }) {
  const result = await query(
    `INSERT INTO usuarios (nombre, email, email_verificado, google_id, foto_perfil_url, rol, id_negocio)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (email)
     DO UPDATE SET
       nombre = EXCLUDED.nombre,
       email_verificado = true,
       google_id = EXCLUDED.google_id,
       foto_perfil_url = COALESCE(EXCLUDED.foto_perfil_url, usuarios.foto_perfil_url),
       rol = CASE
         WHEN usuarios.rol = 'pendiente' THEN EXCLUDED.rol
         ELSE usuarios.rol
       END,
       id_negocio = COALESCE(usuarios.id_negocio, EXCLUDED.id_negocio)
     RETURNING id_usuario, nombre, email, email_verificado, google_id, foto_perfil_url, rol, id_negocio, fecha_registro`,
    [nombre, email, true, googleId, fotoPerfilUrl, rol, idNegocio]
  );

  return result.rows[0];
}

async function assignUsuarioToNegocio({ idUsuario, idNegocio, rol }) {
  const result = await query(
    `UPDATE usuarios
     SET id_negocio = $2,
         rol = $3
     WHERE id_usuario = $1
     RETURNING id_usuario, nombre, email, email_verificado, google_id, foto_perfil_url, rol, id_negocio, fecha_registro`,
    [idUsuario, idNegocio, rol]
  );

  return result.rows[0] || null;
}

async function getUsuarioAuthByEmail(email) {
  const result = await query(
    `SELECT id_usuario, nombre, email, email_verificado, google_id, password_hash, foto_perfil_url, rol, id_negocio, fecha_registro
     FROM usuarios
     WHERE email = $1`,
    [email]
  );

  return result.rows[0] || null;
}

async function getUsuarioAuthById(idUsuario) {
  const result = await query(
    `SELECT id_usuario, nombre, email, email_verificado, google_id, password_hash, foto_perfil_url, rol, id_negocio, fecha_registro
     FROM usuarios
     WHERE id_usuario = $1`,
    [idUsuario]
  );

  return result.rows[0] || null;
}

async function updateUsuarioFotoPerfil(idUsuario, fotoPerfilUrl) {
  const result = await query(
    `UPDATE usuarios
     SET foto_perfil_url = $2
     WHERE id_usuario = $1
     RETURNING id_usuario, nombre, email, email_verificado, google_id, foto_perfil_url, rol, id_negocio, fecha_registro`,
    [idUsuario, fotoPerfilUrl]
  );

  return result.rows[0] || null;
}

async function storeRefreshTokenRecord({ idUsuario, tokenHash, expiresAt }) {
  const result = await query(
    `INSERT INTO refresh_tokens (id_usuario, token_hash, expires_at)
     VALUES ($1, $2, $3)
     RETURNING id_refresh_token, id_usuario, token_hash, expires_at, revoked_at, created_at`,
    [idUsuario, tokenHash, expiresAt]
  );

  return result.rows[0];
}

async function getActiveRefreshTokenRecord({ idUsuario, tokenHash }) {
  const result = await query(
    `SELECT id_refresh_token, id_usuario, token_hash, expires_at, revoked_at, created_at
     FROM refresh_tokens
     WHERE id_usuario = $1
       AND token_hash = $2
       AND revoked_at IS NULL
       AND expires_at > NOW()
     LIMIT 1`,
    [idUsuario, tokenHash]
  );

  return result.rows[0] || null;
}

async function revokeRefreshTokenRecord(tokenHash) {
  const result = await query(
    `UPDATE refresh_tokens
     SET revoked_at = COALESCE(revoked_at, NOW())
     WHERE token_hash = $1
     RETURNING id_refresh_token`,
    [tokenHash]
  );

  return result.rowCount;
}

async function revokeAllRefreshTokensForUser(idUsuario) {
  const result = await query(
    `UPDATE refresh_tokens
     SET revoked_at = COALESCE(revoked_at, NOW())
     WHERE id_usuario = $1`,
    [idUsuario]
  );

  return result.rowCount;
}

async function verifyUsuarioEmail(idUsuario) {
  const result = await query(
    `UPDATE usuarios
     SET email_verificado = true
     WHERE id_usuario = $1
     RETURNING id_usuario, nombre, email, email_verificado, google_id, foto_perfil_url, rol, id_negocio, fecha_registro`,
    [idUsuario]
  );

  return result.rows[0] || null;
}

async function updateUsuarioPassword(idUsuario, passwordHash) {
  const result = await query(
    `UPDATE usuarios
     SET password_hash = $2
     WHERE id_usuario = $1
     RETURNING id_usuario`,
    [idUsuario, passwordHash]
  );

  return result.rows[0] || null;
}

async function updateUsuarioEmail(idUsuario, email) {
  const result = await query(
    `UPDATE usuarios
     SET email = $2,
         email_verificado = true
     WHERE id_usuario = $1
     RETURNING id_usuario, nombre, email, email_verificado, google_id, foto_perfil_url, rol, id_negocio, fecha_registro`,
    [idUsuario, email]
  );

  return result.rows[0] || null;
}

module.exports = {
  assignUsuarioToNegocio,
  createUsuarioEmailRecord,
  createUsuarioRecord,
  getActiveRefreshTokenRecord,
  getUsuarioAuthById,
  getUsuarioAuthByEmail,
  getUsuarioById,
  getOwnerByNegocioId,
  getUsuarioProfileById,
  listUsuariosRecords,
  revokeAllRefreshTokensForUser,
  revokeRefreshTokenRecord,
  storeRefreshTokenRecord,
  updateUsuarioEmail,
  updateUsuarioFotoPerfil,
  updateUsuarioPassword,
  updateUsuarioRecord,
  verifyUsuarioEmail,
  upsertGoogleUsuario
};
