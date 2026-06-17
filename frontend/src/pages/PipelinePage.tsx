import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

const STAGES = [
  { value: "cv_uploaded",       label: "CV Uploaded",    short: "CV",  color: "bg-gray-100 text-gray-600",     border: "border-gray-200",    dot: "bg-gray-400" },
  { value: "ai_screened",       label: "AI Screened",    short: "AI",  color: "bg-blue-100 text-blue-700",     border: "border-blue-200",    dot: "bg-blue-500" },
  { value: "questions_sent",    label: "Questions Sent", short: "Q",   color: "bg-purple-100 text-purple-700", border: "border-purple-200",  dot: "bg-purple-500" },
  { value: "answers_submitted", label: "Answers In",     short: "Ans", color: "bg-amber-100 text-amber-700",   border: "border-amber-200",   dot: "bg-amber-500" },
  { value: "hm_ready",          label: "HM Ready",       short: "HM",  color: "bg-emerald-100 text-emerald-700", border: "border-emerald-200", dot: "bg-emerald-500" },
  { value: "rejected",          label: "Rejected",       short: "Rej", color: "bg-red-100 text-red-700",       border: "border-red-200",     dot: "bg-red-500" },
];

interface Job {
  _id: string; title: string; department: string; location: string;
  status: string; level?: string; minAiScore?: number;
  candidateCount?: number;
}

interface Candidate {
  _id: string; name: string; email: string;
  score?: number; aiScore?: number; tier: string;
  status?: string; createdAt?: string; updatedAt?: string;
  jobTitle?: string; appliedFor?: string;
}

interface JobPipeline {
  job: Job;
  candidates: Candidate[];
  stageCounts: Record<string, number>;
  totalCount: number;
  hmReadyCount: number;
  stuckCount: number;
  avgScore: number;
}

function getDaysInStage(c: Candidate): number {
  const date = new Date(c.updatedAt || c.createdAt || 0);
  return Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
}

