import json
import os
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from collections import Counter, defaultdict
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
    category: Optional[str] = None
    web_type: Optional[str] = None
    publish_time: Optional[str] = None
    url: Optional[str] = None
    scope: Optional[str] = None
    banking_domain: Optional[str] = None
    target_symbol: Optional[str] = None

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

class UpdateBankingDomainRequest(BaseModel):
    article_id: Any
    banking_domain: str
    clear_labels: bool = False
    set_skipped: Optional[bool] = None

class UpdateScopeRequest(BaseModel):
    article_id: Any
    scope: str

class ConfigResponse(BaseModel):
    aspects_categories: List[str]
    aspects: List[str]
    sentiments: List[str]
    banking_domains: List[str]
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

# ViFABSA pipeline labels (Stage 2 & 3)
BANKING_DOMAIN_LABELS = ["BANKING", "NON_BANKING"]
SCOPE_LABELS = ["MICRO", "MACRO"]

# Use merged dataset from ViFABSA project
INPUT_DATA = 'data/raw.json'
OUTPUT_DATA = "data/annotated.json"

# Create reverse mapping: aspect -> category (same as aspect for flat list)
ASPECT_TO_CATEGORY = {aspect: aspect for aspect in ASPECTS}

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
        'category': article.get('category'),
        'web_type': article.get('web_type'),
        'publish_time': article.get('publish_time'),
        'url': article.get('url'),
        'scope': article.get('scope'),
        'banking_domain': article.get('banking_domain'),
        'target_symbol': article.get('target_symbol')
    }

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
    if source_type == 'input':
        for art in articles_metadata:
            art_id = _get_article_id(art)
            content_list = art.get('content', [])
            
            # Handle case where content is a list of strings or list of dicts
            for idx, sent in enumerate(content_list):
                if isinstance(sent, dict):
                    text = sent.get('text', '')
                    paragraph_index = sent.get('paragraph_index', idx)
                else:
                    text = sent
                    paragraph_index = idx
                
                data.append({
                    'id': item_counter,
                    'article_id': art_id,
                    'article_meta': _build_article_meta(art),
                    'paragraph_index': paragraph_index,
                    'text': text,
                    'labels': [],
                    'skipped': False
                })
                item_counter += 1
    else:
        for art in articles_metadata:
            art_id = _get_article_id(art)
            content_list = art.get('content', [])
            
            for idx, sent in enumerate(content_list):
                if isinstance(sent, dict):
                    text = sent.get('text', '')
                    labels = sent.get('labels', [])
                    skipped = sent.get('no_aspect', sent.get('skipped', False))
                    paragraph_index = sent.get('paragraph_index', idx)
                else:
                    text = sent
                    labels = []
                    skipped = False
                    paragraph_index = idx
                
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
        else:
            normalized.append(lbl)
    return normalized


def _reorder_article_fields(article):
    preferred_order = [
        'article_id',
        'banking_domain',
        'scope',
        'publisher',
        'title',
        'author',
        'publish_time',
        'source',
        'sapo',
        'category',
        'web_type',
        'url',
        'target_symbol',
        'content'
    ]
    ordered = {}
    for key in preferred_order:
        if key in article:
            ordered[key] = article[key]
    for key, value in article.items():
        if key not in ordered:
            ordered[key] = value
    return ordered


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
    
    articles_metadata = _extract_articles(base_data)
    
    # Group data by article_id
    art_dict = {}
    for item in data:
        art_id = item['article_id']
        if art_id not in art_dict:
            # Find the metadata
            for meta in articles_metadata:
                if str(_get_article_id(meta)) == str(art_id):
                    art_dict[art_id] = meta.copy()
                    art_dict[art_id]['content'] = []
                    break
            if art_id not in art_dict:
                art_dict[art_id] = {
                    'article_id': art_id,
                    'content': []
                }
        if art_id in art_dict:
            item_meta = item.get('article_meta') or {}
            for key in [
                'title', 'source', 'publisher', 'author', 'sapo',
                'category', 'web_type', 'publish_time', 'url',
                'scope', 'banking_domain', 'target_symbol'
            ]:
                if key in item_meta and item_meta[key] is not None:
                    art_dict[art_id][key] = item_meta[key]

            art_dict[art_id].setdefault('article_id', art_id)
            art_dict[art_id]['content'].append({
                'paragraph_index': item.get('paragraph_index', len(art_dict[art_id]['content'])),
                'text': item['text'],
                'labels': _normalize_labels(item.get('labels', [])),
                'no_aspect': item.get('skipped', False)
            })
    
    if isinstance(base_data, dict) and 'articles' in base_data:
        new_data = base_data.copy()
        new_data['articles'] = [
            _reorder_article_fields(article) for article in art_dict.values()
        ]
        metadata = new_data.get('metadata') or {}
        metadata['last_annotated_at'] = datetime.now().isoformat()
        new_data['metadata'] = metadata
    elif isinstance(base_data, list):
        new_data = [
            _reorder_article_fields(article) for article in art_dict.values()
        ]
    elif isinstance(base_data, dict) and ('article_id' in base_data or 'id' in base_data):
        new_data = (
            _reorder_article_fields(list(art_dict.values())[0])
            if art_dict else base_data
        )
    else:
        new_data = {
            'articles': [
                _reorder_article_fields(article) for article in art_dict.values()
            ],
            'metadata': {
                'last_annotated_at': datetime.now().isoformat()
            }
        }
    
    with open(OUTPUT_DATA, 'w', encoding='utf-8') as f:
        json.dump(new_data, f, ensure_ascii=False, indent=2)


