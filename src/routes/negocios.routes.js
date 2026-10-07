const express = require("express");

const {
  getMyEmployeeQuota,
  joinNegocioByCode,
  registerOwnerNegocio
} = require("../controllers/negocios.controller");
const { requireAuth } = require("../middlewares/auth.middleware");

const router = express.Router();

router.get("/me/cupos", requireAuth, getMyEmployeeQuota);
router.post("/register-owner", requireAuth, registerOwnerNegocio);
router.post("/join", requireAuth, joinNegocioByCode);

module.exports = router;
