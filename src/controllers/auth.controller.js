const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { OAuth2Client } = require("google-auth-library");

const {
  createNegocioRecord,
  getNegocioByCodigoInvitacion
} = require("../models/negocios.model");
const {
  consumeEmailCode,
  createEmailCodeRecord,
  getLatestEmailCodeStatus,
  invalidateEmailCodes
} = require("../models/email-codes.model");
const {
  createUsuarioEmailRecord,
  getUsuarioAuthById,
  getUsuarioAuthByEmail,
  getUsuarioById,
  updateUsuarioPassword,
  updateUsuarioEmail,
  verifyUsuarioEmail,
  upsertGoogleUsuario
} = require("../models/usuarios.model");
const {
  notifyEmployeeWelcomeJoinedBusiness,
  notifyOwnerEmployeeJoined,
  notifyOwnerWelcomeCreatedBusiness,
  notifySecurityEvent
} = require("../services/notification.service");
const {
  sendEmailChangeCodeEmail,
  sendPasswordResetCodeEmail,
  sendVerificationCodeEmail
} = require("../services/mailer.service");
const { uploadUserProfileImage } = require("../services/storage.service");
const { generateInvitationCode } = require("../utils/invitation-code");

const EMAIL_CHANGE_PURPOSE = "email_change";
const EMAIL_CHANGE_CODE_TTL_MINUTES = 10;
const PASSWORD_RESET_PURPOSE = "password_reset";
const PASSWORD_RESET_CODE_TTL_MINUTES = 10;
const EMAIL_VERIFY_PURPOSE = "email_verification";
const EMAIL_VERIFY_CODE_TTL_MINUTES = 10;

function hashCode(code) {
  return crypto.createHash("sha256").update(String(code)).digest("hex");
}

function generateNumericCode(length = 6) {
  const max = 10 ** length;
  const value = crypto.randomInt(0, max);
  return String(value).padStart(length, "0");
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function validatePasswordPolicy(value) {
  const password = String(value || "");
  const rules = {
    minLength: password.length >= 6,
    uppercase: /[A-Z]/.test(password),
    number: /\d/.test(password),
    special: /[^A-Za-z0-9]/.test(password)
  };

  const errors = [];

  if (!rules.minLength) {
    errors.push("minimo 6 caracteres");
  }

  if (!rules.uppercase) {
    errors.push("al menos 1 letra mayuscula");
  }

  if (!rules.number) {
    errors.push("al menos 1 numero");
  }

  if (!rules.special) {
    errors.push("al menos 1 caracter especial");
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

function getPublicUser(usuario) {
  return {
    id_usuario: usuario.id_usuario,
    nombre: usuario.nombre,
    email: usuario.email,
    email_verificado: Boolean(usuario.email_verificado),
    google_id: usuario.google_id,
    foto_perfil_url: usuario.foto_perfil_url,
    rol: usuario.rol,
    id_negocio: usuario.id_negocio,
    fecha_registro: usuario.fecha_registro
  };
}

function getGoogleClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID;

  if (!clientId) {
    throw new Error("GOOGLE_CLIENT_ID no esta configurado");
  }

  return new OAuth2Client(clientId);
}

function signToken(usuario) {
  const jwtSecret = process.env.JWT_SECRET;

  if (!jwtSecret) {
    throw new Error("JWT_SECRET no esta configurado");
  }

  return jwt.sign(
    {
      id_usuario: usuario.id_usuario,
      email: usuario.email,
      rol: usuario.rol
    },
    jwtSecret,
    { expiresIn: "7d" }
  );
}

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

async function googleLogin(req, res, next) {
  try {
    const { idToken } = req.body || {};

    if (!idToken) {
      return res.status(400).json({ message: "idToken es requerido" });
    }

    const ticket = await getGoogleClient().verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID
    });

    const payload = ticket.getPayload();

    if (!payload?.email) {
      return res.status(401).json({ message: "Token de Google invalido" });
    }

    if (!isValidEmail(payload.email)) {
      return res.status(401).json({ message: "El email de Google no es valido" });
    }

    if (payload.email_verified === false) {
      return res.status(401).json({ message: "El email de Google no esta verificado" });
    }

    const existingUser = await getUsuarioAuthByEmail(payload.email);

    if (existingUser && !existingUser.google_id) {
      return res.status(409).json({
        message: "Ese correo ya esta registrado con email y contrasena"
      });
    }

    const usuario = await upsertGoogleUsuario({
      nombre: payload.name || payload.email,
      email: payload.email,
      googleId: payload.sub,
      fotoPerfilUrl: payload.picture || null,
      rol: "pendiente",
      idNegocio: null
    });

    const token = signToken(usuario);

    const onboardingRequired = !usuario.id_negocio || usuario.rol === "pendiente";

    res.json({
      token,
      usuario,
      onboarding_required: onboardingRequired
    });
  } catch (error) {
    if (error.message?.includes("GOOGLE_CLIENT_ID") || error.message?.includes("JWT_SECRET")) {
      return res.status(500).json({ message: error.message });
    }

    if (error.message?.toLowerCase().includes("token")) {
      return res.status(401).json({ message: "No se pudo validar el token de Google" });
    }

    next(error);
  }
}

