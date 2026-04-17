const {
  countNotificacionesByDestinatario,
  listNotificacionesByDestinatario,
  markAllNotificacionesAsRead,
  markNotificacionAsRead
} = require("../models/notificaciones.model");

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

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

function parseSoloNoLeidas(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return ["1", "true", "si", "yes"].includes(normalized);
}

async function listMyNotificaciones(req, res, next) {
  try {
    const idUsuario = Number(req.auth?.id_usuario);

    if (!Number.isInteger(idUsuario) || idUsuario <= 0) {
      return res.status(401).json({ message: "Token invalido" });
    }

    const pagination = parsePagination(req.query);

    if (pagination.error) {
      return res.status(400).json({ message: pagination.error });
    }

    const soloNoLeidas = parseSoloNoLeidas(req.query?.solo_no_leidas);

    const [data, total, totalNoLeidas] = await Promise.all([
      listNotificacionesByDestinatario({
        idDestinatario: idUsuario,
        limit: pagination.limit,
        offset: pagination.offset,
        soloNoLeidas
      }),
      countNotificacionesByDestinatario({
        idDestinatario: idUsuario,
        soloNoLeidas
      }),
      countNotificacionesByDestinatario({
        idDestinatario: idUsuario,
        soloNoLeidas: true
      })
    ]);

    return res.json({
      data,
      unread_count: totalNoLeidas,
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        total,
        totalPages: total > 0 ? Math.ceil(total / pagination.limit) : 0,
        hasNextPage: pagination.offset + data.length < total,
        hasPrevPage: pagination.page > 1
      }
    });
  } catch (error) {
    next(error);
  }
}

async function markMyNotificacionAsRead(req, res, next) {
  try {
    const idUsuario = Number(req.auth?.id_usuario);

    if (!Number.isInteger(idUsuario) || idUsuario <= 0) {
      return res.status(401).json({ message: "Token invalido" });
    }

    const idNotificacion = Number(req.params.id);

    if (!Number.isInteger(idNotificacion) || idNotificacion <= 0) {
      return res.status(400).json({ message: "id de notificacion invalido" });
    }

    const notificacion = await markNotificacionAsRead({
      idNotificacion,
      idDestinatario: idUsuario
    });

    if (!notificacion) {
      return res.status(404).json({ message: "Notificacion no encontrada" });
    }

    return res.json({
      message: "Notificacion marcada como leida",
      notificacion
    });
  } catch (error) {
    next(error);
  }
}

async function markAllMyNotificacionesAsRead(req, res, next) {
  try {
    const idUsuario = Number(req.auth?.id_usuario);

    if (!Number.isInteger(idUsuario) || idUsuario <= 0) {
      return res.status(401).json({ message: "Token invalido" });
    }

    const updatedCount = await markAllNotificacionesAsRead({
      idDestinatario: idUsuario
    });

    return res.json({
      message: "Notificaciones marcadas como leidas",
      updated_count: updatedCount
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  listMyNotificaciones,
  markAllMyNotificacionesAsRead,
  markMyNotificacionAsRead
};
