import { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

const emptyConfig = {
  aspects_categories: [],
  aspects: [],
  entities: [],
  attributes: [],
  entity_attributes: {},
  sentiments: [],
  scopes: [],
};

function App() {
  const [config, setConfig] = useState(emptyConfig);
  const [dataset, setDataset] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isEditingText, setIsEditingText] = useState(false);
  const [textDraft, setTextDraft] = useState("");
  const [selection, setSelection] = useState(null);
  const [selectedEntity, setSelectedEntity] = useState(null);
  const [selectedAttribute, setSelectedAttribute] = useState(null);
  const [selectedSentiment, setSelectedSentiment] = useState(null);
  const [selectedTriggerEntity, setSelectedTriggerEntity] = useState("NULL");
  const [selectedTargetEntitiesText, setSelectedTargetEntitiesText] =
    useState("NULL");
  const [selectedOpinionTerm, setSelectedOpinionTerm] = useState("");
  const [selectedLabelScope, setSelectedLabelScope] = useState(null);
  const [editingLabelIndex, setEditingLabelIndex] = useState(null);
  const [showLabelModal, setShowLabelModal] = useState(false);
  const [showStatsModal, setShowStatsModal] = useState(false);
  const [showClassifyModal, setShowClassifyModal] = useState(false);
  const [showOverviewSection, setShowOverviewSection] = useState(false);
  const [statsData, setStatsData] = useState(null);
  const [selectedScope, setSelectedScope] = useState(null);

  const textRef = useRef(null);
  const dismissedClassificationRef = useRef(new Set());
  const hasLoadedOnceRef = useRef(false);

  const currentItem = dataset[currentIndex] || {};
  const articleMeta = currentItem.article_meta || {};
  const paragraphIndex =
    currentItem.paragraph_index ?? currentItem.sentence_idx ?? 1;
  const articleComplete = currentItem.article_id
    ? isArticleAnnotationComplete(currentItem.article_id)
    : false;

  const total_paragraph = dataset.length;
  const annotatedCount = useMemo(
    () =>
      dataset.filter(
        (item) => (item.labels?.length || 0) > 0 && !item.no_aspect,
      ).length,
    [dataset],
  );
  const noAspectCount = useMemo(
    () => dataset.filter((item) => item.no_aspect).length,
    [dataset],
  );
  const checkedCount = useMemo(
    () => dataset.filter((item) => item.checked).length,
    [dataset],
  );
  const spanCount = useMemo(
    () =>
      dataset.reduce(
        (sum, item) => sum + (item.labels ? item.labels.length : 0),
        0,
      ),
    [dataset],
  );
  const totalArticleCount = useMemo(
    () =>
      new Set(
        dataset
          .map((item) => item.article_id)
          .filter((articleId) => articleId !== undefined && articleId !== null),
      ).size,
    [dataset],
  );
  const remainingCount = total_paragraph - annotatedCount - noAspectCount;
  const annotatorId =
    import.meta.env.annotator_id || import.meta.env.VITE_ANNOTATOR_ID || "N/A";

  const availableAttributes = useMemo(() => {
    const entityMap = config.entity_attributes || {};
    if (!selectedEntity) return [];
    if (entityMap[selectedEntity]) return entityMap[selectedEntity];
    return config.attributes || [];
  }, [config, selectedEntity]);

  const progress =
    total_paragraph > 0
      ? ((annotatedCount + noAspectCount) / total_paragraph) * 100
      : 0;
  const checkedProgress =
    total_paragraph > 0 ? (checkedCount / total_paragraph) * 100 : 0;

  const normalizeLabel = (label) => {
    if (!label || typeof label !== "object") return null;

    const start = Number(label.start ?? label.start_index);
    const end = Number(label.end ?? label.end_index);

    if (Number.isNaN(start) || Number.isNaN(end)) return null;

    return {
      ...label,
      start,
      end,
      start_index: start,
      end_index: end,
    };
  };

  const dedupeLabels = (labels) => {
    if (!Array.isArray(labels)) return [];

    const seen = new Map();
    labels.forEach((rawLabel, index) => {
      const label = normalizeLabel(rawLabel);
      if (!label) return;

      const key = [
        label.start,
        label.end,
        label.entity || "",
        label.attribute || "",
        label.sentiment || "",
        label.scope || "",
      ].join("__");

      seen.set(key, { ...label, __order: index });
    });

    return Array.from(seen.values())
      .sort((a, b) => a.__order - b.__order)
      .map(({ __order, ...label }) => label);
  };

  const normalizeEntityList = (value, fallback = "NULL") => {
    if (Array.isArray(value)) {
      const cleaned = value
        .map((item) => String(item).trim())
        .filter((item) => item.length > 0);
      return cleaned.length > 0 ? cleaned : [fallback];
    }

    const cleaned = String(value || "")
      .split(",")
      .map((item) => item.trim())
      .filter((item) => item.length > 0);

    return cleaned.length > 0 ? cleaned : [fallback];
  };

  const normalizeDataset = (rows) => {
    if (!Array.isArray(rows)) return [];

    const seen = new Map();
    rows.forEach((item, index) => {
      const articleId = item?.article_id ?? "NA";
      const pIndex = item?.paragraph_index ?? item?.sentence_idx ?? 1;
      const key = `${articleId}__${pIndex}`;

      // Keep the latest copy if duplicated keys appear.
      seen.set(key, {
        ...item,
        labels: dedupeLabels(item?.labels || []),
        __order: index,
      });
    });

    return Array.from(seen.values())
      .sort((a, b) => a.__order - b.__order)
      .map(({ __order, ...item }) => item);
  };

  useEffect(() => {
    if (hasLoadedOnceRef.current) return;
    hasLoadedOnceRef.current = true;

    const load = async () => {
      try {
        const configRes = await fetch("/api/config");
        const configData = await configRes.json();
        setConfig(configData);

        const dataRes = await fetch("/api/data");
        const data = await dataRes.json();
        const normalizedData = normalizeDataset(data);
        setDataset(normalizedData);
        console.log(normalizedData);

        const first = normalizedData.findIndex(
          (item) =>
            (!item.labels || item.labels.length === 0) && !item.no_aspect,
        );
        setCurrentIndex(first === -1 ? 0 : first);
      } catch (error) {
        console.error("Failed to load dataset", error);
      }
    };
    load();
  }, []);

  useEffect(() => {
    if (!currentItem) return;
    setTextDraft(currentItem.text || "");
    maybeOpenClassificationModal(currentItem.article_id);
  }, [currentIndex, dataset]);

  useEffect(() => {
    if (!selectedEntity) {
      setSelectedAttribute(null);
      return;
    }

    if (
      selectedAttribute &&
      availableAttributes.length > 0 &&
      !availableAttributes.includes(selectedAttribute)
    ) {
      setSelectedAttribute(null);
    }
  }, [selectedEntity, selectedAttribute, availableAttributes]);

  useEffect(() => {
    if (!showStatsModal) return;
    const fetchStats = async () => {
      try {
        const res = await fetch("/api/stats");
        const data = await res.json();
        console.log("Stats data fetched:", data);
        setStatsData(data);
      } catch (error) {
        console.error("Failed to fetch stats", error);
      }
    };
    fetchStats();
  }, [showStatsModal]);

  const handleTextSelection = () => {
    if (isEditingText) return;
    const selectionObj = window.getSelection();
    if (!selectionObj || selectionObj.toString().length === 0) return;

    const range = selectionObj.getRangeAt(0);
    if (
      !textRef.current ||
      !textRef.current.contains(range.commonAncestorContainer)
    )
      return;

    const preRange = range.cloneRange();
    preRange.selectNodeContents(textRef.current);
    preRange.setEnd(range.startContainer, range.startOffset);

    const start = preRange.toString().length;
    const end = start + selectionObj.toString().length;

    setSelection({ start, end, text: selectionObj.toString() });
    setSelectedEntity(null);
    setSelectedAttribute(null);
    setSelectedSentiment(null);
    setSelectedTriggerEntity("NULL");
    setSelectedTargetEntitiesText("NULL");
    setSelectedOpinionTerm(selectionObj.toString());
    setSelectedLabelScope(articleMeta.scope || null);
    setEditingLabelIndex(null);
    setShowLabelModal(true);
    selectionObj.removeAllRanges();
  };

  const saveCurrentItem = async (updatedItem = currentItem, nextIndex) => {
    const resolvedAnnotatorId = annotatorId !== "N/A" ? annotatorId : null;
    const normalizedLabels = dedupeLabels(updatedItem.labels || []).map(
      (label) => ({
        ...label,
        start_index: label.start,
        end_index: label.end,
        trigger_entity: normalizeEntityList(label.trigger_entity, "NULL"),
        target_entities: normalizeEntityList(label.target_entities, "NULL"),
        annotator_id: label.annotator_id || resolvedAnnotatorId,
      }),
    );
    const payload = {
      ...updatedItem,
      labels: normalizedLabels,
      annotator_id: updatedItem.annotator_id || resolvedAnnotatorId,
    };

    try {
      await fetch("/api/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const dataRes = await fetch("/api/data");
      const data = await dataRes.json();
      const normalizedData = normalizeDataset(data);
      setDataset(normalizedData);
      if (Number.isInteger(nextIndex) && normalizedData.length > 0) {
        const bounded = Math.min(
          Math.max(nextIndex, 0),
          normalizedData.length - 1,
        );
        setCurrentIndex(bounded);
      }
    } catch (error) {
      console.error("Error saving item:", error);
    }
  };

  const confirmLabel = async () => {
    if (
      !selection ||
      !selectedEntity ||
      !selectedAttribute ||
      !selectedSentiment ||
      !selectedLabelScope
    )
      return;

    const triggerEntities = normalizeEntityList(selectedTriggerEntity, "NULL");
    const targetEntities = normalizeEntityList(
      selectedTargetEntitiesText,
      "NULL",
    );

    const newLabel = {
      start: selection.start,
      end: selection.end,
      start_index: selection.start,
      end_index: selection.end,
      span: selection.text,
      entity: selectedEntity,
      attribute: selectedAttribute,
      sentiment: selectedSentiment,
      trigger_entity: triggerEntities,
      target_entities: targetEntities,
      opinion_term: selectedOpinionTerm || "",
      scope: selectedLabelScope,
      annotator_id: annotatorId !== "N/A" ? annotatorId : null,
    };

    const labels = [...(currentItem.labels || [])];
    if (editingLabelIndex !== null) {
      labels[editingLabelIndex] = newLabel;
    } else {
      labels.push(newLabel);
    }

    const updated = {
      ...currentItem,
      labels,
      no_aspect: false,
    };

    setShowLabelModal(false);
    await saveCurrentItem(updated);
    maybeOpenClassificationModal(updated.article_id);
  };

  const removeLabel = async (index) => {
    const labels = [...(currentItem.labels || [])];
    labels.splice(index, 1);
    const updated = { ...currentItem, labels };
    await saveCurrentItem(updated);
  };

  const markNoAspects = async () => {
    const updated = {
      ...currentItem,
      no_aspect: true,
      labels: currentItem.labels || [],
    };
    await saveCurrentItem(updated, currentIndex + 1);
    maybeOpenClassificationModal(updated.article_id);
  };

  const toggleCheckedByHuman = async () => {
    const updated = {
      ...currentItem,
      checked: !currentItem.checked,
    };
    await saveCurrentItem(updated);
  };

  const toggleEditText = () => {
    if (!isEditingText) {
      setIsEditingText(true);
      setTextDraft(currentItem.text || "");
      return;
    }
    const updated = {
      ...currentItem,
      text: textDraft,
      labels: [],
      no_aspect: false,
    };
    setIsEditingText(false);
    saveCurrentItem(updated);
  };

  const navigate = (step) => {
    const next = currentIndex + step;
    if (next < 0 || next >= dataset.length) return;
    setCurrentIndex(next);
    console.log(articleMeta);
  };

  const goToPage = (value) => {
    const idx = Number(value) - 1;
    if (Number.isNaN(idx)) return;
    if (idx < 0 || idx >= dataset.length) return;
    setCurrentIndex(idx);
  };

  const searchById = (idValue) => {
    const id = idValue.trim();
    if (!id) return;

    let index = -1;
    const [articleId, paragraphRaw] = id.split("_");

    if (paragraphRaw !== undefined && paragraphRaw !== "") {
      const paragraphNum = Number(paragraphRaw);
      if (!Number.isNaN(paragraphNum) && paragraphNum >= 1) {
        index = dataset.findIndex((item) => {
          const idx = item.paragraph_index ?? item.sentence_idx ?? 1;
          return (
            String(item.article_id) === String(articleId) &&
            idx === paragraphNum
          );
        });
      }
    }

    if (index === -1) {
      index = dataset.findIndex((item) => {
        const idx = item.paragraph_index ?? item.sentence_idx ?? 1;
        return `${item.article_id}_${idx}` === id;
      });
    }

    if (index !== -1) setCurrentIndex(index);
  };

  function isArticleAnnotationComplete(articleId) {
    const items = dataset.filter(
      (item) => String(item.article_id) === String(articleId),
    );
    if (items.length === 0) return false;
    return items.every((item) => {
      const hasLabel = (item.labels?.length || 0) > 0;
      const isNoAspect = Boolean(item.no_aspect);
      const isEmpty = !(item.text || "").trim();
      return hasLabel || isNoAspect || isEmpty;
    });
  }

  const isClassificationComplete = (meta) => Boolean(meta?.scope);

  const maybeOpenClassificationModal = (articleId) => {
    if (!articleId) return;
    if (!isArticleAnnotationComplete(articleId)) return;
    if (isClassificationComplete(articleMeta)) return;
    if (dismissedClassificationRef.current.has(String(articleId))) return;
    setShowClassifyModal(true);
    setSelectedScope(articleMeta.scope || null);
  };

  const openClassificationModal = () => {
    setShowClassifyModal(true);
    setSelectedScope(articleMeta.scope || null);
  };

  const closeClassificationModal = () => {
    if (currentItem.article_id) {
      dismissedClassificationRef.current.add(String(currentItem.article_id));
    }
    setShowClassifyModal(false);
  };

  const confirmClassification = async () => {
    if (!currentItem?.article_id) return;
    if (!selectedScope) return;

    await fetch("/api/update-scope", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        article_id: currentItem.article_id,
        scope: selectedScope,
      }),
    });

    const dataRes = await fetch("/api/data");
    const data = await dataRes.json();
    setDataset(normalizeDataset(data));
    dismissedClassificationRef.current.delete(String(currentItem.article_id));
    setShowClassifyModal(false);
  };

  const renderHighlightedText = () => {
    const text = currentItem.text || "";
    const labels = [...(currentItem.labels || [])].sort(
      (a, b) => a.start - b.start,
    );
    if (currentItem.no_aspect) return [text];

    const parts = [];
    let lastIndex = 0;
    labels.forEach((lbl, idx) => {
      const start = lbl.start;
      const end = lbl.end;
      if (start > lastIndex) {
        parts.push(text.slice(lastIndex, start));
      }
      const sentiment = lbl.sentiment || "NEUTRAL";
      const colorClass =
        sentiment === "POSITIVE"
          ? "bg-emerald-100 border-emerald-500"
          : sentiment === "NEGATIVE"
            ? "bg-rose-100 border-rose-500"
            : "bg-amber-100 border-amber-500";
      parts.push(
        <span
          key={`${start}-${end}-${idx}`}
          className={`cursor-pointer rounded px-1 border-b-2 ${colorClass}`}
          title={`${lbl.entity} / ${lbl.attribute} > ${sentiment}`}
          onClick={() => {
            setSelection({ start, end, text: text.slice(start, end) });
            setSelectedEntity(lbl.entity);
            setSelectedAttribute(lbl.attribute);
            setSelectedSentiment(lbl.sentiment);
            setSelectedTriggerEntity(
              Array.isArray(lbl.trigger_entity)
                ? lbl.trigger_entity.join(", ") || "NULL"
                : lbl.trigger_entity || "NULL",
            );
            setSelectedTargetEntitiesText(
              Array.isArray(lbl.target_entities)
                ? lbl.target_entities.join(", ") || "NULL"
                : lbl.target_entities || "NULL",
            );
            setSelectedOpinionTerm(lbl.opinion_term || text.slice(start, end));
            setSelectedLabelScope(lbl.scope || articleMeta.scope || null);
            setEditingLabelIndex(idx);
            setShowLabelModal(true);
          }}
        >
          {text.slice(start, end)}
        </span>,
      );
      lastIndex = end;
    });
    parts.push(text.slice(lastIndex));
    return parts;
  };

  const timestampToDatetime = (timestamp) => {
    if (!timestamp) return null;

    const ts = Number(timestamp);
    if (Number.isNaN(ts)) return null;
    // auto-detect seconds vs milliseconds
    const date = new Date(ts < 1e12 ? ts * 1000 : ts);

    if (Number.isNaN(date.getTime())) return null;

    return date.toISOString();
  };

  return (
    <div className="min-h-screen px-6 py-8">
      <div className="mx-auto max-w-6xl rounded-2xl bg-white/90 shadow-xl backdrop-blur">
        <header className="flex flex-wrap items-center justify-between gap-4 rounded-t-2xl bg-gradient-to-r from-indigo-500 to-violet-500 px-6 py-5 text-white">
          <div>
            <div className="text-lg font-semibold">
              LABELiT - ViBankABSA Annotation
            </div>
            <div className="text-sm text-white/90">
              Annotator: {annotatorId}
            </div>
          </div>
          <div className="flex gap-2">
            <div className="flex flex-wrap items-center gap-3">
              <button
                className="rounded-lg bg-white/20 px-3 py-1 font-semibold hover:opacity-50 cursor-pointer"
                onClick={() => setShowOverviewSection((prev) => !prev)}
              >
                {showOverviewSection ? "Hide Summary" : "Show Summary"}
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                className="rounded-lg bg-white/20 px-3 py-1 font-semibold hover:opacity-50 cursor-pointer"
                onClick={() => setShowStatsModal(true)}
              >
                Statistics
              </button>
            </div>
          </div>
        </header>

        <div className="space-y-6 p-6">
          <section className="space-y-4 rounded-xl bg-slate-50// p-4// text-sm font-semibold text-slate-600">
            {showOverviewSection && (
              <>
                <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                  <span>Annotated</span>
                  <span>
                    {annotatedCount + noAspectCount}/{total_paragraph} (
                    {progress.toFixed(1)}%)
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500"
                    style={{ width: `${progress.toFixed(1)}%` }}
                  />
                </div>
                <div className="mt-5 flex items-center justify-between text-xs text-slate-500">
                  <span>Checked by Human</span>
                  <span>
                    {checkedCount}/{total_paragraph} (
                    {checkedProgress.toFixed(1)}%)
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-sky-500"
                    style={{ width: `${checkedProgress.toFixed(1)}%` }}
                  />
                </div>
                <div className="grid gap-0 md:grid-cols-5">
                  <div className="text-center">
                    <span className="text-2xl// text-indigo-600">
                      {totalArticleCount}
                    </span>
                    <div>Articles</div>
                    <br />
                    <span className="text-2xl// text-indigo-600">
                      {total_paragraph}
                    </span>
                    <div>Paragraphs</div>
                  </div>
                  <div className="text-center">
                    <span className="text-2xl// text-emerald-600">
                      {spanCount}
                    </span>
                    <div>
                      Annotated
                      <br />
                      Span
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl// text-emerald-600">
                      {annotatedCount}
                      <br />
                      {((annotatedCount / total_paragraph) * 100).toFixed(2)}%
                    </div>

                    <div>
                      Annotated
                      <br />
                      Paragraphs
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl// text-amber-600">
                      {noAspectCount}
                      <br />
                      {((noAspectCount / total_paragraph) * 100).toFixed(2)}%
                    </div>

                    <div>
                      No Aspect <br />
                      Paragraphs
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl// text-rose-600">
                      {remainingCount}
                      <br />
                      {(
                        100 -
                        ((annotatedCount + noAspectCount) / total_paragraph) *
                          100
                      ).toFixed(2)}
                      %
                    </div>

                    <div>
                      Remaining <br />
                      paragraphs
                    </div>
                  </div>
                </div>
              </>
            )}
          </section>

          <section className="rounded-xl bg-gradient-to-r from-pink-500 to-rose-500 px-4 py-4 text-white">
            <div className="text-lg font-semibold">
              {articleMeta.title || "No title"}
            </div>
            <div className="mt-2 flex flex-wrap gap-2 text-xs font-medium">
              <span className="rounded-full bg-white/20 px-3 py-1 hover:opacity-50 cursor-pointer">
                <a href={articleMeta.source} target="_blank">
                  {"URL" || "N/A"}
                </a>
              </span>
              <span className="rounded-full bg-white/20 px-3 py-1">
                {articleMeta.publisher || "N/A"}
              </span>
              <span className="rounded-full bg-white/20 px-3 py-1">
                {articleMeta.publish_datetime ||
                  articleMeta.publish_time ||
                  "N/A"}
              </span>
              {articleMeta.scope === "MICRO" && (
                <span className="rounded-full bg-white/20 px-3 py-1">
                  Ticker:{" "}
                  {articleMeta.ticker && articleMeta.ticker.length > 0
                    ? articleMeta.ticker.join(" ")
                    : "N/A"}
                </span>
              )}
            </div>
          </section>

          <section className="flex flex-wrap items-center justify-between gap-4 rounded-xl py-3 text-sm font-semibold text-slate-600">
            <div className="flex items-center gap-2">
              <button
                className="rounded-lg bg-red-200 px-3 py-2 text-slate-700 shadow disabled:opacity-40 hover:opacity-50 cursor-pointer"
                disabled={currentIndex <= 0}
                onClick={() => navigate(-1)}
              >
                ←
              </button>
              <div>
                # {currentIndex + 1} / {total_paragraph}
              </div>
              <div className="text-md text-slate-400">
                ID:{" "}
                {currentItem.article_id
                  ? `${currentItem.article_id}_${paragraphIndex}`
                  : "N/A"}
              </div>
              <button
                className="rounded-lg bg-red-200 px-3 py-2 text-slate-700 shadow disabled:opacity-40 hover:opacity-50 cursor-pointer"
                disabled={currentIndex >= total_paragraph - 1}
                onClick={() => navigate(1)}
              >
                →
              </button>
            </div>
            <div className="flex items-center gap-2">
              <span>Go to</span>
              <input
                className="w-20 rounded-lg border border-slate-200 px-2 py-1"
                type="number"
                min={1}
                max={total_paragraph}
                value={currentIndex + 1}
                onChange={(e) => goToPage(e.target.value)}
              />
              <input
                className="w-32 rounded-lg border border-slate-200 px-2 py-1"
                placeholder="article_id_idx"
                onKeyDown={(e) => {
                  if (e.key === "Enter") searchById(e.target.value);
                }}
              />
            </div>
          </section>

          <section className="flex flex-wrap items-center gap-3">
            <button
              className={`rounded-lg bg-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 cursor-pointer hover:opacity-50 `}
              onClick={toggleEditText}
            >
              {isEditingText ? "Done" : "Edit Text"}
            </button>
            <button
              className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-white cursor-pointer hover:opacity-50 "
              onClick={markNoAspects}
            >
              No Aspects
            </button>
            <button
              className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-white cursor-pointer hover:opacity-50 "
              onClick={() => saveCurrentItem()}
            >
              Save
            </button>
            <button
              className={`rounded-lg px-4 py-2 text-sm font-semibold text-white cursor-pointer hover:opacity-50 ${currentItem.checked ? "bg-cyan-600" : "bg-cyan-400"}`}
              onClick={toggleCheckedByHuman}
            >
              {currentItem.checked ? "Unchecked" : "Checked"}
            </button>
          </section>

          <section
            className="rounded-xl border border-slate-200 bg-white p-5 text-lg leading-8 text-slate-800 shadow-sm"
            onMouseUp={handleTextSelection}
          >
            {isEditingText ? (
              <textarea
                className="h-48 w-full rounded-lg border border-indigo-200 p-3 text-base"
                value={textDraft}
                onChange={(e) => setTextDraft(e.target.value)}
              />
            ) : (
              <div ref={textRef} className="whitespace-pre-wrap">
                {renderHighlightedText()}
              </div>
            )}
          </section>

          <section className="rounded-xl bg-slate-50// p-4//">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-700">
                Annotated Labels
              </h2>
              <div className="text-xs text-slate-500">
                {(currentItem.labels || []).length} labels
              </div>
            </div>
            {currentItem.checked && (
              <div className="mb-2 inline-flex rounded-full bg-cyan-100 px-3 py-1 text-xs font-semibold text-cyan-700">
                Checked by Human
              </div>
            )}
            {(currentItem.labels || []).length === 0 &&
              !currentItem.no_aspect && (
                <div className="text-sm text-slate-400">
                  Select text to add labels.
                </div>
              )}
            {currentItem.no_aspect && (
              <div className="text-sm text-emerald-600">
                No aspects in this paragraph.
              </div>
            )}
            <ul className="space-y-2">
              {(currentItem.labels || []).map((lbl, idx) => (
                <li
                  key={`${lbl.start}-${lbl.end}-${idx} h-full`}
                  className="flex items-center justify-between rounded-lg bg-white px-3 py-2 shadow"
                >
                  <div className="text-sm flex flex-col">
                    <div>
                      <span
                        className={`mr-2 rounded-full bg-slate-100 px-2 py-0.5 font-semibold ${lbl.sentiment == "NEGATIVE" ? "text-red-600" : lbl.sentiment == "POSITIVE" ? "text-green-600" : "text-yellow-600"}`}
                      >
                        {lbl.sentiment || "N/A"} | {lbl.entity || "N/A"} |{" "}
                        {lbl.attribute || "N/A"}
                      </span>
                    </div>
                    <span className="flex gap-1 ml-2 text-slate-500">
                      <strong>Span: </strong>
                      <p>{currentItem.text?.slice(lbl.start, lbl.end)}</p>
                    </span>
                    <span className="flex gap-1 ml-2 text-slate-500 text-xs//">
                      <strong>Opinion term:</strong>
                      <p> {lbl.opinion_term || "N/A"}</p>
                    </span>
                    <span className="flex gap-1 ml-2 text-slate-500 text-xs//">
                      <strong>Trigger:</strong>
                      <p>
                        {Array.isArray(lbl.trigger_entity)
                          ? (lbl.trigger_entity || []).join(", ") || "NULL"
                          : lbl.trigger_entity || "NULL"}
                      </p>
                    </span>
                    <span className="flex gap-1 ml-2 text-slate-500 text-xs//">
                      <strong>Target:</strong>
                      {Array.isArray(lbl.target_entities)
                        ? (lbl.target_entities || []).join(", ") || "NULL"
                        : lbl.target_entities || "NULL"}
                    </span>
                    <span className="flex gap-1 ml-2 text-slate-500 text-xs//">
                      <strong>Scope:</strong>
                      <p> {lbl.scope || "N/A"}</p>
                    </span>
                  </div>
                  <button
                    className="rounded-lg h-auto bg-rose-100 py-6 px-2 text-xs font-semibold text-rose-600 hover:opacity-50 cursor-pointer"
                    onClick={() => removeLabel(idx)}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>

      {showLabelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-4 text-lg font-semibold text-slate-700">
              Add Label
            </div>
            <div className="mb-3 text-sm text-slate-500">
              Selected text: “{selection?.text}”
            </div>
            <div className="mb-4">
              <div className="mb-2 text-xs font-semibold uppercase text-slate-400">
                Entity
              </div>
              <div className="flex flex-wrap gap-2">
                {(config.entities || config.aspects || []).map((entity) => (
                  <button
                    key={entity}
                    className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${selectedEntity === entity ? "bg-indigo-500 text-white shadow ring-2 ring-amber-400/70" : "bg-white text-slate-700 border-slate-200 hover:bg-slate-200"}`}
                    onClick={() => setSelectedEntity(entity)}
                  >
                    {entity}
                  </button>
                ))}
              </div>
            </div>
            <div className="mb-4">
              <div className="mb-2 text-xs font-semibold uppercase text-slate-400">
                Attribute
              </div>
              <div className="flex flex-wrap gap-2">
                {(availableAttributes || []).map((attribute) => (
                  <button
                    key={attribute}
                    className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${selectedAttribute === attribute ? "bg-indigo-500 text-white shadow ring-2 ring-amber-400/70" : "bg-white text-slate-700 border-slate-200 hover:bg-slate-200"}`}
                    onClick={() => setSelectedAttribute(attribute)}
                  >
                    {attribute}
                  </button>
                ))}
              </div>
            </div>
            <div className="mb-4">
              <div className="mb-2 text-xs font-semibold uppercase text-slate-400">
                Trigger Entity (comma-separated)
              </div>
              <input
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={selectedTriggerEntity}
                onChange={(e) => setSelectedTriggerEntity(e.target.value)}
                placeholder="VD: Ngan hang Nha nuoc"
              />
            </div>
            <div className="mb-4">
              <div className="mb-2 text-xs font-semibold uppercase text-slate-400">
                Target Entities (comma-separated)
              </div>
              <input
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={selectedTargetEntitiesText}
                onChange={(e) => setSelectedTargetEntitiesText(e.target.value)}
                placeholder="VD: VCB, Nhom co phieu ngan hang"
              />
            </div>
            <div className="mb-4">
              <div className="mb-2 text-xs font-semibold uppercase text-slate-400">
                Opinion Term
              </div>
              <input
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={selectedOpinionTerm}
                onChange={(e) => setSelectedOpinionTerm(e.target.value)}
                placeholder="Cu phap danh gia/tac dong"
              />
            </div>
            <div className="mb-6">
              <div className="mb-2 text-xs font-semibold uppercase text-slate-400">
                Sentiment
              </div>
              <div className="flex flex-wrap gap-2">
                {(config.sentiments || []).map((sent) => {
                  const sentimentColors = {
                    POSITIVE: "bg-emerald-500",
                    NEGATIVE: "bg-rose-500",
                    NEUTRAL: "bg-amber-400",
                  };
                  const bgColor = sentimentColors[sent] || "bg-slate-100";
                  return (
                    <button
                      key={sent}
                      className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${selectedSentiment === sent ? `${bgColor} text-white shadow ring-2 ring-amber-400/70` : "bg-white text-slate-700 border-slate-200 hover:bg-slate-200"}`}
                      onClick={() => setSelectedSentiment(sent)}
                    >
                      {sent}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="mb-6">
              <div className="mb-2 text-xs font-semibold uppercase text-slate-400">
                Scope
              </div>
              <div className="flex flex-wrap gap-2">
                {(config.scopes || []).map((scope) => (
                  <button
                    key={scope}
                    className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${selectedLabelScope === scope ? "bg-emerald-500 text-white shadow ring-2 ring-amber-400/70" : "bg-white text-slate-700 border-slate-200 hover:bg-slate-200"}`}
                    onClick={() => setSelectedLabelScope(scope)}
                  >
                    {scope}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                className="rounded-lg bg-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"
                onClick={() => setShowLabelModal(false)}
              >
                Cancel
              </button>
              <button
                className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white"
                onClick={confirmLabel}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {showStatsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-4xl max-h-screen overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-6 text-2xl font-semibold text-slate-700">
              Dataset Statistics
            </div>

            {/* Summary Cards */}
            <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="rounded-lg bg-indigo-50 p-4">
                <div className="text-3xl font-bold text-indigo-600">
                  {total_paragraph}
                </div>
                <div className="text-sm text-slate-600">Total Paragraphs</div>
              </div>
              <div className="rounded-lg bg-emerald-50 p-4">
                <div className="text-3xl font-bold text-emerald-600">
                  {annotatedCount}
                </div>
                <div className="text-sm text-slate-600">Annotated</div>
              </div>
              <div className="rounded-lg bg-amber-50 p-4">
                <div className="text-3xl font-bold text-amber-600">
                  {noAspectCount}
                </div>
                <div className="text-sm text-slate-600">No Aspect</div>
              </div>
            </div>

            {/* Charts */}
            {!statsData ? (
              <div className="py-12 text-center text-slate-500">
                Loading charts...
              </div>
            ) : (
              <div className="space-y-8">
                {/* Entity Distribution */}
                {statsData.entity_counts &&
                  Object.keys(statsData.entity_counts).length > 0 && (
                    <div className="rounded-lg border border-slate-200 p-4">
                      <div className="mb-4 text-lg font-semibold text-slate-700">
                        Entity Distribution
                      </div>
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart
                          data={Object.entries(statsData.entity_counts).map(
                            ([k, v]) => ({ name: k, count: v }),
                          )}
                        >
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis
                            dataKey="name"
                            angle={-45}
                            textAnchor="end"
                            height={80}
                            interval={0}
                          />
                          <YAxis />
                          <Tooltip />
                          <Bar dataKey="count" fill="#6366f1" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}

                {/* Sentiment Distribution */}
                {statsData.sentiment_counts &&
                  Object.keys(statsData.sentiment_counts).length > 0 && (
                    <div className="rounded-lg border border-slate-200 p-4">
                      <div className="mb-4 text-lg font-semibold text-slate-700">
                        Sentiment Distribution
                      </div>
                      <ResponsiveContainer width="100%" height={300}>
                        <PieChart>
                          <Pie
                            data={Object.entries(
                              statsData.sentiment_counts,
                            ).map(([k, v]) => ({ name: k, value: v }))}
                            cx="50%"
                            cy="50%"
                            labelLine={false}
                            label={({ name, value }) => `${name}: ${value}`}
                            outerRadius={80}
                            fill="#8884d8"
                            dataKey="value"
                          >
                            <Cell fill="#10b981" />
                            <Cell fill="#ef4444" />
                            <Cell fill="#f59e0b" />
                          </Pie>
                          <Tooltip />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  )}

                {/* Entity/Attribute-Sentiment Breakdown */}
                {statsData.breakdown &&
                  Object.keys(statsData.breakdown).length > 0 && (
                    <div className="rounded-lg border border-slate-200 p-4">
                      <div className="mb-4 text-lg font-semibold text-slate-700">
                        Entity/Attribute-Sentiment Breakdown
                      </div>
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart
                          data={Object.entries(statsData.breakdown).map(
                            ([pair, sentiments]) => ({
                              pair,
                              ...sentiments,
                            }),
                          )}
                        >
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis
                            dataKey="pair"
                            angle={-45}
                            textAnchor="end"
                            height={80}
                            interval={0}
                          />
                          <YAxis />
                          <Tooltip />
                          <Legend />
                          <Bar dataKey="POSITIVE" stackId="a" fill="#10b981" />
                          <Bar dataKey="NEGATIVE" stackId="a" fill="#ef4444" />
                          <Bar dataKey="NEUTRAL" stackId="a" fill="#f59e0b" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
              </div>
            )}

            <div className="mt-8 flex justify-end">
              <button
                className="rounded-lg bg-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"
                onClick={() => setShowStatsModal(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
