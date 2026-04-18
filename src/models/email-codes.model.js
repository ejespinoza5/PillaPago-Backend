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

async function consumeEmailCode({ purpose, email, idUsuario, newEmail, codeHash }) {
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
