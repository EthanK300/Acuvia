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
  geminiKey: readEnv("GEMINI_KEY")
};
