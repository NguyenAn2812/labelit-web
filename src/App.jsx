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
  sentiments: [],
  banking_domains: [],
  scopes: [],
};

function App() {
  const [config, setConfig] = useState(emptyConfig);
  const [dataset, setDataset] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isEditingText, setIsEditingText] = useState(false);
  const [textDraft, setTextDraft] = useState("");
  const [selection, setSelection] = useState(null);
  const [selectedAspect, setSelectedAspect] = useState(null);
  const [selectedSentiment, setSelectedSentiment] = useState(null);
  const [editingLabelIndex, setEditingLabelIndex] = useState(null);
  const [showLabelModal, setShowLabelModal] = useState(false);
  const [showStatsModal, setShowStatsModal] = useState(false);
  const [showClassifyModal, setShowClassifyModal] = useState(false);
  const [statsData, setStatsData] = useState(null);
  const [selectedBankingDomain, setSelectedBankingDomain] = useState(null);
  const [selectedScope, setSelectedScope] = useState(null);

  const textRef = useRef(null);
  const dismissedClassificationRef = useRef(new Set());

  const currentItem = dataset[currentIndex] || {};
  const articleMeta = currentItem.article_meta || {};
  const paragraphIndex =
    currentItem.paragraph_index ?? currentItem.sentence_idx ?? 1;
  const articleComplete = currentItem.article_id
    ? isArticleAnnotationComplete(currentItem.article_id)
    : false;

  const total = dataset.length;
  const annotatedCount = useMemo(
    () =>
      dataset.filter((item) => (item.labels?.length || 0) > 0 && !item.skipped)
        .length,
    [dataset],
  );
  const skippedCount = useMemo(
    () => dataset.filter((item) => item.skipped).length,
    [dataset],
  );
  const remainingCount = total - annotatedCount - skippedCount;

  const progress =
    total > 0 ? ((annotatedCount + skippedCount) / total) * 100 : 0;

  useEffect(() => {
    const load = async () => {
      try {
        const configRes = await fetch("/api/config");
        const configData = await configRes.json();
        setConfig(configData);

        const dataRes = await fetch("/api/data");
        const data = await dataRes.json();
        setDataset(data);

        const first = data.findIndex(
          (item) => (!item.labels || item.labels.length === 0) && !item.skipped,
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
    if (!showStatsModal) return;
    const fetchStats = async () => {
      try {
        const res = await fetch("/api/stats");
        const data = await res.json();
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
    setSelectedAspect(null);
    setSelectedSentiment(null);
    setEditingLabelIndex(null);
    setShowLabelModal(true);
    selectionObj.removeAllRanges();
  };

  const saveCurrentItem = async (updatedItem = currentItem, nextIndex) => {
    try {
      await fetch("/api/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedItem),
      });
      const dataRes = await fetch("/api/data");
      const data = await dataRes.json();
      setDataset(data);
      if (Number.isInteger(nextIndex) && data.length > 0) {
        const bounded = Math.min(Math.max(nextIndex, 0), data.length - 1);
        setCurrentIndex(bounded);
      }
    } catch (error) {
      console.error("Error saving item:", error);
    }
  };

  const confirmLabel = async () => {
    if (!selection || !selectedAspect || !selectedSentiment) return;

    const newLabel = {
      start: selection.start,
      end: selection.end,
      text: selection.text,
      aspect: selectedAspect,
      sentiment: selectedSentiment,
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
      skipped: false,
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
      skipped: true,
      labels: currentItem.labels || [],
    };
    await saveCurrentItem(updated, currentIndex + 1);
    maybeOpenClassificationModal(updated.article_id);
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
      skipped: false,
    };
    setIsEditingText(false);
    saveCurrentItem(updated);
  };

  const navigate = (step) => {
    const next = currentIndex + step;
    if (next < 0 || next >= dataset.length) return;
    setCurrentIndex(next);
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
      if (!Number.isNaN(paragraphNum)) {
        index = dataset.findIndex((item) => {
          const idx = item.paragraph_index ?? item.sentence_idx ?? 0;
          return (
            String(item.article_id) === String(articleId) &&
            idx + 1 === paragraphNum
          );
        });
      }
    }

    if (index === -1) {
      index = dataset.findIndex((item) => {
        const idx = item.paragraph_index ?? item.sentence_idx ?? 0;
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
      const isSkipped = Boolean(item.skipped);
      const isEmpty = !(item.text || "").trim();
      return hasLabel || isSkipped || isEmpty;
    });
  }

  const isClassificationComplete = (meta) => {
    if (!meta?.banking_domain) return false;
    if (meta.banking_domain === "NON_BANKING") return true;
    return Boolean(meta.scope);
  };

  const maybeOpenClassificationModal = (articleId) => {
    if (!articleId) return;
    if (!isArticleAnnotationComplete(articleId)) return;
    if (isClassificationComplete(articleMeta)) return;
    if (dismissedClassificationRef.current.has(String(articleId))) return;
    setShowClassifyModal(true);
    setSelectedBankingDomain(articleMeta.banking_domain || null);
    setSelectedScope(articleMeta.scope || null);
  };

  const openClassificationModal = () => {
    setShowClassifyModal(true);
    setSelectedBankingDomain(articleMeta.banking_domain || null);
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
    if (!selectedBankingDomain) return;
    if (selectedBankingDomain === "BANKING" && !selectedScope) return;

    await fetch("/api/update-banking-domain", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        article_id: currentItem.article_id,
        banking_domain: selectedBankingDomain,
        clear_labels: selectedBankingDomain === "NON_BANKING",
        set_skipped: selectedBankingDomain === "NON_BANKING" ? true : null,
      }),
    });

    if (selectedBankingDomain === "BANKING") {
      await fetch("/api/update-scope", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          article_id: currentItem.article_id,
          scope: selectedScope,
        }),
      });
    }

    const dataRes = await fetch("/api/data");
    const data = await dataRes.json();
    setDataset(data);
    dismissedClassificationRef.current.delete(String(currentItem.article_id));
    setShowClassifyModal(false);
  };

  const renderHighlightedText = () => {
    const text = currentItem.text || "";
    const labels = [...(currentItem.labels || [])].sort(
      (a, b) => a.start - b.start,
    );
    if (currentItem.skipped) return [text];

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
          title={`${lbl.aspect} > ${sentiment}`}
          onClick={() => {
            setSelection({ start, end, text: text.slice(start, end) });
            setSelectedAspect(lbl.aspect);
            setSelectedSentiment(lbl.sentiment);
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
              LABELiT - ViFABSA Annotation
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded-full bg-white/20 px-3 py-1 text-xs font-semibold">
              Annotated {annotatedCount}/{total}
            </div>
            <button
              className="rounded-full bg-white/20 px-3 py-1 text-xs font-semibold"
              onClick={() => setShowStatsModal(true)}
            >
              Statistics
            </button>
          </div>
        </header>

        <div className="space-y-6 p-6">
          <section className="space-y-4 rounded-xl bg-slate-50 p-4 text-sm font-semibold text-slate-600">
            <div className="grid gap-4 md:grid-cols-4">
              <div className="text-center">
                <div className="text-2xl text-indigo-600">{total}</div>
                <div>Total Paragraphs</div>
              </div>
              <div className="text-center">
                <div className="text-2xl text-emerald-600">
                  {annotatedCount}
                </div>
                <div>Annotated</div>
              </div>
              <div className="text-center">
                <div className="text-2xl text-amber-600">{skippedCount}</div>
                <div>No Aspect</div>
              </div>
              <div className="text-center">
                <div className="text-2xl text-rose-600">{remainingCount}</div>
                <div>Remaining</div>
              </div>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500"
                style={{ width: `${progress.toFixed(1)}%` }}
              />
            </div>
          </section>

          <section className="rounded-xl bg-gradient-to-r from-pink-500 to-rose-500 px-4 py-4 text-white">
            <div className="text-lg font-semibold">
              {articleMeta.title || "No title"}
            </div>
            <div className="mt-2 flex flex-wrap gap-2 text-xs font-medium">
              <span className="rounded-full bg-white/20 px-3 py-1">
                <a href={articleMeta.source} target="_blank">
                  {"URL" || "N/A"}
                </a>
              </span>
              <span className="rounded-full bg-white/20 px-3 py-1">
                {articleMeta.publisher || "N/A"}
              </span>
              <span className="rounded-full bg-white/20 px-3 py-1">
                {timestampToDatetime(articleMeta.publish_time) || "N/A"}
              </span>
              <span className="rounded-full bg-white/20 px-3 py-1">
                Domain: {articleMeta.banking_domain || "N/A"}
              </span>
              <span className="rounded-full bg-white/20 px-3 py-1">
                Scope: {articleMeta.scope || "N/A"}
              </span>
            </div>
          </section>

          <section className="flex flex-wrap items-center justify-between gap-4 rounded-xl py-3 text-sm font-semibold text-slate-600">
            <div className="flex items-center gap-2">
              <button
                className="rounded-lg bg-red-200 px-3 py-2 text-slate-700 shadow disabled:opacity-40"
                disabled={currentIndex <= 0}
                onClick={() => navigate(-1)}
              >
                ←
              </button>
              <div>
                # {currentIndex + 1} / {total}
              </div>
              <div className="text-md text-slate-400">
                ID:{" "}
                {currentItem.article_id
                  ? `${currentItem.article_id}_${paragraphIndex}`
                  : "N/A"}
              </div>
              <button
                className="rounded-lg bg-red-200 px-3 py-2 text-slate-700 shadow disabled:opacity-40"
                disabled={currentIndex >= total - 1}
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
                max={total}
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
              className="rounded-lg bg-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"
              onClick={toggleEditText}
            >
              {isEditingText ? "Done" : "Edit Text"}
            </button>
            <button
              className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-white"
              onClick={markNoAspects}
            >
              No Aspects
            </button>
            <button
              className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-white"
              onClick={() => saveCurrentItem()}
            >
              Save
            </button>
            <button
              className={`rounded-lg px-4 py-2 text-sm font-semibold text-white ${articleComplete ? "bg-indigo-500" : "bg-indigo-300 cursor-not-allowed"}`}
              onClick={openClassificationModal}
              disabled={!articleComplete}
            >
              Classify Article
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
            {(currentItem.labels || []).length === 0 &&
              !currentItem.skipped && (
                <div className="text-sm text-slate-400">
                  Select text to add labels.
                </div>
              )}
            {currentItem.skipped && (
              <div className="text-sm text-emerald-600">
                No aspects in this paragraph.
              </div>
            )}
            <ul className="space-y-2">
              {(currentItem.labels || []).map((lbl, idx) => (
                <li
                  key={`${lbl.start}-${lbl.end}-${idx}`}
                  className="flex items-center justify-between rounded-lg bg-white px-3 py-2 shadow"
                >
                  <div className="text-sm flex flex-col">
                    <div>
                      <span
                        className={`mr-2 rounded-full bg-slate-100 px-2 py-0.5 font-semibold ${lbl.sentiment == "NEGATIVE" ? "text-red-600" : lbl.sentiment == "POSITIVE" ? "text-green-600" : "text-yellow-600"}`}
                      >
                        {lbl.sentiment} # {lbl.aspect}
                      </span>
                    </div>
                    <span className="ml-2 text-slate-500">
                      “{currentItem.text?.slice(lbl.start, lbl.end)}”
                    </span>
                  </div>
                  <button
                    className="rounded-lg bg-rose-100 py-6 px-2 text-xs font-semibold text-rose-600"
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
                Aspect
              </div>
              <div className="flex flex-wrap gap-2">
                {(config.aspects || []).map((asp) => (
                  <button
                    key={asp}
                    className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${selectedAspect === asp ? "bg-indigo-500 text-white shadow ring-2 ring-amber-400/70" : "bg-white text-slate-700 border-slate-200 hover:bg-slate-200"}`}
                    onClick={() => setSelectedAspect(asp)}
                  >
                    {asp}
                  </button>
                ))}
              </div>
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

      {showClassifyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-4 text-lg font-semibold text-slate-700">
              Article Classification
            </div>
            <div className="mb-2 text-xs font-semibold uppercase text-slate-400">
              Banking Domain
            </div>
            <div className="mb-4 flex flex-wrap gap-2">
              {(config.banking_domains || []).map((label) => (
                <button
                  key={label}
                  className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${selectedBankingDomain === label ? "bg-indigo-500 text-white shadow ring-2 ring-amber-400/70" : "bg-white text-slate-700 border-slate-200 hover:bg-slate-200"}`}
                  onClick={() => setSelectedBankingDomain(label)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="mb-2 text-xs font-semibold uppercase text-slate-400">
              Scope (Banking only)
            </div>
            <div className="mb-6 flex flex-wrap gap-2">
              {(config.scopes || []).map((label) => (
                <button
                  key={label}
                  disabled={selectedBankingDomain !== "BANKING"}
                  className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${selectedScope === label ? "bg-emerald-500 text-white shadow ring-2 ring-amber-400/70" : "bg-white text-slate-700 border-slate-200 hover:bg-slate-200"} ${selectedBankingDomain !== "BANKING" ? "opacity-50" : ""}`}
                  onClick={() => setSelectedScope(label)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <button
                className="rounded-lg bg-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"
                onClick={closeClassificationModal}
              >
                Close
              </button>
              <button
                className={`rounded-lg px-4 py-2 text-sm font-semibold text-white ${selectedBankingDomain && (selectedBankingDomain !== "BANKING" || selectedScope) ? "bg-indigo-500" : "bg-indigo-300 cursor-not-allowed"}`}
                onClick={confirmClassification}
                disabled={
                  !selectedBankingDomain ||
                  (selectedBankingDomain === "BANKING" && !selectedScope)
                }
              >
                Save Classification
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
                  {total}
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
                  {skippedCount}
                </div>
                <div className="text-sm text-slate-600">Skipped/No Aspect</div>
              </div>
            </div>

            {/* Charts */}
            {statsData && (
              <div className="space-y-8">
                {/* Aspect Distribution */}
                {statsData.aspect_counts &&
                  Object.keys(statsData.aspect_counts).length > 0 && (
                    <div className="rounded-lg border border-slate-200 p-4">
                      <div className="mb-4 text-lg font-semibold text-slate-700">
                        Aspect Distribution
                      </div>
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart
                          data={Object.entries(statsData.aspect_counts).map(
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

                {/* Aspect-Sentiment Breakdown */}
                {statsData.breakdown &&
                  Object.keys(statsData.breakdown).length > 0 && (
                    <div className="rounded-lg border border-slate-200 p-4">
                      <div className="mb-4 text-lg font-semibold text-slate-700">
                        Aspect-Sentiment Breakdown
                      </div>
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart
                          data={Object.entries(statsData.breakdown).map(
                            ([aspect, sentiments]) => ({
                              aspect,
                              ...sentiments,
                            }),
                          )}
                        >
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis
                            dataKey="aspect"
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
