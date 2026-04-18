const {
  deactivateDeviceTokenRecord,
  listActiveDeviceTokensByUsuario,
  upsertDeviceTokenRecord
} = require("../models/device-tokens.model");
const { getLatestUnreadWelcomeNotificationByDestinatario } = require("../models/notificaciones.model");
const { sendPushNotificationToUser } = require("../services/fcm.service");

const VALID_PLATFORMS = new Set(["android", "ios", "web"]);

function normalizePlatform(value) {
  return String(value || "").trim().toLowerCase();
}

async function registerDeviceToken(req, res, next) {
  try {
    const idUsuario = Number(req.auth?.id_usuario);

    if (!Number.isInteger(idUsuario) || idUsuario <= 0) {
      return res.status(401).json({ message: "Token invalido" });
    }

    const token = String(req.body?.token || "").trim();
    const plataforma = normalizePlatform(req.body?.plataforma);

    if (!token) {
      return res.status(400).json({ message: "token es requerido" });
    }

    if (token.length > 512) {
      return res.status(400).json({ message: "token excede el maximo permitido" });
    }

    if (!VALID_PLATFORMS.has(plataforma)) {
      return res.status(400).json({ message: "plataforma invalida (android, ios, web)" });
    }

    const deviceToken = await upsertDeviceTokenRecord({
      idUsuario,
      token,
      plataforma
    });

    // Si el usuario tenia una bienvenida pendiente antes de registrar el token,
    // intentamos enviarla ahora para cubrir el flujo de registro inicial.
    try {
      const welcomeNotification = await getLatestUnreadWelcomeNotificationByDestinatario(idUsuario);

      if (welcomeNotification) {
        await sendPushNotificationToUser({
          idUsuario,
          notificacion: welcomeNotification
        });
      }
    } catch (pushError) {
      console.error("No se pudo reenviar push de bienvenida tras registrar token", pushError);
    }

    return res.status(201).json({
      message: "Token de dispositivo registrado",
      device_token: deviceToken
    });
  } catch (error) {
    next(error);
  }
}

async function unregisterDeviceToken(req, res, next) {
  try {
    const idUsuario = Number(req.auth?.id_usuario);

    if (!Number.isInteger(idUsuario) || idUsuario <= 0) {
      return res.status(401).json({ message: "Token invalido" });
    }

    const token = String(req.body?.token || "").trim();

    if (!token) {
      return res.status(400).json({ message: "token es requerido" });
    }

    const updatedCount = await deactivateDeviceTokenRecord({ idUsuario, token });

    return res.json({
      message: "Token de dispositivo actualizado",
      updated_count: updatedCount
    });
  } catch (error) {
    next(error);
  }
}

async function listMyActiveDeviceTokens(req, res, next) {
  try {
    const idUsuario = Number(req.auth?.id_usuario);

    if (!Number.isInteger(idUsuario) || idUsuario <= 0) {
      return res.status(401).json({ message: "Token invalido" });
    }

    const tokens = await listActiveDeviceTokensByUsuario(idUsuario);

    return res.json({
      data: tokens,
      total: tokens.length
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  listMyActiveDeviceTokens,
  registerDeviceToken,
  unregisterDeviceToken
};
