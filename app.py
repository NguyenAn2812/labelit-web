import json
import os
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from collections import defaultdict
from datetime import datetime
from typing import List, Optional, Dict, Any

app = FastAPI(title="Labelit ViFABSA API", version="1.0.0")

# Enable CORS for all origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==================== Pydantic Models ====================
class Label(BaseModel):
    aspect: str
    sentiment: str
    start: int
    end: int

class ParagraphContent(BaseModel):
    paragraph_index: int
    text: str
    labels: List[Label] = []
    no_aspect: bool = False

class ArticleMeta(BaseModel):
    title: Optional[str] = None
    source: Optional[str] = None
    publisher: Optional[str] = None
    author: Optional[str] = None
    sapo: Optional[str] = None
    publish_time: Optional[str] = None
    scope: Optional[str] = None
    ticker: Optional[list] = None

class DataItem(BaseModel):
    id: int
    article_id: Any
    article_meta: ArticleMeta
    paragraph_index: int
    text: str
    labels: List[Label] = []
    skipped: bool = False

class UpdateItemRequest(BaseModel):
    id: int
    text: str
    labels: List[Label]
    skipped: bool = False
    article_meta: Optional[Dict[str, Any]] = None

class UpdateScopeRequest(BaseModel):
    article_id: Any
    scope: str

class ConfigResponse(BaseModel):
    aspects_categories: List[str]
    aspects: List[str]
    sentiments: List[str]
    scopes: List[str]

class StatsResponse(BaseModel):
    total_sentences: int
    annotated_count: int
    aspect_counts: Dict[str, int]
    sentiment_counts: Dict[str, int]
    category_counts: Dict[str, int]
    breakdown: Dict[str, Dict[str, int]]


# ==================== Constants ====================
# ViFABSA ABSA Aspects (Stage 4)
ASPECTS = [
    "PROFITABILITY_&_PERFORMANCE",
    "CREDIT_GROWTH_&_ASSET_QUALITY",
    "CAPITAL_ADEQUACY_&_LIQUIDITY",
    "GOVERNANCE_&_RISK_MANAGEMENT",
    "REGULATORY_&_POLICY_ENVIRONMENT"
]

# Keep categories payload for UI compatibility (flat list)
ASPECTS_CATEGORIES = ASPECTS

SENTIMENTS = ["POSITIVE", "NEGATIVE", "NEUTRAL"]

# ViFABSA pipeline labels (Stage 3)
SCOPE_LABELS = ["MICRO", "MACRO"]

# Use merged dataset from ViFABSA project
INPUT_DATA = 'data/raw.json'
OUTPUT_DATA = 'data/annotated.json'

# Create reverse mapping: aspect -> category (same as aspect for flat list)
ASPECT_TO_CATEGORY = {aspect: aspect for aspect in ASPECTS}

SENTIMENT_SHORT_TO_LONG = {
    "POS": "POSITIVE",
    "NEG": "NEGATIVE",
    "NEU": "NEUTRAL",
}

SENTIMENT_LONG_TO_SHORT = {
    "POSITIVE": "POS",
    "NEGATIVE": "NEG",
    "NEUTRAL": "NEU",
}

def get_category_for_aspect(aspect):
    """Get category name for a given aspect"""
    return ASPECT_TO_CATEGORY.get(aspect, "UNKNOWN")

def _extract_articles(source_data):
    if isinstance(source_data, dict):
        if isinstance(source_data.get('articles'), list):
            return source_data.get('articles', [])
        if 'article_id' in source_data or 'id' in source_data:
            return [source_data]
        if isinstance(source_data.get('data'), list):
            return source_data.get('data', [])
        return []
    if isinstance(source_data, list):
        return source_data
    return []

def _get_article_id(article):
    return article.get('article_id', article.get('id'))

def _build_article_meta(article):
    return {
        'title': article.get('title'),
        'source': article.get('source'),
        'publisher': article.get('publisher'),
        'author': article.get('author'),
        'sapo': article.get('sapo'),
        'publish_time': article.get('publish_time'),
        'scope': article.get('scope'),
        'ticker': article.get('ticker')
    }


def _get_paragraphs(article):
    """Get paragraph list from raw/annotated schema, with legacy fallback."""
    paragraphs = article.get('paragraphs')
    if isinstance(paragraphs, list):
        return paragraphs
    content = article.get('content')
    if isinstance(content, list):
        return content
    return []


def _to_ui_sentiment(value):
    if not isinstance(value, str):
        return value
    return SENTIMENT_SHORT_TO_LONG.get(value.upper(), value)


def _to_storage_sentiment(value):
    if not isinstance(value, str):
        return value
    return SENTIMENT_LONG_TO_SHORT.get(value.upper(), value)


