const admin = require("firebase-admin");

const {
  deactivateDeviceTokenRecord,
  listActiveDeviceTokensByUsuario
} = require("../models/device-tokens.model");

const INVALID_TOKEN_CODES = new Set([
  "messaging/invalid-registration-token",
  "messaging/registration-token-not-registered"
]);

function normalizePrivateKey(privateKey) {
  return String(privateKey || "").replace(/\\n/g, "\n").trim();
}

function buildServiceAccountFromEnv() {
  const projectId = String(process.env.FCM_PROJECT_ID || "").trim();
  const clientEmail = String(process.env.FCM_CLIENT_EMAIL || "").trim();
  const privateKey = normalizePrivateKey(process.env.FCM_PRIVATE_KEY);

  if (!projectId || !clientEmail || !privateKey) {
    return null;
  }

  return {
    projectId,
    clientEmail,
    privateKey
  };
}

function getFirebaseApp() {
  if (String(process.env.FCM_ENABLED || "true").toLowerCase() === "false") {
    return null;
  }

  if (admin.apps.length > 0) {
    return admin.app();
  }

  const serviceAccount = buildServiceAccountFromEnv();

  if (!serviceAccount) {
    return null;
  }

  return admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

function toDataValue(value) {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  try {
    return JSON.stringify(value);
  } catch (_error) {
    return "";
  }
}

function buildFcmData({ notificacion }) {
  const data = {
    id_notificacion: toDataValue(notificacion.id_notificacion),
    tipo: toDataValue(notificacion.tipo),
    id_destinatario: toDataValue(notificacion.id_destinatario),
    id_actor: toDataValue(notificacion.id_actor),
    id_negocio: toDataValue(notificacion.id_negocio),
    created_at: toDataValue(notificacion.created_at)
  };

  if (notificacion.payload !== null && notificacion.payload !== undefined) {
    data.payload = toDataValue(notificacion.payload);
  }

  return data;
}

async function sendPushNotificationToUser({ idUsuario, notificacion }) {
  const app = getFirebaseApp();

  if (!app) {
    return {
      skipped: true,
      reason: "FCM no configurado"
    };
  }

  const idUsuarioNumber = Number(idUsuario);

  if (!Number.isInteger(idUsuarioNumber) || idUsuarioNumber <= 0 || !notificacion) {
    return {
      skipped: true,
      reason: "Datos insuficientes para push"
    };
  }

  const tokenRecords = await listActiveDeviceTokensByUsuario(idUsuarioNumber);
  const tokens = tokenRecords.map((item) => item.token).filter(Boolean);

  if (!tokens.length) {
    return {
      skipped: true,
      reason: "Usuario sin tokens activos"
    };
  }

  const messaging = admin.messaging(app);
  const response = await messaging.sendEachForMulticast({
    tokens,
    notification: {
      title: String(notificacion.titulo || "Notificacion"),
      body: String(notificacion.mensaje || "")
    },
    data: buildFcmData({ notificacion })
  });

  await Promise.all(
    response.responses.map(async (item, index) => {
      if (item.success) {
        return;
      }

      const token = tokens[index];
      const code = item.error?.code;

      if (!token || !INVALID_TOKEN_CODES.has(code)) {
        return;
      }

      await deactivateDeviceTokenRecord({ idUsuario: idUsuarioNumber, token });
    })
  );

  return {
    skipped: false,
    successCount: response.successCount,
    failureCount: response.failureCount
  };
}

module.exports = {
  sendPushNotificationToUser
};