const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");

const { getNegocioById } = require("../models/negocios.model");
const { getOwnerByNegocioId, getUsuarioById } = require("../models/usuarios.model");
const {
  countTransferenciasByNegocio,
  countTransferenciasByUsuario,
  createTransferenciaRecord,
  deactivateTransferenciaRecord,
  getTransferenciasCountLast7Days,
  getTransferenciaById,
  getTotalMontoByAnio,
  getTotalMontoByFecha,
  getTotalMontoByMes,
  getTotalMontoHoy,
  isTransferenciaWithinEmployeeEditWindow,
  listTransferenciasByNegocio,
  listTransferenciasForReport,
  listTransferenciasByUsuario,
  updateTransferenciaRecord
} = require("../models/transferencias.model");
const { notifyOwnerTransferCreated } = require("../services/notification.service");
const { uploadTransferImage } = require("../services/storage.service");

const EMPLEADO_EDIT_WINDOW_MS = 5 * 60 * 1000;
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const APP_NAME = "PillPago";

const PDF_COLORS = {
  primary: "#9EDC3A",
  secondary: "#86C83F",
  dark: "#111827",
  text: "#1F2937",
  subtleText: "#6B7280",
  tableHeaderBg: "#E8F6CC",
  rowAltBg: "#F9FAFB"
};

function getRequestBaseUrl(req) {
  const fromEnv = process.env.PUBLIC_BASE_URL || process.env.BASE_URL;
  if (fromEnv) {
    return String(fromEnv).replace(/\/$/, "");
  }

  const proto = req.headers["x-forwarded-proto"] || req.protocol || "http";
  const host = req.headers["x-forwarded-host"] || req.get("host");
  return `${proto}://${host}`.replace(/\/$/, "");
}

function normalizeTransferImageUrl(urlComprobante, req) {
  if (!urlComprobante) {
    return urlComprobante;
  }

  const raw = String(urlComprobante).trim();
  const baseUrl = getRequestBaseUrl(req);

  if (raw.startsWith("/imagenes-subidas/")) {
    return `${baseUrl}${raw}`;
  }

  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//i.test(raw)) {
    return raw.replace(/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i, baseUrl);
  }

  return raw;
}

function parseIntOrNull(value) {
  if (value === undefined || value === null || String(value).trim() === "") {
    return null;
  }

  const num = Number(value);
  return Number.isInteger(num) ? num : Number.NaN;
}

function parseReporteFechaFiltro(query) {
  const dia = parseIntOrNull(query?.dia);
  const mes = parseIntOrNull(query?.mes);
  const anio = parseIntOrNull(query?.anio);

  if (Number.isNaN(dia)) {
    return { error: "dia invalido" };
  }

  if (Number.isNaN(mes)) {
    return { error: "mes invalido" };
  }

  if (Number.isNaN(anio)) {
    return { error: "anio invalido" };
  }

  if (dia !== null && (dia < 1 || dia > 31)) {
    return { error: "dia invalido (1-31)" };
  }

  if (mes !== null && (mes < 1 || mes > 12)) {
    return { error: "mes invalido (1-12)" };
  }

  if (anio !== null && (anio < 2000 || anio > 2100)) {
    return { error: "anio invalido" };
  }

  if (dia !== null && mes !== null && anio !== null) {
    const utcDate = new Date(Date.UTC(anio, mes - 1, dia));
    const isValidDate = utcDate.getUTCFullYear() === anio
      && utcDate.getUTCMonth() + 1 === mes
      && utcDate.getUTCDate() === dia;

    if (!isValidDate) {
      return { error: "fecha invalida" };
    }
  }

  return { dia, mes, anio };
}

function formatDateTime(value) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return date.toLocaleString("es-EC", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });
}

function formatMoney(value) {
  const amount = Number(value || 0);
  return new Intl.NumberFormat("es-EC", {
    style: "currency",
    currency: "USD"
  }).format(amount);
}

function buildFiltroDescripcion({ dia, mes, anio }) {
  const items = [];

  if (dia !== null) {
    items.push(`Dia: ${dia}`);
  }

  if (mes !== null) {
    items.push(`Mes: ${mes}`);
  }

  if (anio !== null) {
    items.push(`Anio: ${anio}`);
  }

  if (!items.length) {
    return "Sin filtro de fecha";
  }

  return items.join(" | ");
}

