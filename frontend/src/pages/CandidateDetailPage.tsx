import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import ScorecardButton from "../components/ScorecardButton";

interface SkillScore { skill: string; score: number; }
interface Candidate {
  _id: string; name: string; email: string; phone?: string;
  jobTitle?: string; appliedFor?: string;
  score?: number; aiScore?: number;
  cvScoreBreakdown?: {
    skillsMatchScore?: number; experienceScore?: number; domainScore?: number;
    educationScore?: number; projectRelevanceScore?: number; stabilityScore?: number;
  };
  screeningScore?: number;
  screeningBreakdown?: {
    technical?: number; communication?: number; problemSolving?: number;
    roleUnderstanding?: number; motivation?: number;
  };
  combinedScore?: number;
  tier: string; riskLevel?: string;
  appliedAt?: string; createdAt?: string;
  summary?: string; hmSummary?: string;
  topSkills?: string[]; skills?: string[];
  domain?: string; seniority?: string; experienceYears?: number;
  projectDomains?: string[];
  technicalExperience?: string; leadershipExperience?: string; cloudExpertise?: string;
  databases?: string[]; frameworks?: string[]; tools?: string[];
  strengths?: string[]; gaps?: string[];
  skillScores?: SkillScore[];
  recommendation?: string; recommendationReason?: string;
  primarySkillMatch?: boolean; primarySkillScore?: number; jobFitScore?: number;
  status?: string;
  interviewQuestions?: string[];
  interviewFocusAreas?: string[];
  missingMandatorySkills?: string[];
  riskFlags?: {
    frequentJobChanges?: boolean;
    noticePeriodRisk?: string;
    missingMandatorySkills?: string[];
    domainMismatch?: boolean;
  };
  screeningAnswers?: {
    question: string; aiScore?: number;
    scoreBreakdown?: { technical?:number; communication?:number; problemSolving?:number; roleUnderstanding?:number; motivation?:number };
    aiFeedback?: string;
  }[];
}

const STATUSES = [
  { value:"cv_uploaded",       label:"CV Uploaded",       color:"bg-gray-100 text-gray-600"     },
  { value:"ai_screened",       label:"AI Screened",       color:"bg-blue-100 text-blue-700"     },
  { value:"questions_sent",    label:"Questions Sent",    color:"bg-purple-100 text-purple-700" },
  { value:"answers_submitted", label:"Answers Submitted", color:"bg-amber-100 text-amber-700"   },
  { value:"hm_ready",          label:"HM Ready",          color:"bg-emerald-100 text-emerald-700"},
  { value:"rejected",          label:"Rejected",          color:"bg-red-100 text-red-700"       },
];

const REC_COLORS: Record<string,string> = {
  "Strong Hire": "bg-emerald-100 text-emerald-700 border-emerald-200",
  "Hire":        "bg-blue-100 text-blue-700 border-blue-200",
  "Consider":    "bg-amber-100 text-amber-700 border-amber-200",
  "Weak Fit":    "bg-orange-100 text-orange-700 border-orange-200",
  "Reject":      "bg-red-100 text-red-700 border-red-200",
};

function suggestDifficulty(expYears?: number): "easy"|"medium"|"hard" {
  if (!expYears||expYears<=2) return "easy";
  if (expYears<=5) return "medium";
  return "hard";
}

const DIFF_CONFIG = {
  easy:   { icon:"🟢", label:"Easy",   color:"bg-emerald-100 text-emerald-700 border-emerald-200", active:"bg-emerald-600 text-white", desc:"Basic concepts · 0–2 yrs" },
  medium: { icon:"🟡", label:"Medium", color:"bg-amber-100 text-amber-700 border-amber-200",       active:"bg-amber-500 text-white",   desc:"Scenario-based · 3–5 yrs" },
  hard:   { icon:"🔴", label:"Hard",   color:"bg-red-100 text-red-700 border-red-200",             active:"bg-red-600 text-white",     desc:"Architecture · 6+ yrs" },
};

// ── Score Bar Component ───────────────────────────────────────
function ScoreBar({ label, score, color="bg-blue-500", tooltip="" }: { label:string; score:number; color?:string; tooltip?:string }) {
  return (
    <div title={tooltip}>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-gray-600 font-medium">{label}</span>
        <span className="font-bold text-gray-900">{score}/100</span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full">
        <div className={`h-2 rounded-full transition-all ${color}`} style={{ width:`${score}%` }} />
      </div>
    </div>
  );
}

// ── Questions Tab ─────────────────────────────────────────────
interface QTabProps {
  candidate: Candidate; questions: string[]; setQuestions:(q:string[])=>void;
  setCandidate:(c:any)=>void; generatingQ:boolean; setGeneratingQ:(v:boolean)=>void;
  API:string; token:string; id:string;
}

