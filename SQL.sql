-- Enable pgcrypto for gen_random_uuid()
create extension if not exists pgcrypto;
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
-- =============================================
-- datasets
-- =============================================
create table datasets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  total_articles integer not null default 0,
  total_paragraphs integer not null default 0,
  total_annotations integer not null default 0,
  status text not null default 'importing',
  import_error text,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint datasets_status_check check (
    status in ('importing', 'ready', 'error')
  )
);

create index idx_datasets_created_by on datasets(created_by);
create index idx_datasets_status on datasets(status);
create index idx_datasets_created_at on datasets(created_at desc);

-- =============================================
-- articles
-- =============================================
create table articles (
  id uuid primary key default gen_random_uuid(),
  dataset_id uuid not null references datasets(id) on delete cascade,
  external_article_id text not null,
  article_order integer,
  publisher text,
  title text,
  author text,
  publish_datetime timestamp,
  source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(dataset_id, external_article_id)
);

create index idx_articles_dataset_id on articles(dataset_id);
create index idx_articles_publisher on articles(publisher);
create index idx_articles_publish_datetime on articles(publish_datetime desc);
create index idx_articles_title on articles using gin(to_tsvector('simple', coalesce(title, '')));

-- =============================================
-- paragraphs
-- =============================================
create table paragraphs (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references articles(id) on delete cascade,
  external_paragraph_id text not null,
  paragraph_order integer not null,
  paragraph_text text not null,
  status text not null default 'pending',
  checked boolean not null default false,
  no_aspect boolean not null default false,
  locked_by uuid references profiles(id) on delete set null,
  locked_until timestamptz,
  last_edited_by uuid references profiles(id) on delete set null,
  last_edited_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(article_id, external_paragraph_id),
  constraint paragraphs_status_check check (
    status in ('pending', 'in_progress', 'completed', 'skipped')
  )
);

create index idx_paragraphs_article_id on paragraphs(article_id);
create index idx_paragraphs_status on paragraphs(status);
create index idx_paragraphs_locked_by on paragraphs(locked_by);
create index idx_paragraphs_order on paragraphs(article_id, paragraph_order);
create index idx_paragraphs_text_search on paragraphs using gin(to_tsvector('simple', paragraph_text));

-- =============================================
-- annotations  (no scope column)
-- =============================================
create table annotations (
  id uuid primary key default gen_random_uuid(),
  paragraph_id uuid not null references paragraphs(id) on delete cascade,
  span text not null,
  aspect text not null,
  attribute text not null,
  sentiment text not null,
  start_index integer not null,
  end_index integer not null,
  annotation_type text not null default 'imported',
  created_by uuid references profiles(id) on delete set null,
  updated_by uuid references profiles(id) on delete set null,
  is_deleted boolean not null default false,
  deleted_by uuid references profiles(id) on delete set null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint annotation_index_check check (
    start_index >= 0 and end_index > start_index
  ),
  constraint annotation_type_check check (
    annotation_type in ('imported', 'user')
  )
);

create index idx_annotations_paragraph_id on annotations(paragraph_id);
create index idx_annotations_aspect on annotations(aspect);
create index idx_annotations_attribute on annotations(attribute);
create index idx_annotations_sentiment on annotations(sentiment);

-- =============================================
-- annotation_audit_logs
-- =============================================
create table annotation_audit_logs (
  id uuid primary key default gen_random_uuid(),
  annotation_id uuid references annotations(id) on delete set null,
  paragraph_id uuid not null references paragraphs(id) on delete cascade,
  actor_id uuid references profiles(id) on delete set null,
  action text not null,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now(),
  constraint annotation_audit_action_check check (
    action in ('create', 'update', 'delete', 'restore')
  )
);

create index idx_audit_logs_annotation_id on annotation_audit_logs(annotation_id);
create index idx_audit_logs_paragraph_id on annotation_audit_logs(paragraph_id);
create index idx_audit_logs_actor_id on annotation_audit_logs(actor_id);
create index idx_audit_logs_created_at on annotation_audit_logs(created_at desc);
create index idx_audit_logs_action on annotation_audit_logs(action);
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
-- =============================================
-- DATASETS
-- =============================================
create trigger trg_datasets_updated_at
  before update on datasets
  for each row
  execute function set_updated_at();

-- =============================================
-- ARTICLES
-- =============================================
create trigger trg_articles_updated_at
  before update on articles
  for each row
  execute function set_updated_at();

-- =============================================
-- PARAGRAPHS
-- =============================================
create trigger trg_paragraphs_updated_at
  before update on paragraphs
  for each row
  execute function set_updated_at();