function buildReporteSubtitulo({ dia, mes, anio }) {
  const monthNames = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
  ];

  if (dia !== null && mes !== null && anio !== null) {
    return `Reporte del dia ${dia} de ${monthNames[mes - 1]} de ${anio}`;
  }

  if (mes !== null && anio !== null) {
    return `Reporte mensual - ${monthNames[mes - 1]} ${anio}`;
  }

  if (anio !== null && mes === null && dia === null) {
    return `Reporte anual - ${anio}`;
  }

  if (mes !== null && anio === null && dia === null) {
    return `Reporte por mes - ${monthNames[mes - 1]}`;
  }

  if (dia !== null && mes === null && anio === null) {
    return `Reporte por dia del mes - ${dia}`;
  }

  if (dia !== null && mes !== null && anio === null) {
    return `Reporte por dia y mes - ${dia} de ${monthNames[mes - 1]}`;
  }

  if (dia !== null && mes === null && anio !== null) {
    return `Reporte por dia y anio - Dia ${dia}, ${anio}`;
  }

  if (dia === null && mes !== null && anio !== null) {
    return `Reporte mensual del anio - ${monthNames[mes - 1]} ${anio}`;
  }

  return "Reporte general de transferencias";
}

function buildReporteFileName({ dia, mes, anio }) {
  const monthNames = [
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"
  ];

  const today = new Date().toISOString().slice(0, 10);
  let suffix = "general";

  if (dia !== null && mes !== null && anio !== null) {
    suffix = `${anio}-${pad2(mes)}-${pad2(dia)}`;
  } else if (mes !== null && anio !== null) {
    suffix = `${anio}-${pad2(mes)}-${monthNames[mes - 1]}`;
  } else if (anio !== null && mes === null && dia === null) {
    suffix = `anio-${anio}`;
  } else if (mes !== null && anio === null && dia === null) {
    suffix = `mes-${pad2(mes)}-${monthNames[mes - 1]}`;
  } else if (dia !== null && mes === null && anio === null) {
    suffix = `dia-${pad2(dia)}`;
  } else if (dia !== null && mes !== null && anio === null) {
    suffix = `dia-mes-${pad2(dia)}-${pad2(mes)}-${monthNames[mes - 1]}`;
  } else if (dia !== null && mes === null && anio !== null) {
    suffix = `dia-anio-${pad2(dia)}-${anio}`;
  }

  return `reporte-transferencias-${suffix}-${today}.pdf`;
}

