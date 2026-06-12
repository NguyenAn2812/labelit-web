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
