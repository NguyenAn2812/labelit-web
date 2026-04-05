import json
import os
from collections import defaultdict
from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(title="Labelit ViFABSA API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class Label(BaseModel):
    entity: str
    attribute: str
    sentiment: str
    start: int
    end: int
    span: Optional[str] = None
    trigger_entity: Optional[str] = None
    target_entities: List[str] = []
    opinion_term: Optional[str] = None
    scope: Optional[str] = None


class ArticleMeta(BaseModel):
    title: Optional[str] = None
    source: Optional[str] = None
    publisher: Optional[str] = None
    author: Optional[str] = None
    sapo: Optional[str] = None
    publish_time: Optional[str] = None
    publish_datetime: Optional[str] = None
    scope: Optional[str] = None
    ticker: Optional[List[str]] = None


class UpdateItemRequest(BaseModel):
    id: int
    text: str
    labels: List[Label]
    checked: bool = False
    no_aspect: bool = False
    article_meta: Optional[Dict[str, Any]] = None


class UpdateScopeRequest(BaseModel):
    article_id: Any
    scope: str


class ConfigResponse(BaseModel):
    aspects_categories: List[str]
    aspects: List[str]
    entities: List[str]
    attributes: List[str]
    entity_attributes: Dict[str, List[str]]
    sentiments: List[str]
    scopes: List[str]


class StatsResponse(BaseModel):
    total_paragraphs: int
    annotated_paragraphs: int
    entity_counts: Dict[str, int]
    attribute_counts: Dict[str, int]
    sentiment_counts: Dict[str, int]
    pair_counts: Dict[str, int]
    breakdown: Dict[str, Dict[str, int]]


INPUT_DATA = "data/raw_1to100.json"
OUTPUT_DATA = "data/annotated_1to100.json"
SENTIMENTS = ["POSITIVE", "NEGATIVE", "NEUTRAL"]
SCOPE_LABELS = ["MICRO", "MACRO"]

# Official ViBankABSA ontology (v3.1.0)
ENTITY_ATTRIBUTES = {
    "DIGITAL_BANKING": ["USABILITY", "STABILITY", "FEATURES", "SECURITY"],
    "SERVICE": ["STAFF_ATTITUDE", "SUPPORT_SPEED", "PROCEDURE"],
    "FINANCIAL_PRODUCT": ["INTEREST_RATE", "LIQUIDITY", "LIMIT", "APPROVAL_SPEED"],
    "FINANCIAL_FEE": ["TRANSACTION_FEE", "TRANSPARENCY"],
    "LEADERSHIP": ["REPUTATION", "STRATEGY", "INTEGRITY"],
    "MACRO_REGULATION": ["POLICY_CHANGE", "MONETARY_CONTROL", "COMPLIANCE"],
    "MARKET_PERCEPTION": ["ANALYST_VIEW", "INVESTOR_SENTIMENT", "MARKET_SIGNAL"],
}

ENTITIES = list(ENTITY_ATTRIBUTES.keys())
ATTRIBUTES = [attribute for items in ENTITY_ATTRIBUTES.values() for attribute in items]


def _load_json(file_path: str):
    if not os.path.exists(file_path):
        return None
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError):
        return None


def _extract_articles(source_data):
    if isinstance(source_data, dict):
        if isinstance(source_data.get("articles"), list):
            return source_data.get("articles", [])
        if "article_id" in source_data or "id" in source_data:
            return [source_data]
    if isinstance(source_data, list):
        return source_data
    return []


def _get_article_id(article):
    return article.get("article_id", article.get("id"))


def _get_publish_time(article):
    return article.get("publish_datetime") or article.get("publish_time")


def _build_article_meta(article):
    publish_value = _get_publish_time(article)
    return {
        "title": article.get("title"),
        "source": article.get("source"),
        "publisher": article.get("publisher"),
        "author": article.get("author"),
        "sapo": article.get("sapo"),
        "publish_time": publish_value,
        "publish_datetime": publish_value,
        "scope": article.get("scope"),
        "ticker": article.get("ticker"),
    }


def _normalize_sentiment(value):
    if not isinstance(value, str):
        return ""
    return value.strip().upper()


def _normalize_scope(value):
    if not isinstance(value, str):
        return ""
    return value.strip().upper()


