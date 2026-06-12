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
