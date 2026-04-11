const express = require("express");

const authRoutes = require("./auth.routes");
const bancosRoutes = require("./bancos.routes");
const empleadosRoutes = require("./empleados.routes");
const negociosRoutes = require("./negocios.routes");
const transferenciasRoutes = require("./transferencias.routes");
const usuariosRoutes = require("./usuarios.routes");

const router = express.Router();

router.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

router.use("/auth", authRoutes);
router.use("/bancos", bancosRoutes);
router.use("/empleados", empleadosRoutes);
router.use("/negocios", negociosRoutes);
router.use("/transferencias", transferenciasRoutes);
router.use("/usuarios", usuariosRoutes);

module.exports = router;