-- =============================================
-- ANNOTATIONS
-- =============================================
create trigger trg_annotations_updated_at
  before update on annotations
  for each row
  execute function set_updated_at();

-- Set created_by on insert
create or replace function annotations_set_created_by()
returns trigger as $$
begin
  new.created_by = coalesce(new.created_by, auth.uid());
  return new;
end;
$$ language plpgsql;

create trigger trg_annotations_set_created_by
  before insert on annotations
  for each row
  execute function annotations_set_created_by();

-- Set updated_by on every update
create or replace function annotations_set_updated_by()
returns trigger as $$
begin
  new.updated_by = auth.uid();
  return new;
end;
$$ language plpgsql;

create trigger trg_annotations_set_updated_by
  before update on annotations
  for each row
  execute function annotations_set_updated_by();

-- Set deleted_by / deleted_at when soft-deleting
create or replace function annotations_set_deleted_by()
returns trigger as $$
begin
  if new.is_deleted and not old.is_deleted then
    new.deleted_by = coalesce(new.deleted_by, auth.uid());
    new.deleted_at = now();
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_annotations_set_deleted_by
  before update on annotations
  for each row
  when (old.is_deleted is distinct from new.is_deleted)
  execute function annotations_set_deleted_by();

-- =============================================
-- AUDIT LOGS — auto-log every annotation change
-- =============================================
create or replace function log_annotation_changes()
returns trigger
language plpgsql
security definer
as $$
begin
  if TG_OP = 'INSERT' then
    insert into annotation_audit_logs
      (annotation_id, paragraph_id, actor_id, action, new_data)
    values (
      new.id,
      new.paragraph_id,
      coalesce(new.created_by, auth.uid()),
      'create',
      jsonb_build_object(
        'span', new.span,
        'aspect', new.aspect,
        'attribute', new.attribute,
        'sentiment', new.sentiment,
        'start_index', new.start_index,
        'end_index', new.end_index
      )
    );
    return new;
  end if;

  if TG_OP = 'UPDATE' then
    -- Soft delete
    if not old.is_deleted and new.is_deleted then
      insert into annotation_audit_logs
        (annotation_id, paragraph_id, actor_id, action, old_data, new_data)
      values (
        new.id,
        new.paragraph_id,
        coalesce(new.deleted_by, auth.uid()),
        'delete',
        jsonb_build_object(
          'span', old.span,
          'aspect', old.aspect,
          'attribute', old.attribute,
          'sentiment', old.sentiment,
          'start_index', old.start_index,
          'end_index', old.end_index
        ),
        '{"is_deleted": true}'::jsonb
      );
      return new;
    end if;

    -- Restore
    if old.is_deleted and not new.is_deleted then
      insert into annotation_audit_logs
        (annotation_id, paragraph_id, actor_id, action, old_data, new_data)
      values (
        new.id,
        new.paragraph_id,
        coalesce(new.updated_by, auth.uid()),
        'restore',
        '{"is_deleted": true}'::jsonb,
        jsonb_build_object(
          'span', new.span,
          'aspect', new.aspect,
          'attribute', new.attribute,
          'sentiment', new.sentiment,
          'start_index', new.start_index,
          'end_index', new.end_index
        )
      );
      return new;
    end if;

    -- Actual data update
    if (old.span, old.aspect, old.attribute, old.sentiment, old.start_index, old.end_index)
      is distinct from
       (new.span, new.aspect, new.attribute, new.sentiment, new.start_index, new.end_index)
    then
      insert into annotation_audit_logs
        (annotation_id, paragraph_id, actor_id, action, old_data, new_data)
      values (
        new.id,
        new.paragraph_id,
        coalesce(new.updated_by, auth.uid()),
        'update',
        jsonb_build_object(
          'span', old.span,
          'aspect', old.aspect,
          'attribute', old.attribute,
          'sentiment', old.sentiment,
          'start_index', old.start_index,
          'end_index', old.end_index
        ),
        jsonb_build_object(
          'span', new.span,
          'aspect', new.aspect,
          'attribute', new.attribute,
          'sentiment', new.sentiment,
          'start_index', new.start_index,
          'end_index', new.end_index
        )
      );
      return new;
    end if;
  end if;

  return new;
end;
$$;

create trigger trg_annotations_audit_insert
  after insert on annotations
  for each row
  execute function log_annotation_changes();

create trigger trg_annotations_audit_update
  after update on annotations
  for each row
  execute function log_annotation_changes();
