const { query } = require("../config/database");

const APP_TIMEZONE = process.env.APP_TIMEZONE || "America/Guayaquil";

function getScopeCondition({ idNegocio, idUsuario }, startIndex = 1) {
  if (Number.isInteger(idNegocio)) {
    return {
      sql: `t.id_negocio = $${startIndex}`,
      params: [idNegocio]
    };
  }

  return {
    sql: `t.id_usuario = $${startIndex}`,
    params: [idUsuario]
  };
}

async function getTotalMontoHoy({ idNegocio, idUsuario }) {
  const scope = getScopeCondition({ idNegocio, idUsuario });
  const result = await query(
    `SELECT COALESCE(SUM(t.monto), 0) AS total
     FROM transferencias t
     WHERE t.estado = 'ACTIVO'
       AND ${scope.sql}
       AND DATE(t.fecha_transferencia) = DATE(NOW() AT TIME ZONE $${scope.params.length + 1})`,
    [...scope.params, APP_TIMEZONE]
  );

  return Number(result.rows[0]?.total || 0);
}

async function getTotalMontoByFecha({ fecha, idNegocio, idUsuario }) {
  const scope = getScopeCondition({ idNegocio, idUsuario });
  const result = await query(
    `SELECT COALESCE(SUM(t.monto), 0) AS total
     FROM transferencias t
     WHERE t.estado = 'ACTIVO'
       AND ${scope.sql}
       AND DATE(t.fecha_transferencia) = $${scope.params.length + 1}::date`,
    [...scope.params, fecha]
  );

  return Number(result.rows[0]?.total || 0);
}

async function getTotalMontoByMes({ anio, mes, idNegocio, idUsuario }) {
  const scope = getScopeCondition({ idNegocio, idUsuario });
  const result = await query(
    `SELECT COALESCE(SUM(t.monto), 0) AS total
     FROM transferencias t
     WHERE t.estado = 'ACTIVO'
       AND ${scope.sql}
       AND EXTRACT(YEAR FROM DATE(t.fecha_transferencia)) = $${scope.params.length + 1}
       AND EXTRACT(MONTH FROM DATE(t.fecha_transferencia)) = $${scope.params.length + 2}`,
    [...scope.params, anio, mes]
  );

  return Number(result.rows[0]?.total || 0);
}

async function getTotalMontoByAnio({ anio, idNegocio, idUsuario }) {
  const scope = getScopeCondition({ idNegocio, idUsuario });
  const result = await query(
    `SELECT COALESCE(SUM(t.monto), 0) AS total
     FROM transferencias t
     WHERE t.estado = 'ACTIVO'
       AND ${scope.sql}
       AND EXTRACT(YEAR FROM DATE(t.fecha_transferencia)) = $${scope.params.length + 1}`,
    [...scope.params, anio]
  );

  return Number(result.rows[0]?.total || 0);
}

async function getTransferenciaById(idTransferencia) {
  const result = await query(
    `SELECT id_transferencia, id_negocio, id_usuario, id_banco, client_sync_id, monto, url_comprobante,
            fecha_transferencia, fecha_registro_servidor, observaciones, estado
     FROM transferencias
     WHERE id_transferencia = $1`,
    [idTransferencia]
  );

  return result.rows[0] || null;
}

async function isTransferenciaWithinEmployeeEditWindow(idTransferencia, windowMs) {
  const result = await query(
    `SELECT (
        (EXTRACT(
          EPOCH FROM (
            (CURRENT_TIMESTAMP AT TIME ZONE current_setting('TIMEZONE')) - t.fecha_registro_servidor
          )
        ) * 1000) BETWEEN 0 AND $2
      ) AS is_within_window
     FROM transferencias t
     WHERE t.id_transferencia = $1`,
    [idTransferencia, windowMs]
  );

  return Boolean(result.rows[0]?.is_within_window);
}

async function createTransferenciaRecord({
  idNegocio,
  idUsuario,
  clientSyncId,
  monto,
  idBanco,
  fechaTransferencia,
  observaciones,
  imageUrl
}) {
  const result = await query(
    `INSERT INTO transferencias 
     (id_transferencia, id_negocio, id_usuario, id_banco, client_sync_id, monto, url_comprobante, fecha_transferencia, observaciones)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (id_usuario, client_sync_id) WHERE client_sync_id IS NOT NULL
     DO UPDATE SET
       id_banco = EXCLUDED.id_banco,
       monto = EXCLUDED.monto,
       url_comprobante = EXCLUDED.url_comprobante,
       fecha_transferencia = EXCLUDED.fecha_transferencia,
       observaciones = EXCLUDED.observaciones
     RETURNING *`,
    [idNegocio, idUsuario, idBanco, clientSyncId || null, monto, imageUrl, fechaTransferencia, observaciones]
  );

  return result.rows[0];
}

