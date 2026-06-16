-- =============================================
-- Helper: auto-set updated_at on any table
-- =============================================
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- =============================================
-- Helper: check if current user can view data
-- =============================================
create or replace function current_user_can_view()
returns boolean
language plpgsql
stable
as $$
begin
  return exists (
    select 1
    from profiles
    where id = auth.uid()
      and can_view = true
  );
end;
$$;

-- =============================================
-- Helper: check if current user can edit data
-- =============================================
create or replace function current_user_can_edit()
returns boolean
language plpgsql
stable
as $$
begin
  return exists (
    select 1
    from profiles
    where id = auth.uid()
      and can_edit = true
  );
end;
$$;
