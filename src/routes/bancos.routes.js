const express = require("express");

const { listBancos } = require("../controllers/bancos.controller");
const { requireAuth } = require("../middlewares/auth.middleware");

const router = express.Router();

router.get("/", requireAuth, listBancos);

module.exports = router;