function drawPdfHeader(doc, {
  negocioNombre,
  ownerNombre,
  filtroDescripcion,
  reporteSubtitulo,
  totalTransferencias,
  totalMonto
}) {
  const pageWidth = doc.page.width;
  const margin = doc.page.margins.left;

  doc.rect(0, 0, pageWidth, 110).fill(PDF_COLORS.dark);

  const logoPath = path.resolve(__dirname, "../imagenes/solo logo.png");

  if (fs.existsSync(logoPath)) {
    doc.image(logoPath, margin, 24, { fit: [58, 58] });
  }

  doc
    .fillColor(PDF_COLORS.primary)
    .fontSize(24)
    .font("Helvetica-Bold")
    .text(APP_NAME, margin + 72, 28);

  doc
    .fillColor("#FFFFFF")
    .fontSize(24)
    .font("Helvetica-Bold")
    .text(negocioNombre || "Negocio", margin + 72, 28, {
      width: pageWidth - margin - doc.page.margins.right - 72,
      align: "right"
    });

  doc
    .fillColor("#FFFFFF")
    .fontSize(12)
    .font("Helvetica")
    .text("Reporte de transferencias", margin + 72, 60);

  doc
    .fillColor(PDF_COLORS.primary)
    .fontSize(10)
    .font("Helvetica")
    .text(reporteSubtitulo || "Reporte general de transferencias", margin + 72, 78);

  doc
    .fillColor(PDF_COLORS.text)
    .fontSize(11)
    .font("Helvetica-Bold")
    .text(`Negocio: ${negocioNombre || "-"}`, margin, 130)
    .text(`Propietario: ${ownerNombre || "-"}`, margin, 146);

  doc
    .font("Helvetica")
    .fillColor(PDF_COLORS.subtleText)
    .text(`Generado: ${formatDateTime(new Date())}`, margin, 172)
    .text(`Filtro: ${filtroDescripcion}`, margin, 188);

  const cardsY = 206;
  const cardsGap = 12;
  const cardsTotalWidth = pageWidth - margin - doc.page.margins.right;
  const cardWidth = (cardsTotalWidth - cardsGap) / 2;
  const cardHeight = 64;

  doc.roundedRect(margin, cardsY, cardWidth, cardHeight, 8).fill(PDF_COLORS.tableHeaderBg);
  doc.roundedRect(margin + cardWidth + cardsGap, cardsY, cardWidth, cardHeight, 8).fill(PDF_COLORS.rowAltBg);

  doc
    .fillColor(PDF_COLORS.subtleText)
    .font("Helvetica-Bold")
    .fontSize(10)
    .text("TOTAL TRANSFERENCIAS", margin + 12, cardsY + 10, { width: cardWidth - 24, align: "left" })
    .text("TOTAL MONTO", margin + cardWidth + cardsGap + 12, cardsY + 10, { width: cardWidth - 24, align: "left" });

  doc
    .fillColor(PDF_COLORS.dark)
    .font("Helvetica-Bold")
    .fontSize(24)
    .text(String(totalTransferencias), margin + 12, cardsY + 28, { width: cardWidth - 24, align: "left" })
    .text(formatMoney(totalMonto), margin + cardWidth + cardsGap + 12, cardsY + 28, { width: cardWidth - 24, align: "left" });

  doc.moveTo(margin, 282).lineTo(pageWidth - margin, 282).strokeColor(PDF_COLORS.secondary).lineWidth(1).stroke();
}

function drawTransferenciasTable(doc, transferencias) {
  const margin = doc.page.margins.left;
  const tableWidth = doc.page.width - margin - doc.page.margins.right;
  const headerHeight = 24;

  const columns = [
    { label: "Fecha", key: "fecha_transferencia", width: 78 },
    { label: "Registrado por", key: "usuario_nombre", width: 118 },
    { label: "Banco", key: "banco", width: 102 },
    { label: "Monto", key: "monto", width: 72 },
    { label: "Observacion", key: "observaciones", width: 145 }
  ];

  const drawHeader = () => {
    const headerY = doc.y;

    doc.rect(margin, headerY, tableWidth, headerHeight).fill(PDF_COLORS.tableHeaderBg);
    doc.fillColor(PDF_COLORS.dark).fontSize(10).font("Helvetica-Bold");

    let x = margin + 6;
    columns.forEach((column) => {
      doc.text(column.label, x, headerY + 7, { width: column.width - 10, align: "left" });
      x += column.width;
    });

    doc.y = headerY + headerHeight;
  };

  const ensureSpace = (requiredHeight) => {
    const bottomLimit = doc.page.height - doc.page.margins.bottom;

    if (doc.y + requiredHeight > bottomLimit) {
      doc.addPage();
      doc.y = doc.page.margins.top;
      drawHeader();
    }
  };

  drawHeader();

  if (!transferencias.length) {
    ensureSpace(26);
    doc.font("Helvetica").fillColor(PDF_COLORS.subtleText).fontSize(11).text("No existen transferencias para el filtro seleccionado.", margin + 6, doc.y + 7);
    doc.y += 26;
    return;
  }

  transferencias.forEach((item, index) => {
    const values = {
      fecha_transferencia: formatDateTime(item.fecha_transferencia),
      usuario_nombre: item.usuario_nombre || "-",
      banco: item.banco || "-",
      monto: formatMoney(item.monto),
      observaciones: item.observaciones || "-"
    };

    const rowHeight = Math.max(
      22,
      ...columns.map((column) => {
        return doc.heightOfString(String(values[column.key]), {
          width: column.width - 10,
          align: column.key === "monto" ? "right" : "left"
        }) + 8;
      })
    );

    ensureSpace(rowHeight);

    const rowY = doc.y;

    if (index % 2 === 1) {
      doc.rect(margin, rowY, tableWidth, rowHeight).fill(PDF_COLORS.rowAltBg);
    }

    doc.fillColor(PDF_COLORS.text).fontSize(9.5).font("Helvetica");

    let x = margin + 6;
    columns.forEach((column) => {
      doc.text(String(values[column.key]), x, rowY + 4, {
        width: column.width - 10,
        align: column.key === "monto" ? "right" : "left"
      });

      x += column.width;
    });

    doc.y = rowY + rowHeight;
  });
}