def _annotation_to_ui_label(annotation):
    if not isinstance(annotation, dict):
        return None

    start = annotation.get('start')
    end = annotation.get('end')
    aspect = annotation.get('aspect')
    sentiment = _to_ui_sentiment(annotation.get('sentiment'))

    if start is None or end is None or not aspect or not sentiment:
        return None

    try:
        start = int(start)
        end = int(end)
    except (TypeError, ValueError):
        return None

    return {
        'start': start,
        'end': end,
        'aspect': aspect,
        'sentiment': sentiment,
    }


def _ui_label_to_annotation(label, text=''):
    if isinstance(label, Label):
        label = label.model_dump()
    if not isinstance(label, dict):
        return None

    start = label.get('start')
    end = label.get('end')
    aspect = label.get('aspect')
    sentiment = _to_storage_sentiment(label.get('sentiment'))

    if start is None or end is None or not aspect or not sentiment:
        return None

    try:
        start = int(start)
        end = int(end)
    except (TypeError, ValueError):
        return None

    span = text[start:end] if isinstance(text, str) and 0 <= start <= end <= len(text) else ''

    return {
        'span': span,
        'start': start,
        'end': end,
        'aspect': aspect,
        'sentiment': sentiment,
    }


def _has_real_annotations(annotations):
    for ann in annotations or []:
        if not isinstance(ann, dict):
            continue
        if ann.get('aspect') and ann.get('sentiment'):
            return True
    return False

def load_data():
    data = []
    if os.path.exists(OUTPUT_DATA):
        file_to_read = OUTPUT_DATA
        source_type = 'output'
    else:
        file_to_read = INPUT_DATA
        source_type = 'input'

    if not os.path.exists(file_to_read):
        return []

    try:
        with open(file_to_read, 'r', encoding='utf-8') as f:
            source_data = json.load(f)
    except json.JSONDecodeError:
        # Fallback to input data if output is corrupted
        if file_to_read == OUTPUT_DATA and os.path.exists(INPUT_DATA):
            with open(INPUT_DATA, 'r', encoding='utf-8') as f:
                source_data = json.load(f)
            source_type = 'input'
        else:
            return []
    
    articles_metadata = _extract_articles(source_data)
    
    item_counter = 0
    for art in articles_metadata:
        art_id = _get_article_id(art)
        paragraphs = _get_paragraphs(art)

        for idx, para in enumerate(paragraphs):
            if isinstance(para, dict):
                text = para.get('text', '')
                annotations = para.get('annotations')
                if not isinstance(annotations, list):
                    # Legacy fallback (kept for backward compatibility)
                    annotations = para.get('labels', [])
                paragraph_index = idx + 1
                skipped = bool(para.get('no_aspect', para.get('skipped', False)))
            else:
                text = para
                annotations = []
                paragraph_index = idx + 1
                skipped = False

            labels = []
            for ann in annotations:
                converted = _annotation_to_ui_label(ann)
                if converted:
                    labels.append(converted)

            data.append({
                'id': item_counter,
                'article_id': art_id,
                'article_meta': _build_article_meta(art),
                'paragraph_index': paragraph_index,
                'text': text,
                'labels': labels,
                'skipped': skipped
            })
            item_counter += 1
    return data

def _normalize_labels(labels):
    normalized = []
    for lbl in labels or []:
        if isinstance(lbl, Label):
            normalized.append(lbl.model_dump())
        elif isinstance(lbl, dict):
            normalized.append(lbl)
    return normalized


def _index_items_by_article_and_paragraph(data):
    indexed = defaultdict(dict)
    for item in data:
        article_id = str(item.get('article_id'))
        paragraph_index = int(item.get('paragraph_index', 1))
        indexed[article_id][paragraph_index] = item
    return indexed


def _merge_article_meta_into_article(article, item):
    item_meta = item.get('article_meta') or {}
    for key in [
        'title', 'source', 'publisher', 'author', 'sapo',
        'publish_time', 'url',
        'scope', 'ticker'
    ]:
        if key in item_meta:
            article[key] = item_meta[key]


def _build_new_paragraph_item(article_id, paragraph_index, item):
    text = item.get('text', '')
    labels = _normalize_labels(item.get('labels', []))
    annotations = []
    for lbl in labels:
        ann = _ui_label_to_annotation(lbl, text)
        if ann:
            annotations.append(ann)

    return {
        'id': f"{article_id}_{paragraph_index}",
        'text': text,
        'annotations': annotations,
    }


