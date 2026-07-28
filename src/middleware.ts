import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest\\.webmanifest|vendor/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|js|css|webmanifest)$).*)",
  ],
};
