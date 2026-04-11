const express = require("express");

const {
  createNegocio,
  getNegocio,
  joinNegocioByCode,
  listNegocios,
  registerOwnerNegocio
} = require("../controllers/negocios.controller");
const { requireAuth } = require("../middlewares/auth.middleware");

const router = express.Router();

router.get("/", listNegocios);
router.get("/:id", getNegocio);
router.post("/", createNegocio);
router.post("/register-owner", requireAuth, registerOwnerNegocio);
router.post("/join", requireAuth, joinNegocioByCode);

module.exports = router;