def save_data(data):
    # Ensure output directory exists
    output_dir = os.path.dirname(OUTPUT_DATA)
    if output_dir and not os.path.exists(output_dir):
        os.makedirs(output_dir)
    
    # Load the base structure
    base_file = OUTPUT_DATA if os.path.exists(OUTPUT_DATA) else INPUT_DATA
    try:
        with open(base_file, 'r', encoding='utf-8') as f:
            base_data = json.load(f)
    except json.JSONDecodeError:
        # Fallback to input data if output is corrupted
        if base_file == OUTPUT_DATA and os.path.exists(INPUT_DATA):
            with open(INPUT_DATA, 'r', encoding='utf-8') as f:
                base_data = json.load(f)
        else:
            base_data = {'articles': [], 'metadata': {}}
    
    item_index = _index_items_by_article_and_paragraph(data)

    if isinstance(base_data, dict) and isinstance(base_data.get('articles'), list):
        new_data = base_data.copy()
        new_articles = []

        for article in base_data.get('articles', []):
            article_copy = article.copy()
            article_id = str(_get_article_id(article_copy))
            items_for_article = item_index.get(article_id, {})

            paragraphs = _get_paragraphs(article_copy)
            updated_paragraphs = []

            for idx, para in enumerate(paragraphs):
                paragraph_index = idx + 1
                item = items_for_article.get(paragraph_index)

                if isinstance(para, dict):
                    para_copy = para.copy()
                    existing_text = para_copy.get('text', '')
                else:
                    para_copy = {
                        'id': f"{article_id}_{paragraph_index}",
                        'text': para,
                        'annotations': []
                    }
                    existing_text = para

                if item:
                    _merge_article_meta_into_article(article_copy, item)
                    text = item.get('text', existing_text)
                    labels = _normalize_labels(item.get('labels', []))

                    annotations = []
                    for lbl in labels:
                        ann = _ui_label_to_annotation(lbl, text)
                        if ann:
                            annotations.append(ann)

                    para_copy['text'] = text
                    para_copy['annotations'] = annotations
                else:
                    if not isinstance(para_copy.get('annotations'), list):
                        para_copy['annotations'] = []

                if not para_copy.get('id'):
                    para_copy['id'] = f"{article_id}_{paragraph_index}"

                updated_paragraphs.append(para_copy)

            # Add newly created paragraphs if they exist in API data but not in base file.
            if items_for_article:
                max_existing_index = len(updated_paragraphs)
                extra_indexes = sorted(i for i in items_for_article.keys() if i > max_existing_index)
                for paragraph_index in extra_indexes:
                    item = items_for_article[paragraph_index]
                    _merge_article_meta_into_article(article_copy, item)
                    updated_paragraphs.append(
                        _build_new_paragraph_item(article_id, paragraph_index, item)
                    )

            article_copy['paragraphs'] = updated_paragraphs
            if 'content' in article_copy:
                del article_copy['content']
            new_articles.append(article_copy)

        existing_article_ids = {str(_get_article_id(a)) for a in new_articles}
        extra_article_ids = [aid for aid in item_index.keys() if aid not in existing_article_ids]

        for article_id in extra_article_ids:
            items_for_article = item_index[article_id]
            if not items_for_article:
                continue
            first_item = items_for_article[sorted(items_for_article.keys())[0]]
            new_article = {'id': article_id, 'paragraphs': []}
            _merge_article_meta_into_article(new_article, first_item)
            for paragraph_index in sorted(items_for_article.keys()):
                new_article['paragraphs'].append(
                    _build_new_paragraph_item(article_id, paragraph_index, items_for_article[paragraph_index])
                )
            new_articles.append(new_article)

        new_data['articles'] = new_articles
    else:
        # Fallback structure if the base file has an unexpected schema.
        new_articles = []
        for article_id, by_index in item_index.items():
            if not by_index:
                continue
            first_item = by_index[sorted(by_index.keys())[0]]
            article = {'id': article_id, 'paragraphs': []}
            _merge_article_meta_into_article(article, first_item)
            for paragraph_index in sorted(by_index.keys()):
                article['paragraphs'].append(
                    _build_new_paragraph_item(article_id, paragraph_index, by_index[paragraph_index])
                )
            new_articles.append(article)
        new_data = {'articles': new_articles}

    # Keep lightweight save metadata only if metadata section already exists.
    if isinstance(new_data, dict) and isinstance(new_data.get('metadata'), dict):
        metadata = new_data['metadata']
        metadata['last_annotated_at'] = datetime.now().isoformat()
    
    with open(OUTPUT_DATA, 'w', encoding='utf-8') as f:
        json.dump(new_data, f, ensure_ascii=False, indent=2)


# ==================== API Routes ====================

@app.get("/api/config", response_model=ConfigResponse)
async def get_config():
    """Get configuration: aspects, sentiments, scopes"""
    return ConfigResponse(
        aspects_categories=ASPECTS_CATEGORIES,
        aspects=ASPECTS,
        sentiments=SENTIMENTS,
        scopes=SCOPE_LABELS
    )


