const express = require("express");

const authRoutes = require("./auth.routes");
const bancosRoutes = require("./bancos.routes");
const deviceTokensRoutes = require("./device-tokens.routes");
const empleadosRoutes = require("./empleados.routes");
const negociosRoutes = require("./negocios.routes");
const notificacionesRoutes = require("./notificaciones.routes");
const transferenciasRoutes = require("./transferencias.routes");
const usuariosRoutes = require("./usuarios.routes");

const router = express.Router();

router.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

router.use("/auth", authRoutes);
router.use("/bancos", bancosRoutes);
router.use("/device-tokens", deviceTokensRoutes);
router.use("/empleados", empleadosRoutes);
router.use("/negocios", negociosRoutes);
router.use("/notificaciones", notificacionesRoutes);
router.use("/transferencias", transferenciasRoutes);
router.use("/usuarios", usuariosRoutes);

module.exports = router;
