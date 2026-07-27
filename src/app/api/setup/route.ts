import { NextResponse } from "next/server";
import { applySchemaWithPassword, tablesReady } from "@/lib/supabase/setup";

export async function GET() {
  try {
    const ready = await tablesReady();
    return NextResponse.json({ ready });
  } catch (err) {
    return NextResponse.json(
      { ready: false, error: err instanceof Error ? err.message : "Lỗi" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { databasePassword?: string };
    const password = body.databasePassword?.trim();
    if (!password) {
      return NextResponse.json(
        { ok: false, error: "Nhập Database password" },
        { status: 400 },
      );
    }

    if (await tablesReady()) {
      return NextResponse.json({ ok: true, message: "Schema đã sẵn sàng" });
    }

    const result = await applySchemaWithPassword(password);
    if (!result.ok) {
      return NextResponse.json(result, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      message: "Đã tạo bảng families, members, relationships, events + storage avatars",
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Lỗi setup" },
      { status: 500 },
    );
  }
}
