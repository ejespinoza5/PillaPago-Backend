const { query } = require("../config/database");

/**
 * Elimina la cuenta de un usuario anonimizando sus datos personales.
 * Las transferencias se conservan como registro contable del negocio
 * (sin datos personales del usuario). Si el usuario es dueno, el negocio
 * se cierra: sus transferencias se inactivan, los empleados quedan libres
 * y el codigo de invitacion deja de funcionar.
 */
async function deleteUserAccount(usuario) {
  const idUsuario = usuario.id_usuario;

  if (usuario.rol === "dueno" && usuario.id_negocio) {
    const idNegocio = usuario.id_negocio;
    await query(
      `UPDATE transferencias SET estado = 'INACTIVO' WHERE id_negocio = $1`,
      [idNegocio]
    );
    await query(
      `UPDATE usuarios SET id_negocio = NULL, rol = 'pendiente'
       WHERE id_negocio = $1 AND id_usuario <> $2`,
      [idNegocio, idUsuario]
    );
    await query(
      `UPDATE negocios SET codigo_invitacion = $2 WHERE id_negocio = $1`,
      [idNegocio, `CERRADO-${idNegocio}`]
    );
  }

  await query(
    `UPDATE refresh_tokens SET revoked_at = COALESCE(revoked_at, NOW()) WHERE id_usuario = $1`,
    [idUsuario]
  );
  await query(
    `UPDATE device_tokens SET activo = false WHERE id_usuario = $1`,
    [idUsuario]
  ).catch(() => {});
  await query(
    `DELETE FROM email_verification_codes WHERE id_usuario = $1`,
    [idUsuario]
  ).catch(() => {});

  await query(
    `UPDATE usuarios
     SET nombre = 'Usuario eliminado',
         email = $2,
         google_id = NULL,
         password_hash = NULL,
         foto_perfil_url = NULL,
         id_negocio = NULL,
         rol = 'pendiente',
         estado = 'eliminado',
         email_verificado = false
     WHERE id_usuario = $1`,
    [idUsuario, `eliminado-${idUsuario}-${Date.now()}@pillapago.invalid`]
  );
}

module.exports = { deleteUserAccount };
