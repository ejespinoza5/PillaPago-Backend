const { getUsuarioById } = require("../models/usuarios.model");
const {
  countTransferenciasByNegocio,
  countTransferenciasByUsuario,
  createTransferenciaRecord,
  deactivateTransferenciaRecord,
  getTransferenciaById,
  getTotalMontoByAnio,
  getTotalMontoByFecha,
  getTotalMontoByMes,
  getTotalMontoHoy,
  isTransferenciaWithinEmployeeEditWindow,
  listTransferenciasByNegocio,
  listTransferenciasByUsuario,
  updateTransferenciaRecord
} = require("../models/transferencias.model");
const { uploadTransferImage } = require("../services/storage.service");

const EMPLEADO_EDIT_WINDOW_MS = 5 * 60 * 1000;
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function pad2(value) {
  return String(value).padStart(2, "0");
}

function normalizeFechaTransferencia(fechaTransferenciaRaw) {
  const raw = String(fechaTransferenciaRaw || "").trim();

  if (!raw) {
    return null;
  }

  // Si viene solo fecha (YYYY-MM-DD), la guardamos como timestamp sin zona
  // para evitar desfase de un dia por conversion UTC/local.
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [year, month, day] = raw.split("-").map(Number);
    const utcDate = new Date(Date.UTC(year, month - 1, day));

    const isValidDate = utcDate.getUTCFullYear() === year
      && utcDate.getUTCMonth() + 1 === month
      && utcDate.getUTCDate() === day;

    if (!isValidDate) {
      return null;
    }

    return `${raw} 00:00:00`;
  }

  const parsed = new Date(raw);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return `${parsed.getFullYear()}-${pad2(parsed.getMonth() + 1)}-${pad2(parsed.getDate())} ${pad2(parsed.getHours())}:${pad2(parsed.getMinutes())}:${pad2(parsed.getSeconds())}`;
}

async function getUserTransferScope(authUserId) {
  const usuario = await getUsuarioById(authUserId);

  if (!usuario) {
    return { error: { status: 404, message: "Usuario no encontrado" } };
  }

  if (!usuario.id_negocio) {
    return { error: { status: 403, message: "Debes pertenecer a un negocio" } };
  }

  if (!["dueno", "empleado"].includes(usuario.rol)) {
    return { error: { status: 403, message: "Solo usuarios activos pueden acceder a transferencias" } };
  }

  return {
    usuario,
    scope: usuario.rol === "dueno"
      ? { idNegocio: usuario.id_negocio }
      : { idUsuario: usuario.id_usuario }
  };
}

function isValidIsoDate(dateStr) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(dateStr || ""));
}

function parsePagination(query) {
  const rawPage = query?.page;
  const rawLimit = query?.limit;

  const page = rawPage === undefined ? DEFAULT_PAGE : Number(rawPage);
  const limit = rawLimit === undefined ? DEFAULT_LIMIT : Number(rawLimit);

  if (!Number.isInteger(page) || page < 1) {
    return { error: "page debe ser un entero mayor o igual a 1" };
  }

  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    return { error: `limit debe ser un entero entre 1 y ${MAX_LIMIT}` };
  }

  return {
    page,
    limit,
    offset: (page - 1) * limit
  };
}

async function getTotalTransferenciasHoy(req, res, next) {
  try {
    const result = await getUserTransferScope(req.auth.id_usuario);

    if (result.error) {
      return res.status(result.error.status).json({ message: result.error.message });
    }

    const total = await getTotalMontoHoy(result.scope);
    return res.json({
      periodo: "hoy",
      total,
      moneda: "USD"
    });
  } catch (error) {
    next(error);
  }
}

async function getTotalTransferenciasPorDia(req, res, next) {
  try {
    const fecha = String(req.query?.fecha || "").trim();

    if (!isValidIsoDate(fecha)) {
      return res.status(400).json({ message: "fecha debe tener formato YYYY-MM-DD" });
    }

    const result = await getUserTransferScope(req.auth.id_usuario);

    if (result.error) {
      return res.status(result.error.status).json({ message: result.error.message });
    }

    const total = await getTotalMontoByFecha({ ...result.scope, fecha });
    return res.json({
      periodo: "dia",
      fecha,
      total,
      moneda: "USD"
    });
  } catch (error) {
    next(error);
  }
}

async function getTotalTransferenciasPorMes(req, res, next) {
  try {
    const anio = Number(req.query?.anio);
    const mes = Number(req.query?.mes);

    if (!Number.isInteger(anio) || anio < 2000 || anio > 2100) {
      return res.status(400).json({ message: "anio invalido" });
    }

    if (!Number.isInteger(mes) || mes < 1 || mes > 12) {
      return res.status(400).json({ message: "mes invalido (1-12)" });
    }

    const result = await getUserTransferScope(req.auth.id_usuario);

    if (result.error) {
      return res.status(result.error.status).json({ message: result.error.message });
    }

    const total = await getTotalMontoByMes({ ...result.scope, anio, mes });
    return res.json({
      periodo: "mes",
      anio,
      mes,
      total,
      moneda: "USD"
    });
  } catch (error) {
    next(error);
  }
}