@app.get("/api/data", response_model=List[Dict[str, Any]])
async def get_dataset():
    """Get all dataset items with labels"""
    data = load_data()
    return data


@app.post("/api/update")
async def update_item(request: UpdateItemRequest):
    """Update a single item's text, labels, and metadata"""
    all_data = load_data()
    found = False
    
    for item in all_data:
        if int(item.get('id')) == int(request.id):
            item['text'] = request.text
            item['labels'] = request.labels
            item['skipped'] = request.skipped
            if request.article_meta:
                item['article_meta'] = {**(item.get('article_meta') or {}), **request.article_meta}
            current_article_id = item.get('article_id')
            # Update all items of the same article with new article_meta
            if request.article_meta and current_article_id is not None:
                for other in all_data:
                    if other.get('article_id') == current_article_id:
                        other['article_meta'] = {**(other.get('article_meta') or {}), **request.article_meta}
            found = True
            break

    if found:
        save_data(all_data)
        return {"status": "success"}
    else:
        raise HTTPException(status_code=404, detail="ID not found")


@app.post("/api/update-scope")
async def update_scope(request: UpdateScopeRequest):
    """Update article scope classification (MICRO/MACRO)"""
    if request.scope not in SCOPE_LABELS:
        raise HTTPException(status_code=400, detail="Invalid scope")

    all_data = load_data()
    updated = False

    for item in all_data:
        if str(item.get('article_id')) == str(request.article_id):
            item['article_meta'] = {**(item.get('article_meta') or {}), **{"scope": request.scope}}
            updated = True

    if updated:
        save_data(all_data)
        return {"status": "success"}
    else:
        raise HTTPException(status_code=404, detail="article_id not found")


@app.get("/api/annotated-count")
async def get_annotated_count():
    """Get count of annotated items"""
    if not os.path.exists(OUTPUT_DATA):
        return {"count": 0}
    
    count = 0
    with open(OUTPUT_DATA, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    for article in _extract_articles(data):
        for para in _get_paragraphs(article):
            annotations = para.get('annotations', []) if isinstance(para, dict) else []
            if _has_real_annotations(annotations):
                count += 1
    
    return {"count": count}


@app.get("/api/skipped-count")
async def get_skipped_count():
    """Get count of skipped items"""
    data = load_data()
    count = sum(1 for item in data if item.get('skipped'))
    return {"count": count}


@app.post("/api/reset-all")
async def reset_all_labels():
    """Reset all labels and skipped flags"""
    all_data = load_data()

    for item in all_data:
        item['labels'] = []
        item['skipped'] = False

    save_data(all_data)
    return {"status": "success", "message": "All labels cleared"}


@app.get("/api/stats", response_model=StatsResponse)
async def get_stats():
    """Get annotation statistics"""
    data = load_data()

    aspect_counts = defaultdict(int)
    sentiment_counts = defaultdict(int)
    category_counts = defaultdict(int)
    breakdown = defaultdict(lambda: {"POSITIVE": 0, "NEGATIVE": 0, "NEUTRAL": 0})
    annotated_count = 0

    for item in data:
        labels = item.get('labels', [])
        if labels:
            has_real_label = False
            for lbl in labels:
                # Handle new object format
                if isinstance(lbl, dict):
                    aspect = lbl.get('aspect', '')
                    sentiment = _to_ui_sentiment(lbl.get('sentiment', ''))
                    if aspect and sentiment:
                        has_real_label = True
                        aspect_counts[aspect] += 1
                        sentiment_counts[sentiment] += 1
                        category_counts[aspect] += 1
                        breakdown[aspect][sentiment] += 1
                # Handle old array format for backwards compatibility
                elif isinstance(lbl, list) and len(lbl) >= 3:
                    tag = lbl[2]
                    if '#' in tag and tag != 'SKIPPED':
                        has_real_label = True
                        aspect, sentiment = tag.split('#')
                        sentiment = _to_ui_sentiment(sentiment)
                        aspect_counts[aspect] += 1
                        sentiment_counts[sentiment] += 1
                        category = get_category_for_aspect(aspect)
                        if category:
                            category_counts[category] += 1
                        breakdown[aspect][sentiment] += 1
            if has_real_label:
                annotated_count += 1

    return StatsResponse(
        total_sentences=len(data),
        annotated_count=annotated_count,
        aspect_counts=dict(aspect_counts),
        sentiment_counts=dict(sentiment_counts),
        category_counts=dict(category_counts),
        breakdown={k: dict(v) for k, v in breakdown.items()}
    )


# ==================== Main ====================

if __name__ == '__main__':
    import uvicorn

    if not os.path.exists(INPUT_DATA) and not os.path.exists(OUTPUT_DATA):
        print(f"Cảnh báo: Không tìm thấy file {INPUT_DATA}")

    uvicorn.run(app, host="127.0.0.1", port=5000)