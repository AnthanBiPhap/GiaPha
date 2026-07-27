/**
 * Public Supabase config (safe in browser).
 * Prefer env on Vercel; fallback keeps deploy working if env was forgotten.
 */
export const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  "https://uunxxqdkdmqrwjufkotz.supabase.co";

export const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1bnh4cWRrZG1xcndqdWZrb3R6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUxNDQ5MTgsImV4cCI6MjEwMDcyMDkxOH0.ymzYkh3tUHKrkbeUTrskfSpZ-YtFvFZEkg2v-7-im-g";