export default function PipelinePage() {
  const navigate = useNavigate();
  const [pipelines, setPipelines] = useState<JobPipeline[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [stageFilter, setStageFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<"cards" | "table">("cards");

  const API   = "https://asky-recruitiq-ai.onrender.com/api";
  const token = localStorage.getItem("token");

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    try {
      const [jobsRes, candidatesRes] = await Promise.all([
        fetch(`${API}/jobs`,       { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API}/candidates`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      const jobsData       = await jobsRes.json();
      const candidatesData = await candidatesRes.json();

      const jobs: Job[]           = jobsData.jobs || jobsData || [];
      const candidates: Candidate[] = candidatesData.candidates || candidatesData || [];

      const result: JobPipeline[] = jobs.map(job => {
        const jobCandidates = candidates.filter(c =>
          (c.jobTitle || c.appliedFor || "") === job.title
        );
        const stageCounts: Record<string, number> = {};
        STAGES.forEach(s => {
          stageCounts[s.value] = jobCandidates.filter(c => (c.status || "cv_uploaded") === s.value).length;
        });
        const active = jobCandidates.filter(c => c.status !== "rejected" && c.status !== "hm_ready");
        const stuckCount = active.filter(c => getDaysInStage(c) >= 5).length;
        const scores = jobCandidates.map(c => c.aiScore || c.score || 0).filter(s => s > 0);
        const avgScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;

        return {
          job,
          candidates: jobCandidates,
          stageCounts,
          totalCount: jobCandidates.length,
          hmReadyCount: stageCounts["hm_ready"] || 0,
          stuckCount,
          avgScore,
        };
      });

      setPipelines(result);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  const filtered = pipelines.filter(p => {
    const matchSearch = p.job.title.toLowerCase().includes(search.toLowerCase()) ||
      p.job.department.toLowerCase().includes(search.toLowerCase());
    const matchStage = stageFilter === "all" ? true
      : stageFilter === "stuck"   ? p.stuckCount > 0
      : stageFilter === "hmready" ? p.hmReadyCount > 0
      : stageFilter === "empty"   ? p.totalCount === 0
      : true;
    return matchSearch && matchStage;
  });

  const selectedPipeline = pipelines.find(p => p.job._id === selectedJobId);

  // Summary stats
  const totalCandidates = pipelines.reduce((a, p) => a + p.totalCount, 0);
  const totalHMReady    = pipelines.reduce((a, p) => a + p.hmReadyCount, 0);
  const totalStuck      = pipelines.reduce((a, p) => a + p.stuckCount, 0);
  const totalEmpty      = pipelines.filter(p => p.totalCount === 0).length;

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Role-wise Pipeline</h1>
          <p className="text-gray-500 mt-1">Bird's eye view of all roles and candidate stages</p>
        </div>
        <button onClick={loadAll} className="border border-gray-200 bg-white text-gray-700 px-4 py-2.5 rounded-xl font-semibold hover:bg-gray-50 text-sm">
          ↻ Refresh
        </button>
      </div>

      {/* Summary Cards */}
      {!loading && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {[
            { label: "Total Roles",     value: pipelines.length, icon: "💼", color: "bg-blue-50 border-blue-100 text-blue-600" },
            { label: "Total Candidates",value: totalCandidates,  icon: "👥", color: "bg-purple-50 border-purple-100 text-purple-600" },
            { label: "HM Ready",        value: totalHMReady,     icon: "🎯", color: "bg-emerald-50 border-emerald-100 text-emerald-600" },
            { label: "Stuck 5+ Days",   value: totalStuck,       icon: "⚠️", color: "bg-amber-50 border-amber-100 text-amber-600" },
          ].map(card => (
            <div key={card.label} className={`rounded-2xl p-4 border ${card.color}`}>
              <div className="text-2xl mb-1">{card.icon}</div>
              <div className="text-3xl font-black text-gray-900">{card.value}</div>
              <div className="text-sm mt-1 font-medium">{card.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => <div key={i} className="bg-white rounded-2xl h-40 animate-pulse border border-gray-100" />)}
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
            <div key={p.job._id}
              className={`bg-white rounded-2xl border-2 transition-all cursor-pointer hover:shadow-md ${selectedJobId === p.job._id ? "border-blue-400 shadow-md" : "border-gray-100 hover:border-blue-200"}`}
              onClick={() => setSelectedJobId(selectedJobId === p.job._id ? null : p.job._id)}>

              {/* Card Header */}
              <div className="p-5 border-b border-gray-50">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-gray-900 truncate">{p.job.title}</h3>
                    <p className="text-xs text-gray-500 mt-0.5">{p.job.department} · {p.job.location || "Remote"}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0 ml-2">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full capitalize ${p.job.status === "open" ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
                      {p.job.status}
                    </span>
                    {p.stuckCount > 0 && (
                      <span className="text-xs bg-amber-100 text-amber-700 font-bold px-2 py-0.5 rounded-full">
                        ⚠️ {p.stuckCount} stuck
                      </span>
                    )}
                  </div>
                </div>

                {/* Stats row */}
                <div className="flex gap-3 text-sm">
                  <span className="font-bold text-gray-900">{p.totalCount}</span>
                  <span className="text-gray-400">candidates</span>
                  {p.hmReadyCount > 0 && (
                    <span className="text-emerald-600 font-bold">· {p.hmReadyCount} HM ready</span>
                  )}
                  {p.avgScore > 0 && (
                    <span className="text-blue-600 font-bold ml-auto">avg {p.avgScore}</span>
                  )}
                </div>
              </div>

              {/* Stage counts */}
              <div className="p-4">
                {p.totalCount === 0 ? (
                  <div className="text-center py-3 text-gray-400 text-sm">📭 No candidates yet</div>
                ) : (
                  <>
                    {/* Visual bar */}
                    <div className="flex rounded-full overflow-hidden h-2 mb-3">
                      {STAGES.map((s, i) => {
                        const pct = p.totalCount > 0 ? (p.stageCounts[s.value] / p.totalCount) * 100 : 0;
                        const barColors = ["bg-gray-300","bg-blue-400","bg-purple-400","bg-amber-400","bg-emerald-400","bg-red-400"];
                        return pct > 0 ? (
                          <div key={s.value} className={`${barColors[i]} transition-all`}
                            style={{ width: `${pct}%` }} title={`${s.label}: ${p.stageCounts[s.value]}`} />
                        ) : null;
                      })}
                    </div>

                    {/* Stage pill counts */}
                    <div className="grid grid-cols-3 gap-1.5">
                      {STAGES.map(s => (
                        <div key={s.value}
                          className={`flex items-center justify-between px-2 py-1 rounded-lg text-xs ${p.stageCounts[s.value] > 0 ? s.color : "bg-gray-50 text-gray-300"}`}>
                          <span className="truncate">{s.short}</span>
                          <span className="font-bold ml-1">{p.stageCounts[s.value]}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {/* Action buttons */}
              <div className="px-4 pb-4 flex gap-2">
                <button onClick={e => { e.stopPropagation(); navigate(`/jobs/${p.job._id}`); }}
                  className="flex-1 bg-blue-600 text-white py-2 rounded-xl text-xs font-bold hover:bg-blue-700 transition-all">
                  Open Pipeline →
                </button>
                <button onClick={e => { e.stopPropagation(); navigate(`/candidates?job=${p.job.title}`); }}
                  className="flex-1 border border-gray-200 text-gray-600 py-2 rounded-xl text-xs font-bold hover:bg-gray-50 transition-all">
                  View Candidates
                </button>
              </div>

              {/* Expanded candidate list */}
              {selectedJobId === p.job._id && p.candidates.length > 0 && (
                <div className="border-t border-gray-100 p-4 space-y-2 max-h-60 overflow-y-auto">
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Top Candidates</p>
                  {p.candidates
                    .sort((a, b) => (b.aiScore||b.score||0) - (a.aiScore||a.score||0))
                    .slice(0, 5)
                    .map(c => {
                      const score = c.aiScore || c.score || 0;
                      const days = getDaysInStage(c);
                      const stage = STAGES.find(s => s.value === (c.status || "cv_uploaded")) || STAGES[0];
                      return (
                        <div key={c._id}
                          onClick={e => { e.stopPropagation(); navigate(`/candidates/${c._id}`); }}
                          className="flex items-center gap-2 p-2 rounded-xl hover:bg-gray-50 cursor-pointer transition-all">
                          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
                            {c.name?.charAt(0)?.toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-semibold text-gray-900 truncate">{c.name}</div>
                            <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${stage.color}`}>{stage.short}</span>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="text-sm font-black text-gray-900">{score}</div>
                            {days >= 5 && <div className="text-xs text-amber-500 font-bold">{days}d</div>}
                          </div>
                        </div>
                      );
                    })}
                  {p.candidates.length > 5 && (
                    <button onClick={e => { e.stopPropagation(); navigate(`/jobs/${p.job._id}`); }}
                      className="w-full text-center text-xs text-blue-600 hover:underline py-1">
                      +{p.candidates.length - 5} more → View all
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
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Role</th>
                {STAGES.map(s => (
                  <th key={s.value} className="px-3 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">{s.short}</th>
                ))}
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Total</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Avg Score</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Stuck</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map(p => (
                <tr key={p.job._id} className="hover:bg-blue-50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-semibold text-gray-900 text-sm">{p.job.title}</div>
                    <div className="text-xs text-gray-400">{p.job.department}</div>
                  </td>
                  {STAGES.map(s => (
                    <td key={s.value} className="px-3 py-3 text-center">
                      {p.stageCounts[s.value] > 0 ? (
                        <span className={`text-xs font-bold px-2 py-1 rounded-full ${s.color}`}>
                          {p.stageCounts[s.value]}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </td>
                  ))}
                  <td className="px-4 py-3 text-center">
                    <span className="font-black text-gray-900">{p.totalCount}</span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {p.avgScore > 0 ? (
                      <span className={`text-sm font-bold ${p.avgScore >= 80 ? "text-emerald-600" : p.avgScore >= 60 ? "text-blue-600" : "text-amber-600"}`}>
                        {p.avgScore}
                      </span>
                    ) : <span className="text-gray-300 text-xs">—</span>}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {p.stuckCount > 0 ? (
                      <span className="text-xs font-bold bg-amber-100 text-amber-700 px-2 py-1 rounded-full">
                        ⚠️ {p.stuckCount}
                      </span>
                    ) : <span className="text-xs text-emerald-500 font-bold">✓ Clear</span>}
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => navigate(`/jobs/${p.job._id}`)}
                      className="text-xs font-bold text-blue-600 hover:underline whitespace-nowrap">
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
