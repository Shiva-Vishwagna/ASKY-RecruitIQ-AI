import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

interface Candidate {
  _id: string; name: string; email: string; jobTitle?: string;
  score?: number; aiScore?: number; tier: string; riskLevel: string;
  appliedAt?: string; createdAt?: string; status?: string;
}

const tierColors: Record<string, string> = {
  A: "bg-emerald-100 text-emerald-700 border-emerald-200",
  B: "bg-blue-100 text-blue-700 border-blue-200",
  C: "bg-amber-100 text-amber-700 border-amber-200",
};

const STATUSES = [
  { value: "cv_uploaded", label: "CV Uploaded", color: "bg-gray-100 text-gray-600" },
  { value: "ai_screened", label: "AI Screened", color: "bg-blue-100 text-blue-700" },
  { value: "questions_sent", label: "Questions Sent", color: "bg-purple-100 text-purple-700" },
  { value: "answers_submitted", label: "Answers Submitted", color: "bg-amber-100 text-amber-700" },
  { value: "hm_ready", label: "HM Ready", color: "bg-emerald-100 text-emerald-700" },
  { value: "rejected", label: "Rejected", color: "bg-red-100 text-red-700" },
];

export default function CandidatesPage() {
  const navigate = useNavigate();
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [tierFilter, setTierFilter] = useState("all");
  const [riskFilter, setRiskFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState("score-desc");

  const API = "https://asky-recruitiq-ai.onrender.com/api";
  const token = localStorage.getItem("token");

  useEffect(() => {
    fetchCandidates();
    const handleVisibility = () => { if (document.visibilityState === "visible") fetchCandidates(); };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  useEffect(() => {
    const interval = setInterval(fetchCandidates, 15000);
    return () => clearInterval(interval);
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
    try {
      await fetch(`${API}/candidates/${candidateId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: newStatus }),
      });
      setCandidates(prev => prev.map(c => c._id === candidateId ? { ...c, status: newStatus } : c));
    } catch { alert("Failed to update status."); }
  }

  function exportCSV() {
    const headers = ["Name", "Email", "Job", "Score", "Tier", "Risk", "Status", "Applied"];
    const rows = filtered.map(c => [c.name, c.email, c.jobTitle, (c.aiScore||c.score||0), c.tier?.replace(/-?Tier$/i,""), c.riskLevel, c.status || "cv_uploaded", (c.createdAt||c.appliedAt) ? new Date(c.createdAt||c.appliedAt).toLocaleDateString() : "—"]);
    const csv = [headers, ...rows].map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "candidates.csv"; a.click();
  }

  const handleDelete = async (candidateId: string, candidateName: string) => {
    if (!window.confirm(`Delete ${candidateName}?`)) return;
    try {
      await fetch(`${API}/candidates/${candidateId}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      setCandidates(prev => prev.filter(c => c._id !== candidateId));
    } catch { alert("Could not delete."); }
  };

  const filtered = candidates
    .filter(c => {
      const matchSearch = c.name?.toLowerCase().includes(search.toLowerCase()) || c.email?.toLowerCase().includes(search.toLowerCase());
      const matchTier = tierFilter === "all" || c.tier?.replace(/-?Tier$/i,"") === tierFilter;
      const matchRisk = riskFilter === "all" || c.riskLevel === riskFilter;
      const matchStatus = statusFilter === "all" || (c.status || "cv_uploaded") === statusFilter;
      return matchSearch && matchTier && matchRisk && matchStatus;
    })
    .sort((a, b) => {
      if (sortBy === "score-desc") return (b.aiScore||b.score||0) - (a.aiScore||a.score||0);
      if (sortBy === "score-asc") return (a.aiScore||a.score||0) - (b.aiScore||b.score||0);
      if (sortBy === "name") return a.name?.localeCompare(b.name);
      if (sortBy === "date") return new Date(b.createdAt||b.appliedAt||0).getTime() - new Date(a.createdAt||a.appliedAt||0).getTime();
      return 0;
    });

  const getStatusInfo = (status?: string) => STATUSES.find(s => s.value === (status || "cv_uploaded")) || STATUSES[0];

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">All Candidates</h1>
          <p className="text-gray-500 mt-1">{candidates.length} total candidates</p>
        </div>
        <div className="flex gap-3">
          <button onClick={fetchCandidates} className="border border-gray-200 bg-white text-gray-700 px-4 py-2.5 rounded-xl font-semibold hover:bg-gray-50 transition-all text-sm">↻ Refresh</button>
          <button onClick={exportCSV} className="border border-gray-200 bg-white text-gray-700 px-5 py-2.5 rounded-xl font-semibold hover:bg-gray-50 transition-all text-sm">↓ Export CSV</button>
        </div>
      </div>

      {/* Status pipeline */}
      <div className="bg-white rounded-2xl p-4 border border-gray-100 mb-4">
        <div className="flex gap-2 overflow-x-auto pb-1">
          <button onClick={() => setStatusFilter("all")} className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${statusFilter === "all" ? "bg-slate-800 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
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
      </div>

      <div className="bg-white rounded-2xl p-4 border border-gray-100 mb-6 flex flex-wrap gap-3 items-center">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name or email..."
          className="border border-gray-200 rounded-xl px-4 py-2 w-64 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
        <select value={tierFilter} onChange={e => setTierFilter(e.target.value)} className="border border-gray-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="all">All Tiers</option>
          <option value="A">A-Tier</option>
          <option value="B">B-Tier</option>
          <option value="C">C-Tier</option>
        </select>
        <select value={riskFilter} onChange={e => setRiskFilter(e.target.value)} className="border border-gray-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="all">All Risk Levels</option>
          <option value="low">Low Risk</option>
          <option value="medium">Medium Risk</option>
          <option value="high">High Risk</option>
        </select>
        <select value={sortBy} onChange={e => setSortBy(e.target.value)} className="border border-gray-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="score-desc">Score: High to Low</option>
          <option value="score-asc">Score: Low to High</option>
          <option value="name">Name A-Z</option>
          <option value="date">Date: Newest</option>
        </select>
        <span className="text-sm text-gray-400 ml-auto">{filtered.length} results</span>
      </div>

      {loading ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-8">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex gap-4 py-3 border-b border-gray-50 animate-pulse">
              <div className="h-4 bg-gray-100 rounded w-1/4" /><div className="h-4 bg-gray-100 rounded w-1/4" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl p-16 border border-gray-100 text-center text-gray-400">
          <div className="text-5xl mb-4">👥</div>
          <p className="font-medium text-lg">No candidates found</p>
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
                const statusInfo = getStatusInfo(c.status);
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
                    <td className="px-4 py-3.5 text-sm text-gray-600 cursor-pointer" onClick={() => navigate(`/candidates/${c._id}`)}>{c.jobTitle || "—"}</td>
                    <td className="px-4 py-3.5 cursor-pointer" onClick={() => navigate(`/candidates/${c._id}`)}>
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-2 bg-gray-100 rounded-full">
                          <div className={`h-2 rounded-full ${(c.aiScore||c.score||0) >= 80 ? "bg-emerald-500" : (c.aiScore||c.score||0) >= 60 ? "bg-blue-500" : "bg-amber-500"}`}
                            style={{ width: `${c.aiScore||c.score||0}%` }} />
                        </div>
                        <span className="font-bold text-gray-900 text-sm">{c.aiScore||c.score||0}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 cursor-pointer" onClick={() => navigate(`/candidates/${c._id}`)}>
                      <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${tierColors[c.tier?.replace(/-?Tier$/i,'')] || "bg-gray-100 text-gray-600 border-gray-200"}`}>
                        {c.tier?.replace(/-?Tier$/i, '')}-Tier
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
                      {(c.createdAt||c.appliedAt) ? new Date(c.createdAt||c.appliedAt).toLocaleDateString() : '—'}
                    </td>
                    <td className="px-4 py-3.5">
                      <button onClick={(e) => { e.stopPropagation(); handleDelete(c._id, c.name); }}
                        className="text-red-400 hover:text-red-600 hover:bg-red-50 border border-red-200 rounded-md px-2 py-1 text-xs font-medium transition-colors">
                        🗑
                      </button>
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