async function getTotalTransferenciasPorAnio(req, res, next) {
  try {
    const anio = Number(req.query?.anio);

    if (!Number.isInteger(anio) || anio < 2000 || anio > 2100) {
      return res.status(400).json({ message: "anio invalido" });
    }

    const result = await getUserTransferScope(req.auth.id_usuario);

    if (result.error) {
      return res.status(result.error.status).json({ message: result.error.message });
    }

    const total = await getTotalMontoByAnio({ ...result.scope, anio });
    return res.json({
      periodo: "anio",
      anio,
      total,
      moneda: "USD"
    });
  } catch (error) {
    next(error);
  }
}

async function listTransferencias(req, res, next) {
  try {
    const pagination = parsePagination(req.query);

    if (pagination.error) {
      return res.status(400).json({ message: pagination.error });
    }

    const usuario = await getUsuarioById(req.auth.id_usuario);

    if (!usuario) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    if (!usuario.id_negocio) {
      return res.status(403).json({ message: "Debes pertenecer a un negocio para ver transferencias" });
    }

    if (usuario.rol === "dueno") {
      const [transferencias, total] = await Promise.all([
        listTransferenciasByNegocio(usuario.id_negocio, {
          limit: pagination.limit,
          offset: pagination.offset
        }),
        countTransferenciasByNegocio(usuario.id_negocio)
      ]);

      return res.json({
        data: transferencias,
        pagination: {
          page: pagination.page,
          limit: pagination.limit,
          total,
          totalPages: total > 0 ? Math.ceil(total / pagination.limit) : 0,
          hasNextPage: pagination.offset + transferencias.length < total,
          hasPrevPage: pagination.page > 1
        }
      });
    }

    const [transferencias, total] = await Promise.all([
      listTransferenciasByUsuario(usuario.id_usuario, {
        limit: pagination.limit,
        offset: pagination.offset
      }),
      countTransferenciasByUsuario(usuario.id_usuario)
    ]);

    return res.json({
      data: transferencias,
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        total,
        totalPages: total > 0 ? Math.ceil(total / pagination.limit) : 0,
        hasNextPage: pagination.offset + transferencias.length < total,
        hasPrevPage: pagination.page > 1
      }
    });
  } catch (error) {
    next(error);
  }
}

async function getTransferenciaByIdController(req, res, next) {
  try {
    const result = await getUserTransferScope(req.auth.id_usuario);

    if (result.error) {
      return res.status(result.error.status).json({ message: result.error.message });
    }

    const { id } = req.params;
    const transferencia = await getTransferenciaById(id);

    if (!transferencia) {
      return res.status(404).json({ message: "Transferencia no encontrada" });
    }

    if (result.scope.idNegocio && transferencia.id_negocio !== result.scope.idNegocio) {
      return res.status(403).json({ message: "No puedes ver transferencias de otro negocio" });
    }

    if (result.scope.idUsuario && transferencia.id_usuario !== result.scope.idUsuario) {
      return res.status(403).json({ message: "Solo puedes ver tus propias transferencias" });
    }

    const permission = await canEditTransferencia(result.usuario, transferencia);

    return res.json({
      ...transferencia,
      disponible_para_editar: permission.allowed
    });
  } catch (error) {
    next(error);
  }
}

async function createTransferencia(req, res, next) {
  try {
    const usuario = await getUsuarioById(req.auth.id_usuario);

    if (!usuario) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    if (!usuario.id_negocio) {
      return res.status(403).json({ message: "Debes unirte a un negocio antes de subir transferencias" });
    }

    if (!req.file) {
      return res.status(400).json({ message: "La imagen es requerida en el campo 'imagen'" });
    }

    const monto = Number(req.body?.monto);
    const idBanco = Number(req.body?.id_banco);
    const clientSyncId = String(req.body?.client_sync_id || "").trim() || null;
    const fechaTransferenciaRaw = req.body?.fecha_transferencia;
    const observaciones = typeof req.body?.observaciones === "string"
      ? req.body.observaciones.trim() || null
      : null;

    if (!Number.isFinite(monto) || monto <= 0) {
      return res.status(400).json({ message: "monto invalido" });
    }

    if (!Number.isInteger(idBanco) || idBanco <= 0) {
      return res.status(400).json({ message: "id_banco invalido" });
    }

    if (clientSyncId && clientSyncId.length > 120) {
      return res.status(400).json({ message: "client_sync_id excede el maximo permitido" });
    }

    if (!fechaTransferenciaRaw) {
      return res.status(400).json({ message: "fecha_transferencia es requerida" });
    }

    const fechaTransferencia = normalizeFechaTransferencia(fechaTransferenciaRaw);

    if (!fechaTransferencia) {
      return res.status(400).json({ message: "fecha_transferencia invalida" });
    }

    const uploadResult = await uploadTransferImage({
      buffer: req.file.buffer,
      mimeType: req.file.mimetype,
      originalName: req.file.originalname,
      idNegocio: usuario.id_negocio,
      idUsuario: usuario.id_usuario
    });

    const transferencia = await createTransferenciaRecord({
      idNegocio: usuario.id_negocio,
      idUsuario: usuario.id_usuario,
      clientSyncId,
      monto,
      idBanco,
      fechaTransferencia,
      observaciones,
      imageUrl: uploadResult.imageUrl,
      imagePath: uploadResult.imagePath
    });

    res.status(201).json(transferencia);
  } catch (error) {
    next(error);
  }
}

