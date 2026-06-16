import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import {
  supabase,
  signInWithGoogle,
  signOut,
  getCurrentProfile,
} from "./lib/supabase";
import {
  getLabelOptions,
  getDatasets,
  getArticlesByDataset,
  getParagraphsByArticle,
  getAnnotationsByParagraph,
  createAnnotation,
  softDeleteAnnotation,
  updateAnnotation,
  updateParagraphChecked,
  updateParagraphNoAspect,
  updateParagraphStatus,
  importJsonToDataset,
  exportDatasetToJson,
  deleteDataset,
  deleteParagraph,
  getAuditLogsByParagraph,
} from "./lib/db";

function App() {
  /* ═════════════════════════════════════════
     STATE
     ═════════════════════════════════════════ */

  const [authState, setAuthState] = useState("loading");
  const [profile, setProfile] = useState(null);
  const [screen, setScreen] = useState("dashboard");
  const [selectedDatasetId, setSelectedDatasetId] = useState(null);
  const [selectedDatasetName, setSelectedDatasetName] = useState("");
  const [selectedArticleId, setSelectedArticleId] = useState(null);
  const [selectedArticleMeta, setSelectedArticleMeta] = useState(null);

  const [config, setConfig] = useState(null);
  const [datasets, setDatasets] = useState([]);
  const [articles, setArticles] = useState([]);
  const [paragraphs, setParagraphs] = useState([]);
  const [annotations, setAnnotations] = useState({});
  const [currentParaIdx, setCurrentParaIdx] = useState(0);
  const [loadingDatasets, setLoadingDatasets] = useState(false);
  const [loadingArticles, setLoadingArticles] = useState(false);

  const [selection, setSelection] = useState(null);
  const [selectedAspect, setSelectedAspect] = useState(null);
  const [selectedAttribute, setSelectedAttribute] = useState(null);
  const [selectedSentiment, setSelectedSentiment] = useState(null);
  const [showLabelModal, setShowLabelModal] = useState(false);
  const [editingLabelId, setEditingLabelId] = useState(null);
  const [isEditingText, setIsEditingText] = useState(false);
  const [textDraft, setTextDraft] = useState("");
  const textRef = useRef(null);

  /* import */
  const fileInputRef = useRef(null);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0 });

  /* delete confirm */
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  /* search */
  const [searchQuery, setSearchQuery] = useState("");
  const [datasetSearchQuery, setDatasetSearchQuery] = useState("");
  const [articlePage, setArticlePage] = useState(1);
  const [articleTotal, setArticleTotal] = useState(0);

  /* audit log */
  const [showAuditLog, setShowAuditLog] = useState(false);
  const [auditLogs, setAuditLogs] = useState([]);
  const [loadingAuditLog, setLoadingAuditLog] = useState(false);

  /* annotation loading */
  const [annotationLoading, setAnnotationLoading] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  /* span handle drag */
  const modalTextRef = useRef(null);
  const dragWhich = useRef(null);

  /* ═════════════════════════════════════════
     AUTH
     ═════════════════════════════════════════ */

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) initProfile();
      else setAuthState("login");
    });
    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") initProfile();
      else if (event === "SIGNED_OUT") {
        setAuthState("login");
        setProfile(null);
      }
    });
    return () => listener?.subscription?.unsubscribe();
  }, []);

  async function initProfile() {
    setProfile(await getCurrentProfile());
    setAuthState("ready");
  }

  useEffect(() => {
    if (authState !== "ready" || !profile?.can_view) return;
    getLabelOptions().then(setConfig).catch(console.error);
  }, [authState, profile]);

  useEffect(() => {
    if (screen !== "dashboard" || !config) return;
    setLoadingDatasets(true);
    getDatasets().then(setDatasets).catch(console.error).finally(() => setLoadingDatasets(false));
  }, [screen, config]);

  useEffect(() => {
    if (screen !== "dataset-detail" || !selectedDatasetId) return;
    setLoadingArticles(true);
    setDatasetSearchQuery("");
    getArticlesByDataset(selectedDatasetId, articlePage)
      .then(({ articles, total }) => {
        setArticles(articles);
        setArticleTotal(total);
      })
      .catch(console.error)
      .finally(() => setLoadingArticles(false));
  }, [screen, selectedDatasetId, articlePage]);



  /* ═════════════════════════════════════════
     NAVIGATION
     ═════════════════════════════════════════ */

  function goToDataset(ds) {
    setSelectedDatasetId(ds.dataset_id);
    setSelectedDatasetName(ds.name);
    setArticles([]);
    setArticlePage(1);
    setScreen("dataset-detail");
  }

  async function goToArticle(art) {
    setSelectedArticleId(art.article_id);
    setSelectedArticleMeta({
      title: art.title,
      publisher: art.publisher,
      source: art.source,
      author: art.author,
      publish_datetime: art.publish_datetime,
    });
    setParagraphs([]);
    setAnnotations({});
    setCurrentParaIdx(0);
    setShowAuditLog(false);
    setAuditLogs([]);
    setScreen("annotation");

    try {
      const paras = await getParagraphsByArticle(art.article_id);
      setParagraphs(paras);
      setCurrentParaIdx(0);
    } catch (err) {
      console.error(err);
    }
  }

  function goBack() {
    if (screen === "dataset-detail") setScreen("dashboard");
    else if (screen === "annotation") {
      setSelectedArticleId(null);
      setSelectedArticleMeta(null);
      setParagraphs([]);
      setAnnotations({});
      setScreen("dataset-detail");
    }
  }

  async function handleSearch() {
    const q = searchQuery.trim();
    if (!q) return;
    const uuidPat = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (/^\d+$/.test(q)) {
      const idx = parseInt(q, 10) - 1;
      const art = articles[idx];
      if (art) { goToArticle(art); setSearchQuery(""); return; }
    } else if (uuidPat.test(q)) {
      const art = articles.find(a => a.article_id === q);
      if (art) { goToArticle(art); setSearchQuery(""); return; }
      if (selectedArticleId) {
        const pi = paragraphs.findIndex(p => p.id === q);
        if (pi >= 0) { setCurrentParaIdx(pi); setSearchQuery(""); return; }
      }
      const paraMatch = { artIdx: -1, paraIdx: -1 };
      for (let i = 0; i < articles.length; i++) {
        if (articles[i].article_id === selectedArticleId) continue;
        const paras = await getParagraphsByArticle(articles[i].article_id);
        const pi = paras.findIndex(p => p.id === q);
        if (pi >= 0) { paraMatch.artIdx = i; paraMatch.paraIdx = pi; break; }
      }
      if (paraMatch.artIdx >= 0) {
        goToArticle(articles[paraMatch.artIdx]);
        setCurrentParaIdx(paraMatch.paraIdx);
        setSearchQuery("");
        return;
      }
    }
    alert("Không tìm thấy: " + q);
  }

  /* ═════════════════════════════════════════
     DELETE
     ═════════════════════════════════════════ */

  async function handleDeleteDataset(id) {
    try {
      await deleteDataset(id);
      setDatasets((prev) => prev.filter((d) => d.dataset_id !== id));
      setDeleteConfirm(null);
    } catch (err) {
      alert("Delete error: " + err.message);
    }
  }

  async function handleDeleteParagraph(id) {
    try {
      await deleteParagraph(id);
      const updated = await getParagraphsByArticle(selectedArticleId);
      setParagraphs(updated);
      setDeleteConfirm(null);
      if (currentParaIdx >= updated.length) {
        setCurrentParaIdx(Math.max(0, updated.length - 1));
      }
      if (updated.length === 0) {
        const refreshed = await getArticlesByDataset(selectedDatasetId);
        setArticles(refreshed);
        goBack();
      }
    } catch (err) {
      alert("Delete error: " + err.message);
    }
  }

  function advanceToNextTarget() {
    if (currentParaIdx < paragraphs.length - 1) {
      setCurrentParaIdx((i) => i + 1);
      setShowAuditLog(false);
      setAuditLogs([]);
      return true;
    }

    const articleIdx = articles.findIndex(
      (article) => article.article_id === selectedArticleId
    );
    const nextArticle = articleIdx >= 0 ? articles[articleIdx + 1] : null;
    if (nextArticle) {
      goToArticle(nextArticle);
      return true;
    }

    return false;
  }

  /* ═════════════════════════════════════════
     ANNOTATION
     ═════════════════════════════════════════ */

  const currentParagraph = paragraphs[currentParaIdx] || {};
  const currentAnnotations = annotations[currentParagraph.id] || [];

  useEffect(() => {
    setShowAuditLog(false);
    setAuditLogs([]);
  }, [currentParagraph.id]);

  /* lazy‑load annotations for the current paragraph */
  useEffect(() => {
    const pid = currentParagraph?.id;
    if (!pid || screen !== "annotation") return;
    if (annotations[pid]) return;

    setAnnotationLoading(true);
    let cancelled = false;
    getAnnotationsByParagraph(pid)
      .then((anns) => {
        if (!cancelled) {
          setAnnotations((prev) => ({ ...prev, [pid]: anns }));
        }
      })
      .catch(console.error)
      .finally(() => {
        if (!cancelled) setAnnotationLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentParagraph?.id, screen]);

  const availableAttributes = useMemo(() => {
    if (!config || !selectedAspect) return [];
    return config.entity_attributes?.[selectedAspect] || [];
  }, [config, selectedAspect]);

  /* text selection on main page */
  const handleTextSelection = () => {
    if (isEditingText) return;
    const sel = window.getSelection();
    if (!sel || sel.toString().length === 0) return;
    const range = sel.getRangeAt(0);
    if (!textRef.current?.contains(range.commonAncestorContainer)) return;
    const pre = range.cloneRange();
    pre.selectNodeContents(textRef.current);
    pre.setEnd(range.startContainer, range.startOffset);
    const start = pre.toString().length;
    const end = start + sel.toString().length;
    setSelection({ start, end, text: sel.toString() });
    setSelectedAspect(null);
    setSelectedAttribute(null);
    setSelectedSentiment(null);
    setEditingLabelId(null);
    setShowLabelModal(true);
    sel.removeAllRanges();
  };

  /* confirm label */
  const confirmLabel = async () => {
    if (!selection || !selectedAspect || !selectedAttribute || !selectedSentiment)
      return;
    const labelData = {
      paragraph_id: currentParagraph.id,
      span: selection.text,
      aspect: selectedAspect,
      attribute: selectedAttribute,
      sentiment: selectedSentiment,
      start_index: selection.start,
      end_index: selection.end,
    };
    try {
      if (editingLabelId) {
        await updateAnnotation(editingLabelId, labelData);
      } else {
        await createAnnotation(labelData);
      }
      setShowLabelModal(false);
      const updated = await getAnnotationsByParagraph(currentParagraph.id);
      setAnnotations((prev) => ({ ...prev, [currentParagraph.id]: updated }));
    } catch (err) {
      alert("Label error: " + err.message);
    }
  };

  const removeLabel = async (id) => {
    await softDeleteAnnotation(id);
    const updated = await getAnnotationsByParagraph(currentParagraph.id);
    setAnnotations((prev) => ({ ...prev, [currentParagraph.id]: updated }));
  };

  const editLabel = (lbl) => {
    setSelection({
      start: lbl.start_index,
      end: lbl.end_index,
      text: lbl.span,
    });
    setSelectedAspect(lbl.aspect);
    setSelectedAttribute(lbl.attribute);
    setSelectedSentiment(lbl.sentiment);
    setEditingLabelId(lbl.id);
    setShowLabelModal(true);
  };

  const markNoAspects = async () => {
    const was = currentParagraph.no_aspect;
    await updateParagraphNoAspect(currentParagraph.id, !was);
    await updateParagraphStatus(
      currentParagraph.id,
      was ? "pending" : "skipped"
    );
    const updated = await getParagraphsByArticle(selectedArticleId);
    setParagraphs(updated);
    if (!was) advanceToNextTarget();
  };

  const toggleChecked = async () => {
    const newChecked = !currentParagraph.checked;
    await updateParagraphChecked(currentParagraph.id, newChecked);
    await updateParagraphStatus(
      currentParagraph.id,
      newChecked ? "completed" : "pending"
    );
    const [updatedParas, updatedArticles] = await Promise.all([
      getParagraphsByArticle(selectedArticleId),
      getArticlesByDataset(selectedDatasetId),
    ]);
    setParagraphs(updatedParas);
    setArticles(updatedArticles);
  };

  /* ═════════════════════════════════════════
     SPAN HANDLE DRAG
     ═════════════════════════════════════════ */

  const getCaretOffset = useCallback((clientX, clientY) => {
    try {
      const range = document.caretRangeFromPoint(clientX, clientY);
      const container = modalTextRef.current;
      if (!range || !container?.contains(range.startContainer))
        return null;

      const walker = document.createTreeWalker(
        container,
        NodeFilter.SHOW_TEXT
      );
      let offset = 0;
      let node = walker.nextNode();
      while (node) {
        if (node === range.startContainer) {
          return offset + range.startOffset;
        }
        offset += node.textContent.length;
        node = walker.nextNode();
      }
      return null;
    } catch {
      return null;
    }
  }, []);

  const startHandleDrag = useCallback(
    (which) => (e) => {
      e.preventDefault();
      dragWhich.current = which;
      const fullText = currentParagraph.paragraph_text || "";
      const onMove = (ev) => {
        const off = getCaretOffset(ev.clientX, ev.clientY);
        if (off === null) return;
        setSelection((prev) => {
          if (which === "start") {
            const s = Math.max(0, Math.min(off, prev.end - 1));
            return { ...prev, start: s, text: fullText.slice(s, prev.end) };
          } else {
            const e2 = Math.min(fullText.length, Math.max(off, prev.start + 1));
            return { ...prev, end: e2, text: fullText.slice(prev.start, e2) };
          }
        });
      };
      const onUp = () => {
        dragWhich.current = null;
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [getCaretOffset, currentParagraph.paragraph_text]
  );

  /* ═════════════════════════════════════════
     AUDIT LOG
     ═════════════════════════════════════════ */

  const toggleAuditLog = async () => {
    if (showAuditLog) {
      setShowAuditLog(false);
      return;
    }
    setLoadingAuditLog(true);
    try {
      const logs = await getAuditLogsByParagraph(currentParagraph.id);
      setAuditLogs(logs);
      setShowAuditLog(true);
    } catch (err) {
      alert("Audit log error: " + err.message);
    } finally {
      setLoadingAuditLog(false);
    }
  };

  /* ═════════════════════════════════════════
     IMPORT / EXPORT
     ═════════════════════════════════════════ */

  const handleImportJson = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportProgress({ current: 0, total: 0 });
    try {
      const raw = await file.text();
      const json = JSON.parse(raw);
      const name = file.name.replace(/\.json$/i, "");
      await importJsonToDataset(name, json, (current, total) =>
        setImportProgress({ current, total })
      );
      setDatasets(await getDatasets());
    } catch (err) {
      alert("Import error: " + err.message);
    } finally {
      setImporting(false);
      setImportProgress({ current: 0, total: 0 });
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleExportJson = async () => {
    if (!selectedDatasetId) return;
    try {
      const json = await exportDatasetToJson(selectedDatasetId);
      const blob = new Blob([JSON.stringify(json, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${selectedDatasetName || "export"}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert("Export error: " + err.message);
    }
  };

  /* ═════════════════════════════════════════
     TEXT RENDERING
     ═════════════════════════════════════════ */

  const renderHighlightedText = () => {
    const text = currentParagraph.paragraph_text || "";
    const labels = [...currentAnnotations].sort(
      (a, b) => a.start_index - b.start_index
    );
    if (currentParagraph.no_aspect) return [text];
    const parts = [];
    let last = 0;
    labels.forEach((lbl) => {
      const { start_index: s, end_index: e } = lbl;
      if (s > last) parts.push(text.slice(last, s));
      const c =
        lbl.sentiment === "POSITIVE"
          ? "bg-emerald-100 border-emerald-500"
          : lbl.sentiment === "NEGATIVE"
          ? "bg-rose-100 border-rose-500"
          : "bg-amber-100 border-amber-500";
      parts.push(
        <span
          key={lbl.id}
          className={`cursor-pointer rounded px-1 border-b-2 ${c}`}
          title={`${lbl.aspect} / ${lbl.attribute} > ${lbl.sentiment}`}
          onClick={() => editLabel(lbl)}
        >
          {text.slice(s, e)}
        </span>
      );
      last = e;
    });
    if (last < text.length) parts.push(text.slice(last));
    return parts;
  };

  const renderDeleteConfirmModal = () => {
    if (!deleteConfirm) return null;

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
        <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
          <h3 className="text-lg font-semibold text-slate-700">
            Delete {deleteConfirm.type === "dataset" ? "Dataset" : "Paragraph"}
          </h3>
          <p className="mt-2 text-sm text-slate-500">
            Are you sure you want to delete{" "}
            <strong>{deleteConfirm.name}</strong>? This cannot be undone.
          </p>
          <div className="mt-6 flex justify-end gap-2">
            <button
              onClick={() => setDeleteConfirm(null)}
              className="rounded-lg bg-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-300 transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                if (deleteConfirm.type === "dataset") {
                  handleDeleteDataset(deleteConfirm.id);
                } else {
                  handleDeleteParagraph(deleteConfirm.id);
                }
              }}
              className="rounded-lg bg-rose-500 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-600 transition cursor-pointer"
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderGuideModal = () => {
    if (!showGuide) return null;
    return (
      <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-8 overflow-y-auto" onClick={() => setShowGuide(false)}>
        <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-slate-800">Hướng dẫn gán nhãn</h2>
            <button onClick={() => setShowGuide(false)} className="text-slate-400 hover:text-slate-600 text-xl cursor-pointer">&times;</button>
          </div>

          <div className="space-y-5 text-sm text-slate-700">

            <section>
              <h3 className="font-bold text-indigo-700 text-base mb-1">7 khía cạnh (Aspects) & Thuộc tính</h3>
              <div className="space-y-3">

                <div className="rounded-lg border border-indigo-100 bg-indigo-50/50 p-3">
                  <p className="font-semibold text-indigo-800">1. DIGITAL_BANKING — Ngân hàng số</p>
                  <p className="text-xs text-slate-500 mb-1">App, Internet Banking, Website, thanh toán online, API.</p>
                  <ul className="list-disc list-inside text-xs space-y-0.5 text-slate-600">
                    <li><strong>USABILITY</strong> — UI/UX, độ mượt, dễ dùng</li>
                    <li><strong>STABILITY</strong> — Ổn định, lỗi, bảo trì, tốc độ</li>
                    <li><strong>FEATURES</strong> — Tính năng mới (QR, thẻ ảo…)</li>
                    <li><strong>SECURITY</strong> — Bảo mật (OTP, sinh trắc, cảnh báo lừa đảo)</li>
                  </ul>
                </div>

                <div className="rounded-lg border border-emerald-100 bg-emerald-50/50 p-3">
                  <p className="font-semibold text-emerald-800">2. SERVICE — Dịch vụ & Quy trình</p>
                  <p className="text-xs text-slate-500 mb-1">Tại quầy, tổng đài, quy trình giấy tờ.</p>
                  <ul className="list-disc list-inside text-xs space-y-0.5 text-slate-600">
                    <li><strong>STAFF_ATTITUDE</strong> — Thái độ nhân viên, chuyên nghiệp</li>
                    <li><strong>SUPPORT_SPEED</strong> — Thời gian chờ/xử lý khiếu nại</li>
                    <li><strong>PROCEDURE</strong> — Thủ tục hồ sơ, quy định nghiệp vụ</li>
                  </ul>
                </div>

                <div className="rounded-lg border border-amber-100 bg-amber-50/50 p-3">
                  <p className="font-semibold text-amber-800">3. FINANCIAL_PRODUCT — Sản phẩm & Hiệu suất TC</p>
                  <p className="text-xs text-slate-500 mb-1">Sản phẩm tài chính, báo cáo KQKD.</p>
                  <ul className="list-disc list-inside text-xs space-y-0.5 text-slate-600">
                    <li><strong>INTEREST_RATE</strong> — Lãi suất huy động/vay của ngân hàng</li>
                    <li><strong>LIQUIDITY</strong> — Thanh khoản, dòng tiền, tỷ lệ an toàn</li>
                    <li><strong>PROFITABILITY</strong> — Doanh thu, lợi nhuận, NIM, ROE, ROA</li>
                    <li><strong>ASSET_QUALITY</strong> — Nợ xấu (NPL), dự phòng, tài sản đảm bảo</li>
                    <li><strong>OTHER_PRODUCTS</strong> — Bảo hiểm (Bancassurance), thẻ tín dụng, CK</li>
                  </ul>
                </div>

                <div className="rounded-lg border border-rose-100 bg-rose-50/50 p-3">
                  <p className="font-semibold text-rose-800">4. FINANCIAL_FEE — Phí dịch vụ</p>
                  <p className="text-xs text-slate-500 mb-1">Chi phí khách hàng trả.</p>
                  <ul className="list-disc list-inside text-xs space-y-0.5 text-slate-600">
                    <li><strong>TRANSACTION_FEE</strong> — Phí chuyển tiền, duy trì thẻ, SMS</li>
                    <li><strong>TRANSPARENCY</strong> — Minh bạch thu phí, thông báo thay đổi</li>
                  </ul>
                </div>

                <div className="rounded-lg border border-purple-100 bg-purple-50/50 p-3">
                  <p className="font-semibold text-purple-800">5. LEADERSHIP — Lãnh đạo & Chiến lược</p>
                  <p className="text-xs text-slate-500 mb-1">Ban lãnh đạo, quản trị cấp cao.</p>
                  <ul className="list-disc list-inside text-xs space-y-0.5 text-slate-600">
                    <li><strong>REPUTATION</strong> — Hình ảnh, thương hiệu, giải thưởng</li>
                    <li><strong>STRATEGY</strong> — Kế hoạch dài hạn (M&A, chuyển đổi số…)</li>
                    <li><strong>INTEGRITY</strong> — Đạo đức, sai phạm, khởi tố, kỷ luật</li>
                    <li><strong>RISK_CONTROL</strong> — Quản trị rủi ro, Basel II/III</li>
                  </ul>
                </div>

                <div className="rounded-lg border border-cyan-100 bg-cyan-50/50 p-3">
                  <p className="font-semibold text-cyan-800">6. MACRO_REGULATION — Quản lý Vĩ mô</p>
                  <p className="text-xs text-slate-500 mb-1">Từ cơ quan quản lý hoặc bối cảnh vĩ mô.</p>
                  <ul className="list-disc list-inside text-xs space-y-0.5 text-slate-600">
                    <li><strong>POLICY_CHANGE</strong> — Thông tư, nghị định, luật mới</li>
                    <li><strong>MONETARY_CONTROL</strong> — Room tín dụng, lãi suất điều hành, tỷ giá</li>
                    <li><strong>COMPLIANCE</strong> — Thanh tra, bị phạt/khen thưởng do tuân thủ</li>
                  </ul>
                </div>

                <div className="rounded-lg border border-slate-200 bg-slate-100/50 p-3">
                  <p className="font-semibold text-slate-700">7. MARKET_PERCEPTION — Góc nhìn Thị trường</p>
                  <p className="text-xs text-slate-500 mb-1">Phản ứng bên thứ ba và giá cổ phiếu.</p>
                  <ul className="list-disc list-inside text-xs space-y-0.5 text-slate-600">
                    <li><strong>ANALYST_VIEW</strong> — Khuyến nghị mua/bán, dự báo giá</li>
                    <li><strong>INVESTOR_SENTIMENT</strong> — Tâm lý NĐT, mua/bán ròng khối ngoại</li>
                    <li><strong>MARKET_SIGNAL</strong> — Biến động giá CP, thanh khoản</li>
                  </ul>
                </div>

              </div>
            </section>

            <section>
              <h3 className="font-bold text-indigo-700 text-base mb-1">Gán Sentiment</h3>
              <p className="mb-1">Theo góc nhìn <strong>nhà đầu tư chứng khoán</strong>:</p>
              <ul className="list-disc list-inside text-xs space-y-0.5">
                <li><span className="font-semibold text-emerald-600">POSITIVE</span> — Tăng lợi nhuận, giảm rủi ro (nợ xấu, pháp lý), nâng vị thế ngân hàng, giảm chi phí vốn.</li>
                <li><span className="font-semibold text-rose-600">NEGATIVE</span> — Sụt giảm lợi nhuận, nợ xấu/rủi ro pháp lý, suy giảm uy tín, bị xử phạt, thắt chặt CS.</li>
                <li><span className="font-semibold text-amber-600">NEUTRAL</span> — Tin liệt kê/số liệu định kỳ, sự kiện chưa rõ tác động, dự báo từ bên thứ ba.</li>
              </ul>
            </section>

            <section>
              <h3 className="font-bold text-indigo-700 text-base mb-1">Quy tắc trích xuất Span</h3>
              <ol className="list-decimal list-inside text-xs space-y-1">
                <li><strong>Liên tục & Nguyên văn</strong> — Span khớp 100% đoạn gốc, không thêm/bớt ký tự.</li>
                <li><strong>Đủ ngữ cảnh</strong> — Gồm thực thể + hành động + kết quả (VD: "Vietcombank tăng lãi suất lên 6%", không chỉ "lãi suất").</li>
                <li><strong>Không chồng lấn</strong> — Các span không trùng ký tự.</li>
                <li><strong>Nhân quả</strong> — Câu có 2 khía cạnh nhân quả → tách 2 span riêng.</li>
                <li><strong>Đối chiếu</strong> — A tăng nhưng B giảm → tách theo từng thực thể.</li>
                <li><strong>Liệt kê</strong> — Nhiều ngân hàng cùng chung trạng thái → 1 span duy nhất.</li>
              </ol>
            </section>

            <section>
              <h3 className="font-bold text-indigo-700 text-base mb-1">Checklist</h3>
              <ul className="text-xs space-y-0.5 list-none">
                <li className="flex items-start gap-1"><span className="text-emerald-500 shrink-0">✓</span> Span khớp 100% nguyên văn?</li>
                <li className="flex items-start gap-1"><span className="text-emerald-500 shrink-0">✓</span> Aspect thuộc 1 trong 7 nhãn?</li>
                <li className="flex items-start gap-1"><span className="text-emerald-500 shrink-0">✓</span> Attribute hợp lệ với aspect?</li>
                <li className="flex items-start gap-1"><span className="text-emerald-500 shrink-0">✓</span> Sentiment theo góc nhìn NĐT?</li>
                <li className="flex items-start gap-1"><span className="text-emerald-500 shrink-0">✓</span> Đã tách nhân quả nếu cần?</li>
                <li className="flex items-start gap-1"><span className="text-emerald-500 shrink-0">✓</span> Không có tin phù hợp → trả []?</li>
              </ul>
            </section>

          </div>
        </div>
      </div>
    );
  };

  /* ═════════════════════════════════════════
     LOADING
     ═════════════════════════════════════════ */

  if (authState === "loading") {
    return (
      <div className="h-screen flex items-center justify-center bg-gradient-to-br from-indigo-500 to-violet-500">
        <p className="text-white text-xl font-semibold animate-pulse">
          Loading...
        </p>
      </div>
    );
  }

  /* ═════════════════════════════════════════
     LOGIN
     ═════════════════════════════════════════ */

  if (authState === "login") {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-gradient-to-br from-indigo-500 to-violet-500 gap-6">
        <h1 className="text-4xl font-bold text-white">LABELiT</h1>
        <p className="text-white/80 text-lg">ViBankABSA Annotation Tool</p>
        <button
          onClick={signInWithGoogle}
          className="flex items-center gap-3 rounded-xl bg-white px-8 py-3 text-lg font-semibold text-slate-700 shadow-lg hover:opacity-90 transition cursor-pointer"
        >
          <img
            src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
            alt="Google"
            className="w-6 h-6"
          />
          Sign in with Google
        </button>
      </div>
    );
  }

  /* ═════════════════════════════════════════
     NO ACCESS
     ═════════════════════════════════════════ */

  if (profile && !profile.can_view) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-gradient-to-br from-indigo-500 to-violet-500 gap-4">
        <h1 className="text-3xl font-bold text-white">LABELiT</h1>
        <div className="rounded-xl bg-white/10 px-8 py-6 text-center text-white">
          <p className="text-lg font-semibold">
            Tài khoản chưa được cấp quyền xem
          </p>
          <p className="mt-2 text-sm text-white/70">
            Vui lòng liên hệ admin để được cấp quyền.
          </p>
        </div>
        <button
          onClick={signOut}
          className="rounded-lg bg-white/20 px-6 py-2 text-sm font-semibold text-white hover:bg-white/30 transition cursor-pointer"
        >
          Sign Out
        </button>
      </div>
    );
  }

  /* ═════════════════════════════════════════
     DASHBOARD
     ═════════════════════════════════════════ */

  if (screen === "dashboard") {
    const pct = (r) =>
      r.total_paragraphs > 0
        ? ((r.completed_paragraphs / r.total_paragraphs) * 100).toFixed(1)
        : "0.0";

    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-500 to-violet-500">
        <div className="app-container">
        <header className="text-white py-4">
          <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">LABELiT</h1>
          <div className="flex items-center gap-3">
            {profile?.can_edit && (
              <>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={importing}
                  className="rounded-lg bg-white/20 px-4 py-2 text-sm font-semibold hover:bg-white/30 transition cursor-pointer"
                >
                  {importing ? "Importing..." : "Import JSON"}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json"
                  className="hidden"
                  onChange={handleImportJson}
                />
              </>
            )}
            <button
              onClick={signOut}
              className="rounded-lg bg-white/10 px-3 py-1 text-sm hover:bg-white/20 transition cursor-pointer"
            >
              Sign Out
            </button>
            <button
              onClick={() => setShowGuide(true)}
              className="rounded-lg bg-white/10 px-3 py-1 text-sm hover:bg-white/20 transition cursor-pointer"
            >
              Guide
            </button>
          </div>
        </div></header>

        {/* import progress bar */}
        {importing && importProgress.total > 0 && (
          <div className="mb-4">
            <div className="rounded-xl bg-white/10 p-4 text-white">
              <div className="flex justify-between text-sm mb-2">
                <span>Importing…</span>
                <span>
                  {importProgress.current} / {importProgress.total}
                </span>
              </div>
              <div className="h-3 w-full rounded-full bg-white/20">
                <div
                  className="h-3 rounded-full bg-emerald-400 transition-all"
                  style={{
                    width: `${(importProgress.current / importProgress.total) * 100}%`,
                  }}
                />
              </div>
            </div>
          </div>
        )}

        <div className="pb-8">
          {loadingDatasets ? (
            <div className="mt-20 flex justify-center text-white/70">
              <p className="text-lg animate-pulse">Loading datasets…</p>
            </div>
          ) : datasets.length === 0 && !importing ? (
            <div className="mt-20 text-center text-white/70">
              <p className="text-lg">No datasets yet.</p>
              {profile?.can_edit && (
                <p className="mt-2 text-sm">
                  Click "Import JSON" to upload a dataset.
                </p>
              )}
            </div>
          ) : null}
          <div className="mt-6 grid gap-4">
            {datasets.map((ds) => (
              <div
                key={ds.dataset_id}
                className="rounded-xl bg-white p-5 shadow-lg"
              >
                <div
                  className="cursor-pointer"
                  onClick={() => goToDataset(ds)}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-lg font-bold text-slate-800">
                        {ds.name}
                      </h2>
                      <p className="text-sm text-slate-500">
                        {ds.total_articles} articles ·{" "}
                        {ds.total_paragraphs} paragraphs ·{" "}
                        {ds.total_active_annotations} annotations
                      </p>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold text-indigo-600">
                        {pct(ds)}%
                      </div>
                      <div className="text-xs text-slate-400">complete</div>
                    </div>
                  </div>
                  <div className="mt-3 h-2 w-full rounded-full bg-slate-100">
                    <div
                      className="h-2 rounded-full bg-emerald-500 transition-all"
                      style={{ width: `${Math.min(pct(ds), 100)}%` }}
                    />
                  </div>
                </div>
                {profile?.can_edit && (
                  <div className="mt-3 flex justify-end">
                    <button
                      onClick={() =>
                        setDeleteConfirm({
                          type: "dataset",
                          id: ds.dataset_id,
                          name: ds.name,
                        })
                      }
                      className="rounded-lg bg-rose-100 px-3 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-200 transition cursor-pointer"
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
        {renderDeleteConfirmModal()}
        {renderGuideModal()}
      </div>
      </div>
    );
  }

  /* ═════════════════════════════════════════
     DATASET DETAIL
     ═════════════════════════════════════════ */

  if (screen === "dataset-detail") {
    const filteredArticles = articles.filter(a =>
      !datasetSearchQuery.trim()
      || a.title?.toLowerCase().includes(datasetSearchQuery.toLowerCase())
      || a.article_id?.toLowerCase().includes(datasetSearchQuery.toLowerCase())
    );
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-500 to-violet-500">
        <div className="app-container">
        <header className="text-white py-4">
          <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={goBack}
              className="rounded-lg bg-white/20 px-3 py-1 text-sm font-semibold hover:bg-white/30 transition cursor-pointer"
            >
              ← Back
            </button>
            <h1 className="text-xl font-bold">{selectedDatasetName}</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowGuide(true)}
              className="rounded-lg bg-white/10 px-3 py-1 text-sm font-semibold hover:bg-white/20 transition cursor-pointer"
            >
              Guide
            </button>
            {profile?.can_edit && (
              <button
                onClick={handleExportJson}
                className="rounded-lg bg-white/20 px-4 py-2 text-sm font-semibold hover:bg-white/30 transition cursor-pointer"
              >
                Export JSON
              </button>
            )}
          </div>
        </div></header>
        <div className="pb-8">
          {loadingArticles ? (
            <div className="mt-20 flex justify-center text-white/70">
              <p className="text-lg animate-pulse">Loading articles…</p>
            </div>
          ) : articles.length === 0 ? (
            <div className="mt-20 text-center text-white/70">
              <p className="text-lg">No articles in this dataset.</p>
            </div>
          ) : (
          <>
          {/* article summary */}
          <div className="mt-4 mb-2 rounded-xl bg-white/10 px-4 py-2 text-white text-sm flex items-center justify-between">
            <span className="font-semibold">{articles.length} / {articleTotal} articles</span>
            <div className="flex gap-3 text-xs">
              <span className="text-emerald-300">✓ {articles.filter(a => (a.completed_paragraphs || 0) + (a.skipped_paragraphs || 0) >= (a.total_paragraphs || 0)).length} done</span>
              <span className="text-white/50">{articles.filter(a => (a.completed_paragraphs || 0) + (a.skipped_paragraphs || 0) < (a.total_paragraphs || 0)).length} left</span>
            </div>
          </div>
          {/* search bar */}
          <div className="mt-4 mb-1">
            <div className="flex gap-2">
              <input
                className="flex-1 rounded-lg bg-white/10 px-3 py-1.5 text-sm text-white placeholder-white/40 border border-white/20 outline-none focus:border-white/50"
                placeholder="Search articles by title or ID…"
                value={datasetSearchQuery}
                onChange={(e) => setDatasetSearchQuery(e.target.value)}
              />
              {datasetSearchQuery && (
                <button
                  onClick={() => setDatasetSearchQuery("")}
                  className="rounded-lg bg-white/20 px-3 py-1 text-sm font-semibold text-white hover:bg-white/30 transition cursor-pointer"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {datasetSearchQuery && (
            <p className="mb-2 text-xs text-white/50">
              {filteredArticles.length} / {articles.length} articles match
            </p>
          )}

          <div className="mt-6 grid grid-cols-1 gap-4">
            {filteredArticles.map((art, idx) => {
              const pctDone =
                art.total_paragraphs > 0
                  ? ((art.completed_paragraphs / art.total_paragraphs) * 100).toFixed(1)
                  : "0.0";
              const leftCount = (art.total_paragraphs || 0) - (art.completed_paragraphs || 0) - (art.skipped_paragraphs || 0);
              return (
                <div
                  key={art.article_id}
                  onClick={() => goToArticle(art)}
                  className="rounded-xl bg-white p-5 shadow-lg hover:shadow-xl transition cursor-pointer"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-slate-800 truncate">
                        <span className="inline-flex items-center justify-center rounded bg-indigo-100 px-2 py-0.5 mr-1.5 text-xs font-bold text-indigo-700 align-middle">#{idx + 1 + (articlePage - 1) * 50}</span>
                        {art.title || "(no title)"}
                      </h3>
                      <p className="text-xs text-slate-500 mt-1">
                        {art.publisher || "N/A"} · {art.author || "N/A"}
                      </p>
                    </div>
                    <div className="ml-4 text-right shrink-0">
                      <div className="text-lg font-bold text-indigo-600">
                        {pctDone}%
                      </div>
                      <div className="text-xs text-slate-400">
                        {art.completed_paragraphs}/{art.total_paragraphs} paras
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 h-2 w-full rounded-full bg-slate-100">
                    <div
                      className="h-2 rounded-full bg-emerald-500 transition-all"
                      style={{ width: `${Math.min(pctDone, 100)}%` }}
                    />
                  </div>
                  <div className="mt-2 flex gap-4 text-xs">
                    <span className="text-emerald-600 font-semibold">✓ {art.completed_paragraphs || 0} annotated</span>
                    <span className="text-amber-600 font-semibold">⊘ {art.skipped_paragraphs || 0} no aspect</span>
                    <span className="text-slate-400 font-semibold">{Math.max(0, leftCount)} left</span>
                  </div>
                </div>
              );
            })}
          </div>
          {/* pagination */}
          {articleTotal > 50 && (
          <div className="mt-4 flex items-center justify-center gap-4 text-white text-sm">
            <button
              disabled={articlePage <= 1}
              onClick={() => setArticlePage(p => Math.max(1, p - 1))}
              className="rounded-lg bg-white/20 px-4 py-2 font-semibold disabled:opacity-30 hover:bg-white/30 transition cursor-pointer"
            >
              ← Prev
            </button>
            <span className="font-semibold">
              Page {articlePage} / {Math.ceil(articleTotal / 50)}
            </span>
            <button
              disabled={articlePage >= Math.ceil(articleTotal / 50)}
              onClick={() => setArticlePage(p => p + 1)}
              className="rounded-lg bg-white/20 px-4 py-2 font-semibold disabled:opacity-30 hover:bg-white/30 transition cursor-pointer"
            >
              Next →
            </button>
          </div>
          )}
          </>)}
        </div>
        {renderGuideModal()}
      </div>
      </div>
    );
  }

  /* ═════════════════════════════════════════
     ANNOTATION
     ═════════════════════════════════════════ */

  const canGoPrev = currentParaIdx > 0;
  const canGoNext = currentParaIdx < paragraphs.length - 1;
  const currentArticleIndex = articles.findIndex(
    (article) => article.article_id === selectedArticleId
  );
  const hasNextArticle =
    currentArticleIndex >= 0 && currentArticleIndex < articles.length - 1;
  const canAdvance = canGoNext || hasNextArticle;

  const goNextPara = () => {
    if (canGoNext) {
      setCurrentParaIdx((i) => i + 1);
      return;
    }

    if (hasNextArticle) {
      goToArticle(articles[currentArticleIndex + 1]);
    }
  };
  const goPrevPara = () => {
    if (canGoPrev) setCurrentParaIdx((i) => i - 1);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-500 to-violet-500">
      <div className="app-container">
      <header className="text-white py-3">
        <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={goBack}
            className="rounded-lg bg-white/20 px-3 py-1 text-sm font-semibold hover:bg-white/30 transition cursor-pointer"
          >
            ← Exit
          </button>
          <h1 className="text-lg font-bold truncate max-w-md">
            {selectedArticleMeta?.title || "Annotation"}
          </h1>
        </div>
        <button
          onClick={signOut}
          className="rounded-lg bg-white/10 px-3 py-1 text-xs hover:bg-white/20 transition cursor-pointer"
        >
          Sign Out
        </button>
      </div></header>

      {paragraphs.length === 0 && selectedArticleId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="rounded-2xl bg-white/10 backdrop-blur-lg p-8 flex flex-col items-center gap-4 shadow-xl">
            <svg className="animate-spin h-10 w-10 text-white" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <p className="text-white text-lg font-semibold">Loading…</p>
          </div>
        </div>
      ) : (
      <>
      {/* article meta */}
      {selectedArticleMeta && (
        <div className="mb-4">
          <div className="rounded-xl bg-white/10 px-5 py-3 text-white">
            <div className="text-sm font-semibold">
              {selectedArticleMeta.publisher || "N/A"} ·{" "}
              {selectedArticleMeta.author || "N/A"} ·{" "}
              {selectedArticleMeta.publish_datetime || "N/A"}
            </div>
            {selectedArticleMeta.source && (
              <a
                href={selectedArticleMeta.source}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-white/60 hover:text-white/90 underline mt-1 inline-block"
              >
                {selectedArticleMeta.source}
              </a>
            )}
          </div>
        </div>
      )}

      {/* paragraph navigation */}
      <div className="mb-3">
        <div className="flex items-center justify-between rounded-xl bg-white/10 px-4 py-2 text-white text-sm">
          <div className="flex items-center gap-2">
            <button
              disabled={!canGoPrev}
              onClick={goPrevPara}
              className="rounded-lg bg-white/20 px-3 py-1 font-semibold disabled:opacity-30 hover:bg-white/30 transition cursor-pointer"
            >
              ← Prev
            </button>
            <span className="font-semibold">
              P {currentParaIdx + 1}/{paragraphs.length}
              <span className="text-white/50 ml-1">
                · A {currentArticleIndex + 1}/{articles.length}
              </span>
            </span>
            <button
              disabled={!canAdvance}
              onClick={goNextPara}
              className="rounded-lg bg-white/20 px-3 py-1 font-semibold disabled:opacity-30 hover:bg-white/30 transition cursor-pointer"
            >
              {canGoNext ? "Next →" : hasNextArticle ? "Next Article →" : "Done"}
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={toggleAuditLog}
              disabled={loadingAuditLog}
              className="rounded-lg bg-white/20 px-3 py-1 text-xs font-semibold hover:bg-white/30 transition cursor-pointer disabled:opacity-50"
            >
              {loadingAuditLog ? "Loading…" : showAuditLog ? "Hide Log" : "Log"}
            </button>
            <button
              onClick={() => setShowGuide(true)}
              className="rounded-lg bg-white/20 px-3 py-1 text-xs font-semibold hover:bg-white/30 transition cursor-pointer"
            >
              Guide
            </button>
          </div>
        </div>
      </div>

      {/* paragraph dots */}
      <div className="mb-3 flex gap-1.5 justify-center flex-wrap">
        {paragraphs.map((p, i) => (
          <button
            key={p.id}
            onClick={() => setCurrentParaIdx(i)}
            className={`w-3 h-3 rounded-full transition cursor-pointer ${
              i === currentParaIdx
                ? "ring-2 ring-white scale-125"
                : p.status === "completed" || p.no_aspect
                ? "bg-emerald-400"
                : p.status === "in_progress"
                ? "bg-amber-400"
                : "bg-white/30"
            }`}
            title={`Para ${i + 1}: ${p.status}${p.no_aspect ? " (no aspect)" : ""}`}
          />
        ))}
      </div>

      {/* progress bar */}
      <div className="mb-3">
        <div className="rounded-xl bg-white/10 px-4 py-2 text-white text-sm flex items-center justify-between">
          <span className="font-semibold">
            Article {currentArticleIndex + 1}/{articles.length}
          </span>
          <div className="flex gap-3 text-xs">
            <span className="text-emerald-300">
              ✓ {paragraphs.filter(p => p.status === "completed").length} annotated
            </span>
            <span className="text-amber-300">
              ⊘ {paragraphs.filter(p => p.no_aspect).length} no aspect
            </span>
            <span className="text-white/50">
              {paragraphs.filter(p => p.status !== "completed" && !p.no_aspect).length} left
            </span>
          </div>
        </div>
      </div>

      {/* search bar */}
      <div className="mb-3">
        <div className="flex gap-2">
          <input
            className="flex-1 rounded-lg bg-white/10 px-3 py-1.5 text-sm text-white placeholder-white/40 border border-white/20 outline-none focus:border-white/50"
            placeholder="Search article # or ID / paragraph ID…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleSearch(); }}
          />
          <button
            onClick={handleSearch}
            className="rounded-lg bg-white/20 px-3 py-1 text-sm font-semibold text-white hover:bg-white/30 transition cursor-pointer"
          >
            Go
          </button>
        </div>
      </div>

      {/* text area */}
      <div className="mb-3">
        <div className="rounded-xl bg-white p-5 shadow-lg">
          {isEditingText ? (
            <textarea
              className="h-40 w-full rounded-lg border border-indigo-200 p-3 text-base"
              value={textDraft}
              onChange={(e) => setTextDraft(e.target.value)}
            />
          ) : (
            <div
              ref={textRef}
              className="whitespace-pre-wrap text-lg leading-8 text-slate-800"
              onMouseUp={handleTextSelection}
            >
              {renderHighlightedText()}
            </div>
          )}
        </div>
      </div>

      {/* action buttons */}
      <div className="mb-3 flex flex-wrap gap-2">
        <button
          onClick={() => {
            if (isEditingText) setIsEditingText(false);
            else {
              setIsEditingText(true);
              setTextDraft(currentParagraph.paragraph_text || "");
            }
          }}
          className="rounded-lg bg-white/20 px-4 py-2 text-sm font-semibold text-white hover:bg-white/30 transition cursor-pointer"
        >
          {isEditingText ? "Done" : "Edit Text"}
        </button>
        {profile?.can_edit && (
          <>
            <button
              onClick={markNoAspects}
              className="rounded-lg bg-amber-500/80 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-500 transition cursor-pointer"
            >
              {currentParagraph.no_aspect ? "Undo No Aspect" : "No Aspect ↪"}
            </button>
            <button
              onClick={toggleChecked}
              className={`rounded-lg px-4 py-2 text-sm font-semibold text-white transition cursor-pointer ${
                currentParagraph.checked
                  ? "bg-cyan-600 hover:bg-cyan-500"
                  : "bg-cyan-400 hover:bg-cyan-500"
              }`}
            >
              {currentParagraph.checked ? "Unchecked" : "Checked"}
            </button>
            {canAdvance && (
              <button
                onClick={goNextPara}
                className="rounded-lg bg-emerald-500/80 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-600 transition cursor-pointer"
              >
                {canGoNext ? "Next →" : "Next Article →"}
              </button>
            )}
          </>
        )}
        {profile?.can_edit && (
          <button
            onClick={() =>
              setDeleteConfirm({
                type: "paragraph",
                id: currentParagraph.id,
                name: `Paragraph ${currentParaIdx + 1}`,
              })
            }
            className="rounded-lg bg-rose-500/60 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-500 transition cursor-pointer"
          >
            Delete Para
          </button>
        )}
      </div>

      {/* audit log panel */}
      {showAuditLog && (
        <div className="mb-4">
          <div className="rounded-xl bg-white/10 p-4 text-white text-sm">
            <h3 className="font-semibold mb-2">Annotation Log</h3>
            {auditLogs.length === 0 && (
              <p className="text-white/60">No logs for this paragraph.</p>
            )}
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {auditLogs.map((log) => (
                <div
                  key={log.id}
                  className="rounded-lg bg-white/10 px-3 py-2 flex items-start gap-2"
                >
                  <span
                    className={`shrink-0 rounded px-1.5 py-0.5 text-xs font-bold ${
                      log.action === "create"
                        ? "bg-emerald-500/40"
                        : log.action === "update"
                        ? "bg-amber-500/40"
                        : log.action === "delete"
                        ? "bg-rose-500/40"
                        : "bg-cyan-500/40"
                    }`}
                  >
                    {log.action}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-white/80 truncate">
                      by {log.actor_id?.slice(0, 8) || "system"}
                    </p>
                    {log.action === "update" && (
                      <p className="text-xs text-white/60 mt-0.5">
                        {log.old_data?.aspect || "?"} →{" "}
                        {log.new_data?.aspect || "?"}
                        {log.old_data?.sentiment !== log.new_data?.sentiment &&
                          ` · ${log.old_data?.sentiment || "?"} → ${log.new_data?.sentiment || "?"}`}
                      </p>
                    )}
                  </div>
                  <span className="shrink-0 text-xs text-white/40">
                    {new Date(log.created_at).toLocaleTimeString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* labels list */}
      <div className="pb-8">
        <div className="rounded-xl bg-white p-5 shadow-lg">
          <h2 className="mb-3 text-base font-semibold text-slate-700">
            Labels ({currentAnnotations.length})
          </h2>
          {annotationLoading && (
            <p className="text-sm text-slate-400 animate-pulse">
              Loading annotations…
            </p>
          )}
          {!annotationLoading &&
            currentAnnotations.length === 0 &&
            !currentParagraph.no_aspect && (
            <p className="text-sm text-slate-400">
              Select text to add labels.
            </p>
          )}
          {currentParagraph.no_aspect && (
            <p className="text-sm text-emerald-600">
              No aspects in this paragraph.
            </p>
          )}
          <ul className="space-y-2">
            {currentAnnotations.map((lbl) => (
              <li
                key={lbl.id}
                className="flex items-start justify-between rounded-lg border bg-white px-3 py-2 shadow-sm"
              >
                <div className="text-sm flex flex-col gap-0.5">
                  <span className="font-semibold text-slate-800">
                    “{lbl.span}”
                  </span>
                  <span className="text-slate-500">
                    {lbl.aspect} / {lbl.attribute}
                  </span>
                  <span
                    className={`font-semibold ${
                      lbl.sentiment === "POSITIVE"
                        ? "text-emerald-600"
                        : lbl.sentiment === "NEGATIVE"
                        ? "text-rose-600"
                        : "text-amber-600"
                    }`}
                  >
                    {lbl.sentiment}
                  </span>
                </div>
                {profile?.can_edit && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => editLabel(lbl)}
                      className="rounded-lg bg-indigo-100 px-3 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-200 transition cursor-pointer"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => removeLabel(lbl.id)}
                      className="rounded-lg bg-rose-100 px-3 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-200 transition cursor-pointer"
                    >
                      Remove
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* ══════════════════════════════════════
         GUIDE MODAL
         ══════════════════════════════════════ */}

      {renderGuideModal()}

      </>)}
      {/* ══════════════════════════════════════
         LABEL MODAL (with span handles + add options)
         ══════════════════════════════════════ */}

      {showLabelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-4 text-lg font-semibold text-slate-700">
              {editingLabelId ? "Edit Label" : "Add Label"}
            </div>

            {/* span editor with handles */}
            <div className="mb-4">
              <div className="mb-1 text-xs font-semibold uppercase text-slate-400">
                Span — drag the blue handles to adjust
              </div>
              <div
                ref={modalTextRef}
                className="select-none whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-3 text-base leading-8 text-slate-800"
              >
                {(() => {
                  const txt = currentParagraph.paragraph_text || "";
                  const s = selection?.start ?? 0;
                  const e = selection?.end ?? txt.length;
                  return (
                    <>
                      <span>{txt.slice(0, s)}</span>
                      <span className="relative inline bg-indigo-100 rounded px-0.5">
                        <span
                          className="absolute -left-1 top-0 bottom-0 w-2 rounded bg-indigo-500/80 cursor-col-resize"
                          onMouseDown={startHandleDrag("start")}
                          title="Drag to adjust start"
                        />
                        {txt.slice(s, e)}
                        <span
                          className="absolute -right-1 top-0 bottom-0 w-2 rounded bg-indigo-500/80 cursor-col-resize"
                          onMouseDown={startHandleDrag("end")}
                          title="Drag to adjust end"
                        />
                      </span>
                      <span>{txt.slice(e)}</span>
                    </>
                  );
                })()}
              </div>
              <div className="flex gap-4 mt-2 text-xs text-slate-400">
                <span>
                  Start: <strong>{selection?.start ?? 0}</strong>
                </span>
                <span>
                  End: <strong>{selection?.end ?? 0}</strong>
                </span>
                <span>
                  Text: "<strong className="text-slate-600">
                    {selection?.text || ""}
                  </strong>"
                </span>
              </div>
            </div>

            {/* aspect */}
            <div className="mb-4">
              <div className="mb-2">
                <span className="text-xs font-semibold uppercase text-slate-400">
                  Aspect
                </span>
              </div>
              <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                {(config?.aspects || []).map((a) => (
                  <button
                    key={a}
                    onClick={() => setSelectedAspect(a)}
                    className={`rounded-full border px-3 py-1 text-xs font-semibold transition cursor-pointer ${
                      selectedAspect === a
                        ? "bg-indigo-500 text-white shadow ring-2 ring-amber-400/70"
                        : "bg-white text-slate-700 border-slate-200 hover:bg-slate-200"
                    }`}
                  >
                    {a}
                  </button>
                ))}
              </div>
            </div>

            {/* attribute */}
            <div className="mb-4">
              <div className="mb-2">
                <span className="text-xs font-semibold uppercase text-slate-400">
                  Attribute
                </span>
              </div>
              <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                {(availableAttributes || []).map((at) => (
                  <button
                    key={at}
                    onClick={() => setSelectedAttribute(at)}
                    className={`rounded-full border px-3 py-1 text-xs font-semibold transition cursor-pointer ${
                      selectedAttribute === at
                        ? "bg-indigo-500 text-white shadow ring-2 ring-amber-400/70"
                        : "bg-white text-slate-700 border-slate-200 hover:bg-slate-200"
                    }`}
                  >
                    {at}
                  </button>
                ))}
              </div>
            </div>

            {/* sentiment */}
            <div className="mb-4">
              <div className="mb-2">
                <span className="text-xs font-semibold uppercase text-slate-400">
                  Sentiment
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {(config?.sentiments || []).map((s) => {
                  const colors = {
                    POSITIVE: "bg-emerald-500",
                    NEGATIVE: "bg-rose-500",
                    NEUTRAL: "bg-amber-400",
                  };
                  return (
                    <button
                      key={s}
                      onClick={() => setSelectedSentiment(s)}
                      className={`rounded-full border px-3 py-1 text-xs font-semibold transition cursor-pointer ${
                        selectedSentiment === s
                          ? `${colors[s] || "bg-slate-100"} text-white shadow ring-2 ring-amber-400/70`
                          : "bg-white text-slate-700 border-slate-200 hover:bg-slate-200"
                      }`}
                    >
                      {s}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowLabelModal(false)}
                className="rounded-lg bg-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-300 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={confirmLabel}
                className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-600 transition cursor-pointer"
              >
                {editingLabelId ? "Save" : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}

      {renderDeleteConfirmModal()}
      </div>
      </div>
  );
}

export default App;
