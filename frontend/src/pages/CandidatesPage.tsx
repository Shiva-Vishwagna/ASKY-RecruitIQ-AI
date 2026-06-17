import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

interface Candidate {
  _id: string; name: string; email: string;
  jobTitle?: string; jobDepartment?: string; appliedFor?: string;
  score?: number; aiScore?: number; tier: string; riskLevel: string;
  appliedAt?: string; createdAt?: string; updatedAt?: string; status?: string;
  summary?: string; topSkills?: string[]; skills?: string[];
  strengths?: string[]; gaps?: string[];
  domain?: string; seniority?: string; experienceYears?: number;
  technicalExperience?: string; leadershipExperience?: string; cloudExpertise?: string;
  recommendation?: string; phone?: string;
}

const tierColors: Record<string, string> = {
  A: "bg-emerald-100 text-emerald-700 border-emerald-200",
  B: "bg-blue-100 text-blue-700 border-blue-200",
  C: "bg-amber-100 text-amber-700 border-amber-200",
};

const STATUSES = [
  { value: "cv_uploaded",       label: "CV Uploaded",       color: "bg-gray-100 text-gray-600" },
  { value: "ai_screened",       label: "AI Screened",       color: "bg-blue-100 text-blue-700" },
  { value: "questions_sent",    label: "Questions Sent",    color: "bg-purple-100 text-purple-700" },
  { value: "answers_submitted", label: "Answers Submitted", color: "bg-amber-100 text-amber-700" },
  { value: "hm_ready",          label: "HM Ready",          color: "bg-emerald-100 text-emerald-700" },
  { value: "rejected",          label: "Rejected",          color: "bg-red-100 text-red-700" },
];

function getDaysInStage(candidate: Candidate): number {
  const date = new Date(candidate.updatedAt || candidate.createdAt || candidate.appliedAt || 0);
  return Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
}

function getSLABadge(days: number, status?: string) {
  if (status === "rejected" || status === "hm_ready") return null;
  if (days >= 7) return { label: `${days}d 🔴`, cls: "bg-red-100 text-red-700 border border-red-200", tip: "Urgent: Stuck 7+ days" };
  if (days >= 5) return { label: `${days}d 🟡`, cls: "bg-amber-100 text-amber-700 border border-amber-200", tip: "Warning: Stuck 5+ days" };
  if (days >= 3) return { label: `${days}d`, cls: "bg-blue-50 text-blue-500 border border-blue-100", tip: `${days} days in this stage` };
  return null;
}

