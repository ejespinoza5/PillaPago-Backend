// Pruebas de seguridad: arrancan la API con una base de datos simulada.
// Ejecutar con: npm test
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const path = require("node:path");

process.env.JWT_SECRET = "secreto-de-prueba";
process.env.TRUST_PROXY = "0";

// Base de datos simulada: registra las consultas y devuelve filas vacias.
const consultas = [];
const dbPath = require.resolve(path.join(__dirname, "..", "src", "config", "database"));
require.cache[dbPath] = {
  id: dbPath,
  filename: dbPath,
  loaded: true,
  exports: {
    query: async (sql, params) => {
      consultas.push({ sql, params });
      return { rows: [], rowCount: 0 };
    },
  },
};

const app = require("../src/app");
let base;
let server;

before(async () => {
  server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => server.close());

const jwtFalso = (header, payload, secreto) => {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const cuerpo = `${b64(header)}.${b64(payload)}`;
  const firma = secreto
    ? crypto.createHmac("sha256", secreto).update(cuerpo).digest("base64url")
    : "";
  return `${cuerpo}.${firma}`;
};

test("rutas administrativas sin autenticación ya no existen", async () => {
  for (const [method, url] of [
    ["GET", "/api/usuarios"],
    ["GET", "/api/usuarios/1"],
    ["POST", "/api/usuarios"],
    ["PATCH", "/api/usuarios/1"],
    ["GET", "/api/negocios"],
    ["GET", "/api/negocios/1"],
    ["POST", "/api/negocios"],
  ]) {
    const r = await fetch(base + url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: method === "GET" ? undefined : JSON.stringify({ rol: "dueno", id_negocio: 1 }),
    });
    assert.ok([401, 404].includes(r.status), `${method} ${url} respondió ${r.status}`);
  }
});

test("rutas protegidas rechazan peticiones sin token o con token falsificado", async () => {
  const payload = { id_usuario: 1, rol: "dueno", exp: Math.floor(Date.now() / 1000) + 3600 };
  const tokens = [
    null,
    jwtFalso({ alg: "none", typ: "JWT" }, payload, null),
    jwtFalso({ alg: "HS256", typ: "JWT" }, payload, "otro-secreto"),
    "basura.total.aqui",
  ];
  for (const t of tokens) {
    const r = await fetch(`${base}/api/transferencias`, {
      headers: t ? { Authorization: `Bearer ${t}` } : {},
    });
    assert.equal(r.status, 401, `token ${String(t).slice(0, 20)} no fue rechazado`);
  }
});

test("cabeceras de seguridad presentes y sin x-powered-by", async () => {
  const r = await fetch(`${base}/health`);
  assert.equal(r.headers.get("x-powered-by"), null);
  assert.equal(r.headers.get("x-content-type-options"), "nosniff");
  assert.ok(r.headers.get("strict-transport-security"));
});

test("JSON demasiado grande se rechaza", async () => {
  const r = await fetch(`${base}/api/auth/email/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "a@b.c", password: "x".repeat(2 * 1024 * 1024) }),
  });
  assert.equal(r.status, 413);
});

test("los códigos se invalidan tras intentos fallidos (consulta con límite)", async () => {
  const { consumeEmailCode } = require("../src/models/email-codes.model");
  consultas.length = 0;
  const r = await consumeEmailCode({
    purpose: "password_reset", email: "a@b.c", idUsuario: 1, newEmail: null, codeHash: "x",
  });
  assert.equal(r, null);
  const actualiza = consultas.find((c) => /intentos = intentos \+ 1/.test(c.sql));
  assert.ok(actualiza, "no se registró el intento fallido");
  assert.equal(actualiza.params.at(-1), 5);
});

test("rate limit: el login se bloquea tras 20 intentos", async () => {
  let ultimo;
  for (let i = 0; i < 22; i += 1) {
    ultimo = await fetch(`${base}/api/auth/email/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "victima@correo.com", password: `intento${i}` }),
    });
  }
  assert.equal(ultimo.status, 429);
  const cuerpo = await ultimo.json();
  assert.match(cuerpo.message, /Demasiados intentos/);
});

test("rate limit: pedir códigos por correo se limita a 6 por hora", async () => {
  let ultimo;
  for (let i = 0; i < 8; i += 1) {
    ultimo = await fetch(`${base}/api/auth/password/forgot`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "victima@correo.com" }),
    });
  }
  assert.equal(ultimo.status, 429);
});

test("páginas legales públicas con contacto y fecha", async () => {
  process.env.LEGAL_CONTACT_EMAIL = "contacto@ejemplo.com";
  for (const url of ["/terminos", "/privacidad"]) {
    const r = await fetch(base + url);
    assert.equal(r.status, 200);
    const html = await r.text();
    assert.match(html, /contacto@ejemplo\.com/);
    assert.doesNotMatch(html, /\{\{/);
    assert.match(html, /18 años/);
  }
  const css = await fetch(`${base}/legal/legal.css`);
  assert.equal(css.status, 200);
  const raw = await fetch(`${base}/legal/terminos.html`);
  assert.equal(raw.status, 404);
});
