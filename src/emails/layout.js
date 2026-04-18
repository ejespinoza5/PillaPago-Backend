function buildEmailLayout({ title, subtitle, bodyHtml }) {
  const logoUrl = process.env.EMAIL_LOGO_URL || "";
  const brandGreen = "#a5d63f";
  const brandDark = "#0b0f14";
  const cardBackground = "#111827";
  const brandText = "#e5e7eb";

  return `
  <div style="margin:0;padding:0;background:${brandDark};font-family:Segoe UI,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${brandDark};padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:${cardBackground};border:1px solid #1f2937;border-radius:16px;overflow:hidden;">
            <tr>
              <td style="padding:24px 24px 8px 24px;text-align:center;">
                ${logoUrl
                  ? `<img src="${logoUrl}" alt="PillaPago" style="max-width:220px;height:auto;display:inline-block;" />`
                  : ""}
              </td>
            </tr>
            <tr>
              <td style="padding:0 24px 12px 24px;text-align:center;">
                <h1 style="margin:0;color:${brandGreen};font-size:24px;line-height:1.3;">${title}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:0 24px 16px 24px;text-align:center;color:${brandText};font-size:15px;line-height:1.5;">
                ${subtitle}
              </td>
            </tr>
            <tr>
              <td style="padding:0 24px 28px 24px;color:${brandText};font-size:14px;line-height:1.6;">
                ${bodyHtml}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </div>`;
}

module.exports = {
  buildEmailLayout
};