async function downloadTransferenciasReportPdf(req, res, next) {
  try {
    const scopeResult = await getUserTransferScope(req.auth.id_usuario);

    if (scopeResult.error) {
      return res.status(scopeResult.error.status).json({ message: scopeResult.error.message });
    }

    if (scopeResult.usuario.rol !== "dueno") {
      return res.status(403).json({ message: "Solo el dueno puede generar reportes PDF" });
    }

    const filtroFecha = parseReporteFechaFiltro(req.query);

    if (filtroFecha.error) {
      return res.status(400).json({ message: filtroFecha.error });
    }

    const [negocio, owner] = await Promise.all([
      getNegocioById(scopeResult.usuario.id_negocio),
      getOwnerByNegocioId(scopeResult.usuario.id_negocio)
    ]);

    if (!negocio) {
      return res.status(404).json({ message: "Negocio no encontrado" });
    }

    const transferencias = await listTransferenciasForReport({
      ...scopeResult.scope,
      dia: filtroFecha.dia,
      mes: filtroFecha.mes,
      anio: filtroFecha.anio
    });

    const totalMonto = transferencias.reduce((sum, item) => sum + Number(item.monto || 0), 0);
    const filtroDescripcion = buildFiltroDescripcion(filtroFecha);
    const reporteSubtitulo = buildReporteSubtitulo(filtroFecha);
    const fileName = buildReporteFileName(filtroFecha);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);

    const doc = new PDFDocument({ size: "A4", margin: 40 });
    doc.pipe(res);

    drawPdfHeader(doc, {
      negocioNombre: negocio.nombre_negocio,
      ownerNombre: owner?.nombre || "No disponible",
      filtroDescripcion,
      reporteSubtitulo,
      totalTransferencias: transferencias.length,
      totalMonto
    });

    doc.y = 298;
    drawTransferenciasTable(doc, transferencias);

    doc.end();
    return null;
  } catch (error) {
    next(error);
    return null;
  }
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function normalizeFechaTransferencia(fechaTransferenciaRaw) {
  const raw = String(fechaTransferenciaRaw || "").trim();

  if (!raw) {
    return null;
  }

  // Si viene solo fecha (YYYY-MM-DD), devolvemos solo fecha valida.
  // El modelo completa la hora con el reloj del servidor PostgreSQL.
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [year, month, day] = raw.split("-").map(Number);
    const utcDate = new Date(Date.UTC(year, month - 1, day));

    const isValidDate = utcDate.getUTCFullYear() === year
      && utcDate.getUTCMonth() + 1 === month
      && utcDate.getUTCDate() === day;

    if (!isValidDate) {
      return null;
    }

    return raw;
  }

  const parsed = new Date(raw);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return `${parsed.getFullYear()}-${pad2(parsed.getMonth() + 1)}-${pad2(parsed.getDate())} ${pad2(parsed.getHours())}:${pad2(parsed.getMinutes())}:${pad2(parsed.getSeconds())}`;
}

async function getUserTransferScope(authUserId) {
  const usuario = await getUsuarioById(authUserId);

  if (!usuario) {
    return { error: { status: 404, message: "Usuario no encontrado" } };
  }

  if (!usuario.id_negocio) {
    return { error: { status: 403, message: "Debes pertenecer a un negocio" } };
  }

  if (!["dueno", "empleado"].includes(usuario.rol)) {
    return { error: { status: 403, message: "Solo usuarios activos pueden acceder a transferencias" } };
  }

  return {
    usuario,
    scope: usuario.rol === "dueno"
      ? { idNegocio: usuario.id_negocio }
      : { idUsuario: usuario.id_usuario }
  };
}