async function countTransferenciasByNegocio(idNegocio) {
  const result = await query(
    `SELECT COUNT(*)::int AS total
     FROM transferencias t
     WHERE t.id_negocio = $1
       AND t.estado = 'ACTIVO'`,
    [idNegocio]
  );

  return Number(result.rows[0]?.total || 0);
}

async function countTransferenciasByUsuario(idUsuario) {
  const result = await query(
    `SELECT COUNT(*)::int AS total
     FROM transferencias t
     WHERE t.id_usuario = $1
       AND t.estado = 'ACTIVO'`,
    [idUsuario]
  );

  return Number(result.rows[0]?.total || 0);
}

async function listTransferenciasByNegocio(idNegocio, { limit, offset }) {
  const result = await query(
    `SELECT t.id_transferencia, t.id_negocio, t.id_usuario, u.nombre AS usuario_nombre,
            t.id_banco, t.client_sync_id, b.nombre_banco AS banco, t.monto, t.url_comprobante,
            t.fecha_transferencia, t.fecha_registro_servidor, t.observaciones, t.estado
     FROM transferencias t
     INNER JOIN usuarios u ON u.id_usuario = t.id_usuario
     INNER JOIN bancos b ON b.id_banco = t.id_banco
     WHERE t.id_negocio = $1 AND t.estado = 'ACTIVO'
     ORDER BY t.fecha_registro_servidor DESC, t.fecha_transferencia DESC, t.id_transferencia DESC
     LIMIT $2 OFFSET $3`,
    [idNegocio, limit, offset]
  );

  return result.rows;
}

async function listTransferenciasByUsuario(idUsuario, { limit, offset }) {
  const result = await query(
    `SELECT t.id_transferencia, t.id_negocio, t.id_usuario, u.nombre AS usuario_nombre,
            t.id_banco, b.nombre_banco AS banco,
            t.client_sync_id, t.monto, t.url_comprobante, t.fecha_transferencia, t.fecha_registro_servidor, t.observaciones, t.estado
     FROM transferencias t
     INNER JOIN usuarios u ON u.id_usuario = t.id_usuario
     INNER JOIN bancos b ON b.id_banco = t.id_banco
     WHERE t.id_usuario = $1 AND t.estado = 'ACTIVO'
     ORDER BY t.fecha_registro_servidor DESC, t.fecha_transferencia DESC, t.id_transferencia DESC
     LIMIT $2 OFFSET $3`,
    [idUsuario, limit, offset]
  );

  return result.rows;
}

async function updateTransferenciaRecord(idTransferencia, updates) {
  const sets = [];
  const values = [];

  if (updates.monto !== undefined) {
    values.push(updates.monto);
    sets.push(`monto = $${values.length}`);
  }

  if (updates.idBanco !== undefined) {
    values.push(updates.idBanco);
    sets.push(`id_banco = $${values.length}`);
  }

  if (updates.fechaTransferencia !== undefined) {
    values.push(updates.fechaTransferencia);
    sets.push(`fecha_transferencia = $${values.length}`);
  }

  if (updates.observaciones !== undefined) {
    values.push(updates.observaciones);
    sets.push(`observaciones = $${values.length}`);
  }

  if (updates.imageUrl !== undefined) {
    values.push(updates.imageUrl);
    sets.push(`url_comprobante = $${values.length}`);
  }

  if (!sets.length) {
    return getTransferenciaById(idTransferencia);
  }

  values.push(idTransferencia);
  const result = await query(
    `UPDATE transferencias
     SET ${sets.join(", ")}
     WHERE id_transferencia = $${values.length}
     RETURNING *`,
    values
  );

  return result.rows[0] || null;
}

async function deactivateTransferenciaRecord(idTransferencia) {
  const result = await query(
    `UPDATE transferencias
     SET estado = 'INACTIVO'
     WHERE id_transferencia = $1
     RETURNING *`,
    [idTransferencia]
  );

  return result.rows[0] || null;
}

module.exports = {
  countTransferenciasByNegocio,
  countTransferenciasByUsuario,
  createTransferenciaRecord,
  deactivateTransferenciaRecord,
  getTransferenciaById,
  isTransferenciaWithinEmployeeEditWindow,
  getTotalMontoByAnio,
  getTotalMontoByFecha,
  getTotalMontoByMes,
  getTotalMontoHoy,
  listTransferenciasByNegocio,
  listTransferenciasByUsuario,
  updateTransferenciaRecord
};
