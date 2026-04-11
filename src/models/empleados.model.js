const { query } = require("../config/database");

async function countActiveEmployeesByNegocio(idNegocio) {
  const result = await query(
    `SELECT COUNT(*)::int AS total
     FROM usuarios u
     WHERE u.id_negocio = $1
       AND u.rol = 'empleado'
       AND u.estado = 'activo'`,
    [idNegocio]
  );

  return Number(result.rows[0]?.total || 0);
}

async function listActiveEmployeesByNegocio(idNegocio, { limit, offset }) {
  const result = await query(
    `SELECT u.id_usuario, u.nombre, u.email, u.email_verificado, u.google_id,
            u.foto_perfil_url, u.rol, u.estado, u.id_negocio, u.fecha_registro,
            n.nombre_negocio
     FROM usuarios u
     INNER JOIN negocios n ON n.id_negocio = u.id_negocio
     WHERE u.id_negocio = $1
       AND u.rol = 'empleado'
       AND u.estado = 'activo'
     ORDER BY u.nombre ASC
     LIMIT $2 OFFSET $3`,
    [idNegocio, limit, offset]
  );

  return result.rows;
}

async function listInactiveEmployeesByNegocio(idNegocio) {
  const result = await query(
    `SELECT u.id_usuario, u.nombre, u.email, u.email_verificado, u.google_id,
            u.foto_perfil_url, u.rol, u.estado, u.id_negocio, u.fecha_registro,
            n.nombre_negocio
     FROM usuarios u
     INNER JOIN negocios n ON n.id_negocio = u.id_negocio
     WHERE u.id_negocio = $1
       AND u.rol = 'pendiente'
     ORDER BY u.nombre ASC`,
    [idNegocio]
  );

  return result.rows;
}

async function countInactiveEmployeesByNegocio(idNegocio) {
  const result = await query(
    `SELECT COUNT(*)::int AS total
     FROM usuarios u
     WHERE u.id_negocio = $1
       AND u.rol = 'pendiente'`,
    [idNegocio]
  );

  return Number(result.rows[0]?.total || 0);
}

async function listInactiveEmployeesByNegocioPaginated(idNegocio, { limit, offset }) {
  const result = await query(
    `SELECT u.id_usuario, u.nombre, u.email, u.email_verificado, u.google_id,
            u.foto_perfil_url, u.rol, u.estado, u.id_negocio, u.fecha_registro,
            n.nombre_negocio
     FROM usuarios u
     INNER JOIN negocios n ON n.id_negocio = u.id_negocio
     WHERE u.id_negocio = $1
       AND u.rol = 'pendiente'
     ORDER BY u.nombre ASC
     LIMIT $2 OFFSET $3`,
    [idNegocio, limit, offset]
  );

  return result.rows;
}

async function getEmployeeByIdForNegocio({ idEmpleado, idNegocio }) {
  const result = await query(
    `SELECT u.id_usuario, u.nombre, u.email, u.email_verificado, u.google_id,
            u.foto_perfil_url, u.rol, u.estado, u.id_negocio, u.fecha_registro,
            n.nombre_negocio,
            COALESCE(stats.total_transferencias, 0) AS total_transferencias,
            COALESCE(stats.total_monto, 0) AS total_monto_transferencias,
            stats.ultima_transferencia_fecha
     FROM usuarios u
     INNER JOIN negocios n ON n.id_negocio = u.id_negocio
     LEFT JOIN LATERAL (
       SELECT COUNT(*)::int AS total_transferencias,
              COALESCE(SUM(t.monto), 0)::numeric AS total_monto,
              MAX(t.fecha_transferencia) AS ultima_transferencia_fecha
       FROM transferencias t
       WHERE t.id_usuario = u.id_usuario
         AND t.id_negocio = u.id_negocio
         AND t.estado = 'ACTIVO'
     ) stats ON true
     WHERE u.id_usuario = $1
       AND u.id_negocio = $2
       AND u.rol IN ('empleado', 'pendiente')
     LIMIT 1`,
    [idEmpleado, idNegocio]
  );

  return result.rows[0] || null;
}

async function inactivateEmployeeByOwner({ idEmpleado, idNegocio }) {
  const result = await query(
    `UPDATE usuarios
     SET rol = 'pendiente'
     WHERE id_usuario = $1
       AND id_negocio = $2
       AND rol = 'empleado'
     RETURNING id_usuario, nombre, email, email_verificado, google_id,
               foto_perfil_url, rol, estado, id_negocio, fecha_registro`,
    [idEmpleado, idNegocio]
  );

  return result.rows[0] || null;
}

async function reactivateEmployeeByOwner({ idEmpleado, idNegocio }) {
  const result = await query(
    `UPDATE usuarios
     SET rol = 'empleado'
     WHERE id_usuario = $1
       AND id_negocio = $2
       AND rol = 'pendiente'
     RETURNING id_usuario, nombre, email, email_verificado, google_id,
               foto_perfil_url, rol, estado, id_negocio, fecha_registro`,
    [idEmpleado, idNegocio]
  );

  return result.rows[0] || null;
}

async function leaveBusinessBySelf({ idUsuario, idNegocio }) {
  const result = await query(
    `UPDATE usuarios
     SET rol = 'pendiente',
         id_negocio = NULL
     WHERE id_usuario = $1
       AND id_negocio = $2
       AND rol IN ('dueno', 'empleado')
     RETURNING id_usuario, nombre, email, email_verificado, google_id,
               foto_perfil_url, rol, estado, id_negocio, fecha_registro`,
    [idUsuario, idNegocio]
  );

  return result.rows[0] || null;
}

module.exports = {
  countActiveEmployeesByNegocio,
  countInactiveEmployeesByNegocio,
  getEmployeeByIdForNegocio,
  inactivateEmployeeByOwner,
  leaveBusinessBySelf,
  listInactiveEmployeesByNegocio,
  listInactiveEmployeesByNegocioPaginated,
  reactivateEmployeeByOwner,
  listActiveEmployeesByNegocio
};