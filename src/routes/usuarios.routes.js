const express = require("express");

const {
  createUsuario,
  getAuthenticatedUsuario,
  getUsuario,
  listUsuarios,
  updateUsuario
} = require("../controllers/usuarios.controller");
const { requireAuth } = require("../middlewares/auth.middleware");

const router = express.Router();

router.get("/", listUsuarios);
router.get("/me", requireAuth, getAuthenticatedUsuario);
router.get("/:id", getUsuario);
router.post("/", createUsuario);
router.patch("/:id", updateUsuario);

module.exports = router;
