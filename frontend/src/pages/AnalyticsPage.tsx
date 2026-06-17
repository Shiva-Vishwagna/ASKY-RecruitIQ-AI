import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, Legend
} from "recharts";

const API   = "https://asky-recruitiq-ai.onrender.com/api";
const STAGE_LABELS: Record<string, string> = {
  cv_uploaded: "CV Uploaded", ai_screened: "AI Screened",
  questions_sent: "Q Sent", answers_submitted: "Ans Submitted",
  hm_ready: "HM Ready", rejected: "Rejected",
};
const STAGE_COLORS = ["#94a3b8","#3b82f6","#8b5cf6","#f59e0b","#10b981","#ef4444"];
const TIER_COLORS: Record<string, string> = { A: "#10b981", B: "#3b82f6", C: "#f59e0b" };

function getDaysInStage(c: any): number {
  const d = new Date(c.updatedAt || c.createdAt || 0);
  return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
}

export default function AnalyticsPage() {
  const navigate  = useNavigate();
  const [candidates, setCandidates] = useState<any[]>([]);
  const [jobs, setJobs]             = useState<any[]>([]);
  const [loading, setLoading]       = useState(true);
  const [range, setRange]           = useState("30");
  const token = localStorage.getItem("token");

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [cr, jr] = await Promise.all([
        fetch(`${API}/candidates`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API}/jobs`,       { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      const cd = await cr.json();
      const jd = await jr.json();
      setCandidates(cd.candidates || cd || []);
      setJobs(jd.jobs || jd || []);
    } catch {}
    finally { setLoading(false); }
  }

  // ── Filter by date range ─────────────────────────────────────
  const cutoff = new Date(Date.now() - Number(range) * 24 * 60 * 60 * 1000);
  const filtered = candidates.filter(c => new Date(c.createdAt || 0) >= cutoff);

  // ── Summary Stats ─────────────────────────────────────────────
  const totalCandidates = filtered.length;
  const hmReady         = filtered.filter(c => c.status === "hm_ready").length;
  const rejected        = filtered.filter(c => c.status === "rejected").length;
  const scores          = filtered.map(c => c.aiScore || c.score || 0).filter(s => s > 0);
  const avgScore        = scores.length ? Math.round(scores.reduce((a,b) => a+b,0)/scores.length) : 0;
  const hireRate        = totalCandidates > 0 ? Math.round((hmReady / totalCandidates) * 100) : 0;
  const openJobs        = jobs.filter(j => j.status === "open").length;
  const stuck           = filtered.filter(c => getDaysInStage(c) >= 5 && c.status !== "rejected" && c.status !== "hm_ready").length;
  const aTier           = filtered.filter(c => c.tier?.includes("A")).length;

  // ── Pipeline Funnel ───────────────────────────────────────────
  const funnelData = Object.entries(STAGE_LABELS).map(([val, label], i) => ({
    stage: label,
    count: filtered.filter(c => (c.status || "cv_uploaded") === val).length,
    fill: STAGE_COLORS[i],
  })).filter(s => s.count > 0);

  // ── Tier Distribution ─────────────────────────────────────────
  const tierData = ["A","B","C"].map(t => ({
    name: `${t}-Tier`,
    value: filtered.filter(c => c.tier?.replace(/-?Tier$/i,"") === t).length,
    color: TIER_COLORS[t],
  })).filter(d => d.value > 0);

  // ── Monthly Trend ─────────────────────────────────────────────
  const monthMap: Record<string, { candidates: number; hmReady: number }> = {};
  candidates.forEach(c => {
    const d = new Date(c.createdAt || 0);
    const key = d.toLocaleString("default", { month: "short", year: "2-digit" });
    if (!monthMap[key]) monthMap[key] = { candidates: 0, hmReady: 0 };
    monthMap[key].candidates++;
    if (c.status === "hm_ready") monthMap[key].hmReady++;
  });
  const monthlyTrend = Object.entries(monthMap).slice(-6).map(([month, v]) => ({ month, ...v }));

  // ── Score Distribution ────────────────────────────────────────
  const scoreBuckets = [
    { range: "90-100", min: 90, max: 100, color: "#10b981" },
    { range: "80-89",  min: 80, max: 89,  color: "#34d399" },
    { range: "70-79",  min: 70, max: 79,  color: "#3b82f6" },
    { range: "60-69",  min: 60, max: 69,  color: "#60a5fa" },
    { range: "50-59",  min: 50, max: 59,  color: "#f59e0b" },
    { range: "<50",    min: 0,  max: 49,  color: "#ef4444" },
  ].map(b => ({
    ...b,
    count: filtered.filter(c => { const s = c.aiScore||c.score||0; return s >= b.min && s <= b.max; }).length,
  })).filter(b => b.count > 0);

  // ── Top performing roles ──────────────────────────────────────
  const roleStats = jobs.map(job => {
    const jc = candidates.filter(c => (c.jobTitle || c.appliedFor || "") === job.title);
    const sc = jc.map(c => c.aiScore||c.score||0).filter(s => s > 0);
    return {
      title: job.title.length > 20 ? job.title.slice(0,20)+"…" : job.title,
      fullTitle: job.title,
      id: job._id,
      total: jc.length,
      hmReady: jc.filter(c => c.status === "hm_ready").length,
      avgScore: sc.length ? Math.round(sc.reduce((a,b)=>a+b,0)/sc.length) : 0,
      aTier: jc.filter(c => c.tier?.includes("A")).length,
    };
  }).filter(r => r.total > 0).sort((a,b) => b.total - a.total);

  // ── Time-to-stage analysis ────────────────────────────────────
  const avgDaysInStage = Math.round(
    filtered.filter(c => c.status !== "rejected" && c.status !== "hm_ready")
      .reduce((a,c) => a + getDaysInStage(c), 0) /
    (filtered.filter(c => c.status !== "rejected" && c.status !== "hm_ready").length || 1)
  );

  function exportCSV() {
    const headers = ["Name","Email","Job","Score","Tier","Status","Days in Stage","Applied"];
    const rows = filtered.map(c => [
      c.name, c.email,
      c.jobTitle || c.appliedFor || "—",
      c.aiScore || c.score || 0,
      c.tier?.replace(/-?Tier$/i,""),
      c.status || "cv_uploaded",
      getDaysInStage(c),
      c.createdAt ? new Date(c.createdAt).toLocaleDateString() : "—",
    ]);
    const csv = [headers, ...rows].map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `analytics_${range}days.csv`; a.click();
  }

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Analytics</h1>
          <p className="text-gray-500 mt-1">Hiring performance and trends · {totalCandidates} candidates in last {range} days</p>
        </div>
        <div className="flex gap-3">
          <div className="flex bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
            {[{ v:"7",l:"7D"},{ v:"30",l:"30D"},{ v:"90",l:"90D"},{ v:"365",l:"1Y"}].map(({ v, l }) => (
              <button key={v} onClick={() => setRange(v)}
                className={`px-4 py-2 text-sm font-semibold transition-all ${range === v ? "bg-blue-600 text-white" : "text-gray-500 hover:bg-gray-50"}`}>
                {l}
              </button>
            ))}
          </div>
          <button onClick={exportCSV}
            className="border border-gray-200 bg-white text-gray-700 px-4 py-2 rounded-xl text-sm font-semibold hover:bg-gray-50 transition-all shadow-sm">
            ↓ Export CSV
          </button>
        </div>
      </div>

      {/* ── Key Metrics Row ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label:"Total Candidates", value: totalCandidates, icon:"👥", color:"text-purple-600", bg:"bg-purple-50", border:"border-purple-100", sub:`${openJobs} open roles`, path:"/candidates" },
          { label:"Avg AI Score",     value: `${avgScore}/100`, icon:"🎯", color:"text-blue-600",   bg:"bg-blue-50",   border:"border-blue-100",   sub:`${aTier} A-Tier candidates`, path:"/candidates" },
          { label:"HM Ready",         value: hmReady,           icon:"🎉", color:"text-emerald-600",bg:"bg-emerald-50",border:"border-emerald-100", sub:`${hireRate}% conversion rate`, path:"/candidates" },
          { label:"Stuck 5+ Days",    value: stuck,             icon:"⚠️", color:"text-amber-600",  bg:"bg-amber-50",  border:"border-amber-100",  sub:`Avg ${avgDaysInStage}d in stage`, path:"/candidates" },
        ].map(card => (
          <div key={card.label} onClick={() => navigate(card.path)}
            className={`${card.bg} ${card.border} border rounded-2xl p-5 cursor-pointer hover:shadow-md transition-all`}>
            <div className="text-2xl mb-2">{card.icon}</div>
            <div className={`text-3xl font-black ${card.color} mb-1`}>{card.value}</div>
            <div className="text-sm text-gray-600 font-medium">{card.label}</div>
            <div className="text-xs text-gray-400 mt-1">{card.sub}</div>
          </div>
        ))}
      </div>

      {/* ── Charts Row 1 ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">

        {/* Monthly Trend */}
        <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between mb-5">
            <h2 className="font-bold text-gray-900">📈 Monthly Candidate Trend</h2>
            <span className="text-xs text-gray-400 bg-gray-50 px-2 py-1 rounded-lg">Last 6 months</span>
          </div>
          {monthlyTrend.length === 0 ? (
            <div className="h-56 flex items-center justify-center text-gray-400 text-sm">No data yet</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={monthlyTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="candidates" stroke="#3b82f6" strokeWidth={2.5} dot={{ r: 4, fill: "#3b82f6" }} name="Candidates" />
                <Line type="monotone" dataKey="hmReady"    stroke="#10b981" strokeWidth={2.5} dot={{ r: 4, fill: "#10b981" }} name="HM Ready" />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Tier Distribution */}
        <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between mb-5">
            <h2 className="font-bold text-gray-900">🏆 Candidate Tier Distribution</h2>
            <span className="text-xs text-gray-400 bg-gray-50 px-2 py-1 rounded-lg">{totalCandidates} total</span>
          </div>
          {tierData.length === 0 ? (
            <div className="h-56 flex items-center justify-center text-gray-400 text-sm">No data yet</div>
          ) : (
            <div className="flex items-center gap-6">
              <ResponsiveContainer width="55%" height={200}>
                <PieChart>
                  <Pie data={tierData} cx="50%" cy="50%" outerRadius={80} innerRadius={40} dataKey="value">
                    {tierData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-3">
                {tierData.map(t => (
                  <div key={t.name}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="font-semibold text-gray-700">{t.name}</span>
                      <span className="font-bold" style={{ color: t.color }}>{t.value} ({totalCandidates > 0 ? Math.round((t.value/totalCandidates)*100) : 0}%)</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full">
                      <div className="h-2 rounded-full transition-all" style={{ width: `${totalCandidates > 0 ? (t.value/totalCandidates)*100 : 0}%`, background: t.color }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Charts Row 2 ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">

        {/* Pipeline Funnel */}
        <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between mb-5">
            <h2 className="font-bold text-gray-900">🔽 Pipeline Funnel</h2>
            <span className="text-xs text-gray-400 bg-gray-50 px-2 py-1 rounded-lg">By stage</span>
          </div>
          {funnelData.length === 0 ? (
            <div className="h-56 flex items-center justify-center text-gray-400 text-sm">No data yet</div>
          ) : (
            <div className="space-y-3">
              {funnelData.map((s, i) => (
                <div key={i}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-medium text-gray-700">{s.stage}</span>
                    <span className="font-bold text-gray-900">{s.count}</span>
                  </div>
                  <div className="h-7 bg-gray-50 rounded-xl overflow-hidden">
                    <div className="h-7 rounded-xl flex items-center pl-3 transition-all"
                      style={{ width: `${funnelData[0].count > 0 ? (s.count/funnelData[0].count)*100 : 0}%`, minWidth: s.count > 0 ? "40px" : "0", background: s.fill }}>
                      <span className="text-white text-xs font-bold">{funnelData[0].count > 0 ? Math.round((s.count/funnelData[0].count)*100) : 0}%</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Score Distribution */}
        <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between mb-5">
            <h2 className="font-bold text-gray-900">📊 AI Score Distribution</h2>
            <span className="text-xs text-gray-400 bg-gray-50 px-2 py-1 rounded-lg">Avg: {avgScore}/100</span>
          </div>
          {scoreBuckets.length === 0 ? (
            <div className="h-56 flex items-center justify-center text-gray-400 text-sm">No data yet</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={scoreBuckets} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="range" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} formatter={(v) => [`${v} candidates`, "Count"]} />
                <Bar dataKey="count" radius={[6, 6, 0, 0]} name="Candidates">
                  {scoreBuckets.map((b, i) => <Cell key={i} fill={b.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* ── Role Performance Table ── */}
      {roleStats.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-6">
          <div className="p-6 border-b border-gray-50">
            <h2 className="font-bold text-gray-900">💼 Role-wise Performance</h2>
            <p className="text-sm text-gray-400 mt-1">How each job is performing in terms of candidates and scores</p>
          </div>
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                {["Role","Total","A-Tier","HM Ready","Avg Score","Conversion",""].map(h => (
                  <th key={h} className="px-5 py-3.5 text-left text-xs font-bold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {roleStats.map(r => {
                const conversion = r.total > 0 ? Math.round((r.hmReady/r.total)*100) : 0;
                return (
                  <tr key={r.id} className="hover:bg-blue-50 transition-colors">
                    <td className="px-5 py-4">
                      <div className="font-semibold text-gray-900 text-sm">{r.title}</div>
                    </td>
                    <td className="px-5 py-4 font-bold text-gray-900">{r.total}</td>
                    <td className="px-5 py-4">
                      <span className="text-xs font-bold bg-emerald-100 text-emerald-700 px-2.5 py-1 rounded-full">{r.aTier}</span>
                    </td>
                    <td className="px-5 py-4">
                      <span className="text-xs font-bold bg-blue-100 text-blue-700 px-2.5 py-1 rounded-full">{r.hmReady}</span>
                    </td>
                    <td className="px-5 py-4">
                      <span className={`text-sm font-black ${r.avgScore >= 80 ? "text-emerald-600" : r.avgScore >= 60 ? "text-blue-600" : "text-amber-600"}`}>
                        {r.avgScore > 0 ? r.avgScore : "—"}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-2 bg-gray-100 rounded-full">
                          <div className={`h-2 rounded-full ${conversion >= 50 ? "bg-emerald-500" : conversion >= 25 ? "bg-blue-500" : "bg-amber-500"}`}
                            style={{ width: `${conversion}%` }} />
                        </div>
                        <span className="text-xs font-bold text-gray-600">{conversion}%</span>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <button onClick={() => navigate(`/jobs/${r.id}`)}
                        className="text-xs font-bold text-blue-600 hover:underline whitespace-nowrap">
                        View →
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Quick Insights ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
          <h3 className="font-bold text-gray-900 mb-3">🔴 Needs Action</h3>
          <div className="space-y-2">
            {[
              { label: "Stuck 5+ days", value: stuck, color: "text-red-600" },
              { label: "Answers pending review", value: filtered.filter(c => c.status === "answers_submitted").length, color: "text-amber-600" },
              { label: "Rejected this period", value: rejected, color: "text-gray-600" },
            ].map(i => (
              <div key={i.label} className="flex justify-between items-center py-1.5 border-b border-gray-50 last:border-0">
                <span className="text-sm text-gray-500">{i.label}</span>
                <span className={`text-sm font-black ${i.color}`}>{i.value}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
          <h3 className="font-bold text-gray-900 mb-3">✅ Pipeline Health</h3>
          <div className="space-y-2">
            {[
              { label: "HM Ready candidates", value: hmReady, color: "text-emerald-600" },
              { label: "A-Tier candidates", value: aTier, color: "text-emerald-600" },
              { label: "Questions sent", value: filtered.filter(c => c.status === "questions_sent").length, color: "text-purple-600" },
            ].map(i => (
              <div key={i.label} className="flex justify-between items-center py-1.5 border-b border-gray-50 last:border-0">
                <span className="text-sm text-gray-500">{i.label}</span>
                <span className={`text-sm font-black ${i.color}`}>{i.value}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
          <h3 className="font-bold text-gray-900 mb-3">📊 Score Breakdown</h3>
          <div className="space-y-2">
            {[
              { label: "Excellent (80+)", value: filtered.filter(c => (c.aiScore||c.score||0) >= 80).length, color: "text-emerald-600" },
              { label: "Good (60-79)",    value: filtered.filter(c => { const s = c.aiScore||c.score||0; return s >= 60 && s < 80; }).length, color: "text-blue-600" },
              { label: "Below 60",        value: filtered.filter(c => (c.aiScore||c.score||0) < 60 && (c.aiScore||c.score||0) > 0).length, color: "text-amber-600" },
            ].map(i => (
              <div key={i.label} className="flex justify-between items-center py-1.5 border-b border-gray-50 last:border-0">
                <span className="text-sm text-gray-500">{i.label}</span>
                <span className={`text-sm font-black ${i.color}`}>{i.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