function QuestionsTab({ candidate, questions, setQuestions, setCandidate, generatingQ, setGeneratingQ, API, token, id }:QTabProps) {
  const [answers, setAnswers]       = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult]         = useState<any>(null);
  const hasAnswers    = (candidate.screeningAnswers?.length??0) > 0;
  const screeningScore = candidate.screeningScore;
  const suggested     = suggestDifficulty(candidate.experienceYears);
  const [difficulty, setDifficulty] = useState<"easy"|"medium"|"hard">(suggested);

  async function generateQuestions() {
    setGeneratingQ(true);
    try {
      const res  = await fetch(`${API}/candidates/${id}/questions`, {
        method:"POST",
        headers:{"Content-Type":"application/json", Authorization:`Bearer ${token}`},
        body: JSON.stringify({ jobTitle:candidate.appliedFor||candidate.jobTitle, skills:candidate.topSkills, difficulty }),
      });
      const data = await res.json();
      const qs   = data.questions||[];
      setQuestions(qs); setAnswers(new Array(qs.length).fill(""));
      setCandidate((prev:Candidate) => ({...prev, interviewQuestions:qs, status:data.status||prev.status}));
    } catch { alert("Failed to generate questions."); }
    finally { setGeneratingQ(false); }
  }

  async function submitAnswers() {
    if (answers.some(a=>!a.trim())) return alert("Please answer all questions.");
    setSubmitting(true);
    try {
      const payload = questions.map((q,i) => ({question:q, answer:answers[i]}));
      const res  = await fetch(`${API}/candidates/${id}/answers`, {
        method:"POST",
        headers:{"Content-Type":"application/json", Authorization:`Bearer ${token}`},
        body: JSON.stringify({ answers:payload }),
      });
      const data = await res.json();
      setResult(data);
      setCandidate((prev:Candidate) => ({...prev, ...data.candidate}));
    } catch { alert("Failed to submit answers."); }
    finally { setSubmitting(false); }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-bold text-gray-900 text-lg">Interview Questions & Screening</h2>
          <p className="text-sm text-gray-500 mt-0.5">AI-generated questions based on resume and role</p>
        </div>
        {!hasAnswers && (
          <button onClick={generateQuestions} disabled={generatingQ}
            className="bg-blue-600 text-white px-5 py-2.5 rounded-xl font-semibold hover:bg-blue-700 disabled:opacity-60 text-sm">
            {generatingQ?"Generating...":questions.length>0?"↻ Regenerate":"✨ Generate Questions"}
          </button>
        )}
      </div>

      {/* Difficulty Selector */}
      {!hasAnswers && (
        <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-sm font-bold text-gray-700">Select Difficulty</span>
            {candidate.experienceYears ? (
              <span className="text-xs bg-blue-100 text-blue-600 px-2.5 py-1 rounded-full font-semibold">
                💡 Suggested: {DIFF_CONFIG[suggested].icon} {DIFF_CONFIG[suggested].label} · {candidate.experienceYears}y exp
              </span>
            ):null}
          </div>
          <div className="grid grid-cols-3 gap-3">
            {(Object.entries(DIFF_CONFIG) as [keyof typeof DIFF_CONFIG, typeof DIFF_CONFIG["easy"]][]).map(([key,cfg]) => (
              <button key={key} onClick={() => setDifficulty(key)}
                className={`p-4 rounded-xl border-2 text-left transition-all ${difficulty===key?cfg.active+" border-current":cfg.color+" hover:opacity-80"}`}>
                <div className="text-lg mb-1">{cfg.icon}</div>
                <div className="font-bold text-sm">{cfg.label}</div>
                <div className="text-xs mt-0.5 opacity-75">{cfg.desc}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Result banner */}
      {result && (
        <div className={`rounded-2xl p-5 border ${result.status==="hm_ready"?"bg-emerald-50 border-emerald-200":"bg-amber-50 border-amber-200"}`}>
          <div className="flex items-center gap-3 mb-3">
            <span className="text-2xl">{result.status==="hm_ready"?"🎉":"📋"}</span>
            <div>
              <p className="font-bold text-gray-900">{result.status==="hm_ready"?"Candidate moved to HM Ready!":"Answers submitted for review"}</p>
              <p className="text-sm text-gray-600">Combined Score: <strong>{result.combinedScore}/100</strong> ({result.weights?.cvWeight||60}% CV + {result.weights?.screeningWeight||40}% Screening)</p>
            </div>
            <span className={`ml-auto text-sm font-bold px-3 py-1 rounded-full border ${REC_COLORS[result.recommendation]||"bg-gray-100 text-gray-600"}`}>
              {result.recommendation}
            </span>
          </div>
          {result.screeningBreakdown && (
            <div className="grid grid-cols-5 gap-2 mt-3">
              {[
                {label:"Technical",       score:result.screeningBreakdown.technical},
                {label:"Communication",   score:result.screeningBreakdown.communication},
                {label:"Problem Solving", score:result.screeningBreakdown.problemSolving},
                {label:"Role Fit",        score:result.screeningBreakdown.roleUnderstanding},
                {label:"Motivation",      score:result.screeningBreakdown.motivation},
              ].map(s => (
                <div key={s.label} className="text-center bg-white rounded-xl p-2">
                  <div className="text-lg font-black text-gray-900">{s.score}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{s.label}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {questions.length===0 && !hasAnswers ? (
        <div className="bg-white rounded-2xl p-12 border border-gray-100 text-center text-gray-400">
          <div className="text-5xl mb-4">❓</div>
          <p className="font-medium">No questions yet</p>
          <p className="text-sm mt-1">Select difficulty above and click "Generate Questions"</p>
        </div>
      ) : hasAnswers ? (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl p-5 border border-gray-100">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-gray-900">Screening Score</h3>
              <span className="text-3xl font-black text-purple-600">{screeningScore??0}/100</span>
            </div>
            <div className="h-3 bg-gray-100 rounded-full mb-4">
              <div className={`h-3 rounded-full ${(screeningScore??0)>=80?"bg-emerald-500":(screeningScore??0)>=60?"bg-blue-500":"bg-amber-500"}`}
                style={{width:`${screeningScore??0}%`}}/>
            </div>
            {candidate.screeningBreakdown && (
              <div className="space-y-2">
                {[
                  {label:"Technical Knowledge (40%)",  score:candidate.screeningBreakdown.technical||0,         color:"bg-blue-500"},
                  {label:"Communication (20%)",         score:candidate.screeningBreakdown.communication||0,     color:"bg-purple-500"},
                  {label:"Problem Solving (15%)",       score:candidate.screeningBreakdown.problemSolving||0,    color:"bg-amber-500"},
                  {label:"Role Understanding (15%)",    score:candidate.screeningBreakdown.roleUnderstanding||0, color:"bg-emerald-500"},
                  {label:"Motivation & Availability (10%)",score:candidate.screeningBreakdown.motivation||0,    color:"bg-indigo-500"},
                ].map(s => <ScoreBar key={s.label} label={s.label} score={s.score} color={s.color}/>)}
              </div>
            )}
          </div>
          {candidate.screeningAnswers!.map((sa,i) => (
            <div key={i} className="bg-white rounded-xl p-5 border border-gray-100">
              <div className="flex items-start justify-between mb-2">
                <p className="font-semibold text-gray-800 text-sm flex-1">Q{i+1}: {sa.question}</p>
                {sa.aiScore!==undefined && (
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-full ml-3 shrink-0 ${sa.aiScore>=80?"bg-emerald-100 text-emerald-700":sa.aiScore>=60?"bg-blue-100 text-blue-700":"bg-amber-100 text-amber-700"}`}>
                    {sa.aiScore}/100
                  </span>
                )}
              </div>
              {sa.scoreBreakdown && (
                <div className="flex gap-2 mb-2 flex-wrap">
                  {Object.entries(sa.scoreBreakdown).map(([k,v]) => v!=null && (
                    <span key={k} className="text-xs bg-gray-50 border border-gray-100 px-2 py-0.5 rounded-full text-gray-600">
                      {k.replace(/([A-Z])/g,' $1').trim()}: {v}
                    </span>
                  ))}
                </div>
              )}
              {sa.aiFeedback && <p className="text-xs text-gray-500 italic">💡 {sa.aiFeedback}</p>}
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          <div className={`rounded-xl p-3 border flex items-center gap-3 ${DIFF_CONFIG[difficulty].color}`}>
            <span className="text-xl">{DIFF_CONFIG[difficulty].icon}</span>
            <span className="font-bold text-sm">{DIFF_CONFIG[difficulty].label} Questions — {DIFF_CONFIG[difficulty].desc}</span>
          </div>
          <div className="bg-blue-50 rounded-xl p-4 border border-blue-100 text-sm text-blue-700">
            <strong>Instructions:</strong> Answer all {questions.length} questions. AI will score each on 5 criteria.
          </div>
          {questions.map((q,i) => (
            <div key={i} className="bg-white rounded-xl p-5 border border-gray-100">
              <div className="flex gap-3 mb-3">
                <span className="bg-blue-100 text-blue-700 font-bold text-sm w-8 h-8 rounded-full flex items-center justify-center shrink-0">{i+1}</span>
                <p className="text-gray-700 leading-relaxed font-medium">{q}</p>
              </div>
              <textarea value={answers[i]||""} onChange={e=>{const a=[...answers];a[i]=e.target.value;setAnswers(a);}}
                rows={3} placeholder="Enter candidate's answer here..."
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"/>
            </div>
          ))}
          <button onClick={submitAnswers} disabled={submitting||answers.filter(a=>a.trim()).length<questions.length}
            className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700 disabled:opacity-60">
            {submitting?"Scoring with AI...":  `Submit ${questions.length} Answers for AI Scoring`}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────
export default function CandidateDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [candidate, setCandidate] = useState<Candidate|null>(null);
  const [loading, setLoading]     = useState(true);
  const [activeTab, setActiveTab] = useState("overview");
  const [generatingQ, setGeneratingQ] = useState(false);
  const [questions, setQuestions] = useState<string[]>([]);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  const API   = "https://asky-recruitiq-ai.onrender.com/api";
  const token = localStorage.getItem("token");

  useEffect(() => { fetchCandidate(); }, [id]);

  async function fetchCandidate() {
    try {
      const res  = await fetch(`${API}/candidates/${id}`, { headers:{Authorization:`Bearer ${token}`} });
      const data = await res.json();
      const c    = data.candidate||data;
      setCandidate(c);
      setQuestions(c.interviewQuestions||[]);
    } finally { setLoading(false); }
  }

  async function rescreenCandidate() {
    setLoading(true);
    try {
      const res  = await fetch(`${API}/candidates/${id}/rescreen`, {
        method:"POST", headers:{"Content-Type":"application/json", Authorization:`Bearer ${token}`},
      });
      const data = await res.json();
      if (!res.ok) { alert(data.message||"Re-screen failed"); setLoading(false); return; }
      setCandidate(prev => prev?{...prev,...data.candidate}:null);
      alert(`✅ Re-screened! New CV Score: ${data.aiScore}`);
    } catch { alert("Re-screen failed."); }
    finally { setLoading(false); }
  }

  async function updateStatus(newStatus:string) {
    setUpdatingStatus(true);
    try {
      await fetch(`${API}/candidates/${id}`, {
        method:"PATCH", headers:{"Content-Type":"application/json", Authorization:`Bearer ${token}`},
        body: JSON.stringify({ status:newStatus }),
      });
      setCandidate(prev => prev?{...prev,status:newStatus}:prev);
    } finally { setUpdatingStatus(false); }
  }

  if (loading) return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"/></div>;
  if (!candidate) return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><p className="text-gray-500">Candidate not found</p></div>;

  const cvScore       = candidate.aiScore||candidate.score||0;
  const screenScore   = candidate.screeningScore??null;
  const combinedScore = candidate.combinedScore??null;
  const tierKey       = candidate.tier?.replace(/-?Tier$/i,"");
  const tierColor     = ({A:"from-emerald-400 to-emerald-600",B:"from-blue-400 to-blue-600",C:"from-amber-400 to-amber-600"} as any)[tierKey]||"from-gray-400 to-gray-600";
  const tierBadge     = ({A:"bg-emerald-100 text-emerald-700",B:"bg-blue-100 text-blue-700",C:"bg-amber-100 text-amber-700"} as any)[tierKey]||"bg-gray-100 text-gray-600";
  const allSkills     = candidate.topSkills||candidate.skills||[];
  const jobRole       = candidate.appliedFor||candidate.jobTitle||"—";
  const currentStatus = STATUSES.find(s=>s.value===(candidate.status||"cv_uploaded"))||STATUSES[0];
  const rec           = candidate.recommendation||(cvScore>=80?"Strong Hire":cvScore>=70?"Hire":cvScore>=55?"Consider":cvScore>=40?"Weak Fit":"Reject");

  const hasRisks = candidate.riskFlags?.frequentJobChanges ||
                   (candidate.riskFlags?.missingMandatorySkills?.length??0)>0 ||
                   candidate.riskFlags?.domainMismatch;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-6 py-4">
        <button onClick={() => navigate("/candidates")} className="text-gray-500 hover:text-blue-600 text-sm mb-3">← Back to Candidates</button>
        <div className="flex items-start gap-5">
          <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${tierColor} flex items-center justify-center text-white text-2xl font-bold shadow-lg`}>
            {candidate.name?.charAt(0)?.toUpperCase()}
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-gray-900">{candidate.name}</h1>
            <div className="flex gap-4 text-sm text-gray-500 mt-1 flex-wrap">
              <span>✉️ {candidate.email}</span>
              {candidate.phone && <span>📞 {candidate.phone}</span>}
              <span>💼 <strong className="text-gray-700">{jobRole}</strong></span>
              {candidate.seniority && <span>🎯 {candidate.seniority}</span>}
              {candidate.experienceYears?<span>📅 {candidate.experienceYears} yrs</span>:null}
              {candidate.domain && <span>🏷️ {candidate.domain}</span>}
            </div>
          </div>

          {/* Score Cards */}
          <div className="flex items-end gap-3 shrink-0">
            <div className="text-center">
              <div className="text-3xl font-black text-blue-600">{cvScore}</div>
              <div className="text-xs text-gray-400">CV Score</div>
            </div>
            {screenScore!=null && (
              <>
                <div className="text-gray-300 text-lg font-light">+</div>
                <div className="text-center">
                  <div className="text-3xl font-black text-purple-600">{screenScore}</div>
                  <div className="text-xs text-gray-400">Screen</div>
                </div>
                <div className="text-gray-300 text-lg font-light">=</div>
                <div className="text-center bg-gray-50 rounded-xl px-3 py-1 border border-gray-200">
                  <div className="text-3xl font-black text-gray-900">{combinedScore??cvScore}</div>
                  <div className="text-xs text-gray-400">Combined</div>
                </div>
              </>
            )}
          </div>

          <div className="flex flex-col items-end gap-2 shrink-0">
            <span className={`text-xs font-bold px-3 py-1 rounded-full ${tierBadge}`}>{tierKey}-Tier</span>
            <span className={`text-xs font-bold px-3 py-1.5 rounded-full border ${REC_COLORS[rec]||"bg-gray-100 text-gray-600 border-gray-200"}`}>{rec}</span>
            <select value={candidate.status||"cv_uploaded"} onChange={e=>updateStatus(e.target.value)} disabled={updatingStatus}
              className={`text-xs font-semibold px-3 py-1.5 rounded-lg border-0 focus:ring-2 focus:ring-blue-500 cursor-pointer ${currentStatus.color}`}>
              {STATUSES.map(s=><option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            <div className="flex gap-2">
              <button onClick={rescreenCandidate} className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg font-semibold hover:bg-blue-700">🔄 Re-screen</button>
              <ScorecardButton candidate={candidate}/>
            </div>
          </div>
        </div>

        {/* Risk Flags */}
        {hasRisks && (
          <div className="mt-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            <p className="font-bold text-red-700 text-sm mb-2">⚠️ Risk Flags</p>
            <div className="flex gap-3 flex-wrap">
              {candidate.riskFlags?.frequentJobChanges && <span className="text-xs bg-red-100 text-red-700 px-2.5 py-1 rounded-full font-semibold">🔄 Frequent Job Changes</span>}
              {candidate.riskFlags?.domainMismatch && <span className="text-xs bg-orange-100 text-orange-700 px-2.5 py-1 rounded-full font-semibold">🎯 Domain Mismatch</span>}
              {(candidate.riskFlags?.missingMandatorySkills||[]).map(s=>(
                <span key={s} className="text-xs bg-amber-100 text-amber-700 px-2.5 py-1 rounded-full font-semibold">Missing: {s}</span>
              ))}
              {candidate.riskFlags?.noticePeriodRisk && candidate.riskFlags.noticePeriodRisk !== "Not mentioned" && (
                <span className="text-xs bg-amber-100 text-amber-700 px-2.5 py-1 rounded-full font-semibold">⏰ {candidate.riskFlags.noticePeriodRisk}</span>
              )}
            </div>
          </div>
        )}

        {candidate.primarySkillMatch===false && (
          <div className="mt-2 bg-red-50 border border-red-200 rounded-xl px-4 py-2 flex items-center gap-2">
            <span className="text-red-500">⚠️</span>
            <p className="text-sm font-semibold text-red-700">Primary Skill Mismatch — Job Fit: {candidate.jobFitScore??cvScore}/100</p>
          </div>
        )}

        {/* Pipeline bar */}
        <div className="mt-4 flex items-center gap-1">
          {STATUSES.map((s,i)=>{
            const curIdx=STATUSES.findIndex(st=>st.value===(candidate.status||"cv_uploaded"));
            return (
              <div key={s.value} className="flex-1 flex flex-col items-center">
                <div className={`h-1.5 w-full rounded-full ${i<=curIdx?"bg-blue-500":"bg-gray-200"}`}/>
                <span className={`text-xs mt-1 hidden md:block ${i<=curIdx?"text-blue-600 font-medium":"text-gray-400"}`}>{s.label}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-gray-100 px-6">
        <div className="flex gap-6 overflow-x-auto">
          {[
            { key:"overview",     label:"Overview" },
            { key:"score",        label:"Score Breakdown" },
            { key:"ai-insights",  label:"AI Insights" },
            { key:"experience",   label:"Experience" },
            { key:"questions",    label:`Questions ${questions.length>0?`(${questions.length})`:""}` },
          ].map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={`py-3 px-1 text-sm font-semibold border-b-2 transition-all whitespace-nowrap ${activeTab===tab.key?"border-blue-600 text-blue-600":"border-transparent text-gray-500 hover:text-gray-700"}`}>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-6 max-w-5xl">

        {/* ── OVERVIEW TAB ── */}
        {activeTab==="overview" && (
          <div className="space-y-5">
            {/* Combined Score Card */}
            <div className="bg-white rounded-2xl p-6 border border-gray-100">
              <h2 className="font-bold text-gray-900 mb-5">Candidate Fit Score</h2>
              <div className="grid grid-cols-3 gap-4 mb-5">
                <div className="text-center bg-blue-50 rounded-2xl p-5 border border-blue-100">
                  <div className="text-4xl font-black text-blue-600 mb-1">{cvScore}</div>
                  <div className="text-sm font-bold text-blue-700">Resume Match</div>
                  <div className="text-xs text-blue-400 mt-1">60% weight</div>
                </div>
                <div className={`text-center rounded-2xl p-5 border ${screenScore!=null?"bg-purple-50 border-purple-100":"bg-gray-50 border-gray-100"}`}>
                  <div className={`text-4xl font-black mb-1 ${screenScore!=null?"text-purple-600":"text-gray-400"}`}>{screenScore??"-"}</div>
                  <div className={`text-sm font-bold ${screenScore!=null?"text-purple-700":"text-gray-400"}`}>Screening Score</div>
                  <div className="text-xs text-gray-400 mt-1">40% weight</div>
                </div>
                <div className={`text-center rounded-2xl p-5 border ${combinedScore!=null?"bg-gray-900 border-gray-800":"bg-gray-50 border-gray-100"}`}>
                  <div className={`text-4xl font-black mb-1 ${combinedScore!=null?"text-white":"text-gray-400"}`}>{combinedScore??cvScore}</div>
                  <div className={`text-sm font-bold ${combinedScore!=null?"text-gray-300":"text-gray-400"}`}>Overall Score</div>
                  <div className="text-xs text-gray-400 mt-1">{combinedScore!=null?"Weighted Combined":"CV Only (screening pending)"}</div>
                </div>
              </div>

              {/* Recommendation */}
              <div className={`rounded-xl p-4 border text-center ${REC_COLORS[rec]||"bg-gray-50 border-gray-100"}`}>
                <div className="text-xs font-bold uppercase tracking-wide opacity-70 mb-1">Fit Recommendation</div>
                <div className="text-xl font-black">{rec}</div>
              </div>
            </div>

            {/* Basic Info */}
            <div className="bg-white rounded-2xl p-6 border border-gray-100">
              <h2 className="font-bold text-gray-900 mb-4">Candidate Info</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                <div><span className="text-gray-400 text-xs uppercase">Domain</span><p className="font-semibold mt-0.5">{candidate.domain||"—"}</p></div>
                <div><span className="text-gray-400 text-xs uppercase">Seniority</span><p className="font-semibold mt-0.5">{candidate.seniority||"—"}</p></div>
                <div><span className="text-gray-400 text-xs uppercase">Experience</span><p className="font-semibold mt-0.5">{candidate.experienceYears?`${candidate.experienceYears} years`:"—"}</p></div>
                <div><span className="text-gray-400 text-xs uppercase">Applied</span><p className="font-semibold mt-0.5">{(candidate.createdAt||candidate.appliedAt)?new Date(candidate.createdAt||candidate.appliedAt!).toLocaleDateString():"—"}</p></div>
                <div><span className="text-gray-400 text-xs uppercase">Status</span><p className="font-semibold mt-0.5">{currentStatus.label}</p></div>
                <div><span className="text-gray-400 text-xs uppercase">Recommendation</span><p className="font-semibold mt-0.5">{rec}</p></div>
              </div>
            </div>

            {/* HM Summary */}
            {(candidate.hmSummary||candidate.summary) && (
              <div className="bg-white rounded-2xl p-6 border border-gray-100">
                <h2 className="font-bold text-gray-900 mb-3">🎯 Hiring Manager Summary</h2>
                <p className="text-gray-600 leading-relaxed">{candidate.hmSummary||candidate.summary}</p>
              </div>
            )}

            {allSkills.length>0 && (
              <div className="bg-white rounded-2xl p-6 border border-gray-100">
                <h2 className="font-bold text-gray-900 mb-3">Top Skills</h2>
                <div className="flex flex-wrap gap-2">{allSkills.map(s=><span key={s} className="bg-blue-50 text-blue-700 text-sm font-medium px-3 py-1 rounded-full border border-blue-100">{s}</span>)}</div>
              </div>
            )}
          </div>
        )}

        {/* ── SCORE BREAKDOWN TAB ── */}
        {activeTab==="score" && (
          <div className="space-y-5">
            {/* Score Table */}
            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
              <div className="p-5 border-b border-gray-50">
                <h2 className="font-bold text-gray-900">Score Breakdown Table</h2>
                <p className="text-sm text-gray-400 mt-0.5">Transparent calculation of final candidate score</p>
              </div>
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-5 py-3 text-left text-xs font-bold text-gray-500 uppercase">Parameter</th>
                    <th className="px-5 py-3 text-center text-xs font-bold text-gray-500 uppercase">Score</th>
                    <th className="px-5 py-3 text-center text-xs font-bold text-gray-500 uppercase">Weight</th>
                    <th className="px-5 py-3 text-left text-xs font-bold text-gray-500 uppercase">Visual</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {/* CV Breakdown */}
                  <tr className="bg-blue-50">
                    <td className="px-5 py-3 font-bold text-blue-700 text-sm" colSpan={4}>📄 Resume Match ({cvScore}/100)</td>
                  </tr>
                  {candidate.cvScoreBreakdown && [
                    {label:"Skills Match",       score:candidate.cvScoreBreakdown.skillsMatchScore||0,      weight:"30%"},
                    {label:"Experience Relevance",score:candidate.cvScoreBreakdown.experienceScore||0,      weight:"25%"},
                    {label:"Domain Match",        score:candidate.cvScoreBreakdown.domainScore||0,          weight:"15%"},
                    {label:"Education / Certs",   score:candidate.cvScoreBreakdown.educationScore||0,       weight:"10%"},
                    {label:"Project Relevance",   score:candidate.cvScoreBreakdown.projectRelevanceScore||0,weight:"10%"},
                    {label:"Stability / Tenure",  score:candidate.cvScoreBreakdown.stabilityScore||0,       weight:"10%"},
                  ].map(row => (
                    <tr key={row.label} className="hover:bg-gray-50">
                      <td className="px-5 py-3 text-sm text-gray-700 pl-8">{row.label}</td>
                      <td className="px-5 py-3 text-center font-bold text-gray-900">{row.score}</td>
                      <td className="px-5 py-3 text-center text-xs text-gray-400">{row.weight}</td>
                      <td className="px-5 py-3"><div className="w-24 h-2 bg-gray-100 rounded-full"><div className={`h-2 rounded-full ${row.score>=80?"bg-emerald-500":row.score>=60?"bg-blue-500":"bg-amber-500"}`} style={{width:`${row.score}%`}}/></div></td>
                    </tr>
                  ))}

                  {/* Screening Breakdown */}
                  {screenScore!=null && (
                    <>
                      <tr className="bg-purple-50">
                        <td className="px-5 py-3 font-bold text-purple-700 text-sm" colSpan={4}>🎙️ Screening Score ({screenScore}/100)</td>
                      </tr>
                      {candidate.screeningBreakdown && [
                        {label:"Technical Knowledge",  score:candidate.screeningBreakdown.technical||0,         weight:"40%"},
                        {label:"Communication",         score:candidate.screeningBreakdown.communication||0,     weight:"20%"},
                        {label:"Problem Solving",       score:candidate.screeningBreakdown.problemSolving||0,    weight:"15%"},
                        {label:"Role Understanding",    score:candidate.screeningBreakdown.roleUnderstanding||0, weight:"15%"},
                        {label:"Motivation & Availability",score:candidate.screeningBreakdown.motivation||0,    weight:"10%"},
                      ].map(row => (
                        <tr key={row.label} className="hover:bg-gray-50">
                          <td className="px-5 py-3 text-sm text-gray-700 pl-8">{row.label}</td>
                          <td className="px-5 py-3 text-center font-bold text-gray-900">{row.score}</td>
                          <td className="px-5 py-3 text-center text-xs text-gray-400">{row.weight}</td>
                          <td className="px-5 py-3"><div className="w-24 h-2 bg-gray-100 rounded-full"><div className={`h-2 rounded-full ${row.score>=80?"bg-emerald-500":row.score>=60?"bg-purple-500":"bg-amber-500"}`} style={{width:`${row.score}%`}}/></div></td>
                        </tr>
                      ))}
                    </>
                  )}

                  {/* Final */}
                  <tr className="bg-gray-900">
                    <td className="px-5 py-4 font-black text-white">🏆 Overall Candidate Score</td>
                    <td className="px-5 py-4 text-center text-2xl font-black text-white">{combinedScore??cvScore}</td>
                    <td className="px-5 py-4 text-center text-xs text-gray-400">60%+40%</td>
                    <td className="px-5 py-4">
                      <span className={`text-xs font-bold px-3 py-1 rounded-full border ${REC_COLORS[rec]||"bg-gray-100 text-gray-600"}`}>{rec}</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Skill scores */}
            {(candidate.skillScores?.length??0)>0 && (
              <div className="bg-white rounded-2xl p-6 border border-gray-100">
                <h2 className="font-bold text-gray-900 mb-4">Skill-by-Skill Scores</h2>
                <div className="space-y-3">
                  {candidate.skillScores!.map(({skill,score:s})=>(
                    <ScoreBar key={skill} label={skill} score={s}
                      color={s>=80?"bg-emerald-500":s>=60?"bg-blue-500":"bg-amber-500"}/>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── AI INSIGHTS TAB ── */}
        {activeTab==="ai-insights" && (
          <div className="space-y-5">
            {/* HM Summary */}
            {(candidate.hmSummary||candidate.summary) && (
              <div className="bg-white rounded-2xl p-6 border border-gray-100">
                <h2 className="font-bold text-gray-900 mb-3">🎯 Hiring Manager Summary</h2>
                <p className="text-gray-600 leading-relaxed">{candidate.hmSummary||candidate.summary}</p>
                <div className="mt-3 pt-3 border-t border-gray-50">
                  <p className="text-xs text-gray-400">Recommendation Reason: {candidate.recommendationReason||"—"}</p>
                </div>
              </div>
            )}

            {/* Strengths & Gaps */}
            {((candidate.strengths?.length??0)>0||(candidate.gaps?.length??0)>0) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {(candidate.strengths?.length??0)>0 && (
                  <div className="bg-white rounded-2xl p-5 border border-gray-100">
                    <h3 className="font-bold text-emerald-700 mb-3">✅ Strengths</h3>
                    <ul className="space-y-2">{candidate.strengths!.map((s,i)=><li key={i} className="text-sm text-gray-700 flex gap-2"><span className="text-emerald-500 mt-0.5">•</span>{s}</li>)}</ul>
                  </div>
                )}
                {(candidate.gaps?.length??0)>0 && (
                  <div className="bg-white rounded-2xl p-5 border border-gray-100">
                    <h3 className="font-bold text-amber-700 mb-3">⚠️ Concerns / Gaps</h3>
                    <ul className="space-y-2">{candidate.gaps!.map((g,i)=><li key={i} className="text-sm text-gray-700 flex gap-2"><span className="text-amber-500 mt-0.5">•</span>{g}</li>)}</ul>
                  </div>
                )}
              </div>
            )}

            {/* Interview Focus Areas */}
            {(candidate.interviewFocusAreas?.length??0)>0 && (
              <div className="bg-white rounded-2xl p-5 border border-gray-100">
                <h3 className="font-bold text-gray-900 mb-3">🎯 HM Interview Focus Areas</h3>
                <div className="space-y-2">
                  {candidate.interviewFocusAreas!.map((area,i)=>(
                    <div key={i} className="flex gap-3 items-start">
                      <span className="w-6 h-6 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-xs font-bold shrink-0">{i+1}</span>
                      <p className="text-sm text-gray-700">{area}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Missing Mandatory Skills */}
            {(candidate.riskFlags?.missingMandatorySkills?.length??0)>0 && (
              <div className="bg-red-50 rounded-2xl p-5 border border-red-200">
                <h3 className="font-bold text-red-700 mb-3">❌ Missing Mandatory Skills</h3>
                <div className="flex flex-wrap gap-2">
                  {candidate.riskFlags!.missingMandatorySkills!.map(s=>(
                    <span key={s} className="bg-red-100 text-red-700 text-sm font-semibold px-3 py-1 rounded-full">{s}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── EXPERIENCE TAB ── */}
        {activeTab==="experience" && (
          <div className="space-y-5">
            <div className="bg-white rounded-2xl p-6 border border-gray-100">
              <h2 className="font-bold text-gray-900 mb-5">Experience Overview</h2>
              <div className="grid grid-cols-3 gap-4 mb-5">
                <div className={`rounded-2xl p-5 text-center border-2 ${!candidate.experienceYears?"bg-gray-50 border-gray-100":candidate.experienceYears<=2?"bg-emerald-50 border-emerald-200":candidate.experienceYears<=5?"bg-blue-50 border-blue-200":"bg-purple-50 border-purple-200"}`}>
                  <div className={`text-4xl font-black mb-1 ${!candidate.experienceYears?"text-gray-400":candidate.experienceYears<=2?"text-emerald-600":candidate.experienceYears<=5?"text-blue-600":"text-purple-600"}`}>{candidate.experienceYears??"—"}</div>
                  <div className="text-sm font-bold text-gray-600">Years Experience</div>
                </div>
                <div className="bg-gray-50 rounded-2xl p-5 text-center border border-gray-100">
                  <div className="text-2xl font-black text-gray-900 mb-1">{candidate.seniority||"—"}</div>
                  <div className="text-sm font-bold text-gray-600">Seniority Level</div>
                </div>
                <div className="bg-gray-50 rounded-2xl p-5 text-center border border-gray-100">
                  <div className="text-2xl font-black text-gray-900 mb-1">{candidate.domain||"—"}</div>
                  <div className="text-sm font-bold text-gray-600">Primary Domain</div>
                </div>
              </div>
              {(candidate.technicalExperience||candidate.leadershipExperience||candidate.cloudExpertise) && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {candidate.technicalExperience && <div className="bg-blue-50 rounded-xl p-4"><div className="text-blue-600 text-xs font-bold uppercase mb-2">🔧 Technical</div><p className="text-gray-600 text-sm">{candidate.technicalExperience}</p></div>}
                  {candidate.leadershipExperience && <div className="bg-purple-50 rounded-xl p-4"><div className="text-purple-600 text-xs font-bold uppercase mb-2">👥 Leadership</div><p className="text-gray-600 text-sm">{candidate.leadershipExperience}</p></div>}
                  {candidate.cloudExpertise && <div className="bg-emerald-50 rounded-xl p-4"><div className="text-emerald-600 text-xs font-bold uppercase mb-2">☁️ Cloud</div><p className="text-gray-600 text-sm">{candidate.cloudExpertise}</p></div>}
                </div>
              )}
            </div>
            {((candidate.databases?.length??0)>0||(candidate.frameworks?.length??0)>0||(candidate.tools?.length??0)>0) && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {(candidate.databases?.length??0)>0 && <div className="bg-white rounded-2xl p-5 border border-gray-100"><h3 className="font-bold text-gray-700 text-sm mb-3">🗄️ Databases</h3><div className="flex flex-wrap gap-2">{candidate.databases!.map(d=><span key={d} className="bg-orange-50 text-orange-700 text-xs px-2.5 py-1 rounded-full border border-orange-100">{d}</span>)}</div></div>}
                {(candidate.frameworks?.length??0)>0 && <div className="bg-white rounded-2xl p-5 border border-gray-100"><h3 className="font-bold text-gray-700 text-sm mb-3">⚙️ Frameworks</h3><div className="flex flex-wrap gap-2">{candidate.frameworks!.map(f=><span key={f} className="bg-violet-50 text-violet-700 text-xs px-2.5 py-1 rounded-full border border-violet-100">{f}</span>)}</div></div>}
                {(candidate.tools?.length??0)>0 && <div className="bg-white rounded-2xl p-5 border border-gray-100"><h3 className="font-bold text-gray-700 text-sm mb-3">🛠️ Tools</h3><div className="flex flex-wrap gap-2">{candidate.tools!.map(t=><span key={t} className="bg-gray-100 text-gray-700 text-xs px-2.5 py-1 rounded-full">{t}</span>)}</div></div>}
              </div>
            )}
          </div>
        )}

        {/* ── QUESTIONS TAB ── */}
        {activeTab==="questions" && (
          <QuestionsTab candidate={candidate} questions={questions} setQuestions={setQuestions}
            setCandidate={setCandidate} generatingQ={generatingQ} setGeneratingQ={setGeneratingQ}
            API={API} token={token||""} id={id||""}/>
        )}
      </div>
    </div>
  );
}