def _extract_text_from_paragraph_item(paragraph):
    if isinstance(paragraph, str):
        return paragraph
    if isinstance(paragraph, dict):
        return paragraph.get("paragraph") or paragraph.get("text") or ""
    return ""


def _build_paragraph_annotation_map(article):
    paragraph_annotations = article.get("paragraph_annotations", [])
    mapped = {}
    if not isinstance(paragraph_annotations, list):
        return mapped

    for idx, item in enumerate(paragraph_annotations):
        if not isinstance(item, dict):
            continue
        paragraph_index = item.get("paragraph_index", idx + 1)
        try:
            paragraph_index = int(paragraph_index)
        except (TypeError, ValueError):
            continue
        mapped[paragraph_index] = item

    return mapped


def _annotation_to_ui_label(annotation):
    if not isinstance(annotation, dict):
        return None

    start = annotation.get("start")
    end = annotation.get("end")
    entity = annotation.get("entity")
    attribute = annotation.get("attribute")
    sentiment = _normalize_sentiment(annotation.get("sentiment"))

    if start is None or end is None or not entity or not attribute or not sentiment:
        return None

    try:
        start = int(start)
        end = int(end)
    except (TypeError, ValueError):
        return None

    return {
        "start": start,
        "end": end,
        "span": annotation.get("span"),
        "entity": entity,
        "attribute": attribute,
        "sentiment": sentiment,
        "trigger_entity": annotation.get("trigger_entity"),
        "target_entities": annotation.get("target_entities") if isinstance(annotation.get("target_entities"), list) else [],
        "opinion_term": annotation.get("opinion_term"),
        "scope": annotation.get("scope"),
    }


def _ui_label_to_annotation(label, text=""):
    if isinstance(label, Label):
        label = label.model_dump()
    if not isinstance(label, dict):
        return None

    start = label.get("start")
    end = label.get("end")
    entity = label.get("entity")
    attribute = label.get("attribute")
    sentiment = _normalize_sentiment(label.get("sentiment"))
    scope = _normalize_scope(label.get("scope"))

    if start is None or end is None or not entity or not attribute or not sentiment:
        return None

    try:
        start = int(start)
        end = int(end)
    except (TypeError, ValueError):
        return None

    if isinstance(text, str) and 0 <= start <= end <= len(text):
        span = text[start:end]
    else:
        span = label.get("span") or ""

    return {
        "span": span,
        "trigger_entity": label.get("trigger_entity") or "NULL",
        "target_entities": label.get("target_entities") if isinstance(label.get("target_entities"), list) else ["NULL"],
        "entity": entity,
        "attribute": attribute,
        "opinion_term": label.get("opinion_term") or "",
        "sentiment": sentiment,
        "scope": scope,
        "start": start,
        "end": end,
    }


def _validate_ui_labels(labels, text):
    if not isinstance(text, str):
        text = ""

    for index, label in enumerate(labels):
        entity = (label.get("entity") or "").strip()
        attribute = (label.get("attribute") or "").strip()
        sentiment = _normalize_sentiment(label.get("sentiment"))
        scope = _normalize_scope(label.get("scope"))

        if entity not in ENTITY_ATTRIBUTES:
            raise HTTPException(
                status_code=400,
                detail=f"Label {index}: entity '{entity}' is not in official ontology",
            )

        if attribute not in ENTITY_ATTRIBUTES[entity]:
            raise HTTPException(
                status_code=400,
                detail=f"Label {index}: attribute '{attribute}' is invalid for entity '{entity}'",
            )

        if sentiment not in SENTIMENTS:
            raise HTTPException(
                status_code=400,
                detail=f"Label {index}: sentiment must be one of {SENTIMENTS}",
            )

        if scope not in SCOPE_LABELS:
            raise HTTPException(
                status_code=400,
                detail=f"Label {index}: scope must be one of {SCOPE_LABELS}",
            )

        try:
            start = int(label.get("start"))
            end = int(label.get("end"))
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail=f"Label {index}: start/end must be integers")

        if start < 0 or end < 0 or end < start or end > len(text):
            raise HTTPException(
                status_code=400,
                detail=f"Label {index}: invalid span start={start}, end={end} for text length={len(text)}",
            )

        trigger = label.get("trigger_entity")
        if not isinstance(trigger, str) or not trigger.strip():
            raise HTTPException(status_code=400, detail=f"Label {index}: trigger_entity is required")

        targets = label.get("target_entities")
        if not isinstance(targets, list) or not targets:
            raise HTTPException(status_code=400, detail=f"Label {index}: target_entities must be a non-empty list")


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
        article_id = str(item.get("article_id"))
        try:
            paragraph_index = int(item.get("paragraph_index", 1))
        except (TypeError, ValueError):
            paragraph_index = 1
        indexed[article_id][paragraph_index] = item
    return indexed


