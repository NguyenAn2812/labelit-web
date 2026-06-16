import { supabase } from './supabase'

/* ── Label options (config) ──────────────── */

export async function getLabelOptions() {
  const { data, error } = await supabase
    .from('label_options')
    .select('*')
    .eq('is_active', true)
    .order('display_order')

  if (error) throw error

  const aspects = data.filter(o => o.label_type === 'aspect')
  const attributes = data.filter(o => o.label_type === 'attribute')
  const sentiments = data.filter(o => o.label_type === 'sentiment')

  const entityAttributes = {}
  for (const a of aspects) {
    entityAttributes[a.value] = attributes
      .filter(attr => attr.parent_value === a.value)
      .map(attr => attr.value)
  }

  return {
    aspects: aspects.map(a => a.value),
    attributes: attributes.map(a => a.value),
    sentiments: sentiments.map(s => s.value),
    entity_attributes: entityAttributes,
    aspectsOptions: aspects,
    attributesOptions: attributes,
    sentimentsOptions: sentiments,
  }
}

/* ── Datasets ─────────────────────────────── */

export async function getDatasets() {
  const { data, error } = await supabase
    .from('dataset_progress_view')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) throw error
  return data
}

export async function getDatasetById(id) {
  const { data, error } = await supabase
    .from('datasets')
    .select('*')
    .eq('id', id)
    .single()

  if (error) throw error
  return data
}

