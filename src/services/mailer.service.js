const nodemailer = require("nodemailer");

const { buildVerificationEmailTemplate } = require("../emails/verification-email.template");
const { buildPasswordResetEmailTemplate } = require("../emails/password-reset-email.template");
const { buildEmailChangeTemplate } = require("../emails/email-change-email.template");

function getSmtpConfig() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM;

  if (!host || !user || !pass || !from) {
    throw new Error("SMTP_HOST, SMTP_USER, SMTP_PASS y SMTP_FROM son requeridos");
  }

  return {
    host,
    port,
    user,
    pass,
    from,
    secure: port === 465
  };
}

function createTransporter() {
  const smtp = getSmtpConfig();

  return nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: {
      user: smtp.user,
      pass: smtp.pass
    }
  });
}

async function sendEmail({ to, subject, html }) {
  const smtp = getSmtpConfig();
  const transporter = createTransporter();

  await transporter.sendMail({
    from: smtp.from,
    to,
    subject,
    html
  });
}

async function sendVerificationCodeEmail({ to, nombre, code }) {
  const template = buildVerificationEmailTemplate({ nombre, code });
  await sendEmail({ to, subject: template.subject, html: template.html });
}

async function sendPasswordResetCodeEmail({ to, nombre, code }) {
  const template = buildPasswordResetEmailTemplate({ nombre, code });
  await sendEmail({ to, subject: template.subject, html: template.html });
}

async function sendEmailChangeCodeEmail({ to, nombre, code }) {
  const template = buildEmailChangeTemplate({ nombre, code });
  await sendEmail({ to, subject: template.subject, html: template.html });
}

module.exports = {
  sendEmailChangeCodeEmail,
  sendPasswordResetCodeEmail,
  sendVerificationCodeEmail
};
