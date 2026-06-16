-- =============================================
-- PATCH: allow hard delete for dataset/paragraph
-- Existing DBs need this file if SQL.sql was already run.
-- =============================================

drop policy if exists "Delete datasets" on datasets;
create policy "Delete datasets"
  on datasets for delete
  to authenticated
  using (current_user_can_edit());

drop policy if exists "Delete articles" on articles;
create policy "Delete articles"
  on articles for delete
  to authenticated
  using (current_user_can_edit());

drop policy if exists "Delete paragraphs" on paragraphs;
create policy "Delete paragraphs"
  on paragraphs for delete
  to authenticated
  using (current_user_can_edit());

drop policy if exists "Delete annotations" on annotations;
create policy "Delete annotations"
  on annotations for delete
  to authenticated
  using (current_user_can_edit());

drop policy if exists "Delete audit logs" on annotation_audit_logs;
create policy "Delete audit logs"
  on annotation_audit_logs for delete
  to authenticated
  using (current_user_can_edit());