async function handleEmailRegistration(req, res, next, mode = "general") {
  try {
    const {
      nombre,
      email,
      password,
      nombre_negocio: nombreNegocio,
      codigo_invitacion: codigoInvitacion
    } = req.body || {};

    if (!nombre || !email || !password) {
      return res.status(400).json({ message: "nombre, email y password son requeridos" });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ message: "email no es valido" });
    }

    const passwordValidation = validatePasswordPolicy(password);

    if (!passwordValidation.isValid) {
      return res.status(400).json({
        message: `La contrasena no cumple la politica: ${passwordValidation.errors.join(", ")}`
      });
    }

    let idNegocio = null;
    let rol = "pendiente";
    let negocio = null;

    if (mode === "owner" && !nombreNegocio) {
      return res.status(400).json({ message: "nombre_negocio es requerido para registrar dueno" });
    }

    if (mode === "employee" && !codigoInvitacion) {
      return res.status(400).json({ message: "codigo_invitacion es requerido para unirse como empleado" });
    }

    if (nombreNegocio && codigoInvitacion) {
      return res.status(400).json({
        message: "No puedes enviar nombre_negocio y codigo_invitacion al mismo tiempo"
      });
    }

    if (nombreNegocio) {
      negocio = await createNegocioWithUniqueCode(nombreNegocio);
      idNegocio = negocio.id_negocio;
      rol = "dueno";
    }

    if (!nombreNegocio && codigoInvitacion) {
      negocio = await getNegocioByCodigoInvitacion(codigoInvitacion);

      if (!negocio) {
        return res.status(404).json({ message: "Codigo de invitacion invalido" });
      }

      idNegocio = negocio.id_negocio;
      rol = "empleado";
    }

    let fotoPerfilUrl = null;

    if (req.file) {
      const uploadResult = await uploadUserProfileImage({
        buffer: req.file.buffer,
        mimeType: req.file.mimetype,
        originalName: req.file.originalname,
        email,
        req
      });
      fotoPerfilUrl = uploadResult.imageUrl;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const usuario = await createUsuarioEmailRecord({
      nombre,
      email,
      rol,
      idNegocio,
      passwordHash,
      fotoPerfilUrl
    });

    if (rol === "empleado" && idNegocio) {
      try {
        await notifyOwnerEmployeeJoined({
          idNegocio,
          empleado: usuario
        });
      } catch (notificationError) {
        console.error("No se pudo crear notificacion de nuevo empleado", notificationError);
      }

      try {
        await notifyEmployeeWelcomeJoinedBusiness({
          empleado: usuario,
          negocio
        });
      } catch (notificationError) {
        console.error("No se pudo crear notificacion de bienvenida para empleado", notificationError);
      }
    }

    if (rol === "dueno" && idNegocio) {
      try {
        await notifyOwnerWelcomeCreatedBusiness({
          dueno: usuario,
          negocio
        });
      } catch (notificationError) {
        console.error("No se pudo crear notificacion de bienvenida para dueno", notificationError);
      }
    }

    const token = signToken(usuario);

    const verificationCode = generateNumericCode(6);
    const verificationCodeHash = hashCode(verificationCode);

    let verificationEmailSent = false;
    let verificationEmailError = null;

    try {
      await invalidateEmailCodes({
        purpose: EMAIL_VERIFY_PURPOSE,
        email: usuario.email,
        idUsuario: usuario.id_usuario,
        newEmail: null
      });

      await createEmailCodeRecord({
        purpose: EMAIL_VERIFY_PURPOSE,
        email: usuario.email,
        idUsuario: usuario.id_usuario,
        newEmail: null,
        codeHash: verificationCodeHash,
        ttlMinutes: EMAIL_VERIFY_CODE_TTL_MINUTES
      });

      await sendVerificationCodeEmail({
        to: usuario.email,
        nombre: usuario.nombre,
        code: verificationCode
      });

      verificationEmailSent = true;
    } catch (mailError) {
      verificationEmailError = "No se pudo enviar el correo de verificacion";
      console.error(mailError);
    }

    res.status(201).json({
      token,
      usuario,
      negocio,
      verification_email_sent: verificationEmailSent,
      verification_email_expires_in_minutes: EMAIL_VERIFY_CODE_TTL_MINUTES,
      verification_email_error: verificationEmailError
    });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({ message: "email ya existe" });
    }

    next(error);
  }
}

