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
