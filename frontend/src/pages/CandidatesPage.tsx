import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

interface Candidate {
  _id: string; name: string; email: string;
  jobTitle?: string; jobDepartment?: string; appliedFor?: string;
  score?: number; aiScore?: number; tier: string; riskLevel: string;
  appliedAt?: string; createdAt?: string; status?: string;
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

export default function CandidatesPage() {
  const navigate = useNavigate();
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [recruiterFilter, setRecruiterFilter] = useState("all");

  // Filters
  const [search, setSearch]           = useState("");
  const [jobFilter, setJobFilter]     = useState("all");
  const [tierFilter, setTierFilter]   = useState("all");
  const [riskFilter, setRiskFilter]   = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [scoreMin, setScoreMin]       = useState(0);
  const [scoreMax, setScoreMax]       = useState(100);
  const [dateFrom, setDateFrom]       = useState("");
  const [dateTo, setDateTo]           = useState("");
  const [sortBy, setSortBy]           = useState("score-desc");

  const API = "https://asky-recruitiq-ai.onrender.com/api";
  const token = localStorage.getItem("token");
  const user = JSON.parse(localStorage.getItem("user") || "{}");
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
  }

  async function handleDelete(candidateId: string, name: string) {
    if (!window.confirm(`Delete ${name}?`)) return;
    await fetch(`${API}/candidates/${candidateId}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
    setCandidates(prev => prev.filter(c => c._id !== candidateId));
  }

  function exportCSV() {
    const headers = ["Name", "Email", "Applied For", "Department", "Score", "Tier", "Risk", "Status", "Date"];
    const rows = filtered.map(c => [
      c.name, c.email,
      c.jobTitle || c.appliedFor || "—",
      c.jobDepartment || "—",
      (c.aiScore||c.score||0),
      c.tier?.replace(/-?Tier$/i,""),
      c.riskLevel,
      c.status || "cv_uploaded",
      (c.createdAt||c.appliedAt) ? new Date(c.createdAt||c.appliedAt).toLocaleDateString() : "—"
    ]);
    const csv = [headers, ...rows].map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = "candidates.csv"; a.click();
  }

  function resetFilters() {
    setSearch(""); setJobFilter("all"); setTierFilter("all");
    setRiskFilter("all"); setStatusFilter("all");
    setScoreMin(0); setScoreMax(100);
    setDateFrom(""); setDateTo(""); setSortBy("score-desc");
  }

  // Unique job list for filter dropdown
  const uniqueJobs = Array.from(new Set(
    candidates.map(c => c.jobTitle || c.appliedFor || "").filter(Boolean)
  )).sort();

  const filtered = candidates
    .filter(c => {
      const s = (c.aiScore||c.score||0);
      const appliedFor = c.jobTitle || c.appliedFor || "";
      const dateStr = c.createdAt || c.appliedAt || "";
      const matchSearch  = c.name?.toLowerCase().includes(search.toLowerCase()) || c.email?.toLowerCase().includes(search.toLowerCase());
      const matchJob     = jobFilter === "all" || appliedFor === jobFilter;
      const matchTier    = tierFilter === "all" || c.tier?.replace(/-?Tier$/i,"") === tierFilter;
      const matchRisk    = riskFilter === "all" || c.riskLevel === riskFilter;
      const matchStatus  = statusFilter === "all" || (c.status || "cv_uploaded") === statusFilter;
      const matchScore   = s >= scoreMin && s <= scoreMax;
      const matchDateFrom = !dateFrom || (dateStr && new Date(dateStr) >= new Date(dateFrom));
      const matchDateTo   = !dateTo   || (dateStr && new Date(dateStr) <= new Date(dateTo + "T23:59:59"));
      return matchSearch && matchJob && matchTier && matchRisk && matchStatus && matchScore && matchDateFrom && matchDateTo;
    })
    .sort((a, b) => {
      if (sortBy === "score-desc") return (b.aiScore||b.score||0) - (a.aiScore||a.score||0);
      if (sortBy === "score-asc")  return (a.aiScore||a.score||0) - (b.aiScore||b.score||0);
      if (sortBy === "name")       return a.name?.localeCompare(b.name);
      if (sortBy === "date-desc")  return new Date(b.createdAt||b.appliedAt||0).getTime() - new Date(a.createdAt||a.appliedAt||0).getTime();
      if (sortBy === "date-asc")   return new Date(a.createdAt||a.appliedAt||0).getTime() - new Date(b.createdAt||b.appliedAt||0).getTime();
      return 0;
    });

  const activeFilterCount = [
    search, jobFilter !== "all", tierFilter !== "all", riskFilter !== "all",
    statusFilter !== "all", scoreMin > 0, scoreMax < 100, dateFrom, dateTo
  ].filter(Boolean).length;

  const getStatusInfo = (status?: string) => STATUSES.find(s => s.value === (status || "cv_uploaded")) || STATUSES[0];

  return (
    <div className="min-h-screen bg-gray-50 p-6">
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

      {/* Search + Filter toggle row */}
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

        {/* Expanded filters */}
        {showFilters && (
          <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {/* Applied For */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Applied For</label>
              <select value={jobFilter} onChange={e => setJobFilter(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="all">All Roles</option>
                {uniqueJobs.map(j => <option key={j} value={j}>{j}</option>)}
              </select>
            </div>

            {/* Tier */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Tier</label>
              <select value={tierFilter} onChange={e => setTierFilter(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="all">All Tiers</option>
                <option value="A">A-Tier</option>
                <option value="B">B-Tier</option>
                <option value="C">C-Tier</option>
              </select>
            </div>

            {/* Risk */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Risk Level</label>
              <select value={riskFilter} onChange={e => setRiskFilter(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="all">All Risk</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>

            {/* Status */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Status</label>
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="all">All Statuses</option>
                {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>

            {/* AI Score Range */}
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">
                AI Score Range: <span className="text-blue-600">{scoreMin} – {scoreMax}</span>
              </label>
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-400 w-4">0</span>
                <input type="range" min="0" max="100" value={scoreMin} onChange={e => setScoreMin(Number(e.target.value))}
                  className="flex-1 accent-blue-600" />
                <span className="text-xs text-gray-400 w-6">{scoreMin}</span>
                <span className="text-xs text-gray-300">–</span>
                <input type="range" min="0" max="100" value={scoreMax} onChange={e => setScoreMax(Number(e.target.value))}
                  className="flex-1 accent-blue-600" />
                <span className="text-xs text-gray-400 w-8">{scoreMax}</span>
                <span className="text-xs text-gray-400 w-6">100</span>
              </div>
            </div>

            {/* Date From */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Date From</label>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>

            {/* Date To */}
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
                {["Candidate", "Applied For", "AI Score", "Tier", "Risk", "Status", "Date", ""].map(h => (
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
                return (
                  <tr key={c._id} className="hover:bg-blue-50 transition-colors">
                    <td className="px-4 py-3.5 cursor-pointer" onClick={() => navigate(`/candidates/${c._id}`)}>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
                          {c.name?.charAt(0)?.toUpperCase()}
                        </div>
                        <div>
                          <div className="font-semibold text-gray-900 text-sm">{c.name}</div>
                          <div className="text-xs text-gray-500">{c.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 cursor-pointer" onClick={() => navigate(`/candidates/${c._id}`)}>
                      <div className="text-sm font-medium text-gray-800">{appliedFor}</div>
                      {c.jobDepartment && <div className="text-xs text-gray-400">{c.jobDepartment}</div>}
                    </td>
                    <td className="px-4 py-3.5 cursor-pointer" onClick={() => navigate(`/candidates/${c._id}`)}>
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-2 bg-gray-100 rounded-full">
                          <div className={`h-2 rounded-full ${score >= 80 ? "bg-emerald-500" : score >= 60 ? "bg-blue-500" : "bg-amber-500"}`} style={{ width: `${score}%` }} />
                        </div>
                        <span className="font-bold text-gray-900 text-sm">{score}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 cursor-pointer" onClick={() => navigate(`/candidates/${c._id}`)}>
                      <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${tierColors[tierKey] || "bg-gray-100 text-gray-600 border-gray-200"}`}>
                        {tierKey}-Tier
                      </span>
                    </td>
                    <td className="px-4 py-3.5 cursor-pointer" onClick={() => navigate(`/candidates/${c._id}`)}>
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
                    <td className="px-4 py-3.5 text-sm text-gray-500 cursor-pointer" onClick={() => navigate(`/candidates/${c._id}`)}>
                      {(c.createdAt||c.appliedAt) ? new Date(c.createdAt||c.appliedAt).toLocaleDateString() : "—"}
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
