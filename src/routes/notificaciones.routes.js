const express = require("express");

const {
  listMyNotificaciones,
  markAllMyNotificacionesAsRead,
  markMyNotificacionAsRead
} = require("../controllers/notificaciones.controller");
const { requireAuth } = require("../middlewares/auth.middleware");

const router = express.Router();

router.get("/", requireAuth, listMyNotificaciones);
router.patch("/leidas/todas", requireAuth, markAllMyNotificacionesAsRead);
router.patch("/:id/leida", requireAuth, markMyNotificacionAsRead);

module.exports = router;