async function registerEmail(req, res, next) {
  return handleEmailRegistration(req, res, next, "general");
}

async function registerOwnerEmail(req, res, next) {
  return handleEmailRegistration(req, res, next, "owner");
}

async function registerEmployeeEmail(req, res, next) {
  return handleEmailRegistration(req, res, next, "employee");
}

async function loginEmail(req, res, next) {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ message: "email y password son requeridos" });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ message: "email no es valido" });
    }

    const usuario = await getUsuarioAuthByEmail(email);

    if (!usuario || !usuario.password_hash) {
      return res.status(401).json({ message: "Credenciales invalidas" });
    }

    const isValidPassword = await bcrypt.compare(password, usuario.password_hash);

    if (!isValidPassword) {
      return res.status(401).json({ message: "Credenciales invalidas" });
    }

    const token = signToken(usuario);

    const onboardingRequired = !usuario.id_negocio || usuario.rol === "pendiente";

    res.json({
      token,
      usuario: getPublicUser(usuario),
      onboarding_required: onboardingRequired
    });
  } catch (error) {
    next(error);
  }
}

async function getMe(req, res, next) {
  try {
    const usuario = await getUsuarioById(req.auth.id_usuario);

    if (!usuario) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    res.json(usuario);
  } catch (error) {
    next(error);
  }
}

async function forgotPassword(req, res, next) {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();

    if (!email) {
      return res.status(400).json({ message: "email es requerido" });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ message: "email no es valido" });
    }

    const usuario = await getUsuarioAuthByEmail(email);

    // Respuesta neutral para no exponer si el correo existe o no.
    if (!usuario) {
      return res.json({
        message: "Se envio un codigo de recuperacion al correo ingresado"
      });
    }

    const code = generateNumericCode(6);
    const codeHash = hashCode(code);

    await invalidateEmailCodes({
      purpose: PASSWORD_RESET_PURPOSE,
      email: usuario.email,
      idUsuario: usuario.id_usuario,
      newEmail: null
    });

    await createEmailCodeRecord({
      purpose: PASSWORD_RESET_PURPOSE,
      email: usuario.email,
      idUsuario: usuario.id_usuario,
      newEmail: null,
      codeHash,
      ttlMinutes: PASSWORD_RESET_CODE_TTL_MINUTES
    });

    await sendPasswordResetCodeEmail({
      to: usuario.email,
      nombre: usuario.nombre,
      code
    });

    return res.json({
      message: "Se envio un codigo de recuperacion al correo ingresado",
      expires_in_minutes: PASSWORD_RESET_CODE_TTL_MINUTES
    });
  } catch (error) {
    next(error);
  }
}