def _merge_article_meta_into_article(article, item):
    item_meta = item.get("article_meta") or {}
    if "title" in item_meta:
        article["title"] = item_meta["title"]
    if "source" in item_meta:
        article["source"] = item_meta["source"]
    if "publisher" in item_meta:
        article["publisher"] = item_meta["publisher"]
    if "author" in item_meta:
        article["author"] = item_meta["author"]
    if "publish_datetime" in item_meta and item_meta.get("publish_datetime"):
        article["publish_datetime"] = item_meta["publish_datetime"]


def load_data():
    source_data = _load_json(OUTPUT_DATA)
    if source_data is None:
        source_data = _load_json(INPUT_DATA)
    if source_data is None:
        return []

    data = []
    item_counter = 0
    for article in _extract_articles(source_data):
        article_id = _get_article_id(article)
        article_meta = _build_article_meta(article)

        paragraphs = article.get("paragraphs", [])
        if not isinstance(paragraphs, list):
            paragraphs = []

        pa_map = _build_paragraph_annotation_map(article)
        max_index = max(len(paragraphs), max(pa_map.keys(), default=0))

        for paragraph_index in range(1, max_index + 1):
            pa_item = pa_map.get(paragraph_index, {})

            raw_text = ""
            if paragraph_index - 1 < len(paragraphs):
                raw_text = _extract_text_from_paragraph_item(paragraphs[paragraph_index - 1])

            text = pa_item.get("paragraph") or pa_item.get("text") or raw_text

            annotations = pa_item.get("annotations", [])
            if not isinstance(annotations, list):
                annotations = []

            labels = []
            for annotation in annotations:
                converted = _annotation_to_ui_label(annotation)
                if converted:
                    labels.append(converted)

            data.append(
                {
                    "id": item_counter,
                    "article_id": article_id,
                    "article_meta": article_meta,
                    "paragraph_index": paragraph_index,
                    "text": text,
                    "labels": labels,
                    "no_aspect": bool(pa_item.get("no_aspect", False)),
                    "checked": bool(pa_item.get("checked", False)),
                }
            )
            item_counter += 1

    return data


def _get_config_from_data_file(file_path):
    data = _load_json(file_path)
    if data is None:
        return set(), set()

    entities = set()
    attributes = set()

    for article in _extract_articles(data):
        for pa_item in article.get("paragraph_annotations", []) or []:
            if not isinstance(pa_item, dict):
                continue
            for annotation in pa_item.get("annotations", []) or []:
                if not isinstance(annotation, dict):
                    continue
                entity = annotation.get("entity")
                attribute = annotation.get("attribute")
                if entity:
                    entities.add(entity)
                if attribute:
                    attributes.add(attribute)

    return entities, attributes


def _resolve_config_labels():
    entities, attributes = _get_config_from_data_file(OUTPUT_DATA)
    if not entities and not attributes:
        entities, attributes = _get_config_from_data_file(INPUT_DATA)

    return sorted(entities), sorted(attributes)


