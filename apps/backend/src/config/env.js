import dotenv from "dotenv";

dotenv.config();

function readEnv(name, fallback = undefined) {
  const value = process.env[name];
  if (value !== undefined && value !== "") {
    return value;
  }
  if (fallback !== undefined) {
    return fallback;
  }
  throw new Error(`Missing required environment variable: ${name}`);
}

function inferSupabaseRefFromDbUrl(dbUrl) {
  if (!dbUrl) {
    return "";
  }

  try {
    const parsed = new URL(dbUrl);
    const hostParts = parsed.hostname.split(".");
    const postgresIndex = hostParts.indexOf("postgres");
    if (postgresIndex !== -1 && hostParts[postgresIndex + 1]) {
      return hostParts[postgresIndex + 1];
    }
  } catch {
    return "";
  }

  return "";
}

function inferSupabaseRefFromServiceRoleKey(serviceRoleKey) {
  if (!serviceRoleKey || !serviceRoleKey.includes(".")) {
    return "";
  }

  try {
    const base64Payload = serviceRoleKey.split(".")[1];
    const decodedPayload = Buffer.from(base64Payload, "base64url").toString("utf8");
    const payload = JSON.parse(decodedPayload);
    return typeof payload.ref === "string" ? payload.ref : "";
  } catch {
    return "";
  }
}

function inferSupabaseUrl({ explicitUrl, supabaseDbUrl, supabaseServiceRoleKey }) {
  if (explicitUrl) {
    return explicitUrl;
  }

  const projectRef =
    inferSupabaseRefFromDbUrl(supabaseDbUrl) || inferSupabaseRefFromServiceRoleKey(supabaseServiceRoleKey);
  if (!projectRef) {
    return "";
  }

  return `https://${projectRef}.supabase.co`;
}

const supabaseDbUrl = readEnv("SUPABASE_DB_URL");
const supabaseServiceRoleKey = readEnv("SUPABASE_SERVICE_ROLE_KEY", "");
const explicitSupabaseUrl = readEnv("SUPABASE_URL", "");

export const env = {
  port: Number(readEnv("PORT", "4000")),
  supabaseDbUrl,
  geminiKey: readEnv("GEMINI_KEY"),
  patientUiBaseUrl: readEnv("PATIENT_UI_BASE_URL", "http://localhost:5173"),
  supabaseUrl: inferSupabaseUrl({
    explicitUrl: explicitSupabaseUrl,
    supabaseDbUrl,
    supabaseServiceRoleKey
  }),
  supabaseServiceRoleKey
};