function isValidIsoDate(dateStr) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(dateStr || ""));
}

function parsePagination(query) {
  const rawPage = query?.page;
  const rawLimit = query?.limit;

  const page = rawPage === undefined ? DEFAULT_PAGE : Number(rawPage);
  const limit = rawLimit === undefined ? DEFAULT_LIMIT : Number(rawLimit);

  if (!Number.isInteger(page) || page < 1) {
    return { error: "page debe ser un entero mayor o igual a 1" };
  }

  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    return { error: `limit debe ser un entero entre 1 y ${MAX_LIMIT}` };
  }

  return {
    page,
    limit,
    offset: (page - 1) * limit
  };
}

function parseFechaFiltro(query) {
  const hasDia = query?.dia !== undefined;
  const hasMes = query?.mes !== undefined;
  const hasAnio = query?.anio !== undefined;

  // Si no envian ningun campo, no se aplica filtro por fecha.
  if (!hasDia && !hasMes && !hasAnio) {
    return { fecha: null };
  }

  // Si envian un campo de fecha, deben enviar dia, mes y anio juntos.
  if (!hasDia || !hasMes || !hasAnio) {
    return { error: "Para filtrar por fecha debes enviar dia, mes y anio" };
  }

  const dia = Number(query.dia);
  const mes = Number(query.mes);
  const anio = Number(query.anio);

  if (!Number.isInteger(dia) || dia < 1 || dia > 31) {
    return { error: "dia invalido (1-31)" };
  }

  if (!Number.isInteger(mes) || mes < 1 || mes > 12) {
    return { error: "mes invalido (1-12)" };
  }

  if (!Number.isInteger(anio) || anio < 2000 || anio > 2100) {
    return { error: "anio invalido" };
  }

  const utcDate = new Date(Date.UTC(anio, mes - 1, dia));
  const isValidDate = utcDate.getUTCFullYear() === anio
    && utcDate.getUTCMonth() + 1 === mes
    && utcDate.getUTCDate() === dia;

  if (!isValidDate) {
    return { error: "fecha invalida" };
  }

  return {
    fecha: `${anio}-${pad2(mes)}-${pad2(dia)}`
  };
}

function parseEmpleadoFiltro(query) {
  const rawEmpleado = query?.id_empleado ?? query?.id_usuario;

  if (rawEmpleado === undefined) {
    return { idEmpleado: null };
  }

  const idEmpleado = Number(rawEmpleado);

  if (!Number.isInteger(idEmpleado) || idEmpleado <= 0) {
    return { error: "id_empleado invalido" };
  }

  return { idEmpleado };
}

async function getTotalTransferenciasHoy(req, res, next) {
  try {
    const result = await getUserTransferScope(req.auth.id_usuario);

    if (result.error) {
      return res.status(result.error.status).json({ message: result.error.message });
    }

    const total = await getTotalMontoHoy(result.scope);
    return res.json({
      periodo: "hoy",
      total,
      moneda: "USD"
    });
  } catch (error) {
    next(error);
  }
}

async function getTotalTransferenciasPorDia(req, res, next) {
  try {
    const fecha = String(req.query?.fecha || "").trim();

    if (!isValidIsoDate(fecha)) {
      return res.status(400).json({ message: "fecha debe tener formato YYYY-MM-DD" });
    }

    const result = await getUserTransferScope(req.auth.id_usuario);

    if (result.error) {
      return res.status(result.error.status).json({ message: result.error.message });
    }

    const total = await getTotalMontoByFecha({ ...result.scope, fecha });
    return res.json({
      periodo: "dia",
      fecha,
      total,
      moneda: "USD"
    });
  } catch (error) {
    next(error);
  }
}