-- =============================================
-- article_progress_view
-- Frontend: dataset detail → article list
-- =============================================
create view article_progress_view
with (security_invoker = true)
as
select
  a.id as article_id,
  a.dataset_id,
  a.external_article_id,
  a.article_order,
  a.publisher,
  a.title,
  a.author,
  a.publish_datetime,
  a.source,
  count(p.id) as total_paragraphs,
  count(p.id) filter (where p.status = 'pending') as pending_paragraphs,
  count(p.id) filter (where p.status = 'in_progress') as in_progress_paragraphs,
  count(p.id) filter (where p.status = 'completed') as completed_paragraphs,
  count(p.id) filter (where p.status = 'skipped') as skipped_paragraphs,
  case
    when count(p.id) = 0 then 0
    else round(
      count(p.id) filter (where p.status = 'completed')::numeric
      / count(p.id)::numeric * 100,
      2
    )
  end as progress_percent
from articles a
left join paragraphs p on p.article_id = a.id
group by
  a.id,
  a.dataset_id,
  a.external_article_id,
  a.article_order,
  a.publisher,
  a.title,
  a.author,
  a.publish_datetime,
  a.source;

-- =============================================
-- dataset_progress_view
-- Frontend: dashboard → dataset list
-- =============================================
create view dataset_progress_view
with (security_invoker = true)
as
select
  d.id as dataset_id,
  d.name,
  d.description,
  d.status,
  d.import_error,
  d.created_by,
  d.created_at,
  d.updated_at,
  count(distinct a.id) as total_articles,
  count(distinct p.id) as total_paragraphs,
  count(distinct ann.id) filter (where ann.is_deleted = false) as total_active_annotations,
  count(distinct p.id) filter (where p.status = 'pending') as pending_paragraphs,
  count(distinct p.id) filter (where p.status = 'in_progress') as in_progress_paragraphs,
  count(distinct p.id) filter (where p.status = 'completed') as completed_paragraphs,
  count(distinct p.id) filter (where p.status = 'skipped') as skipped_paragraphs,
  case
    when count(distinct p.id) = 0 then 0
    else round(
      count(distinct p.id) filter (where p.status = 'completed')::numeric
      / count(distinct p.id)::numeric * 100,
      2
    )
  end as progress_percent
from datasets d
left join articles a on a.dataset_id = d.id
left join paragraphs p on p.article_id = a.id
left join annotations ann on ann.paragraph_id = p.id
group by
  d.id,
  d.name,
  d.description,
  d.status,
  d.import_error,
  d.created_by,
  d.created_at,
  d.updated_at;
-- =============================================
-- PROFILES
-- =============================================
alter table profiles enable row level security;

create policy "Users can view own profile"
  on profiles for select
  to authenticated
  using (id = auth.uid());

-- =============================================
-- DATASETS
-- =============================================
alter table datasets enable row level security;

create policy "View datasets"
  on datasets for select
  to authenticated
  using (current_user_can_view());

create policy "Insert datasets"
  on datasets for insert
  to authenticated
  with check (current_user_can_edit());

create policy "Update datasets"
  on datasets for update
  to authenticated
  using (current_user_can_edit())
  with check (current_user_can_edit());

create policy "Delete datasets"
  on datasets for delete
  to authenticated
  using (current_user_can_edit());

-- =============================================
-- ARTICLES
-- =============================================
alter table articles enable row level security;

create policy "View articles"
  on articles for select
  to authenticated
  using (current_user_can_view());

create policy "Insert articles"
  on articles for insert
  to authenticated
  with check (current_user_can_edit());

create policy "Update articles"
  on articles for update
  to authenticated
  using (current_user_can_edit())
  with check (current_user_can_edit());

create policy "Delete articles"
  on articles for delete
  to authenticated
  using (current_user_can_edit());

-- =============================================
-- PARAGRAPHS
-- =============================================
alter table paragraphs enable row level security;

create policy "View paragraphs"
  on paragraphs for select
  to authenticated
  using (current_user_can_view());

create policy "Insert paragraphs"
  on paragraphs for insert
  to authenticated
  with check (current_user_can_edit());

create policy "Update paragraphs"
  on paragraphs for update
  to authenticated
  using (current_user_can_edit())
  with check (current_user_can_edit());

create policy "Delete paragraphs"
  on paragraphs for delete
  to authenticated
  using (current_user_can_edit());

-- =============================================
-- ANNOTATIONS
-- =============================================
alter table annotations enable row level security;

create policy "View annotations"
  on annotations for select
  to authenticated
  using (current_user_can_view());

