const { query } = require("../config/database");

async function createNotificacionRecord({
  idDestinatario,
  idActor,
  idNegocio,
  tipo,
  titulo,
  mensaje,
  payload
}) {
  const result = await query(
    `INSERT INTO notificaciones
     (id_destinatario, id_actor, id_negocio, tipo, titulo, mensaje, payload)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      idDestinatario,
      idActor || null,
      idNegocio || null,
      tipo,
      titulo,
      mensaje,
      payload ? JSON.stringify(payload) : null
    ]
  );

  return result.rows[0];
}

async function listNotificacionesByDestinatario({ idDestinatario, limit, offset, soloNoLeidas }) {
  const result = await query(
    `SELECT n.id_notificacion, n.id_destinatario, n.id_actor, n.id_negocio,
            n.tipo, n.titulo, n.mensaje, n.payload, n.leida, n.created_at,
            ua.nombre AS actor_nombre
     FROM notificaciones n
     LEFT JOIN usuarios ua ON ua.id_usuario = n.id_actor
     WHERE n.id_destinatario = $1
       AND ($2::boolean = false OR n.leida = false)
     ORDER BY n.created_at DESC, n.id_notificacion DESC
     LIMIT $3 OFFSET $4`,
    [idDestinatario, Boolean(soloNoLeidas), limit, offset]
  );

  return result.rows;
}

async function countNotificacionesByDestinatario({ idDestinatario, soloNoLeidas }) {
  const result = await query(
    `SELECT COUNT(*)::int AS total
     FROM notificaciones n
     WHERE n.id_destinatario = $1
       AND ($2::boolean = false OR n.leida = false)`,
    [idDestinatario, Boolean(soloNoLeidas)]
  );

  return Number(result.rows[0]?.total || 0);
}

async function markNotificacionAsRead({ idNotificacion, idDestinatario }) {
  const result = await query(
    `UPDATE notificaciones
     SET leida = true
     WHERE id_notificacion = $1
       AND id_destinatario = $2
     RETURNING *`,
    [idNotificacion, idDestinatario]
  );

  return result.rows[0] || null;
}

async function markAllNotificacionesAsRead({ idDestinatario }) {
  const result = await query(
    `UPDATE notificaciones
     SET leida = true
     WHERE id_destinatario = $1
       AND leida = false`,
    [idDestinatario]
  );

  return result.rowCount;
}

async function getLatestUnreadWelcomeNotificationByDestinatario(idDestinatario) {
  const result = await query(
    `SELECT n.id_notificacion, n.id_destinatario, n.id_actor, n.id_negocio,
            n.tipo, n.titulo, n.mensaje, n.payload, n.leida, n.created_at
     FROM notificaciones n
     WHERE n.id_destinatario = $1
       AND n.leida = false
       AND n.tipo IN ('bienvenida_empleado', 'bienvenida_dueno')
     ORDER BY n.created_at DESC, n.id_notificacion DESC
     LIMIT 1`,
    [idDestinatario]
  );

  return result.rows[0] || null;
}

module.exports = {
  countNotificacionesByDestinatario,
  createNotificacionRecord,
  getLatestUnreadWelcomeNotificationByDestinatario,
  listNotificacionesByDestinatario,
  markAllNotificacionesAsRead,
  markNotificacionAsRead
};
