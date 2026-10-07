const fs = require("fs");
const path = require("path");
const { query } = require("../config/database");

const LEGAL_DIR = path.join(__dirname, "..", "..", "public", "legal");
const FECHA_VIGENCIA = "7 de octubre de 2026";

let columnReady = null;

function ensureColumn() {
  columnReady ??= query(
    `ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS terminos_aceptados_at TIMESTAMPTZ`
  ).catch((error) => {
    columnReady = null;
    throw error;
  });
  return columnReady;
}

/** Guarda cuando el usuario acepto los terminos y declaro ser mayor de edad. */
async function registrarAceptacionTerminos(idUsuario) {
  await ensureColumn();
  await query(
    `UPDATE usuarios SET terminos_aceptados_at = COALESCE(terminos_aceptados_at, NOW())
     WHERE id_usuario = $1`,
    [idUsuario]
  );
}

/** true si el usuario ya acepto los terminos. */
async function terminosAceptados(idUsuario) {
  await ensureColumn();
  const r = await query(
    `SELECT terminos_aceptados_at FROM usuarios WHERE id_usuario = $1`,
    [idUsuario]
  );
  return Boolean(r.rows[0]?.terminos_aceptados_at);
}

/** Responde una pagina legal con el correo de contacto configurado. */
function servirPaginaLegal(archivo) {
  return (_req, res) => {
    const contacto = process.env.LEGAL_CONTACT_EMAIL || process.env.SMTP_FROM || "";
    const html = fs
      .readFileSync(path.join(LEGAL_DIR, archivo), "utf8")
      .replaceAll("{{CONTACTO}}", contacto.replace(/^.*<|>.*$/g, ""))
      .replaceAll("{{FECHA}}", FECHA_VIGENCIA);
    res.type("html").send(html);
  };
}

module.exports = { LEGAL_DIR, registrarAceptacionTerminos, servirPaginaLegal, terminosAceptados };
