const { query } = require("../config/database");

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

function getFechaCondition(fecha, startIndex) {
  if (!fecha) {
    return { sql: "", params: [] };
  }

  return {
    sql: ` AND DATE(t.fecha_transferencia) = $${startIndex}::date`,
    params: [fecha]
  };
}

function getEmpleadoCondition(idEmpleado, startIndex) {
  if (!Number.isInteger(idEmpleado)) {
    return { sql: "", params: [] };
  }

  return {
    sql: ` AND t.id_usuario = $${startIndex}`,
    params: [idEmpleado]
  };
}

function getFechaPartsCondition({ dia, mes, anio } = {}, startIndex) {
  const conditions = [];
  const params = [];
  let paramIndex = startIndex;

  if (Number.isInteger(dia)) {
    conditions.push(`EXTRACT(DAY FROM DATE(t.fecha_transferencia)) = $${paramIndex}`);
    params.push(dia);
    paramIndex += 1;
  }

  if (Number.isInteger(mes)) {
    conditions.push(`EXTRACT(MONTH FROM DATE(t.fecha_transferencia)) = $${paramIndex}`);
    params.push(mes);
    paramIndex += 1;
  }

  if (Number.isInteger(anio)) {
    conditions.push(`EXTRACT(YEAR FROM DATE(t.fecha_transferencia)) = $${paramIndex}`);
    params.push(anio);
  }

  if (!conditions.length) {
    return { sql: "", params: [] };
  }

  return {
    sql: ` AND ${conditions.join(" AND ")}`,
    params
  };
}

