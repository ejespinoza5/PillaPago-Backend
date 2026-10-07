const express = require("express");
const { verifySsvQuery, processReward } = require("../services/admob-ssv.service");

const router = express.Router();

// Callback de verificacion del lado del servidor (SSV). Lo llama Google cuando
// un usuario termina un anuncio recompensado; la firma garantiza que es real.
router.get("/ssv", async (req, res, next) => {
  try {
    const rawQuery = req.originalUrl.split("?")[1] || "";
    // La consola de AdMob prueba la URL sin parametros: solo confirmamos que existe.
    if (!rawQuery) return res.status(200).json({ message: "SSV activo" });

    const verificacion = await verifySsvQuery(rawQuery);
    if (!verificacion.ok) {
      return res.status(403).json({ message: `Callback rechazado: ${verificacion.reason}` });
    }

    const result = await processReward(verificacion.params);
    return res.status(result.status).json({ message: result.message });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
