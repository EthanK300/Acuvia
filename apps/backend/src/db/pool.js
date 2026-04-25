import pg from "pg";
import { env } from "../config/env.js";

const { Pool } = pg;

export const pool = new Pool({
  connectionString: env.supabaseDbUrl,
  ssl: { rejectUnauthorized: false }
});

export async function verifyDatabaseConnection() {
  await pool.query("select 1");
}