async function getTotalTransferenciasPorMes(req, res, next) {
  try {
    const anio = Number(req.query?.anio);
    const mes = Number(req.query?.mes);

    if (!Number.isInteger(anio) || anio < 2000 || anio > 2100) {
      return res.status(400).json({ message: "anio invalido" });
    }

    if (!Number.isInteger(mes) || mes < 1 || mes > 12) {
      return res.status(400).json({ message: "mes invalido (1-12)" });
    }

    const result = await getUserTransferScope(req.auth.id_usuario);

    if (result.error) {
      return res.status(result.error.status).json({ message: result.error.message });
    }

    const total = await getTotalMontoByMes({ ...result.scope, anio, mes });
    return res.json({
      periodo: "mes",
      anio,
      mes,
      total,
      moneda: "USD"
    });
  } catch (error) {
    next(error);
  }
}

async function getTotalTransferenciasPorAnio(req, res, next) {
  try {
    const anio = Number(req.query?.anio);

    if (!Number.isInteger(anio) || anio < 2000 || anio > 2100) {
      return res.status(400).json({ message: "anio invalido" });
    }

    const result = await getUserTransferScope(req.auth.id_usuario);

    if (result.error) {
      return res.status(result.error.status).json({ message: result.error.message });
    }

    const total = await getTotalMontoByAnio({ ...result.scope, anio });
    return res.json({
      periodo: "anio",
      anio,
      total,
      moneda: "USD"
    });
  } catch (error) {
    next(error);
  }
}

async function getTransferenciasEstadisticaUltimos7Dias(req, res, next) {
  try {
    const result = await getUserTransferScope(req.auth.id_usuario);

    if (result.error) {
      return res.status(result.error.status).json({ message: result.error.message });
    }

    const data = await getTransferenciasCountLast7Days(result.scope);
    const totalPeriodo = data.reduce(
      (acc, item) => acc + Number(item.total_transferencias || 0),
      0
    );

    return res.json({
      periodo: "ultimos_7_dias",
      dias_incluidos: 7,
      total_periodo: totalPeriodo,
      data
    });
  } catch (error) {
    next(error);
  }
}

async function listTransferencias(req, res, next) {
  try {
    const pagination = parsePagination(req.query);
    const filtroFecha = parseFechaFiltro(req.query);
    const filtroEmpleado = parseEmpleadoFiltro(req.query);

    if (pagination.error) {
      return res.status(400).json({ message: pagination.error });
    }

    if (filtroFecha.error) {
      return res.status(400).json({ message: filtroFecha.error });
    }

    if (filtroEmpleado.error) {
      return res.status(400).json({ message: filtroEmpleado.error });
    }

    const usuario = await getUsuarioById(req.auth.id_usuario);

    if (!usuario) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    if (!usuario.id_negocio) {
      return res.status(403).json({ message: "Debes pertenecer a un negocio para ver transferencias" });
    }

    if (usuario.rol === "empleado"
      && filtroEmpleado.idEmpleado !== null
      && filtroEmpleado.idEmpleado !== usuario.id_usuario) {
      return res.status(403).json({ message: "Solo puedes consultar tus propias transferencias" });
    }

    if (usuario.rol === "dueno") {
      const [transferencias, total] = await Promise.all([
        listTransferenciasByNegocio(usuario.id_negocio, {
          fecha: filtroFecha.fecha,
          idEmpleado: filtroEmpleado.idEmpleado,
          limit: pagination.limit,
          offset: pagination.offset
        }),
        countTransferenciasByNegocio(usuario.id_negocio, {
          fecha: filtroFecha.fecha,
          idEmpleado: filtroEmpleado.idEmpleado
        })
      ]);

      return res.json({
        data: transferencias,
        pagination: {
          page: pagination.page,
          limit: pagination.limit,
          total,
          totalPages: total > 0 ? Math.ceil(total / pagination.limit) : 0,
          hasNextPage: pagination.offset + transferencias.length < total,
          hasPrevPage: pagination.page > 1
        }
      });
    }

    const [transferencias, total] = await Promise.all([
      listTransferenciasByUsuario(usuario.id_usuario, {
        fecha: filtroFecha.fecha,
        limit: pagination.limit,
        offset: pagination.offset
      }),
      countTransferenciasByUsuario(usuario.id_usuario, {
        fecha: filtroFecha.fecha
      })
    ]);

    return res.json({
      data: transferencias,
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        total,
        totalPages: total > 0 ? Math.ceil(total / pagination.limit) : 0,
        hasNextPage: pagination.offset + transferencias.length < total,
        hasPrevPage: pagination.page > 1
      }
    });
  } catch (error) {
    next(error);
  }
}