def save_data(data):
    output_dir = os.path.dirname(OUTPUT_DATA)
    if output_dir and not os.path.exists(output_dir):
        os.makedirs(output_dir)

    base_data = _load_json(OUTPUT_DATA)
    if base_data is None:
        base_data = _load_json(INPUT_DATA)
    if base_data is None:
        base_data = {"total": 0, "articles": []}

    base_articles = _extract_articles(base_data)
    item_index = _index_items_by_article_and_paragraph(data)

    new_articles = []
    for article in base_articles:
        article_copy = article.copy()
        article_id = str(_get_article_id(article_copy))
        items_for_article = item_index.get(article_id, {})

        paragraphs = article_copy.get("paragraphs", [])
        if not isinstance(paragraphs, list):
            paragraphs = []

        pa_map = _build_paragraph_annotation_map(article_copy)
        max_index = max(
            len(paragraphs),
            max(pa_map.keys(), default=0),
            max(items_for_article.keys(), default=0),
        )

        normalized_paragraphs = list(paragraphs)
        new_paragraph_annotations = []

        for paragraph_index in range(1, max_index + 1):
            existing_pa = pa_map.get(paragraph_index, {})
            existing_annotations = existing_pa.get("annotations", [])
            if not isinstance(existing_annotations, list):
                existing_annotations = []

            raw_text = ""
            if paragraph_index - 1 < len(normalized_paragraphs):
                raw_text = _extract_text_from_paragraph_item(normalized_paragraphs[paragraph_index - 1])

            existing_text = existing_pa.get("paragraph") or existing_pa.get("text") or raw_text
            item = items_for_article.get(paragraph_index)

            if item:
                _merge_article_meta_into_article(article_copy, item)
                text = item.get("text", existing_text)
                labels = _normalize_labels(item.get("labels", []))
                annotations = []
                for label in labels:
                    converted = _ui_label_to_annotation(label, text)
                    if converted:
                        annotations.append(converted)
                checked = bool(item.get("checked", False))
                no_aspect = bool(item.get("no_aspect", False))
            else:
                text = existing_text
                annotations = existing_annotations
                checked = bool(existing_pa.get("checked", False))
                no_aspect = bool(existing_pa.get("no_aspect", False))

            if paragraph_index - 1 < len(normalized_paragraphs):
                normalized_paragraphs[paragraph_index - 1] = text
            else:
                normalized_paragraphs.append(text)

            new_paragraph_annotations.append(
                {
                    "paragraph_index": paragraph_index,
                    "paragraph": text,
                    "annotations": annotations,
                    "checked": checked,
                    "no_aspect": no_aspect,
                }
            )

        article_copy["paragraphs"] = normalized_paragraphs
        article_copy["paragraph_annotations"] = new_paragraph_annotations
        new_articles.append(article_copy)

    existing_article_ids = {str(_get_article_id(article)) for article in new_articles}
    extra_article_ids = [article_id for article_id in item_index.keys() if article_id not in existing_article_ids]

    for article_id in extra_article_ids:
        items_for_article = item_index[article_id]
        if not items_for_article:
            continue

        ordered_indexes = sorted(items_for_article.keys())
        first_item = items_for_article[ordered_indexes[0]]
        article = {"article_id": first_item.get("article_id"), "paragraphs": [], "paragraph_annotations": []}
        _merge_article_meta_into_article(article, first_item)

        for paragraph_index in ordered_indexes:
            item = items_for_article[paragraph_index]
            text = item.get("text", "")
            labels = _normalize_labels(item.get("labels", []))
            annotations = []
            for label in labels:
                converted = _ui_label_to_annotation(label, text)
                if converted:
                    annotations.append(converted)
            article["paragraphs"].append(text)
            article["paragraph_annotations"].append(
                {
                    "paragraph_index": paragraph_index,
                    "paragraph": text,
                    "annotations": annotations,
                    "checked": bool(item.get("checked", False)),
                    "no_aspect": bool(item.get("no_aspect", False)),
                }
            )

        new_articles.append(article)

    output_payload = {
        "total": len(new_articles),
        "articles": new_articles,
        "last_annotated_at": datetime.now().isoformat(),
    }

    with open(OUTPUT_DATA, "w", encoding="utf-8") as f:
        json.dump(output_payload, f, ensure_ascii=False, indent=2)


@app.get("/api/config", response_model=ConfigResponse)
async def get_config():
    return ConfigResponse(
        aspects_categories=ENTITIES,
        aspects=ENTITIES,
        entities=ENTITIES,
        attributes=ATTRIBUTES,
        entity_attributes=ENTITY_ATTRIBUTES,
        sentiments=SENTIMENTS,
        scopes=SCOPE_LABELS,
    )


@app.get("/api/data", response_model=List[Dict[str, Any]])
async def get_dataset():
    return load_data()