create policy "Insert annotations"
  on annotations for insert
  to authenticated
  with check (current_user_can_edit());

create policy "Update annotations"
  on annotations for update
  to authenticated
  using (current_user_can_edit())
  with check (current_user_can_edit());

create policy "Delete annotations"
  on annotations for delete
  to authenticated
  using (current_user_can_edit());

-- =============================================
-- ANNOTATION AUDIT LOGS
-- =============================================
alter table annotation_audit_logs enable row level security;

create policy "View audit logs"
  on annotation_audit_logs for select
  to authenticated
  using (current_user_can_view());

create policy "Delete audit logs"
  on annotation_audit_logs for delete
  to authenticated
  using (current_user_can_edit());

-- =============================================
-- LABEL OPTIONS
-- =============================================
alter table label_options enable row level security;

create policy "View label options"
  on label_options for select
  to authenticated
  using (current_user_can_view());

create policy "Insert label options"
  on label_options for insert
  to authenticated
  with check (current_user_can_edit());

create policy "Update label options"
  on label_options for update
  to authenticated
  using (current_user_can_edit())
  with check (current_user_can_edit());
-- =============================================
-- Seed aspects
-- =============================================
insert into label_options (label_type, value, display_order) values
  ('aspect', 'DIGITAL_BANKING', 1),
  ('aspect', 'SERVICE', 2),
  ('aspect', 'FINANCIAL_PRODUCT', 3),
  ('aspect', 'FINANCIAL_FEE', 4),
  ('aspect', 'LEADERSHIP', 5),
  ('aspect', 'MACRO_REGULATION', 6),
  ('aspect', 'MARKET_PERCEPTION', 7);

-- =============================================
-- Seed attributes (linked to parent aspect)
-- =============================================
insert into label_options (label_type, value, parent_value, display_order) values
  -- DIGITAL_BANKING
  ('attribute', 'USABILITY', 'DIGITAL_BANKING', 1),
  ('attribute', 'STABILITY', 'DIGITAL_BANKING', 2),
  ('attribute', 'FEATURES', 'DIGITAL_BANKING', 3),
  ('attribute', 'SECURITY', 'DIGITAL_BANKING', 4),
  -- SERVICE
  ('attribute', 'STAFF_ATTITUDE', 'SERVICE', 1),
  ('attribute', 'SUPPORT_SPEED', 'SERVICE', 2),
  ('attribute', 'PROCEDURE', 'SERVICE', 3),
  -- FINANCIAL_PRODUCT
  ('attribute', 'INTEREST_RATE', 'FINANCIAL_PRODUCT', 1),
  ('attribute', 'LIQUIDITY', 'FINANCIAL_PRODUCT', 2),
  ('attribute', 'PROFITABILITY', 'FINANCIAL_PRODUCT', 3),
  ('attribute', 'OTHER_PRODUCTS', 'FINANCIAL_PRODUCT', 4),
  ('attribute', 'ASSET_QUALITY', 'FINANCIAL_PRODUCT', 5),
  -- FINANCIAL_FEE
  ('attribute', 'TRANSACTION_FEE', 'FINANCIAL_FEE', 1),
  ('attribute', 'TRANSPARENCY', 'FINANCIAL_FEE', 2),
  -- LEADERSHIP
  ('attribute', 'REPUTATION', 'LEADERSHIP', 1),
  ('attribute', 'STRATEGY', 'LEADERSHIP', 2),
  ('attribute', 'INTEGRITY', 'LEADERSHIP', 3),
  ('attribute', 'RISK_CONTROL', 'LEADERSHIP', 4),
  -- MACRO_REGULATION
  ('attribute', 'POLICY_CHANGE', 'MACRO_REGULATION', 1),
  ('attribute', 'MONETARY_CONTROL', 'MACRO_REGULATION', 2),
  ('attribute', 'COMPLIANCE', 'MACRO_REGULATION', 3),
  -- MARKET_PERCEPTION
  ('attribute', 'ANALYST_VIEW', 'MARKET_PERCEPTION', 1),
  ('attribute', 'INVESTOR_SENTIMENT', 'MARKET_PERCEPTION', 2),
  ('attribute', 'MARKET_SIGNAL', 'MARKET_PERCEPTION', 3);

-- =============================================
-- Seed sentiments
-- =============================================
insert into label_options (label_type, value, display_order) values
  ('sentiment', 'POSITIVE', 1),
  ('sentiment', 'NEGATIVE', 2),
  ('sentiment', 'NEUTRAL', 3);
