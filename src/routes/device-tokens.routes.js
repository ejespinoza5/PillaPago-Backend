const express = require("express");

const {
  listMyActiveDeviceTokens,
  registerDeviceToken,
  unregisterDeviceToken
} = require("../controllers/device-tokens.controller");
const { requireAuth } = require("../middlewares/auth.middleware");

const router = express.Router();

router.get("/", requireAuth, listMyActiveDeviceTokens);
router.post("/", requireAuth, registerDeviceToken);
router.delete("/", requireAuth, unregisterDeviceToken);

module.exports = router;