async function resetPassword(req, res, next) {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const code = String(req.body?.code || "").trim();
    const newPassword = req.body?.newPassword || req.body?.password_nueva || req.body?.contrasena_nueva;

    if (!email || !code || !newPassword) {
      return res.status(400).json({ message: "email, code y newPassword son requeridos" });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ message: "email no es valido" });
    }

    const passwordValidation = validatePasswordPolicy(newPassword);

    if (!passwordValidation.isValid) {
      return res.status(400).json({
        message: `La contrasena nueva no cumple la politica: ${passwordValidation.errors.join(", ")}`
      });
    }

    const usuario = await getUsuarioAuthByEmail(email);

    if (!usuario) {
      return res.status(400).json({ message: "No se pudo validar el codigo" });
    }

    const codeHash = hashCode(code);

    const consumedCode = await consumeEmailCode({
      purpose: PASSWORD_RESET_PURPOSE,
      email: usuario.email,
      idUsuario: usuario.id_usuario,
      newEmail: null,
      codeHash
    });

    if (!consumedCode) {
      const status = await getLatestEmailCodeStatus({
        purpose: PASSWORD_RESET_PURPOSE,
        email: usuario.email,
        idUsuario: usuario.id_usuario,
        newEmail: null,
        codeHash
      });

      if (status === "no_code_requested") {
        return res.status(400).json({ message: "No hay codigo de recuperacion solicitado" });
      }

      if (status === "code_expired") {
        return res.status(400).json({ message: "El codigo expiro" });
      }

      if (status === "code_already_used") {
        return res.status(400).json({ message: "El codigo ya fue usado" });
      }

      if (status === "code_incorrect") {
        return res.status(400).json({ message: "Codigo incorrecto" });
      }

      return res.status(400).json({ message: "No se pudo validar el codigo" });
    }

    const newPasswordHash = await bcrypt.hash(String(newPassword), 10);
    const usuarioActualizado = await updateUsuarioPassword(usuario.id_usuario, newPasswordHash);

    try {
      await notifySecurityEvent({
        usuario: usuarioActualizado || usuario,
        tipo: "seguridad_password_recuperado",
        titulo: "Contrasena restablecida",
        mensaje: "Tu contrasena fue restablecida correctamente",
        payload: {
          id_usuario: usuario.id_usuario,
          email: usuario.email
        }
      });
    } catch (notificationError) {
      console.error("No se pudo crear notificacion de seguridad por recuperacion", notificationError);
    }

    return res.json({ message: "Contrasena restablecida correctamente" });
  } catch (error) {
    next(error);
  }
}

async function changePassword(req, res, next) {
  try {
    const idUsuario = Number(req.auth?.id_usuario);

    if (!Number.isInteger(idUsuario) || idUsuario <= 0) {
      return res.status(401).json({ message: "Token invalido" });
    }

    const passwordActual = req.body?.password_actual || req.body?.contrasena_anterior;
    const passwordNueva = req.body?.password_nueva || req.body?.contrasena_nueva;

    if (!passwordActual || !passwordNueva) {
      return res.status(400).json({
        message: "password_actual y password_nueva son requeridos"
      });
    }

    const newPasswordValidation = validatePasswordPolicy(passwordNueva);

    if (!newPasswordValidation.isValid) {
      return res.status(400).json({
        message: `La contrasena nueva no cumple la politica: ${newPasswordValidation.errors.join(", ")}`
      });
    }

    if (String(passwordActual) === String(passwordNueva)) {
      return res.status(400).json({
        message: "La contrasena nueva debe ser diferente a la contrasena actual"
      });
    }

    const usuario = await getUsuarioAuthById(idUsuario);

    if (!usuario) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    if (!usuario.password_hash) {
      return res.status(409).json({
        message: "Tu cuenta no tiene contrasena registrada"
      });
    }

    const passwordValida = await bcrypt.compare(String(passwordActual), usuario.password_hash);

    if (!passwordValida) {
      return res.status(401).json({ message: "La contrasena actual es incorrecta" });
    }

    const nuevoHash = await bcrypt.hash(String(passwordNueva), 10);
    await updateUsuarioPassword(idUsuario, nuevoHash);

    try {
      await notifySecurityEvent({
        usuario,
        tipo: "seguridad_password_cambiado",
        titulo: "Cambio de contrasena exitoso",
        mensaje: "Tu contrasena fue actualizada correctamente",
        payload: {
          id_usuario: usuario.id_usuario,
          email: usuario.email
        }
      });
    } catch (notificationError) {
      console.error("No se pudo crear notificacion de seguridad por cambio de contrasena", notificationError);
    }

    return res.json({ message: "Contrasena actualizada correctamente" });
  } catch (error) {
    next(error);
  }
}

