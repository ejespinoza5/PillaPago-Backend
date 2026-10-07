const express = require("express");

const {
  getMyEmployeeQuota,
  joinNegocioByCode,
  registerMyAdWatched,
  registerOwnerNegocio
} = require("../controllers/negocios.controller");
const { requireAuth } = require("../middlewares/auth.middleware");

const router = express.Router();

router.get("/me/cupos", requireAuth, getMyEmployeeQuota);
router.post("/me/anuncio-visto", requireAuth, registerMyAdWatched);
router.post("/register-owner", requireAuth, registerOwnerNegocio);
router.post("/join", requireAuth, joinNegocioByCode);

module.exports = router;
