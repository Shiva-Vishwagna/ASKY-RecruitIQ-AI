import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

const STAGES = [
  { value: "cv_uploaded",       label: "CV Uploaded",    short: "CV",  color: "bg-gray-100 text-gray-600",       barColor: "bg-gray-400"    },
  { value: "ai_screened",       label: "AI Screened",    short: "AI",  color: "bg-blue-100 text-blue-700",       barColor: "bg-blue-500"    },
  { value: "questions_sent",    label: "Questions Sent", short: "Q✉",  color: "bg-purple-100 text-purple-700",   barColor: "bg-purple-500"  },
  { value: "answers_submitted", label: "Answers In",     short: "Ans", color: "bg-amber-100 text-amber-700",     barColor: "bg-amber-500"   },
  { value: "hm_ready",          label: "HM Ready",       short: "HM✓", color: "bg-emerald-100 text-emerald-700", barColor: "bg-emerald-500" },
  { value: "rejected",          label: "Rejected",       short: "Rej", color: "bg-red-100 text-red-700",         barColor: "bg-red-400"     },
];

interface Job   { _id: string; title: string; department: string; location: string; status: string; level?: string; minAiScore?: number; }
interface Cand  { _id: string; name: string; email: string; score?: number; aiScore?: number; tier: string; status?: string; createdAt?: string; updatedAt?: string; jobTitle?: string; appliedFor?: string; }

interface JobPipeline {
  job: Job; candidates: Cand[];
  stageCounts: Record<string, number>;
  totalCount: number; hmReadyCount: number; stuckCount: number; avgScore: number;
}

function getDaysInStage(c: Cand): number {
  const d = new Date(c.updatedAt || c.createdAt || 0);
  return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
}

