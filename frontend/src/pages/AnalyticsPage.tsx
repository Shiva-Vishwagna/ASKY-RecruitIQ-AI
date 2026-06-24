import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, Legend, AreaChart, Area
} from "recharts";

const API = "https://asky-recruitiq-ai.onrender.com/api";
const STAGE_LABELS: Record<string, string> = {
  cv_uploaded: "CV Uploaded", ai_screened: "AI Screened",
  questions_sent: "Q Sent", answers_submitted: "Ans In",
  hm_ready: "HM Ready", rejected: "Rejected",
};
const STAGE_COLORS = ["#94a3b8","#3b82f6","#8b5cf6","#f59e0b","#10b981","#ef4444"];
const TIER_COLORS: Record<string, string> = { A: "#10b981", B: "#3b82f6", C: "#f59e0b", D: "#ef4444" };

function getDaysInStage(c: any): number {
  const d = new Date(c.updatedAt || c.createdAt || 0);
  return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
}
function getDaysToHM(c: any): number | null {
  if (c.status !== "hm_ready") return null;
  const start = new Date(c.createdAt || 0);
  const end   = new Date(c.updatedAt || 0);
  return Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}

export default function AnalyticsPage() {
  const navigate  = useNavigate();
  const [candidates, setCandidates] = useState<any[]>([]);
  const [jobs, setJobs]             = useState<any[]>([]);
  const [loading, setLoading]       = useState(true);
  const [range, setRange]           = useState("30");
  const [activeTab, setActiveTab]   = useState<"overview"|"pipeline"|"recruiter"|"quality">("overview");
  const token = localStorage.getItem("token");
  const user  = JSON.parse(localStorage.getItem("user") || "{}");
  const isAdmin = user.role === "admin";

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [cr, jr] = await Promise.all([
        fetch(`${API}/candidates`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API}/jobs`,       { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      const cd = await cr.json(); const jd = await jr.json();
      setCandidates(cd.candidates || cd || []);
      setJobs(jd.jobs || jd || []);
    } catch {} finally { setLoading(false); }
  }

  const cutoff   = new Date(Date.now() - Number(range) * 24 * 60 * 60 * 1000);
  const filtered = candidates.filter(c => new Date(c.createdAt || 0) >= cutoff);

  // ── Summary Stats ─────────────────────────────────────
  const totalCandidates = filtered.length;
  const hmReady    = filtered.filter(c => c.status === "hm_ready").length;
  const rejected   = filtered.filter(c => c.status === "rejected").length;
  const scores     = filtered.map(c => c.aiScore || c.score || 0).filter(s => s > 0);
  const avgScore   = scores.length ? Math.round(scores.reduce((a,b)=>a+b,0)/scores.length) : 0;
  const hireRate   = totalCandidates > 0 ? Math.round((hmReady/totalCandidates)*100) : 0;
  const openJobs   = jobs.filter(j => j.status === "open").length;
  const stuck      = filtered.filter(c => getDaysInStage(c) >= 5 && c.status !== "rejected" && c.status !== "hm_ready").length;
  const aTier      = filtered.filter(c => c.tier?.includes("A")).length;
  const screened   = filtered.filter(c => c.screeningScore && c.screeningScore > 0).length;
  const pendingReview = filtered.filter(c => c.status === "answers_submitted").length;

  // ── Time to Hire ──────────────────────────────────────
  const tthValues = filtered.map(getDaysToHM).filter((d): d is number => d !== null);
  const avgTTH    = tthValues.length ? Math.round(tthValues.reduce((a,b)=>a+b,0)/tthValues.length) : 0;
  const minTTH    = tthValues.length ? Math.min(...tthValues) : 0;
  const maxTTH    = tthValues.length ? Math.max(...tthValues) : 0;

  // ── Pipeline Funnel ───────────────────────────────────
  const funnelData = Object.entries(STAGE_LABELS).map(([val, label], i) => ({
    stage: label, count: filtered.filter(c => (c.status || "cv_uploaded") === val).length, fill: STAGE_COLORS[i],
  })).filter(s => s.count > 0);

  // ── Tier Distribution ─────────────────────────────────
  const tierData = ["A","B","C","D"].map(t => ({
    name: `${t}-Tier`, value: filtered.filter(c => c.tier?.replace(/-?Tier$/i,"") === t).length, color: TIER_COLORS[t],
  })).filter(d => d.value > 0);

  // ── Score Distribution ────────────────────────────────
  const scoreBuckets = [
    { range:"90-100", count: filtered.filter(c=>(c.aiScore||0)>=90).length, color:"#10b981" },
    { range:"80-89",  count: filtered.filter(c=>(c.aiScore||0)>=80&&(c.aiScore||0)<90).length, color:"#3b82f6" },
    { range:"70-79",  count: filtered.filter(c=>(c.aiScore||0)>=70&&(c.aiScore||0)<80).length, color:"#6366f1" },
    { range:"60-69",  count: filtered.filter(c=>(c.aiScore||0)>=60&&(c.aiScore||0)<70).length, color:"#f59e0b" },
    { range:"50-59",  count: filtered.filter(c=>(c.aiScore||0)>=50&&(c.aiScore||0)<60).length, color:"#f97316" },
    { range:"<50",    count: filtered.filter(c=>(c.aiScore||0)>0&&(c.aiScore||0)<50).length,  color:"#ef4444" },
  ].filter(b => b.count > 0);

  // ── Monthly Trend ─────────────────────────────────────
  const monthMap: Record<string,{candidates:number;hmReady:number;screened:number}> = {};
  candidates.forEach(c => {
    const key = new Date(c.createdAt||0).toLocaleString("default",{month:"short",year:"2-digit"});
    if (!monthMap[key]) monthMap[key] = {candidates:0,hmReady:0,screened:0};
    monthMap[key].candidates++;
    if (c.status === "hm_ready") monthMap[key].hmReady++;
    if (c.screeningScore) monthMap[key].screened++;
  });
  const trendData = Object.entries(monthMap).slice(-6).map(([month,v])=>({month,...v}));

  // ── Role Performance ──────────────────────────────────
  const roleStats = jobs.map(j => {
    const rc = filtered.filter(c=>(c.jobTitle||c.appliedFor||"")===j.title);
    const sc = rc.map(c=>c.aiScore||0).filter(s=>s>0);
    const tth = rc.map(getDaysToHM).filter((d): d is number => d !== null);
    return {
      id: j._id, title: j.title, total: rc.length,
      aTier: rc.filter(c=>c.tier?.includes("A")).length,
      hmReady: rc.filter(c=>c.status==="hm_ready").length,
      screened: rc.filter(c=>c.screeningScore).length,
      avgScore: sc.length ? Math.round(sc.reduce((a,b)=>a+b,0)/sc.length) : 0,
      avgTTH: tth.length ? Math.round(tth.reduce((a,b)=>a+b,0)/tth.length) : null,
    };
  }).filter(r => r.total > 0).sort((a,b)=>b.total-a.total);

  // ── Recruiter Performance (admin only) ────────────────
  const recruiterMap: Record<string,{name:string;uploads:number;screened:number;hmReady:number;scores:number[]}> = {};
  filtered.forEach(c => {
    const name = c.uploadedByName || "Unknown";
    if (!recruiterMap[name]) recruiterMap[name] = {name,uploads:0,screened:0,hmReady:0,scores:[]};
    recruiterMap[name].uploads++;
    if (c.screeningScore) recruiterMap[name].screened++;
    if (c.status === "hm_ready") recruiterMap[name].hmReady++;
    if (c.aiScore) recruiterMap[name].scores.push(c.aiScore);
  });
  const recruiterStats = Object.values(recruiterMap).map(r => ({
    ...r, avgScore: r.scores.length ? Math.round(r.scores.reduce((a,b)=>a+b,0)/r.scores.length) : 0,
    convRate: r.uploads > 0 ? Math.round((r.hmReady/r.uploads)*100) : 0,
  })).sort((a,b)=>b.uploads-a.uploads);

  // ── Source Quality ────────────────────────────────────
  const sourceMap: Record<string,{count:number;scores:number[];hmReady:number}> = {};
  filtered.forEach(c => {
    const src = c.source || "Direct";
    if (!sourceMap[src]) sourceMap[src] = {count:0,scores:[],hmReady:0};
    sourceMap[src].count++;
    if (c.aiScore) sourceMap[src].scores.push(c.aiScore);
    if (c.status === "hm_ready") sourceMap[src].hmReady++;
  });
  const sourceStats = Object.entries(sourceMap).map(([src,v])=>({
    source: src, count: v.count,
    avgScore: v.scores.length ? Math.round(v.scores.reduce((a,b)=>a+b,0)/v.scores.length) : 0,
    convRate: v.count > 0 ? Math.round((v.hmReady/v.count)*100) : 0,
  })).sort((a,b)=>b.count-a.count);

  const TABS = [
    { key:"overview",  label:"📊 Overview" },
    { key:"pipeline",  label:"🔽 Pipeline" },
    ...(isAdmin ? [{ key:"recruiter", label:"👤 Recruiter" }] : []),
    { key:"quality",   label:"⭐ Quality" },
  ];

  if (loading) return <div className="p-8 text-center text-gray-400">Loading analytics...</div>;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
          <p className="text-sm text-gray-400 mt-0.5">{isAdmin ? "Organisation-wide insights" : "Your recruitment performance"}</p>
        </div>
        <div className="flex items-center gap-3">
          <select value={range} onChange={e=>setRange(e.target.value)}
            className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            {[{v:"7",l:"Last 7 days"},{v:"30",l:"Last 30 days"},{v:"90",l:"Last 90 days"},{v:"365",l:"Last year"}].map(o=>(
              <option key={o.v} value={o.v}>{o.l}</option>
            ))}
          </select>
          <button onClick={loadData} className="bg-gray-100 text-gray-600 px-3 py-2 rounded-xl text-sm font-semibold hover:bg-gray-200">↻ Refresh</button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3 mb-6">
        {[
          { label:"Total", value:totalCandidates, color:"text-gray-900", bg:"bg-gray-50", border:"border-gray-100", icon:"👥" },
          { label:"HM Ready", value:hmReady, color:"text-emerald-600", bg:"bg-emerald-50", border:"border-emerald-100", icon:"🎯" },
          { label:"Avg Score", value:`${avgScore}`, color:"text-blue-600", bg:"bg-blue-50", border:"border-blue-100", icon:"⭐" },
          { label:"Hire Rate", value:`${hireRate}%`, color:"text-indigo-600", bg:"bg-indigo-50", border:"border-indigo-100", icon:"✅" },
          { label:"Avg TTH", value:avgTTH ? `${avgTTH}d` : "—", color:"text-purple-600", bg:"bg-purple-50", border:"border-purple-100", icon:"⏱" },
          { label:"Screened", value:screened, color:"text-amber-600", bg:"bg-amber-50", border:"border-amber-100", icon:"🎙️" },
          { label:"Stuck", value:stuck, color:stuck>0?"text-red-600":"text-gray-400", bg:stuck>0?"bg-red-50":"bg-gray-50", border:stuck>0?"border-red-100":"border-gray-100", icon:"⚠️" },
          { label:"Open Jobs", value:openJobs, color:"text-teal-600", bg:"bg-teal-50", border:"border-teal-100", icon:"💼" },
        ].map(s=>(
          <div key={s.label} className={`${s.bg} border ${s.border} rounded-2xl p-3 text-center`}>
            <div className="text-lg mb-0.5">{s.icon}</div>
            <div className={`text-xl font-black ${s.color}`}>{s.value}</div>
            <div className="text-xs text-gray-500 mt-0.5 font-medium">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Tab Navigation */}
      <div className="bg-gray-100 rounded-2xl p-1 flex gap-1 mb-6 w-fit">
        {TABS.map(t=>(
          <button key={t.key} onClick={()=>setActiveTab(t.key as any)}
            className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${activeTab===t.key?"bg-white text-blue-600 shadow-sm":"text-gray-500 hover:text-gray-700"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* OVERVIEW TAB */}
      {activeTab==="overview" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Monthly Trend */}
            <div className="bg-white rounded-2xl p-6 border border-gray-100">
              <h2 className="font-bold text-gray-900 mb-4">📈 Monthly Trend</h2>
              {trendData.length === 0 ? <div className="h-48 flex items-center justify-center text-gray-400 text-sm">No data yet</div> : (
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={trendData} margin={{top:5,right:10,bottom:5,left:0}}>
                    <defs>
                      <linearGradient id="cg" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2}/><stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/></linearGradient>
                      <linearGradient id="hg" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#10b981" stopOpacity={0.2}/><stop offset="95%" stopColor="#10b981" stopOpacity={0}/></linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/>
                    <XAxis dataKey="month" tick={{fontSize:11}}/>
                    <YAxis tick={{fontSize:11}}/>
                    <Tooltip contentStyle={{borderRadius:12,fontSize:12}}/>
                    <Legend/>
                    <Area type="monotone" dataKey="candidates" stroke="#3b82f6" fill="url(#cg)" name="Uploaded" strokeWidth={2}/>
                    <Area type="monotone" dataKey="hmReady" stroke="#10b981" fill="url(#hg)" name="HM Ready" strokeWidth={2}/>
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Tier Distribution */}
            <div className="bg-white rounded-2xl p-6 border border-gray-100">
              <h2 className="font-bold text-gray-900 mb-4">🏆 Tier Distribution</h2>
              {tierData.length === 0 ? <div className="h-48 flex items-center justify-center text-gray-400 text-sm">No data yet</div> : (
                <div className="flex items-center gap-6">
                  <ResponsiveContainer width="50%" height={200}>
                    <PieChart>
                      <Pie data={tierData} cx="50%" cy="50%" outerRadius={80} innerRadius={40} dataKey="value">
                        {tierData.map((e,i)=><Cell key={i} fill={e.color}/>)}
                      </Pie>
                      <Tooltip contentStyle={{borderRadius:12,fontSize:12}}/>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex-1 space-y-3">
                    {tierData.map(t=>(
                      <div key={t.name}>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="font-semibold text-gray-700">{t.name}</span>
                          <span className="font-bold" style={{color:t.color}}>{t.value} ({totalCandidates>0?Math.round((t.value/totalCandidates)*100):0}%)</span>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full">
                          <div className="h-2 rounded-full" style={{width:`${totalCandidates>0?(t.value/totalCandidates)*100:0}%`,background:t.color}}/>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Time to Hire */}
          {tthValues.length > 0 && (
            <div className="bg-white rounded-2xl p-6 border border-gray-100">
              <h2 className="font-bold text-gray-900 mb-4">⏱️ Time to Hire Analysis</h2>
              <div className="grid grid-cols-3 gap-4 mb-4">
                {[{label:"Average",value:`${avgTTH} days`,color:"text-blue-600"},{label:"Fastest",value:`${minTTH} days`,color:"text-emerald-600"},{label:"Slowest",value:`${maxTTH} days`,color:"text-amber-600"}].map(s=>(
                  <div key={s.label} className="bg-gray-50 rounded-xl p-4 text-center">
                    <div className={`text-2xl font-black ${s.color}`}>{s.value}</div>
                    <div className="text-xs text-gray-500 mt-1">{s.label}</div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-400">Based on {tthValues.length} candidates who reached HM Ready status</p>
            </div>
          )}

          {/* Quick Insights */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white rounded-2xl p-5 border border-gray-100">
              <h3 className="font-bold text-gray-900 mb-3">🔴 Needs Action</h3>
              <div className="space-y-2">
                {[{label:"Stuck 5+ days",value:stuck,color:"text-red-600"},{label:"Answers pending review",value:pendingReview,color:"text-amber-600"},{label:"Rejected this period",value:rejected,color:"text-gray-600"}].map(i=>(
                  <div key={i.label} className="flex justify-between items-center py-1.5 border-b border-gray-50 last:border-0">
                    <span className="text-sm text-gray-500">{i.label}</span>
                    <span className={`text-sm font-black ${i.color}`}>{i.value}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-white rounded-2xl p-5 border border-gray-100">
              <h3 className="font-bold text-gray-900 mb-3">✅ Pipeline Health</h3>
              <div className="space-y-2">
                {[{label:"HM Ready",value:hmReady,color:"text-emerald-600"},{label:"A-Tier candidates",value:aTier,color:"text-emerald-600"},{label:"Screening completion",value:`${screened}/${totalCandidates}`,color:"text-blue-600"}].map(i=>(
                  <div key={i.label} className="flex justify-between items-center py-1.5 border-b border-gray-50 last:border-0">
                    <span className="text-sm text-gray-500">{i.label}</span>
                    <span className={`text-sm font-black ${i.color}`}>{i.value}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-white rounded-2xl p-5 border border-gray-100">
              <h3 className="font-bold text-gray-900 mb-3">📊 Score Breakdown</h3>
              <div className="space-y-2">
                {[{label:"Excellent (80+)",value:filtered.filter(c=>(c.aiScore||0)>=80).length,color:"text-emerald-600"},{label:"Good (60–79)",value:filtered.filter(c=>{const s=c.aiScore||0;return s>=60&&s<80;}).length,color:"text-blue-600"},{label:"Below 60",value:filtered.filter(c=>(c.aiScore||0)<60&&(c.aiScore||0)>0).length,color:"text-amber-600"}].map(i=>(
                  <div key={i.label} className="flex justify-between items-center py-1.5 border-b border-gray-50 last:border-0">
                    <span className="text-sm text-gray-500">{i.label}</span>
                    <span className={`text-sm font-black ${i.color}`}>{i.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PIPELINE TAB */}
      {activeTab==="pipeline" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-2xl p-6 border border-gray-100">
              <h2 className="font-bold text-gray-900 mb-5">🔽 Pipeline Funnel</h2>
              <div className="space-y-3">
                {funnelData.map((s,i)=>(
                  <div key={i}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="font-medium text-gray-700">{s.stage}</span>
                      <span className="font-bold text-gray-900">{s.count}</span>
                    </div>
                    <div className="h-7 bg-gray-50 rounded-xl overflow-hidden">
                      <div className="h-7 rounded-xl flex items-center pl-3 transition-all"
                        style={{width:`${funnelData[0].count>0?(s.count/funnelData[0].count)*100:0}%`,minWidth:s.count>0?"40px":"0",background:s.fill}}>
                        <span className="text-white text-xs font-bold">{funnelData[0].count>0?Math.round((s.count/funnelData[0].count)*100):0}%</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-white rounded-2xl p-6 border border-gray-100">
              <h2 className="font-bold text-gray-900 mb-4">📊 AI Score Distribution</h2>
              {scoreBuckets.length===0 ? <div className="h-56 flex items-center justify-center text-gray-400 text-sm">No data yet</div> : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={scoreBuckets} margin={{top:5,right:10,bottom:5,left:0}}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/>
                    <XAxis dataKey="range" tick={{fontSize:11}}/>
                    <YAxis tick={{fontSize:11}}/>
                    <Tooltip contentStyle={{borderRadius:12,fontSize:12}} formatter={v=>[`${v} candidates`,"Count"]}/>
                    <Bar dataKey="count" radius={[6,6,0,0]}>
                      {scoreBuckets.map((b,i)=><Cell key={i} fill={b.color}/>)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Role Performance */}
          {roleStats.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
              <div className="p-6 border-b border-gray-50">
                <h2 className="font-bold text-gray-900">💼 Role-wise Performance</h2>
                <p className="text-sm text-gray-400 mt-1">How each job is performing in terms of candidates and scores</p>
              </div>
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>{["Role","Total","A-Tier","HM Ready","Avg Score","Avg TTH","Conv%",""].map(h=>(
                    <th key={h} className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}</tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {roleStats.map(r=>{
                    const conv = r.total>0?Math.round((r.hmReady/r.total)*100):0;
                    return (
                      <tr key={r.id} className="hover:bg-blue-50 transition-colors">
                        <td className="px-4 py-4"><div className="font-semibold text-gray-900 text-sm">{r.title}</div></td>
                        <td className="px-4 py-4 font-bold text-gray-900">{r.total}</td>
                        <td className="px-4 py-4"><span className="text-xs font-bold bg-emerald-100 text-emerald-700 px-2.5 py-1 rounded-full">{r.aTier}</span></td>
                        <td className="px-4 py-4"><span className="text-xs font-bold bg-blue-100 text-blue-700 px-2.5 py-1 rounded-full">{r.hmReady}</span></td>
                        <td className="px-4 py-4"><span className={`text-sm font-black ${r.avgScore>=80?"text-emerald-600":r.avgScore>=60?"text-blue-600":"text-amber-600"}`}>{r.avgScore||"—"}</span></td>
                        <td className="px-4 py-4"><span className="text-sm text-gray-600">{r.avgTTH!=null?`${r.avgTTH}d`:"—"}</span></td>
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-2">
                            <div className="w-12 h-2 bg-gray-100 rounded-full">
                              <div className={`h-2 rounded-full ${conv>=50?"bg-emerald-500":conv>=25?"bg-blue-500":"bg-amber-500"}`} style={{width:`${conv}%`}}/>
                            </div>
                            <span className="text-xs font-bold text-gray-600">{conv}%</span>
                          </div>
                        </td>
                        <td className="px-4 py-4"><button onClick={()=>navigate(`/jobs/${r.id}`)} className="text-xs font-bold text-blue-600 hover:underline">View →</button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* RECRUITER TAB */}
      {activeTab==="recruiter" && isAdmin && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div className="p-6 border-b border-gray-50">
              <h2 className="font-bold text-gray-900">👤 Recruiter Performance</h2>
              <p className="text-sm text-gray-400 mt-1">Individual recruiter metrics — admin view only</p>
            </div>
            {recruiterStats.length===0 ? (
              <div className="p-10 text-center text-gray-400 text-sm">No recruiter data yet</div>
            ) : (
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>{["Recruiter","Uploads","Screened","HM Ready","Avg Score","Conv Rate",""].map(h=>(
                    <th key={h} className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}</tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {recruiterStats.map((r,i)=>(
                    <tr key={i} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-xs font-bold">{r.name.charAt(0).toUpperCase()}</div>
                          <span className="font-semibold text-gray-900 text-sm">{r.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-4 font-bold text-gray-900">{r.uploads}</td>
                      <td className="px-4 py-4 text-gray-600">{r.screened}</td>
                      <td className="px-4 py-4"><span className="text-xs font-bold bg-emerald-100 text-emerald-700 px-2 py-1 rounded-full">{r.hmReady}</span></td>
                      <td className="px-4 py-4"><span className={`font-black text-sm ${r.avgScore>=80?"text-emerald-600":r.avgScore>=60?"text-blue-600":"text-amber-600"}`}>{r.avgScore||"—"}</span></td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-2 bg-gray-100 rounded-full">
                            <div className={`h-2 rounded-full ${r.convRate>=30?"bg-emerald-500":r.convRate>=15?"bg-blue-500":"bg-amber-500"}`} style={{width:`${r.convRate}%`}}/>
                          </div>
                          <span className="text-xs font-bold text-gray-600">{r.convRate}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        {i===0 && <span className="text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded-full font-semibold">🏆 Top</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Recruiter bar chart */}
          {recruiterStats.length > 1 && (
            <div className="bg-white rounded-2xl p-6 border border-gray-100">
              <h2 className="font-bold text-gray-900 mb-4">📊 Uploads by Recruiter</h2>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={recruiterStats.slice(0,8)} margin={{top:5,right:10,bottom:20,left:0}}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/>
                  <XAxis dataKey="name" tick={{fontSize:11}} angle={-20} textAnchor="end"/>
                  <YAxis tick={{fontSize:11}}/>
                  <Tooltip contentStyle={{borderRadius:12,fontSize:12}}/>
                  <Bar dataKey="uploads" fill="#3b82f6" radius={[6,6,0,0]} name="Uploads"/>
                  <Bar dataKey="hmReady" fill="#10b981" radius={[6,6,0,0]} name="HM Ready"/>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {/* QUALITY TAB */}
      {activeTab==="quality" && (
        <div className="space-y-6">
          {/* Source Quality */}
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div className="p-6 border-b border-gray-50">
              <h2 className="font-bold text-gray-900">🎯 Source Quality Analysis</h2>
              <p className="text-sm text-gray-400 mt-1">Which sources bring the best candidates</p>
            </div>
            {sourceStats.length===0 ? (
              <div className="p-10 text-center text-gray-400 text-sm">No source data yet — add source field when uploading</div>
            ) : (
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>{["Source","Candidates","Avg AI Score","HM Ready %","Quality"].map(h=>(
                    <th key={h} className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}</tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {sourceStats.map((s,i)=>(
                    <tr key={i} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-4 font-semibold text-gray-900 text-sm">{s.source}</td>
                      <td className="px-4 py-4 font-bold text-gray-900">{s.count}</td>
                      <td className="px-4 py-4"><span className={`font-black text-sm ${s.avgScore>=80?"text-emerald-600":s.avgScore>=60?"text-blue-600":"text-amber-600"}`}>{s.avgScore||"—"}</span></td>
                      <td className="px-4 py-4"><span className="text-sm font-bold text-gray-700">{s.convRate}%</span></td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-1">
                          {Array.from({length:5}).map((_,j)=>(
                            <div key={j} className={`w-3 h-3 rounded-full ${j<Math.round(s.avgScore/20)?"bg-amber-400":"bg-gray-100"}`}/>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* A-Tier source chart */}
          {sourceStats.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white rounded-2xl p-6 border border-gray-100">
                <h2 className="font-bold text-gray-900 mb-4">📊 Candidates by Source</h2>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={sourceStats} margin={{top:5,right:10,bottom:20,left:0}}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/>
                    <XAxis dataKey="source" tick={{fontSize:11}} angle={-15} textAnchor="end"/>
                    <YAxis tick={{fontSize:11}}/>
                    <Tooltip contentStyle={{borderRadius:12,fontSize:12}}/>
                    <Bar dataKey="count" fill="#6366f1" radius={[6,6,0,0]} name="Candidates"/>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="bg-white rounded-2xl p-6 border border-gray-100">
                <h2 className="font-bold text-gray-900 mb-4">🏆 Avg Score by Source</h2>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={sourceStats} margin={{top:5,right:10,bottom:20,left:0}}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/>
                    <XAxis dataKey="source" tick={{fontSize:11}} angle={-15} textAnchor="end"/>
                    <YAxis tick={{fontSize:11}} domain={[0,100]}/>
                    <Tooltip contentStyle={{borderRadius:12,fontSize:12}}/>
                    <Bar dataKey="avgScore" fill="#10b981" radius={[6,6,0,0]} name="Avg Score"/>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Screening quality */}
          <div className="bg-white rounded-2xl p-6 border border-gray-100">
            <h2 className="font-bold text-gray-900 mb-4">🎙️ Screening Completion Rate</h2>
            <div className="flex items-center gap-6">
              <div className="flex-1">
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-gray-600">Candidates screened</span>
                  <span className="font-bold text-gray-900">{screened} / {totalCandidates}</span>
                </div>
                <div className="h-4 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-4 bg-purple-500 rounded-full transition-all" style={{width:`${totalCandidates>0?(screened/totalCandidates)*100:0}%`}}/>
                </div>
                <p className="text-xs text-gray-400 mt-2">{totalCandidates>0?Math.round((screened/totalCandidates)*100):0}% of uploaded candidates completed AI screening</p>
              </div>
              <div className="text-center">
                <div className="text-4xl font-black text-purple-600">{totalCandidates>0?Math.round((screened/totalCandidates)*100):0}%</div>
                <div className="text-xs text-gray-400 mt-1">Completion rate</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
