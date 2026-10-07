const crypto = require("crypto");
const { query } = require("../config/database");
const { getUsuarioById } = require("../models/usuarios.model");
const { registerAdWatched } = require("./employee-quota.service");

// Verificacion del lado del servidor (SSV) de anuncios recompensados de AdMob.
// https://developers.google.com/admob/android/ssv
const KEYS_URL = "https://www.gstatic.com/admob/reward/verifier-keys.json";
const KEYS_TTL_MS = 12 * 60 * 60 * 1000;

let cache = { keys: null, at: 0 };
let fetchKeys = async () => {
  const res = await fetch(KEYS_URL);
  if (!res.ok) throw new Error(`No se pudieron obtener las claves de AdMob (${res.status})`);
  const data = await res.json();
  return new Map(data.keys.map((k) => [String(k.keyId), k.pem]));
};

async function getKey(keyId) {
  if (!cache.keys || Date.now() - cache.at > KEYS_TTL_MS || !cache.keys.has(String(keyId))) {
    cache = { keys: await fetchKeys(), at: Date.now() };
  }
  return cache.keys.get(String(keyId)) || null;
}

/**
 * Verifica la firma de la URL de callback. El mensaje firmado es la cadena
 * de consulta completa hasta (sin incluir) "&signature=".
 */
async function verifySsvQuery(rawQuery) {
  const idx = rawQuery.indexOf("&signature=");
  if (idx < 0) return { ok: false, reason: "sin firma" };

  const message = rawQuery.slice(0, idx);
  const params = new URLSearchParams(rawQuery);
  const signature = params.get("signature");
  const keyId = params.get("key_id");
  if (!signature || !keyId) return { ok: false, reason: "faltan signature o key_id" };

  const pem = await getKey(keyId);
  if (!pem) return { ok: false, reason: "key_id desconocido" };

  const valid = crypto.verify(
    "sha256",
    Buffer.from(message, "utf8"),
    { key: pem, dsaEncoding: "der" },
    Buffer.from(signature, "base64url")
  );
  return valid ? { ok: true, params } : { ok: false, reason: "firma invalida" };
}

let tableReady = null;
function ensureTable() {
  tableReady ??= query(`
    CREATE TABLE IF NOT EXISTS admob_recompensas (
      transaction_id VARCHAR(128) PRIMARY KEY,
      id_usuario INT NOT NULL,
      id_negocio INT,
      ad_unit VARCHAR(64),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `).catch((error) => {
    tableReady = null;
    throw error;
  });
  return tableReady;
}

/** Procesa un callback ya verificado. Idempotente por transaction_id. */
async function processReward(params) {
  const transactionId = params.get("transaction_id");
  const idUsuario = Number(params.get("user_id"));
  if (!transactionId || !Number.isInteger(idUsuario) || idUsuario <= 0) {
    return { status: 400, message: "transaction_id o user_id invalidos" };
  }

  const usuario = await getUsuarioById(idUsuario);
  if (!usuario?.id_negocio || usuario.rol !== "dueno") {
    // Respondemos 200 para que Google no reintente; no hay nada que acreditar.
    return { status: 200, message: "Usuario sin negocio propio; recompensa ignorada" };
  }

  await ensureTable();
  const insert = await query(
    `INSERT INTO admob_recompensas (transaction_id, id_usuario, id_negocio, ad_unit)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (transaction_id) DO NOTHING`,
    [transactionId, idUsuario, usuario.id_negocio, params.get("ad_unit")]
  );
  if (!insert.rowCount) return { status: 200, message: "Transaccion ya procesada" };

  await registerAdWatched(usuario.id_negocio);
  return { status: 200, message: "Recompensa acreditada" };
}

module.exports = {
  verifySsvQuery,
  processReward,
  // Solo para pruebas
  __setFetchKeys: (fn) => {
    fetchKeys = fn;
    cache = { keys: null, at: 0 };
  },
};
