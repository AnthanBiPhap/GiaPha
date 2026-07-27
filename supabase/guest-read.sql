-- Guest / public read (chạy thêm trên Supabase nếu DB đã tạo trước đó)
-- Cho phép xem gia phả khi chưa đăng nhập; ghi vẫn chỉ owner.

drop policy if exists "Public read families" on families;
create policy "Public read families"
  on families for select
  using (true);

drop policy if exists "Public read members" on members;
create policy "Public read members"
  on members for select
  using (true);

drop policy if exists "Public read relationships" on relationships;
create policy "Public read relationships"
  on relationships for select
  using (true);

drop policy if exists "Public read events" on events;
create policy "Public read events"
  on events for select
  using (true);

drop policy if exists "Public read member_photos" on member_photos;
create policy "Public read member_photos"
  on member_photos for select
  using (true);
