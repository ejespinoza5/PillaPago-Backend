const { createNotificacionRecord } = require("../models/notificaciones.model");
const { getOwnerByNegocioId } = require("../models/usuarios.model");
const { sendPushNotificationToUser } = require("./fcm.service");

async function createAndDispatchNotification({
  idDestinatario,
  idActor,
  idNegocio,
  tipo,
  titulo,
  mensaje,
  payload
}) {
  const notificacion = await createNotificacionRecord({
    idDestinatario,
    idActor,
    idNegocio,
    tipo,
    titulo,
    mensaje,
    payload
  });

  try {
    await sendPushNotificationToUser({
      idUsuario: idDestinatario,
      notificacion
    });
  } catch (pushError) {
    console.error("No se pudo enviar push por FCM", pushError);
  }

  return notificacion;
}

async function notifyUser({ idDestinatario, idActor, idNegocio, tipo, titulo, mensaje, payload }) {
  if (!Number.isInteger(Number(idDestinatario))) {
    return null;
  }

  return createAndDispatchNotification({
    idDestinatario: Number(idDestinatario),
    idActor: Number.isInteger(Number(idActor)) ? Number(idActor) : null,
    idNegocio: Number.isInteger(Number(idNegocio)) ? Number(idNegocio) : null,
    tipo,
    titulo,
    mensaje,
    payload
  });
}

async function notifyOwner({ idNegocio, idActor, tipo, titulo, mensaje, payload }) {
  if (!Number.isInteger(Number(idNegocio))) {
    return null;
  }

  const owner = await getOwnerByNegocioId(Number(idNegocio));

  if (!owner) {
    return null;
  }

  if (Number(owner.id_usuario) === Number(idActor)) {
    return null;
  }

  return createAndDispatchNotification({
    idDestinatario: owner.id_usuario,
    idActor,
    idNegocio: Number(idNegocio),
    tipo,
    titulo,
    mensaje,
    payload
  });
}

function formatCurrency(value) {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? amount.toFixed(2) : "0.00";
}

async function notifyOwnerTransferCreated({ transferencia, actorUsuario }) {
  if (!transferencia || !actorUsuario) {
    return null;
  }

  return notifyOwner({
    idNegocio: transferencia.id_negocio,
    idActor: actorUsuario.id_usuario,
    tipo: "transferencia_creada",
    titulo: "Nueva transferencia registrada",
    mensaje: `${actorUsuario.nombre} registro una transferencia por $${formatCurrency(transferencia.monto)}`,
    payload: {
      id_transferencia: transferencia.id_transferencia,
      id_usuario: transferencia.id_usuario,
      id_banco: transferencia.id_banco,
      monto: Number(transferencia.monto),
      fecha_transferencia: transferencia.fecha_transferencia
    }
  });
}

async function notifyOwnerEmployeeJoined({ idNegocio, empleado }) {
  if (!empleado) {
    return null;
  }

  return notifyOwner({
    idNegocio,
    idActor: empleado.id_usuario,
    tipo: "empleado_registrado",
    titulo: "Nuevo empleado en tu negocio",
    mensaje: `${empleado.nombre} se unio al negocio`,
    payload: {
      id_usuario: empleado.id_usuario,
      nombre: empleado.nombre,
      email: empleado.email,
      rol: empleado.rol
    }
  });
}

async function notifyEmployeeWelcomeJoinedBusiness({ empleado, negocio }) {
  if (!empleado) {
    return null;
  }

  const nombreNegocio = negocio?.nombre_negocio || "tu negocio";

  return notifyUser({
    idDestinatario: empleado.id_usuario,
    idActor: null,
    idNegocio: empleado.id_negocio,
    tipo: "bienvenida_empleado",
    titulo: "Bienvenido al negocio",
    mensaje: `Te has unido al negocio ${nombreNegocio}`,
    payload: {
      id_usuario: empleado.id_usuario,
      id_negocio: empleado.id_negocio,
      nombre_negocio: negocio?.nombre_negocio || null
    }
  });
}

async function notifyOwnerWelcomeCreatedBusiness({ dueno, negocio }) {
  if (!dueno) {
    return null;
  }

  const nombreNegocio = negocio?.nombre_negocio || "tu negocio";

  return notifyUser({
    idDestinatario: dueno.id_usuario,
    idActor: null,
    idNegocio: dueno.id_negocio,
    tipo: "bienvenida_dueno",
    titulo: "Bienvenido",
    mensaje: `Has creado el negocio ${nombreNegocio}`,
    payload: {
      id_usuario: dueno.id_usuario,
      id_negocio: dueno.id_negocio,
      nombre_negocio: negocio?.nombre_negocio || null
    }
  });
}

async function notifySecurityEvent({ usuario, tipo, titulo, mensaje, payload }) {
  if (!usuario) {
    return null;
  }

  return notifyUser({
    idDestinatario: usuario.id_usuario,
    idActor: null,
    idNegocio: usuario.id_negocio,
    tipo,
    titulo,
    mensaje,
    payload
  });
}

module.exports = {
  notifyEmployeeWelcomeJoinedBusiness,
  notifyOwner,
  notifyOwnerEmployeeJoined,
  notifyOwnerWelcomeCreatedBusiness,
  notifySecurityEvent,
  notifyUser,
  notifyOwnerTransferCreated
};
