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