async function getTransferenciaByIdController(req, res, next) {
  try {
    const result = await getUserTransferScope(req.auth.id_usuario);

    if (result.error) {
      return res.status(result.error.status).json({ message: result.error.message });
    }

    const { id } = req.params;
    const transferencia = await getTransferenciaById(id);

    if (!transferencia) {
      return res.status(404).json({ message: "Transferencia no encontrada" });
    }

    if (result.scope.idNegocio && transferencia.id_negocio !== result.scope.idNegocio) {
      return res.status(403).json({ message: "No puedes ver transferencias de otro negocio" });
    }

    if (result.scope.idUsuario && transferencia.id_usuario !== result.scope.idUsuario) {
      return res.status(403).json({ message: "Solo puedes ver tus propias transferencias" });
    }

    const permission = await canEditTransferencia(result.usuario, transferencia);
    const transferenciaResponse = {
      ...transferencia,
      url_comprobante: normalizeTransferImageUrl(transferencia.url_comprobante, req)
    };

    return res.json({
      ...transferenciaResponse,
      disponible_para_editar: permission.allowed
    });
  } catch (error) {
    next(error);
  }
}

async function createTransferencia(req, res, next) {
  try {
    const usuario = await getUsuarioById(req.auth.id_usuario);

    if (!usuario) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    if (!usuario.id_negocio) {
      return res.status(403).json({ message: "Debes unirte a un negocio antes de subir transferencias" });
    }

    if (!req.file) {
      return res.status(400).json({ message: "La imagen es requerida en el campo 'imagen'" });
    }

    const monto = Number(req.body?.monto);
    const idBanco = Number(req.body?.id_banco);
    const clientSyncId = String(req.body?.client_sync_id || "").trim() || null;
    const fechaTransferenciaRaw = req.body?.fecha_transferencia;
    const observaciones = typeof req.body?.observaciones === "string"
      ? req.body.observaciones.trim() || null
      : null;

    if (!Number.isFinite(monto) || monto <= 0) {
      return res.status(400).json({ message: "monto invalido" });
    }

    if (!Number.isInteger(idBanco) || idBanco <= 0) {
      return res.status(400).json({ message: "id_banco invalido" });
    }

    if (clientSyncId && clientSyncId.length > 120) {
      return res.status(400).json({ message: "client_sync_id excede el maximo permitido" });
    }

    if (!fechaTransferenciaRaw) {
      return res.status(400).json({ message: "fecha_transferencia es requerida" });
    }

    const fechaTransferencia = normalizeFechaTransferencia(fechaTransferenciaRaw);

    if (!fechaTransferencia) {
      return res.status(400).json({ message: "fecha_transferencia invalida" });
    }

    const uploadResult = await uploadTransferImage({
      buffer: req.file.buffer,
      mimeType: req.file.mimetype,
      originalName: req.file.originalname,
      idNegocio: usuario.id_negocio,
      idUsuario: usuario.id_usuario
    });

    const transferencia = await createTransferenciaRecord({
      idNegocio: usuario.id_negocio,
      idUsuario: usuario.id_usuario,
      clientSyncId,
      monto,
      idBanco,
      fechaTransferencia,
      observaciones,
      imageUrl: uploadResult.imageUrl,
      imagePath: uploadResult.imagePath
    });

    try {
      await notifyOwnerTransferCreated({
        transferencia,
        actorUsuario: usuario
      });
    } catch (notificationError) {
      console.error("No se pudo crear notificacion por transferencia", notificationError);
    }

    res.status(201).json(transferencia);
  } catch (error) {
    next(error);
  }
}

