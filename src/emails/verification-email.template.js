const { buildEmailLayout } = require("./layout");

function buildVerificationEmailTemplate({ nombre, code }) {
  const safeName = nombre || "Usuario";

  return {
    subject: "PillaPago - Verifica tu correo",
    html: buildEmailLayout({
      title: "Verifica tu cuenta",
      subtitle: `Hola <strong>${safeName}</strong>, usa este codigo para activar tu cuenta.`,
      bodyHtml: `
        <p style="margin:0 0 12px 0;">Tu codigo de verificacion es:</p>
        <div style="margin:0 auto 18px auto;max-width:240px;background:#0b0f14;border:1px dashed #a5d63f;border-radius:12px;padding:14px 10px;text-align:center;">
          <span style="font-size:30px;font-weight:700;letter-spacing:6px;color:#a5d63f;">${code}</span>
        </div>
        <p style="margin:0 0 8px 0;">Este codigo expira en 10 minutos.</p>
        <p style="margin:0;color:#9ca3af;">Si no solicitaste este codigo, ignora este correo.</p>
      `
    })
  };
}

module.exports = {
  buildVerificationEmailTemplate
};
