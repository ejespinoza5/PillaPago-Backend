const jwt = require("jsonwebtoken");

function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Token Bearer requerido" });
  }

  const token = authHeader.slice(7).trim();
  const jwtSecret = process.env.JWT_SECRET;

  if (!jwtSecret) {
    return res.status(500).json({ message: "JWT_SECRET no esta configurado" });
  }

  try {
    const payload = jwt.verify(token, jwtSecret);
    req.auth = payload;
    next();
  } catch (_error) {
    return res.status(401).json({ message: "Token invalido o expirado" });
  }
}

module.exports = {
  requireAuth
};
