const { query } = require("../config/database");

async function invalidateEmailCodes({ purpose, email, idUsuario, newEmail }) {
  await query(
    `UPDATE email_verification_codes
     SET used_at = COALESCE(used_at, NOW())
     WHERE purpose = $1
       AND email = $2
       AND ($3::INT IS NULL OR id_usuario = $3)
       AND ($4::VARCHAR IS NULL OR new_email = $4)
       AND used_at IS NULL`,
    [purpose, email, idUsuario || null, newEmail || null]
  );
}

async function createEmailCodeRecord({ purpose, email, idUsuario, newEmail, codeHash, ttlMinutes }) {
  const result = await query(
    `INSERT INTO email_verification_codes (purpose, email, id_usuario, new_email, code_hash, expires_at)
     VALUES ($1, $2, $3, $4, $5, NOW() + ($6::INT * INTERVAL '1 minute'))
     RETURNING id_email_code, purpose, email, id_usuario, new_email, expires_at, used_at, created_at`,
    [purpose, email, idUsuario || null, newEmail || null, codeHash, ttlMinutes]
  );

  return result.rows[0];
}

async function consumeEmailCodeOnce({ purpose, email, idUsuario, newEmail, codeHash }) {
  const result = await query(
    `UPDATE email_verification_codes
     SET used_at = NOW()
     WHERE id_email_code = (
       SELECT id_email_code
       FROM email_verification_codes
       WHERE purpose = $1
         AND email = $2
         AND ($3::INT IS NULL OR id_usuario = $3)
         AND ($4::VARCHAR IS NULL OR new_email = $4)
         AND code_hash = $5
         AND used_at IS NULL
         AND expires_at > NOW()
       ORDER BY created_at DESC
       LIMIT 1
     )
     RETURNING id_email_code, purpose, email, id_usuario, new_email, expires_at, used_at, created_at`,
    [purpose, email, idUsuario || null, newEmail || null, codeHash]
  );

  return result.rows[0] || null;
}

// Maximo de intentos fallidos antes de invalidar el codigo (evita fuerza bruta
// sobre los codigos de 6 digitos).
const MAX_CODE_ATTEMPTS = 5;
let attemptsColumnReady = null;

function ensureAttemptsColumn() {
  attemptsColumnReady ??= query(
    `ALTER TABLE email_verification_codes ADD COLUMN IF NOT EXISTS intentos INT NOT NULL DEFAULT 0`
  ).catch((error) => {
    attemptsColumnReady = null;
    throw error;
  });
  return attemptsColumnReady;
}

async function consumeEmailCode(params) {
  await ensureAttemptsColumn();
  const consumed = await consumeEmailCodeOnce(params);
  if (consumed) return consumed;

  // Codigo incorrecto: suma un intento al codigo vigente y lo invalida al llegar al maximo.
  const { purpose, email, idUsuario, newEmail } = params;
  await query(
    `UPDATE email_verification_codes
     SET intentos = intentos + 1,
         used_at = CASE WHEN intentos + 1 >= $5 THEN NOW() ELSE used_at END
     WHERE id_email_code = (
       SELECT id_email_code FROM email_verification_codes
       WHERE purpose = $1 AND email = $2
         AND ($3::INT IS NULL OR id_usuario = $3)
         AND ($4::VARCHAR IS NULL OR new_email = $4)
         AND used_at IS NULL AND expires_at > NOW()
       ORDER BY created_at DESC
       LIMIT 1
     )`,
    [purpose, email, idUsuario || null, newEmail || null, MAX_CODE_ATTEMPTS]
  );
  return null;
}


async function getLatestEmailCodeStatus({ purpose, email, idUsuario, newEmail, codeHash }) {
  const result = await query(
    `SELECT code_hash,
            expires_at,
            used_at,
            (expires_at <= NOW()) AS is_expired
     FROM email_verification_codes
     WHERE purpose = $1
       AND email = $2
       AND ($3::INT IS NULL OR id_usuario = $3)
       AND ($4::VARCHAR IS NULL OR new_email = $4)
     ORDER BY created_at DESC
     LIMIT 1`,
    [purpose, email, idUsuario || null, newEmail || null]
  );

  const row = result.rows[0];

  if (!row) {
    return "no_code_requested";
  }

  if (row.used_at) {
    return "code_already_used";
  }

  if (row.is_expired) {
    return "code_expired";
  }

  if (row.code_hash !== codeHash) {
    return "code_incorrect";
  }

  return "unknown";
}

module.exports = {
  consumeEmailCode,
  createEmailCodeRecord,
  getLatestEmailCodeStatus,
  invalidateEmailCodes
};