export default function PipelinePage() {
  const navigate = useNavigate();
  const [pipelines, setPipelines] = useState<JobPipeline[]>([]);
  const [loading, setLoading]     = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [stageFilter, setStageFilter] = useState("all");
  const [search, setSearch]       = useState("");
  const [viewMode, setViewMode]   = useState<"cards" | "table">("cards");

  const API   = "https://asky-recruitiq-ai.onrender.com/api";
  const token = localStorage.getItem("token");

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const [jr, cr] = await Promise.all([
        fetch(`${API}/jobs`,       { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API}/candidates`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      const jd = await jr.json();
      const cd = await cr.json();
      const jobs: Job[]  = jd.jobs || jd || [];
      const cands: Cand[] = cd.candidates || cd || [];

      const result: JobPipeline[] = jobs.map(job => {
        const jc = cands.filter(c => (c.jobTitle || c.appliedFor || "") === job.title);
        const stageCounts: Record<string, number> = {};
        STAGES.forEach(s => { stageCounts[s.value] = jc.filter(c => (c.status || "cv_uploaded") === s.value).length; });
        const active     = jc.filter(c => c.status !== "rejected" && c.status !== "hm_ready");
        const stuckCount = active.filter(c => getDaysInStage(c) >= 5).length;
        const scores     = jc.map(c => c.aiScore || c.score || 0).filter(s => s > 0);
        const avgScore   = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
        return { job, candidates: jc, stageCounts, totalCount: jc.length, hmReadyCount: stageCounts["hm_ready"] || 0, stuckCount, avgScore };
      });
      setPipelines(result);
    } catch {}
    finally { setLoading(false); }
  }

  const filtered = pipelines.filter(p => {
    const ms = p.job.title.toLowerCase().includes(search.toLowerCase()) || p.job.department.toLowerCase().includes(search.toLowerCase());
    const mf = stageFilter === "all" ? true
      : stageFilter === "stuck"   ? p.stuckCount > 0
      : stageFilter === "hmready" ? p.hmReadyCount > 0
      : stageFilter === "empty"   ? p.totalCount === 0
      : true;
    return ms && mf;
  });

  const totalCandidates = pipelines.reduce((a, p) => a + p.totalCount, 0);
  const totalHMReady    = pipelines.reduce((a, p) => a + p.hmReadyCount, 0);
  const totalStuck      = pipelines.reduce((a, p) => a + p.stuckCount, 0);

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Role-wise Pipeline</h1>
          <p className="text-gray-500 mt-1">Bird's eye view of all roles and candidate stages</p>
        </div>
        <button onClick={loadAll} className="border border-gray-200 bg-white text-gray-700 px-4 py-2.5 rounded-xl font-semibold hover:bg-gray-50 text-sm">↻ Refresh</button>
      </div>

      {/* Summary Cards */}
      {!loading && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {[
            { label: "Total Roles",      value: pipelines.length,  icon: "💼", bg: "bg-blue-50",    border: "border-blue-100",    text: "text-blue-700"    },
            { label: "Total Candidates", value: totalCandidates,   icon: "👥", bg: "bg-purple-50",  border: "border-purple-100",  text: "text-purple-700"  },
            { label: "HM Ready",         value: totalHMReady,      icon: "🎯", bg: "bg-emerald-50", border: "border-emerald-100", text: "text-emerald-700" },
            { label: "Stuck 5+ Days",    value: totalStuck,        icon: "⚠️", bg: "bg-amber-50",   border: "border-amber-100",   text: "text-amber-700"   },
          ].map(c => (
            <div key={c.label} className={`rounded-2xl p-5 border ${c.bg} ${c.border}`}>
              <div className="text-2xl mb-2">{c.icon}</div>
              <div className={`text-3xl font-black ${c.text}`}>{c.value}</div>
              <div className="text-sm text-gray-500 mt-1 font-medium">{c.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Filters + View Toggle */}
      <div className="bg-white rounded-2xl p-4 border border-gray-100 mb-6 flex gap-3 flex-wrap items-center">
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search by role or department..."
          className="border border-gray-200 rounded-xl px-4 py-2 flex-1 min-w-48 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
        {[
          { value: "all",     label: "All Roles" },
          { value: "hmready", label: "🎯 HM Ready" },
          { value: "stuck",   label: "⚠️ Has Stuck" },
          { value: "empty",   label: "📭 No Candidates" },
        ].map(f => (
          <button key={f.value} onClick={() => setStageFilter(f.value)}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${stageFilter === f.value ? "bg-blue-600 text-white" : "border border-gray-200 text-gray-600 hover:border-blue-300"}`}>
            {f.label}
          </button>
        ))}
        <div className="ml-auto flex gap-2">
          <button onClick={() => setViewMode("cards")}
            className={`px-3 py-2 rounded-xl text-sm font-semibold border transition-all ${viewMode === "cards" ? "bg-blue-600 text-white border-blue-600" : "border-gray-200 text-gray-600"}`}>
            ⊞ Cards
          </button>
          <button onClick={() => setViewMode("table")}
            className={`px-3 py-2 rounded-xl text-sm font-semibold border transition-all ${viewMode === "table" ? "bg-blue-600 text-white border-blue-600" : "border-gray-200 text-gray-600"}`}>
            ≡ Table
          </button>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => <div key={i} className="bg-white rounded-2xl h-52 animate-pulse border border-gray-100" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl p-16 border border-gray-100 text-center text-gray-400">
          <div className="text-5xl mb-4">📋</div>
          <p className="font-medium text-lg">No roles found</p>
        </div>
      ) : viewMode === "cards" ? (

        /* ── CARD VIEW ── */
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(p => (
            <div key={p.job._id} className="bg-white rounded-2xl border border-gray-100 hover:border-blue-200 hover:shadow-md transition-all flex flex-col">

              {/* Card Top */}
              <div className="p-5 border-b border-gray-50">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0 pr-2">
                    <h3 className="font-bold text-gray-900 text-base leading-tight">{p.job.title}</h3>
                    <p className="text-xs text-gray-400 mt-1">{p.job.department} · {p.job.location || "Remote"}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-full capitalize ${p.job.status === "open" ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
                      {p.job.status}
                    </span>
                    {p.stuckCount > 0 && (
                      <span className="text-xs bg-amber-100 text-amber-700 font-bold px-2.5 py-1 rounded-full">⚠️ {p.stuckCount} stuck</span>
                    )}
                    {p.hmReadyCount > 0 && (
                      <span className="text-xs bg-emerald-100 text-emerald-700 font-bold px-2.5 py-1 rounded-full">🎯 {p.hmReadyCount} HM ready</span>
                    )}
                  </div>
                </div>

                {/* Candidate count + avg score */}
                <div className="flex items-center gap-3">
                  <span className="text-2xl font-black text-gray-900">{p.totalCount}</span>
                  <span className="text-sm text-gray-400">candidates</span>
                  {p.avgScore > 0 && (
                    <span className={`ml-auto text-sm font-bold px-3 py-1 rounded-full ${p.avgScore >= 80 ? "bg-emerald-50 text-emerald-600" : p.avgScore >= 60 ? "bg-blue-50 text-blue-600" : "bg-amber-50 text-amber-600"}`}>
                      avg {p.avgScore}
                    </span>
                  )}
                </div>
              </div>

              {/* Stage Breakdown */}
              <div className="p-4 flex-1">
                {p.totalCount === 0 ? (
                  <div className="text-center py-4 text-gray-400 text-sm">📭 No candidates yet</div>
                ) : (
                  <>
                    {/* Visual bar */}
                    <div className="flex rounded-full overflow-hidden h-2.5 mb-4 gap-px">
                      {STAGES.map(s => {
                        const pct = p.totalCount > 0 ? (p.stageCounts[s.value] / p.totalCount) * 100 : 0;
                        return pct > 0 ? (
                          <div key={s.value} className={`${s.barColor} transition-all`}
                            style={{ width: `${pct}%` }} title={`${s.label}: ${p.stageCounts[s.value]}`} />
                        ) : null;
                      })}
                    </div>

                    {/* Stage grid */}
                    <div className="grid grid-cols-3 gap-2">
                      {STAGES.map(s => (
                        <div key={s.value}
                          className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold ${p.stageCounts[s.value] > 0 ? s.color : "bg-gray-50 text-gray-300"}`}>
                          <span>{s.short}</span>
                          <span className="font-black ml-1">{p.stageCounts[s.value]}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {/* Action Buttons */}
              <div className="p-4 pt-0 flex gap-2">
                <button
                  onClick={() => navigate(`/jobs/${p.job._id}`)}
                  className="flex-1 bg-blue-600 text-white py-2.5 rounded-xl text-sm font-bold hover:bg-blue-700 transition-all">
                  Open Pipeline →
                </button>
                <button
                  onClick={() => setExpandedId(expandedId === p.job._id ? null : p.job._id)}
                  className="px-4 py-2.5 border border-gray-200 text-gray-600 rounded-xl text-sm font-bold hover:bg-gray-50 transition-all">
                  {expandedId === p.job._id ? "▲" : "▼"}
                </button>
              </div>

              {/* Expanded top candidates */}
              {expandedId === p.job._id && p.candidates.length > 0 && (
                <div className="border-t border-gray-100 p-4 space-y-2 max-h-64 overflow-y-auto">
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">Top Candidates</p>
                  {p.candidates
                    .sort((a, b) => (b.aiScore||b.score||0) - (a.aiScore||a.score||0))
                    .slice(0, 6)
                    .map(c => {
                      const score = c.aiScore || c.score || 0;
                      const days  = getDaysInStage(c);
                      const stage = STAGES.find(s => s.value === (c.status || "cv_uploaded")) || STAGES[0];
                      const tierKey = c.tier?.replace(/-?Tier$/i, "");
                      return (
                        <div key={c._id}
                          onClick={() => navigate(`/candidates/${c._id}`)}
                          className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-blue-50 cursor-pointer transition-all border border-transparent hover:border-blue-100">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
                            {c.name?.charAt(0)?.toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-semibold text-gray-900 truncate">{c.name}</div>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${stage.color}`}>{stage.short}</span>
                              {tierKey && <span className="text-xs text-gray-400">{tierKey}-Tier</span>}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className={`text-sm font-black ${score >= 80 ? "text-emerald-600" : score >= 60 ? "text-blue-600" : "text-amber-600"}`}>{score}</div>
                            {days >= 5 && <div className="text-xs text-red-400 font-bold">{days}d ⚠️</div>}
                          </div>
                        </div>
                      );
                    })}
                  {p.candidates.length > 6 && (
                    <button onClick={() => navigate(`/jobs/${p.job._id}`)}
                      className="w-full text-center text-xs text-blue-600 hover:underline py-2 font-semibold">
                      +{p.candidates.length - 6} more → Open Full Pipeline
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

      ) : (

        /* ── TABLE VIEW ── */
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-5 py-3.5 text-left text-xs font-bold text-gray-500 uppercase tracking-wide">Role</th>
                {STAGES.map(s => (
                  <th key={s.value} className="px-3 py-3.5 text-center text-xs font-bold text-gray-500 uppercase tracking-wide">{s.short}</th>
                ))}
                <th className="px-4 py-3.5 text-center text-xs font-bold text-gray-500 uppercase tracking-wide">Total</th>
                <th className="px-4 py-3.5 text-center text-xs font-bold text-gray-500 uppercase tracking-wide">Avg</th>
                <th className="px-4 py-3.5 text-center text-xs font-bold text-gray-500 uppercase tracking-wide">Stuck</th>
                <th className="px-4 py-3.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map(p => (
                <tr key={p.job._id} className="hover:bg-blue-50 transition-colors">
                  <td className="px-5 py-4">
                    <div className="font-bold text-gray-900 text-sm">{p.job.title}</div>
                    <div className="text-xs text-gray-400 mt-0.5">{p.job.department} · {p.job.location || "Remote"}</div>
                  </td>
                  {STAGES.map(s => (
                    <td key={s.value} className="px-3 py-4 text-center">
                      {p.stageCounts[s.value] > 0 ? (
                        <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${s.color}`}>{p.stageCounts[s.value]}</span>
                      ) : <span className="text-gray-200 text-sm">—</span>}
                    </td>
                  ))}
                  <td className="px-4 py-4 text-center font-black text-gray-900">{p.totalCount}</td>
                  <td className="px-4 py-4 text-center">
                    {p.avgScore > 0 ? (
                      <span className={`text-sm font-bold ${p.avgScore >= 80 ? "text-emerald-600" : p.avgScore >= 60 ? "text-blue-600" : "text-amber-600"}`}>{p.avgScore}</span>
                    ) : <span className="text-gray-300 text-sm">—</span>}
                  </td>
                  <td className="px-4 py-4 text-center">
                    {p.stuckCount > 0 ? (
                      <span className="text-xs font-bold bg-amber-100 text-amber-700 px-2.5 py-1 rounded-full">⚠️ {p.stuckCount}</span>
                    ) : <span className="text-xs text-emerald-500 font-bold">✓</span>}
                  </td>
                  <td className="px-4 py-4">
                    <button onClick={() => navigate(`/jobs/${p.job._id}`)}
                      className="text-xs font-bold text-blue-600 hover:underline whitespace-nowrap bg-blue-50 px-3 py-1.5 rounded-lg hover:bg-blue-100 transition-all">
                      Open →
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
