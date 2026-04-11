const { createClient } = require("@supabase/supabase-js");

let supabaseClient;

function getSupabaseUrl() {
  const url = process.env.SUPABASE_URL;

  if (!url) {
    throw new Error("SUPABASE_URL no esta configurado");
  }

  return url;
}

function getSupabaseServiceRoleKey() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!key) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY no esta configurado");
  }

  return key;
}

function getStorageBucketName() {
  const bucket = process.env.SUPABASE_STORAGE_BUCKET;

  if (!bucket) {
    throw new Error("SUPABASE_STORAGE_BUCKET no esta configurado");
  }

  return bucket;
}

function getSupabaseAdminClient() {
  if (!supabaseClient) {
    supabaseClient = createClient(getSupabaseUrl(), getSupabaseServiceRoleKey(), {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });
  }

  return supabaseClient;
}

module.exports = {
  getStorageBucketName,
  getSupabaseAdminClient
};
