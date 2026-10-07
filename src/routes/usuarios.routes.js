const express = require("express");

const {
  getAuthenticatedUsuario,
  updateAuthenticatedUsuarioProfile,
  deleteAuthenticatedUsuario
} = require("../controllers/usuarios.controller");
const { requireAuth } = require("../middlewares/auth.middleware");
const { upload } = require("../middlewares/upload.middleware");

const router = express.Router();

router.get("/me", requireAuth, getAuthenticatedUsuario);
router.delete("/me", requireAuth, deleteAuthenticatedUsuario);
router.patch("/me/perfil", requireAuth, upload.single("foto_perfil"), updateAuthenticatedUsuarioProfile);

module.exports = router;