async function canEditTransferencia(usuario, transferencia) {
  if (!usuario || !transferencia) {
    return { allowed: false, reason: "No autorizado" };
  }

  if (usuario.id_negocio !== transferencia.id_negocio) {
    return { allowed: false, reason: "No puedes editar transferencias de otro negocio" };
  }

  if (usuario.rol === "dueno") {
    return { allowed: true };
  }

  if (transferencia.estado !== "ACTIVO") {
    return { allowed: false, reason: "No puedes editar una transferencia inactiva" };
  }

  if (usuario.id_usuario !== transferencia.id_usuario) {
    return { allowed: false, reason: "Solo puedes editar tus propias transferencias" };
  }

  const isWithinWindow = await isTransferenciaWithinEmployeeEditWindow(
    transferencia.id_transferencia,
    EMPLEADO_EDIT_WINDOW_MS
  );

  if (!isWithinWindow) {
    return { allowed: false, reason: "Solo puedes editar una transferencia dentro de los primeros 5 minutos" };
  }

  return { allowed: true };
}

async function updateTransferencia(req, res, next) {
  try {
    const usuario = await getUsuarioById(req.auth.id_usuario);

    if (!usuario) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    const { id } = req.params;
    const transferencia = await getTransferenciaById(id);

    if (!transferencia) {
      return res.status(404).json({ message: "Transferencia no encontrada" });
    }

    const permission = await canEditTransferencia(usuario, transferencia);

    if (!permission.allowed) {
      return res.status(403).json({ message: permission.reason });
    }

    const updates = {};

    if (req.body?.monto !== undefined) {
      const monto = Number(req.body.monto);

      if (!Number.isFinite(monto) || monto <= 0) {
        return res.status(400).json({ message: "monto invalido" });
      }

      updates.monto = monto;
    }

    if (req.body?.id_banco !== undefined) {
      const idBanco = Number(req.body.id_banco);

      if (!Number.isInteger(idBanco) || idBanco <= 0) {
        return res.status(400).json({ message: "id_banco invalido" });
      }

      updates.idBanco = idBanco;
    }

    if (req.body?.fecha_transferencia !== undefined) {
      const fechaTransferencia = normalizeFechaTransferencia(req.body.fecha_transferencia);

      if (!fechaTransferencia) {
        return res.status(400).json({ message: "fecha_transferencia invalida" });
      }

      updates.fechaTransferencia = fechaTransferencia;
    }

    if (req.body?.observaciones !== undefined) {
      const observaciones = String(req.body.observaciones || "").trim();
      updates.observaciones = observaciones || null;
    }

    if (req.file) {
      const uploadResult = await uploadTransferImage({
        buffer: req.file.buffer,
        mimeType: req.file.mimetype,
        originalName: req.file.originalname,
        idNegocio: usuario.id_negocio,
        idUsuario: usuario.id_usuario
      });

      updates.imageUrl = uploadResult.imageUrl;
    }

    if (!Object.keys(updates).length) {
      return res.status(400).json({
        message: "Debes enviar al menos un campo para editar: monto, id_banco, fecha_transferencia, observaciones o imagen"
      });
    }

    const updated = await updateTransferenciaRecord(id, updates);

    return res.json(updated);
  } catch (error) {
    next(error);
  }
}

async function deleteTransferencia(req, res, next) {
  try {
    const usuario = await getUsuarioById(req.auth.id_usuario);

    if (!usuario) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    const { id } = req.params;
    const transferencia = await getTransferenciaById(id);

    if (!transferencia) {
      return res.status(404).json({ message: "Transferencia no encontrada" });
    }

    if (usuario.rol !== "dueno") {
      return res.status(403).json({ message: "Solo el dueno puede eliminar transferencias" });
    }

    if (usuario.id_negocio !== transferencia.id_negocio) {
      return res.status(403).json({ message: "No puedes eliminar transferencias de otro negocio" });
    }

    if (transferencia.estado !== "ACTIVO") {
      return res.json({ message: "La transferencia ya estaba inactiva", transferencia });
    }

    const deleted = await deactivateTransferenciaRecord(id);
    return res.json({ message: "Transferencia eliminada", transferencia: deleted });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  createTransferencia,
  deleteTransferencia,
  downloadTransferenciasReportPdf,
  getTransferenciaByIdController,
  getTransferenciasEstadisticaUltimos7Dias,
  getTotalTransferenciasHoy,
  getTotalTransferenciasPorAnio,
  getTotalTransferenciasPorDia,
  getTotalTransferenciasPorMes,
  listTransferencias,
  updateTransferencia
};
