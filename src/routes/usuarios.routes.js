const express = require("express");

const {
  createUsuario,
  getAuthenticatedUsuario,
  getUsuario,
  listUsuarios,
  updateAuthenticatedUsuarioProfile,
  updateUsuario
} = require("../controllers/usuarios.controller");
const { requireAuth } = require("../middlewares/auth.middleware");
const { upload } = require("../middlewares/upload.middleware");

const router = express.Router();

router.get("/", listUsuarios);
router.get("/me", requireAuth, getAuthenticatedUsuario);
router.patch("/me/perfil", requireAuth, upload.single("foto_perfil"), updateAuthenticatedUsuarioProfile);
router.get("/:id", getUsuario);
router.post("/", createUsuario);
router.patch("/:id", updateUsuario);

module.exports = router;
