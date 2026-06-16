-- =============================================
-- label_options — ontology dropdowns
-- Only aspect / attribute / sentiment (no scope)
-- =============================================
create table label_options (
  id uuid primary key default gen_random_uuid(),
  label_type text not null,
  value text not null,
  parent_value text,
  description text,
  display_order integer default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(label_type, value),
  constraint label_type_check check (
    label_type in ('aspect', 'attribute', 'sentiment')
  )
);

create index idx_label_options_type on label_options(label_type);
create index idx_label_options_parent on label_options(parent_value);

create trigger trg_label_options_updated_at
  before update on label_options
  for each row
  execute function set_updated_at();
