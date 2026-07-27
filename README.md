# Gia Phả Online

Next.js (App Router) + Supabase + Google Maps + Vercel.

## Yêu cầu

- Node.js 20+
- Project Supabase (URL + anon key đã có sẵn trong `.env.local`)
- (Tuỳ chọn) Google Maps API key

## Thiết lập nhanh

1. Chạy SQL trong `supabase/schema.sql` trên **Supabase → SQL Editor**.
2. Bật Auth: Email và (tuỳ chọn) Google OAuth; thêm Redirect URL:
   - `http://localhost:3000/auth/callback`
   - `https://<domain-vercel>/auth/callback`
3. Điền Maps key vào `.env.local` nếu dùng bản đồ:

```env
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your_maps_key
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
- CRUD thành viên + upload avatar (bucket `avatars`)
- Thêm quan hệ cha-mẹ/con, vợ/chồng, anh chị em
- Tab cây gia phả (`@xyflow/react`)
- Tab bản đồ Google Maps (khi có API key)
- Tab timeline sự kiện
- Tìm kiếm thành viên theo tên / đời / quê

## Deploy Vercel

1. Push repo lên GitHub
2. Import vào Vercel
3. Thêm env:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`
4. Deploy