export async function createDataset({ name, description }) {
  const { data, error } = await supabase
    .from('datasets')
    .insert({ name, description })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function updateDatasetStatus(id, status, importError = null) {
  const update = { status }
  if (importError !== null) update.import_error = importError

  const { data, error } = await supabase
    .from('datasets')
    .update(update)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function deleteDataset(id) {
  const { data, error } = await supabase
    .from('datasets')
    .delete()
    .eq('id', id)
    .select()
  if (error) throw error
  if (!data || data.length === 0) throw new Error('Xóa thất bại: không tìm thấy hoặc không có quyền')
}

/* ── Articles ─────────────────────────────── */

export async function getArticlesByDataset(datasetId) {
  const { data, error } = await supabase
    .from('article_progress_view')
    .select('*')
    .eq('dataset_id', datasetId)
    .order('article_order')

  if (error) throw error
  return data
}

/* ── Paragraphs ───────────────────────────── */

export async function getParagraphsByArticle(articleId) {
  const { data, error } = await supabase
    .from('paragraphs')
    .select('*')
    .eq('article_id', articleId)
    .order('paragraph_order')

  if (error) throw error
  return data
}

export async function updateParagraphStatus(id, status) {
  const { data, error } = await supabase
    .from('paragraphs')
    .update({
      status,
      last_edited_by: (await supabase.auth.getUser()).data.user?.id,
      last_edited_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function deleteParagraph(id) {
  const { data, error } = await supabase
    .from('paragraphs')
    .delete()
    .eq('id', id)
    .select()
  if (error) throw error
  if (!data || data.length === 0) throw new Error('Xóa thất bại: không tìm thấy hoặc không có quyền')
}

export async function updateParagraphChecked(id, checked) {
  const { data, error } = await supabase
    .from('paragraphs')
    .update({ checked })
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function updateParagraphNoAspect(id, noAspect) {
  const { data, error } = await supabase
    .from('paragraphs')
    .update({
      no_aspect: noAspect,
      status: noAspect ? 'skipped' : 'pending',
    })
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}

/* ── Annotations ──────────────────────────── */

export async function getAnnotationsByParagraph(paragraphId) {
  const { data, error } = await supabase
    .from('annotations')
    .select('*')
    .eq('paragraph_id', paragraphId)
    .eq('is_deleted', false)
    .order('start_index')

  if (error) throw error
  return data
}

export async function createAnnotation(annotation) {
  const { data, error } = await supabase
    .from('annotations')
    .insert({
      paragraph_id: annotation.paragraph_id,
      span: annotation.span,
      aspect: annotation.aspect,
      attribute: annotation.attribute,
      sentiment: annotation.sentiment,
      start_index: annotation.start_index,
      end_index: annotation.end_index,
      annotation_type: 'user',
    })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function updateAnnotation(id, updates) {
  const { data, error } = await supabase
    .from('annotations')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function softDeleteAnnotation(id) {
  const { data, error } = await supabase
    .from('annotations')
    .update({ is_deleted: true })
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function restoreAnnotation(id) {
  const { data, error } = await supabase
    .from('annotations')
    .update({ is_deleted: false })
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}

/* ── Audit logs ───────────────────────────── */

export async function getAuditLogsByParagraph(paragraphId) {
  const { data, error } = await supabase
    .from('annotation_audit_logs')
    .select('*')
    .eq('paragraph_id', paragraphId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data
}

/* ── Label options (custom) ───────────────── */

export async function addLabelOption({ labelType, value, parentValue }) {
  const { data, error } = await supabase
    .from('label_options')
    .insert({
      label_type: labelType,
      value,
      parent_value: parentValue || null,
      display_order: 999,
    })
    .select()
    .single()

  if (error) throw error
  return data
}

/* ── Import / Export ──────────────────────── */

export async function importJsonToDataset(name, jsonData, onProgress) {
  const articles = jsonData.articles || []
  if (!articles.length) throw new Error('No articles in JSON')

  const dataset = await createDataset({
    name,
    description: `Imported from JSON — ${articles.length} articles`,
  })

  let totalParagraphs = 0
  let totalAnnotations = 0

  for (let order = 0; order < articles.length; order++) {
    if (onProgress) onProgress(order + 1, articles.length)

    const article = articles[order]

    const { data: articleRow, error: artErr } = await supabase
      .from('articles')
      .insert({
        dataset_id: dataset.id,
        external_article_id: article.article_id,
        article_order: order,
        publisher: article.publisher,
        title: article.title,
        author: article.author,
        publish_datetime: article.publish_datetime,
        source: article.source,
      })
      .select()
      .single()

    if (artErr) throw artErr

    const paraAnnotations = article.paragraph_annotations || []
    const paragraphsList = article.paragraphs || []

    for (let pIdx = 0; pIdx < paraAnnotations.length; pIdx++) {
      const pa = paraAnnotations[pIdx]
      const text = pa.paragraph || paragraphsList[pIdx] || ''
      if (!text) continue

      const { data: paraRow, error: paraErr } = await supabase
        .from('paragraphs')
        .insert({
          article_id: articleRow.id,
          external_paragraph_id: pa.paragraph_id || `${article.article_id}_p_${pIdx + 1}`,
          paragraph_order: pIdx,
          paragraph_text: text,
        })
        .select()
        .single()

      if (paraErr) throw paraErr
      totalParagraphs++

      const annotations = pa.annotations || []
      for (const ann of annotations) {
        if (!ann.aspect || !ann.attribute) continue

        const { error: annErr } = await supabase
          .from('annotations')
          .insert({
            paragraph_id: paraRow.id,
            span: ann.span,
            aspect: ann.aspect,
            attribute: ann.attribute,
            sentiment: (ann.sentiment || 'NEUTRAL').toUpperCase(),
            start_index: ann.start_index,
            end_index: ann.end_index,
            annotation_type: 'imported',
          })

        if (annErr) throw annErr
        totalAnnotations++
      }
    }
  }

  // 3. Update dataset stats
  await updateDatasetStatus(dataset.id, 'ready')
  await supabase
    .from('datasets')
    .update({
      total_articles: articles.length,
      total_paragraphs: totalParagraphs,
      total_annotations: totalAnnotations,
    })
    .eq('id', dataset.id)

  return dataset
}

export async function exportDatasetToJson(datasetId) {
  // Fetch articles
  const { data: articles, error: artErr } = await supabase
    .from('articles')
    .select('*')
    .eq('dataset_id', datasetId)
    .order('article_order')

  if (artErr) throw artErr

  const result = { total: articles.length, articles: [] }

  for (const article of articles) {
    const { data: paragraphs, error: paraErr } = await supabase
      .from('paragraphs')
      .select('*')
      .eq('article_id', article.id)
      .order('paragraph_order')

    if (paraErr) throw paraErr

    const articleObj = {
      article_id: article.external_article_id,
      publisher: article.publisher,
      title: article.title,
      author: article.author,
      publish_datetime: article.publish_datetime,
      source: article.source,
      paragraphs: paragraphs.map(p => p.paragraph_text),
      paragraph_annotations: [],
    }

    for (const para of paragraphs) {
      const { data: annotations, error: annErr } = await supabase
        .from('annotations')
        .select('*')
        .eq('paragraph_id', para.id)
        .eq('is_deleted', false)
        .order('start_index')

      if (annErr) throw annErr
      if (annotations.length === 0 && !para.no_aspect) continue

      const pa = {
        paragraph_id: para.external_paragraph_id,
        paragraph: para.paragraph_text,
        annotations: annotations.map(a => ({
          span: a.span,
          aspect: a.aspect,
          attribute: a.attribute,
          sentiment: a.sentiment,
          start_index: a.start_index,
          end_index: a.end_index,
        })),
      }

      if (para.checked) pa.checked = true
      if (para.no_aspect) pa.no_aspect = true

      articleObj.paragraph_annotations.push(pa)
    }

    result.articles.push(articleObj)
  }

  return result
}
