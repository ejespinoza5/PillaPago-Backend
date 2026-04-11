const {
  createUsuarioRecord,
  getUsuarioById,
  getUsuarioProfileById,
  listUsuariosRecords,
  updateUsuarioRecord
} = require("../models/usuarios.model");
const { uploadUserProfileImage } = require("../services/storage.service");

const validRoles = new Set(["dueno", "empleado", "pendiente"]);

function buildAuthenticatedUserPayload(usuario) {
  const esDueno = usuario.rol === "dueno";
  const onboardingCompleto = Boolean(usuario.id_negocio) && usuario.rol !== "pendiente";

  return {
    id_usuario: usuario.id_usuario,
    nombre: usuario.nombre,
    email: usuario.email,
    email_verificado: usuario.email_verificado,
    google_id: usuario.google_id,
    foto_perfil_url: usuario.foto_perfil_url,
    fotoPerfilUrl: usuario.foto_perfil_url,
    tiene_foto_perfil: Boolean(usuario.foto_perfil_url),
    rol: usuario.rol,
    cargo: usuario.rol,
    es_dueno: esDueno,
    id_negocio: usuario.id_negocio,
    nombre_negocio: usuario.nombre_negocio || null,
    codigo_negocio: esDueno ? usuario.codigo_negocio || null : null,
    fecha_registro: usuario.fecha_registro,
    onboarding_completo: onboardingCompleto,
    negocio: usuario.id_negocio
      ? {
          id_negocio: usuario.id_negocio,
          nombre_negocio: usuario.nombre_negocio || null,
          codigo_negocio: esDueno ? usuario.codigo_negocio || null : null
        }
      : null,
    metricas: {
      total_transferencias: Number(usuario.total_transferencias || 0),
      total_monto_transferencias: Number(usuario.total_monto_transferencias || 0),
      transferencias_hoy: Number(usuario.transferencias_hoy || 0),
      monto_hoy: Number(usuario.monto_hoy || 0),
      transferencias_mes_actual: Number(usuario.transferencias_mes_actual || 0),
      monto_mes_actual: Number(usuario.monto_mes_actual || 0),
      ultima_transferencia_fecha: usuario.ultima_transferencia_fecha || null
    }
  };
}

async function listUsuarios(req, res, next) {
  try {
    const idNegocio = req.query?.id_negocio ? Number(req.query.id_negocio) : undefined;

    if (req.query?.id_negocio && !Number.isInteger(idNegocio)) {
      return res.status(400).json({ message: "id_negocio invalido" });
    }

    const usuarios = await listUsuariosRecords({ idNegocio });
    res.json(usuarios);
  } catch (error) {
    next(error);
  }
}

async function getUsuario(req, res, next) {
  try {
    const idUsuario = Number(req.params.id);

    if (!Number.isInteger(idUsuario)) {
      return res.status(400).json({ message: "id de usuario invalido" });
    }

    const usuario = await getUsuarioById(idUsuario);

    if (!usuario) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    res.json(usuario);
  } catch (error) {
    next(error);
  }
}

async function getAuthenticatedUsuario(req, res, next) {
  try {
    const idUsuario = Number(req.auth?.id_usuario);

    if (!Number.isInteger(idUsuario)) {
      return res.status(401).json({ message: "Token invalido" });
    }

    const usuario = await getUsuarioProfileById(idUsuario);

    if (!usuario) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    res.json(buildAuthenticatedUserPayload(usuario));
  } catch (error) {
    next(error);
  }
}

async function createUsuario(req, res, next) {
  try {
    const { nombre, email, rol, id_negocio: idNegocio, password_hash: passwordHash } = req.body || {};

    if (!nombre || !email) {
      return res.status(400).json({ message: "nombre y email son requeridos" });
    }

    if (rol && !validRoles.has(rol)) {
      return res.status(400).json({ message: "rol invalido" });
    }

    const usuario = await createUsuarioRecord({
      nombre,
      email,
      rol: rol || "pendiente",
      idNegocio: idNegocio ? Number(idNegocio) : null,
      passwordHash: passwordHash || null
    });

    res.status(201).json(usuario);
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({ message: "email ya existe" });
    }

    next(error);
  }
}

async function updateUsuario(req, res, next) {
  try {
    const idUsuario = Number(req.params.id);

    if (!Number.isInteger(idUsuario)) {
      return res.status(400).json({ message: "id de usuario invalido" });
    }

    const { nombre, foto_perfil_url: fotoPerfilUrl, rol, id_negocio: idNegocio } = req.body || {};

    if (rol && !validRoles.has(rol)) {
      return res.status(400).json({ message: "rol invalido" });
    }

    const usuario = await updateUsuarioRecord(idUsuario, {
      nombre: nombre || null,
      fotoPerfilUrl: fotoPerfilUrl || null,
      rol: rol || null,
      idNegocio: Number.isInteger(Number(idNegocio)) ? Number(idNegocio) : null
    });

    if (!usuario) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    res.json(usuario);
  } catch (error) {
    next(error);
  }
}

async function updateAuthenticatedUsuarioProfile(req, res, next) {
  try {
    const idUsuario = Number(req.auth?.id_usuario);

    if (!Number.isInteger(idUsuario)) {
      return res.status(401).json({ message: "Token invalido" });
    }

    const usuarioActual = await getUsuarioById(idUsuario);

    if (!usuarioActual) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    const nombreRecibido = req.body?.nombre;
    const envioNombre = typeof nombreRecibido === "string";
    const nombre = envioNombre ? nombreRecibido.trim() : null;

    if (!envioNombre && !req.file) {
      return res.status(400).json({
        message: "Debes enviar nombre y/o foto_perfil para actualizar el perfil"
      });
    }

    if (envioNombre && !nombre) {
      return res.status(400).json({ message: "nombre no puede estar vacio" });
    }

    let fotoPerfilUrl = null;

    if (req.file) {
      const uploadResult = await uploadUserProfileImage({
        buffer: req.file.buffer,
        mimeType: req.file.mimetype,
        originalName: req.file.originalname,
        email: usuarioActual.email
      });

      fotoPerfilUrl = uploadResult.imageUrl;
    }

    const usuarioActualizado = await updateUsuarioRecord(idUsuario, {
      nombre,
      fotoPerfilUrl,
      rol: null,
      idNegocio: null
    });

    res.json(usuarioActualizado);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  buildAuthenticatedUserPayload,
  createUsuario,
  getAuthenticatedUsuario,
  getUsuario,
  listUsuarios,
  updateAuthenticatedUsuarioProfile,
  updateUsuario
};