@app.post("/api/update")
async def update_item(request: UpdateItemRequest):
    all_data = load_data()
    found = False

    for item in all_data:
        if int(item.get("id")) == int(request.id):
            labels_payload = [label.model_dump() for label in request.labels]

            # Normalize sentiment/scope before validation and saving.
            for payload in labels_payload:
                payload["sentiment"] = _normalize_sentiment(payload.get("sentiment"))
                payload["scope"] = _normalize_scope(payload.get("scope"))

            _validate_ui_labels(labels_payload, request.text)

            item["text"] = request.text
            item["labels"] = labels_payload
            item["checked"] = request.checked
            item["no_aspect"] = request.no_aspect
            if request.article_meta:
                item["article_meta"] = {**(item.get("article_meta") or {}), **request.article_meta}
            current_article_id = item.get("article_id")
            if request.article_meta and current_article_id is not None:
                for other in all_data:
                    if other.get("article_id") == current_article_id:
                        other["article_meta"] = {**(other.get("article_meta") or {}), **request.article_meta}
            found = True
            break

    if not found:
        raise HTTPException(status_code=404, detail="ID not found")

    save_data(all_data)
    return {"status": "success"}


@app.post("/api/update-scope")
async def update_scope(request: UpdateScopeRequest):
    if request.scope not in SCOPE_LABELS:
        raise HTTPException(status_code=400, detail="Invalid scope")

    all_data = load_data()
    updated = False

    for item in all_data:
        if str(item.get("article_id")) == str(request.article_id):
            item["article_meta"] = {**(item.get("article_meta") or {}), **{"scope": request.scope}}
            updated = True

    if not updated:
        raise HTTPException(status_code=404, detail="article_id not found")

    save_data(all_data)
    return {"status": "success"}


@app.get("/api/annotated-count")
async def get_annotated_count():
    data = load_data()
    count = sum(1 for item in data if len(item.get("labels", [])) > 0)
    return {"count": count}


@app.get("/api/no-aspect-count")
async def get_no_aspect_count():
    data = load_data()
    count = sum(1 for item in data if item.get("no_aspect"))
    return {"count": count}


@app.post("/api/reset-all")
async def reset_all_labels():
    all_data = load_data()

    for item in all_data:
        item["labels"] = []
        item["no_aspect"] = False
        item["checked"] = False

    save_data(all_data)
    return {"status": "success", "message": "All labels cleared"}


@app.get("/api/stats", response_model=StatsResponse)
async def get_stats():
    data = load_data()

    entity_counts = defaultdict(int)
    attribute_counts = defaultdict(int)
    sentiment_counts = defaultdict(int)
    pair_counts = defaultdict(int)
    breakdown = defaultdict(lambda: {"POSITIVE": 0, "NEGATIVE": 0, "NEUTRAL": 0})
    annotated_paragraphs = 0

    for item in data:
        labels = item.get("labels", [])
        has_real = False
        for label in labels:
            entity = label.get("entity") if isinstance(label, dict) else ""
            attribute = label.get("attribute") if isinstance(label, dict) else ""
            sentiment = _normalize_sentiment(label.get("sentiment")) if isinstance(label, dict) else ""
            if not entity or not attribute or sentiment not in SENTIMENTS:
                continue

            has_real = True
            pair_key = f"{entity}::{attribute}"
            entity_counts[entity] += 1
            attribute_counts[attribute] += 1
            sentiment_counts[sentiment] += 1
            pair_counts[pair_key] += 1
            if sentiment not in breakdown[pair_key]:
                breakdown[pair_key][sentiment] = 0
            breakdown[pair_key][sentiment] += 1

        if has_real:
            annotated_paragraphs += 1

    return StatsResponse(
        total_paragraphs=len(data),
        annotated_paragraphs=annotated_paragraphs,
        entity_counts=dict(entity_counts),
        attribute_counts=dict(attribute_counts),
        sentiment_counts=dict(sentiment_counts),
        pair_counts=dict(pair_counts),
        breakdown={k: dict(v) for k, v in breakdown.items()},
    )


if __name__ == "__main__":
    import uvicorn

    if not os.path.exists(INPUT_DATA) and not os.path.exists(OUTPUT_DATA):
        print(f"Canh bao: Khong tim thay file {INPUT_DATA}")

    uvicorn.run(app, host="127.0.0.1", port=5000)