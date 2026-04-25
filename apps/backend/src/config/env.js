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

export const env = {
  port: Number(readEnv("PORT", "4000")),
  supabaseDbUrl: readEnv("SUPABASE_DB_URL"),
  geminiKey: readEnv("GEMINI_KEY"),
  patientUiBaseUrl: readEnv("PATIENT_UI_BASE_URL", "http://localhost:5173"),
  supabaseUrl: readEnv("SUPABASE_URL", ""),
  supabaseServiceRoleKey: readEnv("SUPABASE_SERVICE_ROLE_KEY", "")
};
