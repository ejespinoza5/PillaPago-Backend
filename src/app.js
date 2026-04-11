const express = require("express");

const apiRoutes = require("./routes");

const app = express();

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api", apiRoutes);

app.use((err, _req, res, _next) => {
  console.error(err);

  if (err.type === "entity.too.large") {
    return res.status(413).json({
      message: "El cuerpo de la peticion excede el limite permitido"
    });
  }

  if (err.name === "MulterError") {
    return res.status(400).json({ message: `Error al subir archivo: ${err.message}` });
  }

  if (err.message?.includes("Solo se permiten archivos de imagen")) {
    return res.status(400).json({ message: err.message });
  }

  res.status(500).json({
    message: "Error interno del servidor"
  });
});

module.exports = app;