# ==================== API Routes ====================

@app.get("/api/config", response_model=ConfigResponse)
async def get_config():
    """Get configuration: aspects, sentiments, banking domains, scopes"""
    return ConfigResponse(
        aspects_categories=ASPECTS_CATEGORIES,
        aspects=ASPECTS,
        sentiments=SENTIMENTS,
        banking_domains=BANKING_DOMAIN_LABELS,
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


@app.post("/api/update-banking-domain")
async def update_banking_domain(request: UpdateBankingDomainRequest):
    """Update article banking domain classification"""
    if request.banking_domain not in BANKING_DOMAIN_LABELS:
        raise HTTPException(status_code=400, detail="Invalid banking_domain")

    all_data = load_data()
    updated = False

    for item in all_data:
        if str(item.get('article_id')) == str(request.article_id):
            item['article_meta'] = {**(item.get('article_meta') or {}), **{"banking_domain": request.banking_domain}}
            if request.banking_domain == 'NON_BANKING':
                item['article_meta']['scope'] = None
            if request.clear_labels:
                item['labels'] = []
            if request.set_skipped is not None:
                item['skipped'] = bool(request.set_skipped)
            updated = True

    if updated:
        save_data(all_data)
        return {"status": "success"}
    else:
        raise HTTPException(status_code=404, detail="article_id not found")


@app.post("/api/update-scope")
async def update_scope(request: UpdateScopeRequest):
    """Update article scope classification (MICRO/MACRO)"""
    if request.scope not in SCOPE_LABELS:
        raise HTTPException(status_code=400, detail="Invalid scope")

    all_data = load_data()
    updated = False

    for item in all_data:
        if str(item.get('article_id')) == str(request.article_id):
            current_domain = (item.get('article_meta') or {}).get('banking_domain')
            if current_domain != 'BANKING':
                raise HTTPException(status_code=400, detail="Set banking_domain to BANKING first")
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
        if article.get('banking_domain') == 'NON_BANKING':
            continue
        for sent in article.get('content', []):
            labels = sent.get('labels', [])
            if labels and any((isinstance(l, dict) and l.get('aspect') and l.get('sentiment')) or (isinstance(l, list) and len(l) >= 3 and l[2] != 'SKIPPED') for l in labels):
                count += 1
    
    return {"count": count}


@app.get("/api/skipped-count")
async def get_skipped_count():
    """Get count of skipped items"""
    if not os.path.exists(OUTPUT_DATA):
        return {"count": 0}
    
    count = 0
    with open(OUTPUT_DATA, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    for article in _extract_articles(data):
        for sent in article.get('content', []):
            if sent.get('no_aspect', sent.get('skipped', False)):
                count += 1
    
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
        if (item.get('article_meta') or {}).get('banking_domain') == 'NON_BANKING':
            continue
        labels = item.get('labels', [])
        if labels:
            has_real_label = False
            for lbl in labels:
                # Handle new object format
                if isinstance(lbl, dict):
                    aspect = lbl.get('aspect', '')
                    sentiment = lbl.get('sentiment', '')
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