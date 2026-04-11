-- 1. Tabla de Negocios
CREATE TABLE negocios (
    id_negocio SERIAL PRIMARY KEY,
    nombre_negocio VARCHAR(100) NOT NULL,
    codigo_invitacion VARCHAR(20) UNIQUE NOT NULL,
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Tabla de Usuarios
CREATE TABLE usuarios (
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
    estado VARCHAR(20) DEFAULT 'activo' NOT NULL,
    fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (id_negocio) 
        REFERENCES negocios(id_negocio) 
        ON DELETE SET NULL
);

-- 3. Tabla de Refresh Tokens
CREATE TABLE refresh_tokens (
    id_refresh_token SERIAL PRIMARY KEY,
    id_usuario INT NOT NULL,
    token_hash VARCHAR(64) UNIQUE NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    revoked_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (id_usuario) REFERENCES usuarios(id_usuario) ON DELETE CASCADE
);

-- 4. Tabla de Codigos de Verificacion
CREATE TABLE email_verification_codes (
    id_email_code SERIAL PRIMARY KEY,
    purpose VARCHAR(40) NOT NULL,
    email VARCHAR(255) NOT NULL,
    id_usuario INT,
    new_email VARCHAR(255),
    code_hash VARCHAR(64) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (id_usuario) REFERENCES usuarios(id_usuario) ON DELETE CASCADE
);

-- 5. Tabla de Bancos
CREATE TABLE bancos (
    id_banco SERIAL PRIMARY KEY,
    nombre_banco VARCHAR(80) NOT NULL UNIQUE
);

-- 6. Tabla de Transferencias
CREATE TABLE transferencias (
    id_transferencia UUID PRIMARY KEY,
    id_usuario INT NOT NULL,
    id_negocio INT NOT NULL,
    id_banco INT NOT NULL,
    client_sync_id VARCHAR(120),
    monto DECIMAL(10,2) NOT NULL,
    url_comprobante VARCHAR(255) NOT NULL,
    fecha_transferencia TIMESTAMP NOT NULL,
    fecha_registro_servidor TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    observaciones TEXT,
    estado varchar(25) DEFAULT 'ACTIVO',
    FOREIGN KEY (id_usuario) REFERENCES usuarios(id_usuario),
    FOREIGN KEY (id_negocio) REFERENCES negocios(id_negocio),
    FOREIGN KEY (id_banco) REFERENCES bancos(id_banco)
);

CREATE UNIQUE INDEX ux_transferencias_usuario_client_sync
ON transferencias (id_usuario, client_sync_id)
WHERE client_sync_id IS NOT NULL;

-- ============================================================
-- INSERT de bancos de Ecuador con app móvil para transferencias
-- Incluye: bancos privados, públicos y apps de pago
-- ============================================================

INSERT INTO bancos (nombre_banco) VALUES
  -- BANCOS PRIVADOS NACIONALES CON APP MÓVIL
  ('Banco Pichincha'),
  ('Banco Guayaquil'),
  ('Produbanco'),
  ('Banco Bolivariano'),
  ('Banco del Pacífico'),
  ('Banco Internacional'),
  ('Banco del Austro'),
  ('Banco de Loja'),
  ('Banco Rumiñahui'),
  ('Banco Solidario'),
  ('Banco ProCredit'),
  ('Banco Diners Club'),
  ('Banco General Rumiñahui'),
  ('Banco Coopnacional'),
  ('Banco Desarrollo de los Pueblos (Bancodesarrollo)'),
  ('Banco D-Miro'),
  ('Banco Amazonas'),
  ('Delbank'),
  ('Banco Visionfund Ecuador'),

  -- BANCOS PÚBLICOS CON APP MÓVIL
  ('BanEcuador'),
  ('Banco del Estado (BanEstado)'),
  ('Corporación Financiera Nacional (CFN)'),

  -- APPS / BILLETERAS DIGITALES CON TRANSFERENCIAS
  ('De Una (Deuna - respaldo Banco Pichincha)'),
  ('Wip (Produbanco / Banco Guayaquil / Internacional)');