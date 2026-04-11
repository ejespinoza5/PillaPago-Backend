const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });

const { closePool, query } = require("../config/database");

async function run() {
  try {
    await query(`CREATE EXTENSION IF NOT EXISTS pgcrypto;`);

    await query(`
      CREATE TABLE IF NOT EXISTS negocios (
        id_negocio SERIAL PRIMARY KEY,
        nombre_negocio VARCHAR(100) NOT NULL,
        codigo_invitacion VARCHAR(20) UNIQUE NOT NULL,
        fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS usuarios (
        id_usuario SERIAL PRIMARY KEY,
        nombre VARCHAR(100) NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        email_verificado BOOLEAN NOT NULL DEFAULT false,
        google_id VARCHAR(255) UNIQUE,
        password_hash VARCHAR(255),
        foto_perfil_url VARCHAR(255),
        rol VARCHAR(20) NOT NULL DEFAULT 'pendiente'
          CHECK (rol IN ('dueno', 'empleado', 'pendiente')),
        id_negocio INT,
        fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (id_negocio)
          REFERENCES negocios(id_negocio)
          ON DELETE SET NULL
      );
    `);

    await query(`
      ALTER TABLE usuarios
      ADD COLUMN IF NOT EXISTS email_verificado BOOLEAN NOT NULL DEFAULT false;
    `);

    await query(`
      UPDATE usuarios
      SET email_verificado = true
      WHERE google_id IS NOT NULL;
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS refresh_tokens (
        id_refresh_token SERIAL PRIMARY KEY,
        id_usuario INT NOT NULL REFERENCES usuarios(id_usuario) ON DELETE CASCADE,
        token_hash VARCHAR(64) NOT NULL UNIQUE,
        expires_at TIMESTAMP NOT NULL,
        revoked_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS email_verification_codes (
        id_email_code SERIAL PRIMARY KEY,
        purpose VARCHAR(40) NOT NULL,
        email VARCHAR(255) NOT NULL,
        id_usuario INT REFERENCES usuarios(id_usuario) ON DELETE CASCADE,
        new_email VARCHAR(255),
        code_hash VARCHAR(64) NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        used_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await query(`
      ALTER TABLE email_verification_codes
      ALTER COLUMN expires_at TYPE TIMESTAMPTZ USING expires_at AT TIME ZONE 'UTC';
    `);

    await query(`
      ALTER TABLE email_verification_codes
      ALTER COLUMN used_at TYPE TIMESTAMPTZ USING used_at AT TIME ZONE 'UTC';
    `);

    await query(`
      ALTER TABLE email_verification_codes
      ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC';
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS bancos (
        id_banco SERIAL PRIMARY KEY,
        nombre_banco VARCHAR(50) NOT NULL UNIQUE
      );
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS transferencias (
        id_transferencia UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        id_negocio INT NOT NULL REFERENCES negocios(id_negocio) ON DELETE CASCADE,
        id_usuario INT NOT NULL REFERENCES usuarios(id_usuario) ON DELETE CASCADE,
        id_banco INT NOT NULL REFERENCES bancos(id_banco),
        client_sync_id VARCHAR(120),
        monto NUMERIC(12, 2) NOT NULL CHECK (monto > 0),
        url_comprobante VARCHAR(255) NOT NULL,
        fecha_transferencia TIMESTAMP NOT NULL,
        fecha_registro_servidor TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        observaciones TEXT,
        estado VARCHAR(25) NOT NULL DEFAULT 'ACTIVO'
      );
    `);

    await query(`
      ALTER TABLE transferencias
      ADD COLUMN IF NOT EXISTS client_sync_id VARCHAR(120);
    `);

    await query(`
      CREATE UNIQUE INDEX IF NOT EXISTS ux_transferencias_usuario_client_sync
      ON transferencias (id_usuario, client_sync_id)
      WHERE client_sync_id IS NOT NULL;
    `);

    console.log("Esquema creado o actualizado correctamente");
  } catch (error) {
    console.error("No se pudo crear el esquema");
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    await closePool();
  }
}

run();
