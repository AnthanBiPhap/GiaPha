# Gia Phả Cao Tổ

Next.js (App Router) + Supabase + TrackAsia.

## Yêu cầu

- Node.js 20+
- Project Supabase (URL + anon key trong `.env.local`)
- TrackAsia API key (`NEXT_PUBLIC_TRACKASIA_API_KEY`)

## Thiết lập nhanh

1. Chạy SQL trong `supabase/schema.sql` trên **Supabase → SQL Editor**.
2. Bật Auth: Email và (tuỳ chọn) Google OAuth; thêm Redirect URL:
   - `http://localhost:3000/auth/callback`
   - `https://<domain-của-bạn>/auth/callback`
3. Điền key vào `.env.local`:

```env
NEXT_PUBLIC_TRACKASIA_API_KEY=your_trackasia_key
```

4. Cài và chạy:

```bash
npm install
npm run dev
```

Mở http://localhost:3000

## Tính năng đã có

- Đăng ký / đăng nhập (email + Google OAuth)
- Dashboard tạo/xem dòng họ
- CRUD thành viên + ảnh
- Quan hệ cha-mẹ/con, vợ/chồng, anh chị em
- Cây gia phả (`@xyflow/react`)
- Bản đồ TrackAsia + GPS
- Dòng thời gian sự kiện

## Lưu ý branding

Tên hiển thị app là **Gia Phả Cao Tổ** (không dùng slug kiểu `gia-pha-cao-to.vercel.app`).
Nếu email xác thực / Google OAuth vẫn hiện tên domain Vercel, sửa trong:

- Supabase → Authentication → URL Configuration / Email Templates
- Google Cloud → OAuth consent screen → App name
