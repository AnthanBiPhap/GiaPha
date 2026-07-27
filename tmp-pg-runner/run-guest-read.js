const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

function loadEnv() {
  const envPath = path.join("C:/Users/Admin/GiaPha", ".env.local");
  const text = fs.readFileSync(envPath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^DATABASE_URL=(.*)$/);
    if (m) return m[1].trim();
  }
  throw new Error("Missing DATABASE_URL");
}

async function main() {
  const connectionString = loadEnv();
  const sql = fs.readFileSync(
    path.join("C:/Users/Admin/GiaPha", "supabase", "guest-read.sql"),
    "utf8",
  );

  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  await client.query(sql);
  await client.end();
  console.log("OK: guest-read policies applied");
}

main().catch((err) => {
  console.error("FAILED:", err.message);
  process.exit(1);
});
