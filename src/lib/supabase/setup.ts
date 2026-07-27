import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { join } from "path";
import pg from "pg";

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Thiếu NEXT_PUBLIC_SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function tablesReady() {
  const supabase = getServiceClient();
  const { error } = await supabase.from("families").select("id").limit(1);
  if (!error) return true;
  // PGRST205 = table missing
  return false;
}

export async function applySchemaWithPassword(databasePassword: string) {
  const projectRef = "uunxxqdkdmqrwjufkotz";
  const encoded = encodeURIComponent(databasePassword);

  const candidates = [
    process.env.DATABASE_URL,
    `postgresql://postgres.${projectRef}:${encoded}@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres`,
    `postgresql://postgres:${encoded}@db.${projectRef}.supabase.co:5432/postgres`,
    `postgresql://postgres.${projectRef}:${encoded}@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres`,
    `postgresql://postgres.${projectRef}:${encoded}@aws-0-us-east-1.pooler.supabase.com:6543/postgres`,
    `postgresql://postgres.${projectRef}:${encoded}@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres`,
  ].filter(Boolean) as string[];

  const sqlPath = join(process.cwd(), "supabase", "schema.sql");
  const sql = readFileSync(sqlPath, "utf8");

  let lastError: unknown;
  for (const cs of candidates) {
    const client = new pg.Client({
      connectionString: cs,
      ssl: { rejectUnauthorized: false },
    });
    try {
      await client.connect();
      await client.query(sql);
      await client.end();
      return { ok: true as const };
    } catch (err) {
      lastError = err;
      try {
        await client.end();
      } catch {
        /* ignore */
      }
    }
  }

  return {
    ok: false as const,
    error: lastError instanceof Error ? lastError.message : "Không kết nối được database",
  };
}
