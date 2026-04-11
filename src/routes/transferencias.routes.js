const express = require("express");

const {
  createTransferencia,
  deleteTransferencia,
  getTransferenciaByIdController,
  getTotalTransferenciasHoy,
  getTotalTransferenciasPorAnio,
  getTotalTransferenciasPorDia,
  getTotalTransferenciasPorMes,
  listTransferencias,
  updateTransferencia
} = require("../controllers/transferencias.controller");
const { requireAuth } = require("../middlewares/auth.middleware");
const { upload } = require("../middlewares/upload.middleware");

const router = express.Router();

router.get("/", requireAuth, listTransferencias);
router.get("/totales/hoy", requireAuth, getTotalTransferenciasHoy);
router.get("/totales/dia", requireAuth, getTotalTransferenciasPorDia);
router.get("/totales/mes", requireAuth, getTotalTransferenciasPorMes);
router.get("/totales/anio", requireAuth, getTotalTransferenciasPorAnio);
router.get("/:id", requireAuth, getTransferenciaByIdController);
router.post("/", requireAuth, upload.single("imagen"), createTransferencia);
router.patch("/:id", requireAuth, upload.single("imagen"), updateTransferencia);
router.delete("/:id", requireAuth, deleteTransferencia);

module.exports = router;
