-- =============================================
-- profiles — chỉ có quyền xem/sửa
-- =============================================
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  can_view boolean not null default false,
  can_edit boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint edit_requires_view check (
    can_edit = false or can_view = true
  )
);

create trigger trg_profiles_updated_at
  before update on profiles
  for each row
  execute function set_updated_at();

-- =============================================
-- Tự tạo profile khi user đăng nhập lần đầu
-- =============================================
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id)
  values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function handle_new_user();
