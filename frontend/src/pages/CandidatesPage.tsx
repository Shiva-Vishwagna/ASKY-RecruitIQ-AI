import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

interface Candidate {
  _id: string;
  name: string;
  email: string;
  jobTitle: string;
  score: number;
  tier: string;
  riskLevel: string;
  appliedAt: string;
}

const tierColors: Record<string, string> = {
  A: "bg-emerald-100 text-emerald-700 border-emerald-200",
  B: "bg-blue-100 text-blue-700 border-blue-200",
  C: "bg-amber-100 text-amber-700 border-amber-200",
};

export default function CandidatesPage() {
  const navigate = useNavigate();
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [tierFilter, setTierFilter] = useState("all");
  const [riskFilter, setRiskFilter] = useState("all");
  const [sortBy, setSortBy] = useState("score-desc");

  const API = import.meta.env.VITE_API_URL || "http://localhost:5000/api";
  const token = localStorage.getItem("token");

  // ✅ FIX 1: Refresh when page becomes visible (user navigates back after upload)
  useEffect(() => {
    fetchCandidates();

    const handleVisibility = () => {
      if (document.visibilityState === "visible") fetchCandidates();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  // ✅ FIX 2: Also poll every 10 seconds to catch new uploads
  useEffect(() => {
    const interval = setInterval(fetchCandidates, 10000);
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

  function exportCSV() {
    const headers = ["Name", "Email", "Job", "Score", "Tier", "Risk", "Applied"];
    const rows = filtered.map(c => [c.name, c.email, c.jobTitle, c.score, c.tier, c.riskLevel, new Date(c.appliedAt).toLocaleDateString()]);
    const csv = [headers, ...rows].map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "candidates.csv"; a.click();
  }

  const filtered = candidates
    .filter(c => {
      const matchSearch = c.name?.toLowerCase().includes(search.toLowerCase()) || c.email?.toLowerCase().includes(search.toLowerCase());
      const matchTier = tierFilter === "all" || c.tier === tierFilter;
      const matchRisk = riskFilter === "all" || c.riskLevel === riskFilter;
      return matchSearch && matchTier && matchRisk;
    })
    .sort((a, b) => {
      if (sortBy === "score-desc") return b.score - a.score;
      if (sortBy === "score-asc") return a.score - b.score;
      if (sortBy === "name") return a.name?.localeCompare(b.name);
      if (sortBy === "date") return new Date(b.appliedAt).getTime() - new Date(a.appliedAt).getTime();
      return 0;
    });

  // ✅ FIX 3: Corrected delete URL from /api/resumes/ to /candidates/
  const handleDelete = async (candidateId: string, candidateName: string) => {
    if (!window.confirm(`Delete ${candidateName}? This cannot be undone.`)) return;
    try {
      const res = await fetch(`${API}/candidates/${candidateId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Delete failed.");
      setCandidates(prev => prev.filter(c => c._id !== candidateId));
    } catch {
      alert("Could not delete. Please try again.");
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">All Candidates</h1>
          <p className="text-gray-500 mt-1">{candidates.length} total candidates across all jobs</p>
        </div>
        <div className="flex gap-3">
          {/* ✅ FIX 4: Manual refresh button */}
          <button onClick={fetchCandidates} className="border border-gray-200 bg-white text-gray-700 px-4 py-2.5 rounded-xl font-semibold hover:bg-gray-50 transition-all text-sm">
            ↻ Refresh
          </button>
          <button onClick={exportCSV} className="border border-gray-200 bg-white text-gray-700 px-5 py-2.5 rounded-xl font-semibold hover:bg-gray-50 transition-all text-sm">
            ↓ Export CSV
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl p-4 border border-gray-100 mb-6 flex flex-wrap gap-3 items-center">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name or email..."
          className="border border-gray-200 rounded-xl px-4 py-2 w-64 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
        <select value={tierFilter} onChange={e => setTierFilter(e.target.value)}
          className="border border-gray-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="all">All Tiers</option>
          <option value="A">A-Tier</option>
          <option value="B">B-Tier</option>
          <option value="C">C-Tier</option>
        </select>
        <select value={riskFilter} onChange={e => setRiskFilter(e.target.value)}
          className="border border-gray-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="all">All Risk Levels</option>
          <option value="low">Low Risk</option>
          <option value="medium">Medium Risk</option>
          <option value="high">High Risk</option>
        </select>
        <select value={sortBy} onChange={e => setSortBy(e.target.value)}
          className="border border-gray-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="score-desc">Score: High to Low</option>
          <option value="score-asc">Score: Low to High</option>
          <option value="name">Name A-Z</option>
          <option value="date">Date: Newest</option>
        </select>
        <span className="text-sm text-gray-400 ml-auto">{filtered.length} results</span>
      </div>

      {/* Table */}
      {loading ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-8">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex gap-4 py-3 border-b border-gray-50 animate-pulse">
              <div className="h-4 bg-gray-100 rounded w-1/4" />
              <div className="h-4 bg-gray-100 rounded w-1/4" />
              <div className="h-4 bg-gray-100 rounded w-1/6" />
              <div className="h-4 bg-gray-100 rounded w-1/6" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl p-16 border border-gray-100 text-center text-gray-400">
          <div className="text-5xl mb-4">👥</div>
          <p className="font-medium text-lg">No candidates found</p>
          <p className="text-sm mt-1">Try adjusting your filters</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {["Candidate", "Applied For", "AI Score", "Tier", "Risk Level", "Date Applied", ""].map(h => (
                  <th key={h} className="px-4 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map(c => (
                <tr key={c._id} onClick={() => navigate(`/candidates/${c._id}`)}
                  className="hover:bg-blue-50 cursor-pointer transition-colors">
                  <td className="px-4 py-3.5">
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
                  <td className="px-4 py-3.5 text-sm text-gray-600">{c.jobTitle || "—"}</td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-2">
                      <div className="w-20 h-2 bg-gray-100 rounded-full">
                        <div className={`h-2 rounded-full ${c.score >= 80 ? "bg-emerald-500" : c.score >= 60 ? "bg-blue-500" : "bg-amber-500"}`}
                          style={{ width: `${c.score}%` }} />
                      </div>
                      <span className="font-bold text-gray-900 text-sm">{c.score}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${tierColors[c.tier] || "bg-gray-100 text-gray-600 border-gray-200"}`}>
                      {c.tier}-Tier
                    </span>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full capitalize ${c.riskLevel === "low" ? "bg-green-100 text-green-700" : c.riskLevel === "high" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
                      {c.riskLevel || "medium"}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-sm text-gray-500">{new Date(c.appliedAt).toLocaleDateString()}</td>
                  <td className="px-4 py-3.5">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(c._id, c.name); }}
                      className="text-red-400 hover:text-red-600 hover:bg-red-50 border border-red-200 rounded-md px-2 py-1 text-xs font-medium transition-colors">
                      🗑 Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