async function requestEmailChange(req, res, next) {
  try {
    const idUsuario = Number(req.auth?.id_usuario);

    if (!Number.isInteger(idUsuario) || idUsuario <= 0) {
      return res.status(401).json({ message: "Token invalido" });
    }

    const newEmailRaw = req.body?.new_email;
    const newEmail = String(newEmailRaw || "").trim().toLowerCase();

    if (!newEmail) {
      return res.status(400).json({ message: "new_email es requerido" });
    }

    if (!isValidEmail(newEmail)) {
      return res.status(400).json({ message: "new_email no es valido" });
    }

    const usuario = await getUsuarioAuthById(idUsuario);

    if (!usuario) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    const currentEmail = String(usuario.email || "").trim().toLowerCase();

    if (newEmail === currentEmail) {
      return res.status(400).json({ message: "El nuevo correo debe ser diferente al actual" });
    }

    const existingUser = await getUsuarioAuthByEmail(newEmail);

    if (existingUser && Number(existingUser.id_usuario) !== idUsuario) {
      return res.status(409).json({ message: "El correo ya esta en uso" });
    }

    const code = generateNumericCode(6);
    const codeHash = hashCode(code);

    await invalidateEmailCodes({
      purpose: EMAIL_CHANGE_PURPOSE,
      email: usuario.email,
      idUsuario,
      newEmail: null
    });

    await createEmailCodeRecord({
      purpose: EMAIL_CHANGE_PURPOSE,
      email: usuario.email,
      idUsuario,
      newEmail,
      codeHash,
      ttlMinutes: EMAIL_CHANGE_CODE_TTL_MINUTES
    });

    await sendEmailChangeCodeEmail({
      to: newEmail,
      nombre: usuario.nombre,
      code
    });

    return res.json({
      message: "Codigo enviado al nuevo correo",
      new_email: newEmail,
      expires_in_minutes: EMAIL_CHANGE_CODE_TTL_MINUTES
    });
  } catch (error) {
    next(error);
  }
}

async function confirmEmailChange(req, res, next) {
  try {
    const idUsuario = Number(req.auth?.id_usuario);

    if (!Number.isInteger(idUsuario) || idUsuario <= 0) {
      return res.status(401).json({ message: "Token invalido" });
    }

    const newEmail = String(req.body?.new_email || "").trim().toLowerCase();
    const code = String(req.body?.code || "").trim();

    if (!newEmail || !code) {
      return res.status(400).json({ message: "new_email y code son requeridos" });
    }

    if (!isValidEmail(newEmail)) {
      return res.status(400).json({ message: "new_email no es valido" });
    }

    const usuario = await getUsuarioAuthById(idUsuario);

    if (!usuario) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    const codeHash = hashCode(code);

    const consumedCode = await consumeEmailCode({
      purpose: EMAIL_CHANGE_PURPOSE,
      email: usuario.email,
      idUsuario,
      newEmail,
      codeHash
    });

    if (!consumedCode) {
      const status = await getLatestEmailCodeStatus({
        purpose: EMAIL_CHANGE_PURPOSE,
        email: usuario.email,
        idUsuario,
        newEmail,
        codeHash
      });

      if (status === "no_code_requested") {
        return res.status(400).json({ message: "No hay solicitud de cambio de correo para ese email" });
      }

      if (status === "code_expired") {
        return res.status(400).json({ message: "El codigo expiro" });
      }

      if (status === "code_already_used") {
        return res.status(400).json({ message: "El codigo ya fue usado" });
      }

      if (status === "code_incorrect") {
        return res.status(400).json({ message: "Codigo incorrecto" });
      }

      return res.status(400).json({ message: "No se pudo validar el codigo" });
    }

    const usuarioActualizado = await updateUsuarioEmail(idUsuario, newEmail);

    try {
      await notifySecurityEvent({
        usuario: usuarioActualizado,
        tipo: "seguridad_email_cambiado",
        titulo: "Correo actualizado",
        mensaje: "Tu correo de acceso fue actualizado correctamente",
        payload: {
          id_usuario: usuarioActualizado.id_usuario,
          email_anterior: usuario.email,
          email_nuevo: usuarioActualizado.email
        }
      });
    } catch (notificationError) {
      console.error("No se pudo crear notificacion de seguridad por cambio de correo", notificationError);
    }

    return res.json({
      message: "Correo actualizado correctamente",
      usuario: getPublicUser(usuarioActualizado)
    });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({ message: "El correo ya esta en uso" });
    }

    next(error);
  }
}

