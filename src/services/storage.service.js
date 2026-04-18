const fs = require("fs/promises");
const path = require("path");
const { randomUUID } = require("crypto");
const sharp = require("sharp");

const UPLOADS_ROOT = path.resolve(__dirname, "..", "..", "imagenes subidas");
const MAX_WIDTH_TRANSFER = Number(process.env.UPLOAD_MAX_WIDTH_TRANSFER || 1600);
const MAX_WIDTH_PROFILE = Number(process.env.UPLOAD_MAX_WIDTH_PROFILE || 900);
const JPEG_QUALITY = Number(process.env.UPLOAD_JPEG_QUALITY || 78);
const PNG_QUALITY = Number(process.env.UPLOAD_PNG_QUALITY || 80);
const WEBP_QUALITY = Number(process.env.UPLOAD_WEBP_QUALITY || 78);

function getPublicBaseUrl(req) {
  const fromEnv = process.env.PUBLIC_BASE_URL || process.env.BASE_URL;
  if (fromEnv) {
    return String(fromEnv).replace(/\/$/, "");
  }

  if (req) {
    const forwardedProto = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim();
    const forwardedHost = String(req.headers["x-forwarded-host"] || "").split(",")[0].trim();
    const proto = forwardedProto || req.protocol || "http";
    const host = forwardedHost || req.get("host");

    if (host) {
      return `${proto}://${host}`.replace(/\/$/, "");
    }
  }

  const baseUrl = `http://localhost:${process.env.PORT || 3000}`;
  return String(baseUrl).replace(/\/$/, "");
}

function getExtensionFromMimeType(mimeType) {
  const normalized = String(mimeType || "").toLowerCase();

  if (normalized === "image/jpeg" || normalized === "image/jpg") return ".jpg";
  if (normalized === "image/png") return ".png";
  if (normalized === "image/webp") return ".webp";
  return ".jpg";
}

async function optimizeImageBuffer({ buffer, maxWidth }) {
  const pipeline = sharp(buffer, { failOn: "none" }).rotate().resize({
    width: maxWidth,
    height: maxWidth,
    fit: "inside",
    withoutEnlargement: true
  });

  const metadata = await pipeline.metadata();
  const format = String(metadata.format || "").toLowerCase();

  if (format === "png") {
    return {
      buffer: await pipeline.png({
        compressionLevel: 9,
        palette: true,
        quality: PNG_QUALITY
      }).toBuffer(),
      extension: ".png"
    };
  }

  if (format === "webp") {
    return {
      buffer: await pipeline.webp({ quality: WEBP_QUALITY }).toBuffer(),
      extension: ".webp"
    };
  }

  return {
    buffer: await pipeline.jpeg({ quality: JPEG_QUALITY, mozjpeg: true }).toBuffer(),
    extension: ".jpg"
  };
}

async function saveImageLocally({ relativePath, buffer, req }) {
  const absolutePath = path.join(UPLOADS_ROOT, relativePath);
  const dir = path.dirname(absolutePath);

  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(absolutePath, buffer);

  const normalizedRelativePath = relativePath.replace(/\\/g, "/");
  const imagePathForUrl = encodeURI(normalizedRelativePath);
  const publicBaseUrl = getPublicBaseUrl(req);

  return {
    imagePath: absolutePath,
    imageUrl: `${publicBaseUrl}/imagenes-subidas/${imagePathForUrl}`
  };
}

async function uploadTransferImage({ buffer, mimeType, originalName, idNegocio, idUsuario, req }) {
  let optimizedBuffer = buffer;
  let extension = path.extname(originalName || "") || getExtensionFromMimeType(mimeType);

  try {
    const optimized = await optimizeImageBuffer({
      buffer,
      maxWidth: MAX_WIDTH_TRANSFER
    });
    optimizedBuffer = optimized.buffer;
    extension = optimized.extension;
  } catch (_error) {
    // Si la optimizacion falla, se guarda el archivo original para no bloquear el flujo.
  }

  const filePath = `transferencias/${idNegocio}/${Date.now()}-${idUsuario}-${randomUUID()}${extension}`;

  return saveImageLocally({
    relativePath: filePath,
    buffer: optimizedBuffer,
    req
  });
}

async function uploadUserProfileImage({ buffer, mimeType, originalName, email, req }) {
  let optimizedBuffer = buffer;
  let extension = path.extname(originalName || "") || getExtensionFromMimeType(mimeType);

  try {
    const optimized = await optimizeImageBuffer({
      buffer,
      maxWidth: MAX_WIDTH_PROFILE
    });
    optimizedBuffer = optimized.buffer;
    extension = optimized.extension;
  } catch (_error) {
    // Si la optimizacion falla, se guarda el archivo original para no bloquear el flujo.
  }

  const safeEmail = String(email || "user").replace(/[^a-zA-Z0-9._-]/g, "_");
  const filePath = `perfiles/${Date.now()}-${safeEmail}-${randomUUID()}${extension}`;

  return saveImageLocally({
    relativePath: filePath,
    buffer: optimizedBuffer,
    req
  });
}

module.exports = {
  uploadTransferImage,
  uploadUserProfileImage
};