// ── Quick Preview Panel ───────────────────────────────────────
function QuickPreviewPanel({
  candidate, onClose, onViewFull, onStatusChange
}: {
  candidate: Candidate;
  onClose: () => void;
  onViewFull: () => void;
  onStatusChange: (id: string, status: string) => void;
}) {
  const score = candidate.aiScore || candidate.score || 0;
  const tierKey = candidate.tier?.replace(/-?Tier$/i, "");
  const allSkills = candidate.topSkills || candidate.skills || [];
  const days = getDaysInStage(candidate);
  const slaBadge = getSLABadge(days, candidate.status);
  const currentStatus = STATUSES.find(s => s.value === (candidate.status || "cv_uploaded")) || STATUSES[0];
  const currentStatusIdx = STATUSES.findIndex(s => s.value === (candidate.status || "cv_uploaded"));

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />

      {/* Panel */}
      <div className="fixed right-0 top-0 h-full w-full max-w-md bg-white shadow-2xl z-50 flex flex-col overflow-hidden">
        {/* Panel Header */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-5 py-4 text-white shrink-0">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold opacity-70 uppercase tracking-wide">Quick Preview</span>
            <button onClick={onClose} className="text-white/70 hover:text-white text-xl font-bold">✕</button>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center text-white text-xl font-bold shrink-0">
              {candidate.name?.charAt(0)?.toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="font-bold text-lg leading-tight truncate">{candidate.name}</h2>
              <p className="text-blue-200 text-xs truncate">{candidate.email}</p>
              {candidate.phone && <p className="text-blue-200 text-xs">{candidate.phone}</p>}
            </div>
            <div className="text-right shrink-0">
              <div className="text-3xl font-black">{score}</div>
              <div className="text-blue-200 text-xs">/100</div>
            </div>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">

          {/* Key Info Row */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-gray-50 rounded-xl p-3 text-center">
              <div className={`text-xs font-bold px-2 py-1 rounded-full inline-block mb-1 ${tierColors[tierKey] || "bg-gray-100 text-gray-600"}`}>
                {tierKey}-Tier
              </div>
              <div className="text-xs text-gray-500">Tier</div>
            </div>
            <div className="bg-gray-50 rounded-xl p-3 text-center">
              <div className={`text-xs font-semibold px-2 py-1 rounded-full inline-block mb-1 capitalize ${candidate.riskLevel === "low" ? "bg-green-100 text-green-700" : candidate.riskLevel === "high" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
                {candidate.riskLevel || "medium"}
              </div>
              <div className="text-xs text-gray-500">Risk</div>
            </div>
            <div className="bg-gray-50 rounded-xl p-3 text-center">
              {slaBadge ? (
                <div className={`text-xs font-bold px-2 py-1 rounded-full inline-block mb-1 ${slaBadge.cls}`}>{slaBadge.label}</div>
              ) : (
                <div className="text-xs font-semibold text-gray-600 mb-1">{days}d</div>
              )}
              <div className="text-xs text-gray-500">In Stage</div>
            </div>
          </div>

          {/* Applied For */}
          <div className="bg-blue-50 rounded-xl p-3 border border-blue-100">
            <div className="text-xs text-blue-500 font-semibold uppercase tracking-wide mb-1">Applied For</div>
            <div className="font-bold text-gray-900">{candidate.jobTitle || candidate.appliedFor || "—"}</div>
            {candidate.jobDepartment && <div className="text-xs text-gray-500 mt-0.5">{candidate.jobDepartment}</div>}
          </div>

          {/* Pipeline Progress */}
          <div>
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Pipeline Stage</div>
            <div className="flex gap-1 mb-2">
              {STATUSES.map((s, i) => (
                <div key={s.value} title={s.label}
                  className={`flex-1 h-2 rounded-full transition-all ${i <= currentStatusIdx ? "bg-blue-500" : "bg-gray-100"}`} />
              ))}
            </div>
            <div className="flex items-center justify-between">
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${currentStatus.color}`}>{currentStatus.label}</span>
              <select value={candidate.status || "cv_uploaded"}
                onChange={e => onStatusChange(candidate._id, e.target.value)}
                className="text-xs border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                onClick={e => e.stopPropagation()}>
                {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
          </div>

          {/* Score Bar */}
          <div>
            <div className="flex justify-between text-xs font-semibold mb-1">
              <span className="text-gray-500 uppercase tracking-wide">AI Score</span>
              <span className={score >= 80 ? "text-emerald-600" : score >= 60 ? "text-blue-600" : "text-amber-600"}>{score >= 80 ? "🌟 Excellent" : score >= 60 ? "👍 Good" : "🔍 Needs Review"}</span>
            </div>
            <div className="h-3 bg-gray-100 rounded-full">
              <div className={`h-3 rounded-full transition-all ${score >= 80 ? "bg-emerald-500" : score >= 60 ? "bg-blue-500" : "bg-amber-500"}`}
                style={{ width: `${score}%` }} />
            </div>
          </div>

          {/* Candidate Details */}
          {(candidate.domain || candidate.seniority || candidate.experienceYears) && (
            <div className="grid grid-cols-3 gap-3">
              {candidate.domain && (
                <div className="text-center">
                  <div className="text-sm font-bold text-gray-900">{candidate.domain}</div>
                  <div className="text-xs text-gray-500">Domain</div>
                </div>
              )}
              {candidate.seniority && (
                <div className="text-center">
                  <div className="text-sm font-bold text-gray-900">{candidate.seniority}</div>
                  <div className="text-xs text-gray-500">Level</div>
                </div>
              )}
              {candidate.experienceYears && (
                <div className="text-center">
                  <div className="text-sm font-bold text-gray-900">{candidate.experienceYears}y</div>
                  <div className="text-xs text-gray-500">Experience</div>
                </div>
              )}
            </div>
          )}

          {/* AI Summary */}
          {candidate.summary && (
            <div>
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">AI Summary</div>
              <p className="text-sm text-gray-600 leading-relaxed bg-gray-50 rounded-xl p-3">{candidate.summary}</p>
            </div>
          )}

          {/* Skills */}
          {allSkills.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Top Skills</div>
              <div className="flex flex-wrap gap-1.5">
                {allSkills.slice(0, 8).map(s => (
                  <span key={s} className="bg-blue-50 text-blue-700 text-xs font-medium px-2.5 py-1 rounded-full border border-blue-100">{s}</span>
                ))}
                {allSkills.length > 8 && <span className="text-xs text-gray-400 px-2 py-1">+{allSkills.length - 8} more</span>}
              </div>
            </div>
          )}

          {/* Strengths & Gaps */}
          {((candidate.strengths?.length ?? 0) > 0 || (candidate.gaps?.length ?? 0) > 0) && (
            <div className="grid grid-cols-2 gap-3">
              {(candidate.strengths?.length ?? 0) > 0 && (
                <div className="bg-emerald-50 rounded-xl p-3 border border-emerald-100">
                  <div className="text-xs font-bold text-emerald-700 mb-2">✅ Strengths</div>
                  {candidate.strengths!.slice(0, 3).map((s, i) => (
                    <div key={i} className="text-xs text-gray-600 mb-1">• {s}</div>
                  ))}
                  {(candidate.strengths!.length > 3) && <div className="text-xs text-gray-400">+{candidate.strengths!.length - 3} more</div>}
                </div>
              )}
              {(candidate.gaps?.length ?? 0) > 0 && (
                <div className="bg-amber-50 rounded-xl p-3 border border-amber-100">
                  <div className="text-xs font-bold text-amber-700 mb-2">⚠️ Gaps</div>
                  {candidate.gaps!.slice(0, 3).map((g, i) => (
                    <div key={i} className="text-xs text-gray-600 mb-1">• {g}</div>
                  ))}
                  {(candidate.gaps!.length > 3) && <div className="text-xs text-gray-400">+{candidate.gaps!.length - 3} more</div>}
                </div>
              )}
            </div>
          )}

          {/* Recommendation */}
          {candidate.recommendation && (
            <div className={`rounded-xl p-3 border text-center ${
              candidate.recommendation === "Strong Hire" ? "bg-emerald-50 border-emerald-200" :
              candidate.recommendation === "Hire" ? "bg-blue-50 border-blue-200" :
              candidate.recommendation === "Maybe" ? "bg-amber-50 border-amber-200" :
              "bg-red-50 border-red-200"}`}>
              <div className="text-xs text-gray-500 mb-1">AI Recommendation</div>
              <div className={`font-bold text-sm ${
                candidate.recommendation === "Strong Hire" ? "text-emerald-700" :
                candidate.recommendation === "Hire" ? "text-blue-700" :
                candidate.recommendation === "Maybe" ? "text-amber-700" : "text-red-700"}`}>
                {candidate.recommendation}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-gray-100 bg-gray-50 shrink-0">
          <button onClick={onViewFull}
            className="w-full bg-blue-600 text-white py-2.5 rounded-xl font-bold hover:bg-blue-700 transition-all text-sm">
            View Full Profile →
          </button>
        </div>
      </div>
    </>
  );
}

// ── Main Candidates Page ──────────────────────────────────────
export default function CandidatesPage() {
  const navigate = useNavigate();
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [previewCandidate, setPreviewCandidate] = useState<Candidate | null>(null);

  const [search, setSearch]             = useState("");
  const [jobFilter, setJobFilter]       = useState("all");
  const [tierFilter, setTierFilter]     = useState("all");
  const [riskFilter, setRiskFilter]     = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [scoreMin, setScoreMin]         = useState(0);
  const [scoreMax, setScoreMax]         = useState(100);
  const [dateFrom, setDateFrom]         = useState("");
  const [dateTo, setDateTo]             = useState("");
  const [sortBy, setSortBy]             = useState("score-desc");
  const [slaFilter, setSlaFilter]       = useState("all");
  const [selectedIds, setSelectedIds]   = useState<Set<string>>(new Set());
  const [bulkStatus, setBulkStatus]     = useState("");
  const [bulkLoading, setBulkLoading]   = useState(false);

  const API   = "https://asky-recruitiq-ai.onrender.com/api";
  const token = localStorage.getItem("token");
  const user  = JSON.parse(localStorage.getItem("user") || "{}");
  const isAdmin = user.role === "admin";

  useEffect(() => {
    fetchCandidates();
    const iv = setInterval(fetchCandidates, 15000);
    return () => clearInterval(iv);
  }, []);

  async function fetchCandidates() {
    try {
      const res = await fetch(`${API}/candidates`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      setCandidates(data.candidates || data || []);
    } catch { setCandidates([]); }
    finally { setLoading(false); }
  }

  async function updateStatus(candidateId: string, newStatus: string) {
    await fetch(`${API}/candidates/${candidateId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status: newStatus }),
    });
    setCandidates(prev => prev.map(c => c._id === candidateId ? { ...c, status: newStatus } : c));
    if (previewCandidate?._id === candidateId) {
      setPreviewCandidate(prev => prev ? { ...prev, status: newStatus } : null);
    }
  }

  async function handleDelete(candidateId: string, name: string) {
    if (!window.confirm(`Delete ${name}?`)) return;
    await fetch(`${API}/candidates/${candidateId}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
    setCandidates(prev => prev.filter(c => c._id !== candidateId));
    if (previewCandidate?._id === candidateId) setPreviewCandidate(null);
  }

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map(c => c._id)));
    }
  }

  async function applyBulkStatus() {
    if (!bulkStatus || selectedIds.size === 0) return;
    if (!window.confirm(`Move ${selectedIds.size} candidate(s) to "${STATUSES.find(s => s.value === bulkStatus)?.label}"?`)) return;
    setBulkLoading(true);
    await Promise.all([...selectedIds].map(id => updateStatus(id, bulkStatus)));
    setSelectedIds(new Set());
    setBulkStatus("");
    setBulkLoading(false);
  }

  async function bulkDelete() {
    if (!isAdmin || selectedIds.size === 0) return;
    if (!window.confirm(`Delete ${selectedIds.size} candidate(s)? This cannot be undone.`)) return;
    setBulkLoading(true);
    await Promise.all([...selectedIds].map(id =>
      fetch(`${API}/candidates/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } })
    ));
    setCandidates(prev => prev.filter(c => !selectedIds.has(c._id)));
    setSelectedIds(new Set());
    setBulkLoading(false);
  }

  function exportCSV() {
    const headers = ["Name", "Email", "Applied For", "Department", "Score", "Tier", "Risk", "Status", "Days in Stage", "Date"];
    const rows = filtered.map(c => [
      c.name, c.email,
      c.jobTitle || c.appliedFor || "—",
      c.jobDepartment || "—",
      (c.aiScore||c.score||0),
      c.tier?.replace(/-?Tier$/i,""),
      c.riskLevel,
      c.status || "cv_uploaded",
      getDaysInStage(c),
      (c.createdAt||c.appliedAt) ? new Date(c.createdAt||c.appliedAt!).toLocaleDateString() : "—"
    ]);
    const csv = [headers, ...rows].map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "candidates.csv"; a.click();
  }

  function resetFilters() {
    setSearch(""); setJobFilter("all"); setTierFilter("all");
    setRiskFilter("all"); setStatusFilter("all");
    setScoreMin(0); setScoreMax(100);
    setDateFrom(""); setDateTo(""); setSortBy("score-desc"); setSlaFilter("all");
  }

  const uniqueJobs = Array.from(new Set(
    candidates.map(c => c.jobTitle || c.appliedFor || "").filter(Boolean)
  )).sort();

  const filtered = candidates
    .filter(c => {
      const s = (c.aiScore||c.score||0);
      const appliedFor = c.jobTitle || c.appliedFor || "";
      const dateStr = c.createdAt || c.appliedAt || "";
      const days = getDaysInStage(c);
      const matchSearch   = c.name?.toLowerCase().includes(search.toLowerCase()) || c.email?.toLowerCase().includes(search.toLowerCase());
      const matchJob      = jobFilter === "all" || appliedFor === jobFilter;
      const matchTier     = tierFilter === "all" || c.tier?.replace(/-?Tier$/i,"") === tierFilter;
      const matchRisk     = riskFilter === "all" || c.riskLevel === riskFilter;
      const matchStatus   = statusFilter === "all" || (c.status || "cv_uploaded") === statusFilter;
      const matchScore    = s >= scoreMin && s <= scoreMax;
      const matchDateFrom = !dateFrom || (dateStr && new Date(dateStr) >= new Date(dateFrom));
      const matchDateTo   = !dateTo   || (dateStr && new Date(dateStr) <= new Date(dateTo + "T23:59:59"));
      const matchSLA      = slaFilter === "all" ? true
        : slaFilter === "stuck7" ? (days >= 7 && c.status !== "rejected" && c.status !== "hm_ready")
        : slaFilter === "stuck5" ? (days >= 5 && c.status !== "rejected" && c.status !== "hm_ready")
        : true;
      return matchSearch && matchJob && matchTier && matchRisk && matchStatus && matchScore && matchDateFrom && matchDateTo && matchSLA;
    })
    .sort((a, b) => {
      if (sortBy === "score-desc") return (b.aiScore||b.score||0) - (a.aiScore||a.score||0);
      if (sortBy === "score-asc")  return (a.aiScore||a.score||0) - (b.aiScore||b.score||0);
      if (sortBy === "name")       return a.name?.localeCompare(b.name);
      if (sortBy === "date-desc")  return new Date(b.createdAt||b.appliedAt||0).getTime() - new Date(a.createdAt||a.appliedAt||0).getTime();
      if (sortBy === "date-asc")   return new Date(a.createdAt||a.appliedAt||0).getTime() - new Date(b.createdAt||b.appliedAt||0).getTime();
      if (sortBy === "sla-desc")   return getDaysInStage(b) - getDaysInStage(a);
      return 0;
    });

  const activeFilterCount = [
    search, jobFilter !== "all", tierFilter !== "all", riskFilter !== "all",
    statusFilter !== "all", scoreMin > 0, scoreMax < 100, dateFrom, dateTo, slaFilter !== "all"
  ].filter(Boolean).length;

  const getStatusInfo = (status?: string) => STATUSES.find(s => s.value === (status || "cv_uploaded")) || STATUSES[0];
  const stuck7Count = candidates.filter(c => getDaysInStage(c) >= 7 && c.status !== "rejected" && c.status !== "hm_ready").length;
  const stuck5Count = candidates.filter(c => getDaysInStage(c) >= 5 && c.status !== "rejected" && c.status !== "hm_ready").length;

  return (
    <div className="min-h-screen bg-gray-50 p-6">

      {/* Quick Preview Panel */}
      {previewCandidate && (
        <QuickPreviewPanel
          candidate={previewCandidate}
          onClose={() => setPreviewCandidate(null)}
          onViewFull={() => navigate(`/candidates/${previewCandidate._id}`)}
          onStatusChange={updateStatus}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">All Candidates</h1>
          <p className="text-gray-500 mt-1">{candidates.length} total · {filtered.length} shown</p>
        </div>
        <div className="flex gap-3">
          <button onClick={fetchCandidates} className="border border-gray-200 bg-white text-gray-700 px-4 py-2.5 rounded-xl font-semibold hover:bg-gray-50 text-sm">↻ Refresh</button>
          <button onClick={exportCSV} className="border border-gray-200 bg-white text-gray-700 px-4 py-2.5 rounded-xl font-semibold hover:bg-gray-50 text-sm">↓ Export CSV</button>
        </div>
      </div>

      {/* SLA Alert Bar */}
      {(stuck7Count > 0 || stuck5Count > 0) && (
        <div className="mb-4 flex gap-3 flex-wrap">
          {stuck7Count > 0 && (
            <button onClick={() => setSlaFilter("stuck7")}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-semibold transition-all ${slaFilter === "stuck7" ? "bg-red-600 text-white border-red-600" : "bg-red-50 text-red-700 border-red-200 hover:bg-red-100"}`}>
              🔴 {stuck7Count} stuck 7+ days — Urgent
            </button>
          )}
          {stuck5Count > 0 && (
            <button onClick={() => setSlaFilter("stuck5")}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-semibold transition-all ${slaFilter === "stuck5" ? "bg-amber-600 text-white border-amber-600" : "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100"}`}>
              🟡 {stuck5Count} stuck 5+ days — Review
            </button>
          )}
          {slaFilter !== "all" && (
            <button onClick={() => setSlaFilter("all")} className="text-sm text-gray-500 hover:text-gray-700 px-3 py-2">✕ Clear SLA filter</button>
          )}
        </div>
      )}

      {/* Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <div className="mb-4 bg-blue-600 text-white rounded-2xl px-5 py-3 flex items-center gap-4 flex-wrap shadow-lg">
          <span className="font-bold">{selectedIds.size} selected</span>
          <select value={bulkStatus} onChange={e => setBulkStatus(e.target.value)}
            className="bg-white text-gray-800 text-sm rounded-lg px-3 py-1.5 font-semibold focus:outline-none">
            <option value="">Move to stage...</option>
            {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <button onClick={applyBulkStatus} disabled={!bulkStatus || bulkLoading}
            className="bg-white text-blue-600 font-bold px-4 py-1.5 rounded-lg text-sm hover:bg-blue-50 disabled:opacity-50">
            {bulkLoading ? "Updating..." : "Apply"}
          </button>
          {isAdmin && (
            <button onClick={bulkDelete} disabled={bulkLoading}
              className="bg-red-500 text-white font-bold px-4 py-1.5 rounded-lg text-sm hover:bg-red-600 disabled:opacity-50">
              🗑 Delete Selected
            </button>
          )}
          <button onClick={() => setSelectedIds(new Set())} className="ml-auto text-blue-200 hover:text-white text-sm">✕ Cancel</button>
        </div>
      )}

      {/* Status pipeline bar */}
      <div className="bg-white rounded-2xl p-4 border border-gray-100 mb-4 flex gap-2 overflow-x-auto">
        <button onClick={() => setStatusFilter("all")}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${statusFilter === "all" ? "bg-slate-800 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
          All ({candidates.length})
        </button>
        {STATUSES.map(s => {
          const count = candidates.filter(c => (c.status || "cv_uploaded") === s.value).length;
          return (
            <button key={s.value} onClick={() => setStatusFilter(s.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${statusFilter === s.value ? "bg-slate-800 text-white" : `${s.color} hover:opacity-80`}`}>
              {s.label} ({count})
            </button>
          );
        })}
      </div>

      {/* Search + Filters */}
      <div className="bg-white rounded-2xl p-4 border border-gray-100 mb-4">
        <div className="flex gap-3 items-center flex-wrap">
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by name or email..."
            className="border border-gray-200 rounded-xl px-4 py-2 flex-1 min-w-48 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
          <select value={sortBy} onChange={e => setSortBy(e.target.value)}
            className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="score-desc">Score: High → Low</option>
            <option value="score-asc">Score: Low → High</option>
            <option value="name">Name A–Z</option>
            <option value="date-desc">Date: Newest</option>
            <option value="date-asc">Date: Oldest</option>
            <option value="sla-desc">Days in Stage: Most</option>
          </select>
          <button onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border transition-all ${showFilters ? "bg-blue-600 text-white border-blue-600" : "border-gray-200 text-gray-700 hover:bg-gray-50"}`}>
            🔽 Filters {activeFilterCount > 0 && <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${showFilters ? "bg-white text-blue-600" : "bg-blue-600 text-white"}`}>{activeFilterCount}</span>}
          </button>
          {activeFilterCount > 0 && (
            <button onClick={resetFilters} className="text-sm text-red-500 hover:text-red-700 font-medium px-2">✕ Clear</button>
          )}
          <span className="text-sm text-gray-400 ml-auto">{filtered.length} results</span>
        </div>

        {showFilters && (
          <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Applied For</label>
              <select value={jobFilter} onChange={e => setJobFilter(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="all">All Roles</option>
                {uniqueJobs.map(j => <option key={j} value={j}>{j}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Tier</label>
              <select value={tierFilter} onChange={e => setTierFilter(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="all">All Tiers</option>
                <option value="A">A-Tier</option><option value="B">B-Tier</option><option value="C">C-Tier</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Risk Level</label>
              <select value={riskFilter} onChange={e => setRiskFilter(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="all">All Risk</option>
                <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Status</label>
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="all">All Statuses</option>
                {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">SLA / Stuck</label>
              <select value={slaFilter} onChange={e => setSlaFilter(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="all">All</option>
                <option value="stuck5">Stuck 5+ days</option>
                <option value="stuck7">Stuck 7+ days (Urgent)</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">
                AI Score Range: <span className="text-blue-600">{scoreMin} – {scoreMax}</span>
              </label>
              <div className="flex items-center gap-3">
                <input type="range" min="0" max="100" value={scoreMin} onChange={e => setScoreMin(Number(e.target.value))} className="flex-1 accent-blue-600" />
                <span className="text-xs text-gray-400 w-6">{scoreMin}</span>
                <span className="text-xs text-gray-300">–</span>
                <input type="range" min="0" max="100" value={scoreMax} onChange={e => setScoreMax(Number(e.target.value))} className="flex-1 accent-blue-600" />
                <span className="text-xs text-gray-400 w-8">{scoreMax}</span>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Date From</label>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Date To</label>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-8 space-y-3">
          {[...Array(5)].map((_, i) => <div key={i} className="h-10 bg-gray-100 rounded-xl animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl p-16 border border-gray-100 text-center text-gray-400">
          <div className="text-5xl mb-4">👥</div>
          <p className="font-medium text-lg">No candidates match your filters</p>
          <button onClick={resetFilters} className="mt-3 text-blue-600 text-sm hover:underline">Clear all filters</button>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-4 py-3.5 w-8">
                  <input type="checkbox"
                    checked={selectedIds.size === filtered.length && filtered.length > 0}
                    onChange={toggleSelectAll}
                    className="rounded accent-blue-600 cursor-pointer" />
                </th>
                {["Candidate", "Applied For", "AI Score", "Tier", "Risk", "Status", "In Stage", "Date", ""].map(h => (
                  <th key={h} className="px-4 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map(c => {
                const score = c.aiScore || c.score || 0;
                const tierKey = c.tier?.replace(/-?Tier$/i, "");
                const statusInfo = getStatusInfo(c.status);
                const appliedFor = c.jobTitle || c.appliedFor || "—";
                const days = getDaysInStage(c);
                const slaBadge = getSLABadge(days, c.status);
                const isSelected = selectedIds.has(c._id);
                const isPreview = previewCandidate?._id === c._id;

                return (
                  <tr key={c._id}
                    className={`transition-colors ${isPreview ? "bg-blue-50 border-l-4 border-l-blue-500" : isSelected ? "bg-blue-50" : "hover:bg-gray-50"}`}>
                    <td className="px-4 py-3.5" onClick={e => e.stopPropagation()}>
                      <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(c._id)}
                        className="rounded accent-blue-600 cursor-pointer" />
                    </td>
                    {/* Candidate name — click opens preview */}
                    <td className="px-4 py-3.5 cursor-pointer" onClick={() => setPreviewCandidate(c)}>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
                          {c.name?.charAt(0)?.toUpperCase()}
                        </div>
                        <div>
                          <div className="font-semibold text-gray-900 text-sm hover:text-blue-600 transition-colors">{c.name}</div>
                          <div className="text-xs text-gray-500">{c.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 cursor-pointer" onClick={() => setPreviewCandidate(c)}>
                      <div className="text-sm font-medium text-gray-800">{appliedFor}</div>
                      {c.jobDepartment && <div className="text-xs text-gray-400">{c.jobDepartment}</div>}
                    </td>
                    <td className="px-4 py-3.5 cursor-pointer" onClick={() => setPreviewCandidate(c)}>
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-2 bg-gray-100 rounded-full">
                          <div className={`h-2 rounded-full ${score >= 80 ? "bg-emerald-500" : score >= 60 ? "bg-blue-500" : "bg-amber-500"}`} style={{ width: `${score}%` }} />
                        </div>
                        <span className="font-bold text-gray-900 text-sm">{score}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 cursor-pointer" onClick={() => setPreviewCandidate(c)}>
                      <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${tierColors[tierKey] || "bg-gray-100 text-gray-600 border-gray-200"}`}>
                        {tierKey}-Tier
                      </span>
                    </td>
                    <td className="px-4 py-3.5 cursor-pointer" onClick={() => setPreviewCandidate(c)}>
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full capitalize ${c.riskLevel === "low" ? "bg-green-100 text-green-700" : c.riskLevel === "high" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
                        {c.riskLevel || "medium"}
                      </span>
                    </td>
                    <td className="px-4 py-3.5" onClick={e => e.stopPropagation()}>
                      <select value={c.status || "cv_uploaded"} onChange={e => updateStatus(c._id, e.target.value)}
                        className={`text-xs font-semibold px-2.5 py-1.5 rounded-lg border-0 focus:ring-2 focus:ring-blue-500 cursor-pointer ${statusInfo.color}`}>
                        {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                      </select>
                    </td>
                    <td className="px-4 py-3.5 cursor-pointer" onClick={() => setPreviewCandidate(c)}>
                      {slaBadge ? (
                        <span title={slaBadge.tip} className={`text-xs font-bold px-2.5 py-1 rounded-full ${slaBadge.cls}`}>
                          {slaBadge.label}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">{days}d</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-sm text-gray-500 cursor-pointer" onClick={() => setPreviewCandidate(c)}>
                      {(c.createdAt||c.appliedAt) ? new Date(c.createdAt||c.appliedAt!).toLocaleDateString() : "—"}
                    </td>
                    <td className="px-4 py-3.5">
                      {isAdmin && (
                        <button onClick={e => { e.stopPropagation(); handleDelete(c._id, c.name); }}
                          className="text-red-400 hover:text-red-600 hover:bg-red-50 border border-red-200 rounded-md px-2 py-1 text-xs transition-colors">
                          🗑
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
