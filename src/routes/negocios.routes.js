const express = require("express");

const {
  createNegocio,
  getNegocio,
  getMyEmployeeQuota,
  joinNegocioByCode,
  registerMyAdWatched,
  listNegocios,
  registerOwnerNegocio
} = require("../controllers/negocios.controller");
const { requireAuth } = require("../middlewares/auth.middleware");

const router = express.Router();

router.get("/", listNegocios);
router.get("/me/cupos", requireAuth, getMyEmployeeQuota);
router.post("/me/anuncio-visto", requireAuth, registerMyAdWatched);
router.get("/:id", getNegocio);
router.post("/", createNegocio);
router.post("/register-owner", requireAuth, registerOwnerNegocio);
router.post("/join", requireAuth, joinNegocioByCode);

module.exports = router;