async function requestEmailVerification(req, res, next) {
  try {
    const idUsuario = Number(req.auth?.id_usuario);

    if (!Number.isInteger(idUsuario) || idUsuario <= 0) {
      return res.status(401).json({ message: "Token invalido" });
    }

    const usuario = await getUsuarioAuthById(idUsuario);

    if (!usuario) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    if (usuario.email_verificado) {
      return res.json({
        message: "El correo ya esta verificado",
        usuario: getPublicUser(usuario)
      });
    }

    const verificationCode = generateNumericCode(6);
    const verificationCodeHash = hashCode(verificationCode);

    await invalidateEmailCodes({
      purpose: EMAIL_VERIFY_PURPOSE,
      email: usuario.email,
      idUsuario,
      newEmail: null
    });

    await createEmailCodeRecord({
      purpose: EMAIL_VERIFY_PURPOSE,
      email: usuario.email,
      idUsuario,
      newEmail: null,
      codeHash: verificationCodeHash,
      ttlMinutes: EMAIL_VERIFY_CODE_TTL_MINUTES
    });

    await sendVerificationCodeEmail({
      to: usuario.email,
      nombre: usuario.nombre,
      code: verificationCode
    });

    return res.json({
      message: "Codigo de verificacion enviado",
      email: usuario.email,
      expires_in_minutes: EMAIL_VERIFY_CODE_TTL_MINUTES
    });
  } catch (error) {
    next(error);
  }
}

async function confirmEmailVerification(req, res, next) {
  try {
    const idUsuario = Number(req.auth?.id_usuario);

    if (!Number.isInteger(idUsuario) || idUsuario <= 0) {
      return res.status(401).json({ message: "Token invalido" });
    }

    const code = String(req.body?.code || "").trim();

    if (!code) {
      return res.status(400).json({ message: "code es requerido" });
    }

    const usuario = await getUsuarioAuthById(idUsuario);

    if (!usuario) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    if (usuario.email_verificado) {
      return res.json({
        message: "El correo ya estaba verificado",
        usuario: getPublicUser(usuario)
      });
    }

    const codeHash = hashCode(code);

    const consumedCode = await consumeEmailCode({
      purpose: EMAIL_VERIFY_PURPOSE,
      email: usuario.email,
      idUsuario,
      newEmail: null,
      codeHash
    });

    if (!consumedCode) {
      const status = await getLatestEmailCodeStatus({
        purpose: EMAIL_VERIFY_PURPOSE,
        email: usuario.email,
        idUsuario,
        newEmail: null,
        codeHash
      });

      if (status === "no_code_requested") {
        return res.status(400).json({ message: "No hay codigo de verificacion solicitado" });
      }

      if (status === "code_expired") {
        return res.status(400).json({ message: "El codigo expiro" });
      }

      if (status === "code_already_used") {
        return res.status(400).json({ message: "El codigo ya fue usado" });
      }

      if (status === "code_incorrect") {
        return res.status(400).json({ message: "Codigo incorrecto" });
      }

      return res.status(400).json({ message: "No se pudo validar el codigo" });
    }

    const usuarioActualizado = await verifyUsuarioEmail(idUsuario);

    try {
      await notifySecurityEvent({
        usuario: usuarioActualizado,
        tipo: "seguridad_email_verificado",
        titulo: "Correo verificado",
        mensaje: "Tu correo fue verificado correctamente",
        payload: {
          id_usuario: usuarioActualizado.id_usuario,
          email: usuarioActualizado.email
        }
      });
    } catch (notificationError) {
      console.error("No se pudo crear notificacion de seguridad por verificacion de correo", notificationError);
    }

    return res.json({
      message: "Correo verificado correctamente",
      usuario: getPublicUser(usuarioActualizado)
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  changePassword,
  forgotPassword,
  requestEmailVerification,
  confirmEmailVerification,
  confirmEmailChange,
  getMe,
  googleLogin,
  loginEmail,
  resetPassword,
  requestEmailChange,
  registerEmployeeEmail,
  registerEmail,
  registerOwnerEmail
};
