const helmet = require("helmet");
const { rateLimit } = require("express-rate-limit");

const MIN = 60 * 1000;

function limiter({ windowMs, limit, message }) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { message },
  });
}

// General para toda la API (uso normal de la app queda muy por debajo).
const apiLimiter = limiter({
  windowMs: 15 * MIN,
  limit: 600,
  message: "Demasiadas solicitudes. Espera unos minutos e intenta de nuevo.",
});

// Inicio de sesion y registro: frena ataques de fuerza bruta a contrasenas.
const authLimiter = limiter({
  windowMs: 15 * MIN,
  limit: 20,
  message: "Demasiados intentos de inicio de sesion. Espera 15 minutos.",
});

// Validacion de codigos de 6 digitos (recuperar contrasena, verificar correo).
const codeLimiter = limiter({
  windowMs: 15 * MIN,
  limit: 10,
  message: "Demasiados intentos con el codigo. Espera 15 minutos.",
});

// Envio de correos: evita usar el servidor para enviar spam.
const emailLimiter = limiter({
  windowMs: 60 * MIN,
  limit: 6,
  message: "Ya enviamos varios codigos. Espera un rato antes de pedir otro.",
});

const refreshLimiter = limiter({
  windowMs: 15 * MIN,
  limit: 60,
  message: "Demasiadas renovaciones de sesion. Espera unos minutos.",
});

function applySecurity(app) {
  app.disable("x-powered-by");

  // Detras de un proxy (nginx, Cloudflare) la IP real viene en X-Forwarded-For.
  // TRUST_PROXY = numero de proxies delante del servidor (por defecto 1).
  app.set("trust proxy", Number(process.env.TRUST_PROXY ?? 1));

  app.use(helmet({
    // Las imagenes y el APK se descargan desde la app, no desde otros sitios web.
    crossOriginResourcePolicy: { policy: "same-site" },
  }));

  app.use("/api", apiLimiter);
  app.use("/api/auth/email/login", authLimiter);
  app.use("/api/auth/google", authLimiter);
  app.use("/api/auth/email/register", authLimiter);
  app.use("/api/auth/email/register-owner", authLimiter);
  app.use("/api/auth/email/register-employee", authLimiter);
  app.use("/api/auth/refresh", refreshLimiter);
  app.use("/api/auth/password/reset", codeLimiter);
  app.use("/api/auth/email/verify/confirm", codeLimiter);
  app.use("/api/auth/email/change/confirm", codeLimiter);
  app.use("/api/auth/password/forgot", emailLimiter);
  app.use("/api/auth/email/verify/request", emailLimiter);
  app.use("/api/auth/email/change/request", emailLimiter);
  app.use("/api/usuarios/me", (req, res, next) =>
    req.method === "DELETE" ? codeLimiter(req, res, next) : next());
}

module.exports = { applySecurity };
