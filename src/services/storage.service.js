const path = require("path");
const { randomUUID } = require("crypto");

const { getStorageBucketName, getSupabaseAdminClient } = require("../config/supabase");

async function uploadToSupabase({ filePath, buffer, mimeType }) {
  const supabase = getSupabaseAdminClient();
  const bucket = getStorageBucketName();

  const { error } = await supabase.storage.from(bucket).upload(filePath, buffer, {
    contentType: mimeType,
    upsert: false
  });

  if (error) {
    throw new Error(`No se pudo subir imagen a Supabase: ${error.message}`);
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(filePath);

  if (!data?.publicUrl) {
    throw new Error("No se pudo generar URL publica en Supabase");
  }

  return {
    imagePath: filePath,
    imageUrl: data.publicUrl
  };
}

async function uploadTransferImage({ buffer, mimeType, originalName, idNegocio, idUsuario }) {
  const extension = path.extname(originalName || "") || ".jpg";
  const filePath = `transferencias/${idNegocio}/${Date.now()}-${idUsuario}-${randomUUID()}${extension}`;

  return uploadToSupabase({
    filePath,
    buffer,
    mimeType
  });
}

async function uploadUserProfileImage({ buffer, mimeType, originalName, email }) {
  const extension = path.extname(originalName || "") || ".jpg";
  const safeEmail = String(email || "user").replace(/[^a-zA-Z0-9._-]/g, "_");
  const filePath = `perfiles/${Date.now()}-${safeEmail}-${randomUUID()}${extension}`;

  return uploadToSupabase({
    filePath,
    buffer,
    mimeType
  });
}

module.exports = {
  uploadTransferImage,
  uploadUserProfileImage
};
