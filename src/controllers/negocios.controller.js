const {
  createNegocioRecord,
  getNegocioByCodigoInvitacion,
  getNegocioById,
  listNegociosRecords
} = require("../models/negocios.model");
const { assignUsuarioToNegocio, getUsuarioById } = require("../models/usuarios.model");
const {
  notifyEmployeeWelcomeJoinedBusiness,
  notifyOwnerEmployeeJoined,
  notifyOwnerWelcomeCreatedBusiness
} = require("../services/notification.service");
const { generateInvitationCode } = require("../utils/invitation-code");

async function createNegocioWithUniqueCode(nombreNegocio) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const codigoInvitacion = generateInvitationCode();
      return await createNegocioRecord({ nombreNegocio, codigoInvitacion });
    } catch (error) {
      if (error.code === "23505") {
        continue;
      }

      throw error;
    }
  }

  throw new Error("No se pudo generar un codigo de invitacion unico");
}

async function listNegocios(_req, res, next) {
  try {
    const negocios = await listNegociosRecords();
    res.json(negocios);
  } catch (error) {
    next(error);
  }
}

async function getNegocio(req, res, next) {
  try {
    const idNegocio = Number(req.params.id);

    if (!Number.isInteger(idNegocio)) {
      return res.status(400).json({ message: "id de negocio invalido" });
    }

    const negocio = await getNegocioById(idNegocio);

    if (!negocio) {
      return res.status(404).json({ message: "Negocio no encontrado" });
    }

    res.json(negocio);
  } catch (error) {
    next(error);
  }
}

async function createNegocio(req, res, next) {
  try {
    const nombreNegocio = req.body?.nombre_negocio;

    if (!nombreNegocio) {
      return res.status(400).json({ message: "nombre_negocio es requerido" });
    }

    const negocio = await createNegocioWithUniqueCode(nombreNegocio);

    res.status(201).json(negocio);
  } catch (error) {
    next(error);
  }
}

async function registerOwnerNegocio(req, res, next) {
  try {
    const nombreNegocio = req.body?.nombre_negocio;

    if (!nombreNegocio) {
      return res.status(400).json({ message: "nombre_negocio es requerido" });
    }

    const usuario = await getUsuarioById(req.auth.id_usuario);

    if (!usuario) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    const isUsuarioActivoEnNegocio = Boolean(usuario.id_negocio) && usuario.rol !== "pendiente";

    if (isUsuarioActivoEnNegocio) {
      return res.status(409).json({ message: "El usuario ya pertenece a un negocio" });
    }

    const negocio = await createNegocioWithUniqueCode(nombreNegocio);
    const usuarioActualizado = await assignUsuarioToNegocio({
      idUsuario: usuario.id_usuario,
      idNegocio: negocio.id_negocio,
      rol: "dueno"
    });

    try {
      await notifyOwnerWelcomeCreatedBusiness({
        dueno: usuarioActualizado,
        negocio
      });
    } catch (notificationError) {
      console.error("No se pudo crear notificacion de bienvenida para dueno", notificationError);
    }

    res.status(201).json({
      negocio,
      usuario: usuarioActualizado
    });
  } catch (error) {
    next(error);
  }
}

async function joinNegocioByCode(req, res, next) {
  try {
    const codigoInvitacion = req.body?.codigo_invitacion;

    if (!codigoInvitacion) {
      return res.status(400).json({ message: "codigo_invitacion es requerido" });
    }

    const usuario = await getUsuarioById(req.auth.id_usuario);

    if (!usuario) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    const isUsuarioActivoEnNegocio = Boolean(usuario.id_negocio) && usuario.rol !== "pendiente";

    if (isUsuarioActivoEnNegocio) {
      return res.status(409).json({ message: "El usuario ya pertenece a un negocio" });
    }

    const negocio = await getNegocioByCodigoInvitacion(codigoInvitacion);

    if (!negocio) {
      return res.status(404).json({ message: "Codigo de invitacion invalido" });
    }

    const usuarioActualizado = await assignUsuarioToNegocio({
      idUsuario: usuario.id_usuario,
      idNegocio: negocio.id_negocio,
      rol: "empleado"
    });

    try {
      await notifyOwnerEmployeeJoined({
        idNegocio: negocio.id_negocio,
        empleado: usuarioActualizado
      });
    } catch (notificationError) {
      console.error("No se pudo crear notificacion de nuevo empleado", notificationError);
    }

    try {
      await notifyEmployeeWelcomeJoinedBusiness({
        empleado: usuarioActualizado,
        negocio
      });
    } catch (notificationError) {
      console.error("No se pudo crear notificacion de bienvenida para empleado", notificationError);
    }

    res.json({
      negocio,
      usuario: usuarioActualizado
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  createNegocio,
  getNegocio,
  joinNegocioByCode,
  listNegocios,
  registerOwnerNegocio
};