async function getTotalMontoHoy({ idNegocio, idUsuario }) {
  const scope = getScopeCondition({ idNegocio, idUsuario });
  const result = await query(
    `SELECT COALESCE(SUM(t.monto), 0) AS total
     FROM transferencias t
     WHERE t.estado = 'ACTIVO'
       AND ${scope.sql}
       AND DATE(t.fecha_transferencia) = CURRENT_DATE`,
    scope.params
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

async function getTransferenciasCountLast7Days({ idNegocio, idUsuario }) {
  const scope = getScopeCondition({ idNegocio, idUsuario }, 1);
  const result = await query(
    `WITH dias AS (
       SELECT generate_series(
         CURRENT_DATE - INTERVAL '6 days',
         CURRENT_DATE,
         INTERVAL '1 day'
       )::date AS fecha
     )
     SELECT
       TO_CHAR(d.fecha, 'YYYY-MM-DD') AS fecha,
       COALESCE(COUNT(t.id_transferencia), 0)::int AS total_transferencias
     FROM dias d
     LEFT JOIN transferencias t
       ON DATE(t.fecha_transferencia) = d.fecha
      AND t.estado = 'ACTIVO'
      AND ${scope.sql}
     GROUP BY d.fecha
     ORDER BY d.fecha ASC`,
    scope.params
  );

  return result.rows;
}

async function getTransferenciaById(idTransferencia) {
  const result = await query(
    `SELECT t.id_transferencia, t.id_negocio, t.id_usuario, u.nombre AS usuario_nombre,
            t.id_banco, b.nombre_banco AS nombre_banco, t.client_sync_id, t.monto, t.url_comprobante,
            t.fecha_transferencia, t.fecha_registro_servidor, t.observaciones, t.estado
     FROM transferencias t
     LEFT JOIN usuarios u ON u.id_usuario = t.id_usuario
     LEFT JOIN bancos b ON b.id_banco = t.id_banco
     WHERE t.id_transferencia = $1`,
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
     VALUES (
       gen_random_uuid(),
       $1,
       $2,
       $3,
       $4,
       $5,
       $6,
       CASE
         WHEN $7::text ~ '^\\d{4}-\\d{2}-\\d{2}$' THEN ($7::date + LOCALTIME)::timestamp
         ELSE $7::timestamp
       END,
       $8
     )
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

async function countTransferenciasByNegocio(idNegocio, { fecha, idEmpleado } = {}) {
  const fechaCondition = getFechaCondition(fecha, 2);
  const empleadoCondition = getEmpleadoCondition(
    idEmpleado,
    2 + fechaCondition.params.length
  );

  const result = await query(
    `SELECT COUNT(*)::int AS total
     FROM transferencias t
     WHERE t.id_negocio = $1
       AND t.estado = 'ACTIVO'${fechaCondition.sql}${empleadoCondition.sql}`,
    [idNegocio, ...fechaCondition.params, ...empleadoCondition.params]
  );

  return Number(result.rows[0]?.total || 0);
}

async function countTransferenciasByUsuario(idUsuario, { fecha } = {}) {
  const fechaCondition = getFechaCondition(fecha, 2);
  const result = await query(
    `SELECT COUNT(*)::int AS total
     FROM transferencias t
     WHERE t.id_usuario = $1
       AND t.estado = 'ACTIVO'${fechaCondition.sql}`,
    [idUsuario, ...fechaCondition.params]
  );

  return Number(result.rows[0]?.total || 0);
}

async function listTransferenciasByNegocio(idNegocio, { fecha, idEmpleado, limit, offset }) {
  const fechaCondition = getFechaCondition(fecha, 2);
  const empleadoCondition = getEmpleadoCondition(
    idEmpleado,
    2 + fechaCondition.params.length
  );
  const limitIndex = 2 + fechaCondition.params.length + empleadoCondition.params.length;
  const offsetIndex = limitIndex + 1;

  const result = await query(
    `SELECT t.id_transferencia, t.id_negocio, t.id_usuario, u.nombre AS usuario_nombre,
            t.id_banco, t.client_sync_id, b.nombre_banco AS banco, t.monto, t.url_comprobante,
            t.fecha_transferencia, t.fecha_registro_servidor, t.observaciones, t.estado
     FROM transferencias t
     INNER JOIN usuarios u ON u.id_usuario = t.id_usuario
     INNER JOIN bancos b ON b.id_banco = t.id_banco
     WHERE t.id_negocio = $1 AND t.estado = 'ACTIVO'${fechaCondition.sql}${empleadoCondition.sql}
     ORDER BY t.fecha_registro_servidor DESC, t.fecha_transferencia DESC, t.id_transferencia DESC
     LIMIT $${limitIndex} OFFSET $${offsetIndex}`,
    [idNegocio, ...fechaCondition.params, ...empleadoCondition.params, limit, offset]
  );

  return result.rows;
}

async function listTransferenciasByUsuario(idUsuario, { fecha, limit, offset }) {
  const fechaCondition = getFechaCondition(fecha, 2);
  const limitIndex = 2 + fechaCondition.params.length;
  const offsetIndex = limitIndex + 1;

  const result = await query(
    `SELECT t.id_transferencia, t.id_negocio, t.id_usuario, u.nombre AS usuario_nombre,
            t.id_banco, b.nombre_banco AS banco,
            t.client_sync_id, t.monto, t.url_comprobante, t.fecha_transferencia, t.fecha_registro_servidor, t.observaciones, t.estado
     FROM transferencias t
     INNER JOIN usuarios u ON u.id_usuario = t.id_usuario
     INNER JOIN bancos b ON b.id_banco = t.id_banco
     WHERE t.id_usuario = $1 AND t.estado = 'ACTIVO'${fechaCondition.sql}
     ORDER BY t.fecha_registro_servidor DESC, t.fecha_transferencia DESC, t.id_transferencia DESC
     LIMIT $${limitIndex} OFFSET $${offsetIndex}`,
    [idUsuario, ...fechaCondition.params, limit, offset]
  );

  return result.rows;
}

async function listTransferenciasForReport({ idNegocio, idUsuario, dia, mes, anio }) {
  const scope = getScopeCondition({ idNegocio, idUsuario });
  const fechaParts = getFechaPartsCondition({ dia, mes, anio }, scope.params.length + 1);

  const result = await query(
    `SELECT t.id_transferencia, t.id_negocio, t.id_usuario, u.nombre AS usuario_nombre,
            t.id_banco, b.nombre_banco AS banco, t.monto,
            t.fecha_transferencia, t.fecha_registro_servidor, t.observaciones, t.estado
     FROM transferencias t
     INNER JOIN usuarios u ON u.id_usuario = t.id_usuario
     INNER JOIN bancos b ON b.id_banco = t.id_banco
     WHERE t.estado = 'ACTIVO'
       AND ${scope.sql}${fechaParts.sql}
     ORDER BY t.fecha_transferencia DESC, t.fecha_registro_servidor DESC, t.id_transferencia DESC`,
    [...scope.params, ...fechaParts.params]
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
    sets.push(`fecha_transferencia = CASE
      WHEN $${values.length}::text ~ '^\\d{4}-\\d{2}-\\d{2}$' THEN ($${values.length}::date + LOCALTIME)::timestamp
      ELSE $${values.length}::timestamp
    END`);
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
  getTransferenciasCountLast7Days,
  listTransferenciasByNegocio,
  listTransferenciasForReport,
  listTransferenciasByUsuario,
  updateTransferenciaRecord
};