async function canEditTransferencia(usuario, transferencia) {
  if (!usuario || !transferencia) {
    return { allowed: false, reason: "No autorizado" };
  }

  if (usuario.id_negocio !== transferencia.id_negocio) {
    return { allowed: false, reason: "No puedes editar transferencias de otro negocio" };
  }

  if (usuario.rol === "dueno") {
    return { allowed: true };
  }

  if (transferencia.estado !== "ACTIVO") {
    return { allowed: false, reason: "No puedes editar una transferencia inactiva" };
  }

  if (usuario.id_usuario !== transferencia.id_usuario) {
    return { allowed: false, reason: "Solo puedes editar tus propias transferencias" };
  }

  const isWithinWindow = await isTransferenciaWithinEmployeeEditWindow(
    transferencia.id_transferencia,
    EMPLEADO_EDIT_WINDOW_MS
  );

  if (!isWithinWindow) {
    return { allowed: false, reason: "Solo puedes editar una transferencia dentro de los primeros 5 minutos" };
  }

  return { allowed: true };
}

async function updateTransferencia(req, res, next) {
  try {
    const usuario = await getUsuarioById(req.auth.id_usuario);

    if (!usuario) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    const { id } = req.params;
    const transferencia = await getTransferenciaById(id);

    if (!transferencia) {
      return res.status(404).json({ message: "Transferencia no encontrada" });
    }

    const permission = await canEditTransferencia(usuario, transferencia);

    if (!permission.allowed) {
      return res.status(403).json({ message: permission.reason });
    }

    const updates = {};

    if (req.body?.monto !== undefined) {
      const monto = Number(req.body.monto);

      if (!Number.isFinite(monto) || monto <= 0) {
        return res.status(400).json({ message: "monto invalido" });
      }

      updates.monto = monto;
    }

    if (req.body?.id_banco !== undefined) {
      const idBanco = Number(req.body.id_banco);

      if (!Number.isInteger(idBanco) || idBanco <= 0) {
        return res.status(400).json({ message: "id_banco invalido" });
      }

      updates.idBanco = idBanco;
    }

    if (req.body?.fecha_transferencia !== undefined) {
      const fechaTransferencia = normalizeFechaTransferencia(req.body.fecha_transferencia);

      if (!fechaTransferencia) {
        return res.status(400).json({ message: "fecha_transferencia invalida" });
      }

      updates.fechaTransferencia = fechaTransferencia;
    }

    if (req.body?.observaciones !== undefined) {
      const observaciones = String(req.body.observaciones || "").trim();
      updates.observaciones = observaciones || null;
    }

    if (req.file) {
      const uploadResult = await uploadTransferImage({
        buffer: req.file.buffer,
        mimeType: req.file.mimetype,
        originalName: req.file.originalname,
        idNegocio: usuario.id_negocio,
        idUsuario: usuario.id_usuario
      });

      updates.imageUrl = uploadResult.imageUrl;
    }

    if (!Object.keys(updates).length) {
      return res.status(400).json({
        message: "Debes enviar al menos un campo para editar: monto, id_banco, fecha_transferencia, observaciones o imagen"
      });
    }

    const updated = await updateTransferenciaRecord(id, updates);

    return res.json(updated);
  } catch (error) {
    next(error);
  }
}

async function deleteTransferencia(req, res, next) {
  try {
    const usuario = await getUsuarioById(req.auth.id_usuario);

    if (!usuario) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    const { id } = req.params;
    const transferencia = await getTransferenciaById(id);

    if (!transferencia) {
      return res.status(404).json({ message: "Transferencia no encontrada" });
    }

    if (usuario.rol !== "dueno") {
      return res.status(403).json({ message: "Solo el dueno puede eliminar transferencias" });
    }

    if (usuario.id_negocio !== transferencia.id_negocio) {
      return res.status(403).json({ message: "No puedes eliminar transferencias de otro negocio" });
    }

    if (transferencia.estado !== "ACTIVO") {
      return res.json({ message: "La transferencia ya estaba inactiva", transferencia });
    }

    const deleted = await deactivateTransferenciaRecord(id);
    return res.json({ message: "Transferencia eliminada", transferencia: deleted });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  createTransferencia,
  deleteTransferencia,
  getTransferenciaByIdController,
  getTotalTransferenciasHoy,
  getTotalTransferenciasPorAnio,
  getTotalTransferenciasPorDia,
  getTotalTransferenciasPorMes,
  listTransferencias,
  updateTransferencia
};
