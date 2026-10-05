const { query } = require("../config/database");
const { countActiveEmployeesByNegocio } = require("../models/empleados.model");

// Cupos de empleados: 2 gratis + 1 extra por cada ANUNCIOS_POR_CUPO anuncios vistos.
const EMPLEADOS_GRATIS = 2;
const ANUNCIOS_POR_CUPO = 2;

let columnsReady = null;

// Crea las columnas si aun no existen (no requiere correr migraciones a mano).
function ensureColumns() {
  columnsReady ??= query(`
    ALTER TABLE negocios
      ADD COLUMN IF NOT EXISTS empleados_extra INT NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS anuncios_vistos INT NOT NULL DEFAULT 0;
  `).catch((error) => {
    columnsReady = null;
    throw error;
  });
  return columnsReady;
}

async function getEmployeeQuota(idNegocio) {
  await ensureColumns();
  const [result, usados] = await Promise.all([
    query(
      `SELECT empleados_extra, anuncios_vistos FROM negocios WHERE id_negocio = $1`,
      [idNegocio]
    ),
    countActiveEmployeesByNegocio(idNegocio)
  ]);
  const row = result.rows[0] || { empleados_extra: 0, anuncios_vistos: 0 };
  const extra = Number(row.empleados_extra) || 0;
  const vistos = Number(row.anuncios_vistos) || 0;
  const limite = EMPLEADOS_GRATIS + extra;

  return {
    gratis: EMPLEADOS_GRATIS,
    extra,
    limite,
    usados,
    disponibles: Math.max(limite - usados, 0),
    anuncios_por_cupo: ANUNCIOS_POR_CUPO,
    anuncios_vistos: vistos % ANUNCIOS_POR_CUPO,
    anuncios_restantes: ANUNCIOS_POR_CUPO - (vistos % ANUNCIOS_POR_CUPO)
  };
}

/** Devuelve un mensaje de error si el negocio no tiene cupo, o null. */
async function checkEmployeeQuota(idNegocio) {
  const quota = await getEmployeeQuota(idNegocio);
  if (quota.disponibles > 0) return null;
  return `Este negocio ya tiene ${quota.usados} de ${quota.limite} empleados. `
    + "Pide al dueno que desbloquee un cupo mas.";
}

// TODO: cuando se integre AdMob, validar el anuncio con Server-Side Verification
// antes de contarlo, para que no se pueda llamar al endpoint sin ver el anuncio.
async function registerAdWatched(idNegocio) {
  await ensureColumns();
  await query(
    `UPDATE negocios
     SET anuncios_vistos = anuncios_vistos + 1,
         empleados_extra = empleados_extra
           + CASE WHEN (anuncios_vistos + 1) % $2 = 0 THEN 1 ELSE 0 END
     WHERE id_negocio = $1`,
    [idNegocio, ANUNCIOS_POR_CUPO]
  );
  return getEmployeeQuota(idNegocio);
}

module.exports = { checkEmployeeQuota, getEmployeeQuota, registerAdWatched };
