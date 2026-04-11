const { buildEmailLayout } = require("./layout");

function buildPasswordResetEmailTemplate({ nombre, code }) {
  const safeName = nombre || "Usuario";

  return {
    subject: "PillaPago - Recuperar contrasena",
    html: buildEmailLayout({
      title: "Recuperar contrasena",
      subtitle: `Hola <strong>${safeName}</strong>, recibimos una solicitud para restablecer tu contrasena.`,
      bodyHtml: `
        <p style="margin:0 0 12px 0;">Ingresa este codigo en la app:</p>
        <div style="margin:0 auto 18px auto;max-width:240px;background:#0b0f14;border:1px dashed #a5d63f;border-radius:12px;padding:14px 10px;text-align:center;">
          <span style="font-size:30px;font-weight:700;letter-spacing:6px;color:#a5d63f;">${code}</span>
        </div>
        <p style="margin:0 0 8px 0;">Este codigo expira en 10 minutos.</p>
        <p style="margin:0;color:#9ca3af;">Si no solicitaste este cambio, ignora este mensaje y tu contrasena seguira igual.</p>
      `
    })
  };
}

module.exports = {
  buildPasswordResetEmailTemplate
};
