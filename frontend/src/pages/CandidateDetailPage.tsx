import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";

interface SkillScore { skill: string; score: number; }
interface Candidate {
  _id: string; name: string; email: string; phone?: string;
  jobTitle?: string; appliedFor?: string; score?: number; aiScore?: number;
  tier: string; riskLevel?: string; appliedAt?: string; createdAt?: string;
  summary?: string; topSkills?: string[]; skills?: string[];
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
  screeningScore?: number;
  screeningAnswers?: { question: string; answer: string; aiScore?: number; aiFeedback?: string; }[];
}

const STATUSES = [
  { value: "cv_uploaded", label: "CV Uploaded", color: "bg-gray-100 text-gray-600" },
  { value: "ai_screened", label: "AI Screened", color: "bg-blue-100 text-blue-700" },
  { value: "questions_sent", label: "Questions Sent", color: "bg-purple-100 text-purple-700" },
  { value: "answers_submitted", label: "Answers Submitted", color: "bg-amber-100 text-amber-700" },
  { value: "hm_ready", label: "HM Ready", color: "bg-emerald-100 text-emerald-700" },
  { value: "rejected", label: "Rejected", color: "bg-red-100 text-red-700" },
];


interface QuestionsTabProps {
  candidate: Candidate; questions: string[]; setQuestions: (q: string[]) => void;
  setCandidate: (c: any) => void; generatingQ: boolean; setGeneratingQ: (v: boolean) => void;
  API: string; token: string; id: string;
}

function QuestionsTab({ candidate, questions, setQuestions, setCandidate, generatingQ, setGeneratingQ, API, token, id }: QuestionsTabProps) {
  const [answers, setAnswers] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState((candidate.screeningAnswers?.length ?? 0) > 0);
  const [result, setResult] = useState<{ screeningScore: number; combinedScore: number; status: string } | null>(null);

  const hasAnswers = (candidate.screeningAnswers?.length ?? 0) > 0;
  const screeningScore = candidate.screeningScore;

  async function generateQuestions() {
    setGeneratingQ(true);
    try {
      const res = await fetch(`${API}/candidates/${id}/questions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ jobTitle: candidate.appliedFor || candidate.jobTitle, skills: candidate.topSkills }),
      });
      const data = await res.json();
      const qs = data.questions || [];
      setQuestions(qs);
      setAnswers(new Array(qs.length).fill(""));
      setCandidate((prev: Candidate) => ({ ...prev, interviewQuestions: qs, status: data.status || prev.status }));
    } catch { alert("Failed to generate questions."); }
    finally { setGeneratingQ(false); }
  }

  async function submitAnswers() {
    if (answers.some(a => !a.trim())) return alert("Please answer all questions before submitting.");
    setSubmitting(true);
    try {
      const payload = questions.map((q, i) => ({ question: q, answer: answers[i] }));
      const res = await fetch(`${API}/candidates/${id}/answers`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ answers: payload }),
      });
      const data = await res.json();
      setResult({ screeningScore: data.screeningScore, combinedScore: data.combinedScore, status: data.status });
      setSubmitted(true);
      setCandidate((prev: Candidate) => ({ ...prev, ...data.candidate }));
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
            className="bg-blue-600 text-white px-5 py-2.5 rounded-xl font-semibold hover:bg-blue-700 transition-all disabled:opacity-60 text-sm">
            {generatingQ ? "Generating..." : questions.length > 0 ? "↻ Regenerate" : "✨ Generate Questions"}
          </button>
        )}
      </div>

      {/* Result banner */}
      {result && (
        <div className={`rounded-2xl p-5 border ${result.status === "hm_ready" ? "bg-emerald-50 border-emerald-200" : "bg-amber-50 border-amber-200"}`}>
          <div className="flex items-center gap-3 mb-2">
            <span className="text-2xl">{result.status === "hm_ready" ? "🎉" : "📋"}</span>
            <div>
              <p className="font-bold text-gray-900">{result.status === "hm_ready" ? "Candidate moved to HM Ready!" : "Answers submitted for review"}</p>
              <p className="text-sm text-gray-600">Screening Score: <strong>{result.screeningScore}/100</strong> · Combined Score: <strong>{result.combinedScore}/100</strong></p>
            </div>
          </div>
        </div>
      )}

      {questions.length === 0 && !hasAnswers ? (
        <div className="bg-white rounded-2xl p-12 border border-gray-100 text-center text-gray-400">
          <div className="text-5xl mb-4">❓</div>
          <p className="font-medium">No questions yet</p>
          <p className="text-sm mt-1">Click "Generate Questions" to create AI-powered screening questions</p>
        </div>
      ) : hasAnswers ? (
        // Show submitted answers with scores
        <div className="space-y-4">
          <div className="bg-white rounded-2xl p-5 border border-gray-100 flex items-center gap-4">
            <div className="text-center">
              <div className="text-3xl font-black text-gray-900">{screeningScore ?? "—"}</div>
              <div className="text-xs text-gray-500">Screening Score</div>
            </div>
            <div className="flex-1 h-3 bg-gray-100 rounded-full">
              <div className={`h-3 rounded-full ${(screeningScore ?? 0) >= 80 ? "bg-emerald-500" : (screeningScore ?? 0) >= 60 ? "bg-blue-500" : "bg-amber-500"}`}
                style={{ width: `${screeningScore ?? 0}%` }} />
            </div>
            <span className={`text-xs font-bold px-3 py-1.5 rounded-full ${(screeningScore ?? 0) >= 60 ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
              {(screeningScore ?? 0) >= 60 ? "✓ Passed" : "Needs Review"}
            </span>
          </div>

          {candidate.screeningAnswers!.map((sa, i) => (
            <div key={i} className="bg-white rounded-xl p-5 border border-gray-100">
              <div className="flex items-start justify-between mb-2">
                <p className="font-semibold text-gray-800 text-sm flex-1">Q{i+1}: {sa.question}</p>
                {sa.aiScore !== undefined && (
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-full ml-3 shrink-0 ${sa.aiScore >= 80 ? "bg-emerald-100 text-emerald-700" : sa.aiScore >= 60 ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700"}`}>
                    {sa.aiScore}/100
                  </span>
                )}
              </div>
              <p className="text-gray-600 text-sm bg-gray-50 p-3 rounded-lg mb-2">{sa.answer}</p>
              {sa.aiFeedback && <p className="text-xs text-gray-500 italic">💡 {sa.aiFeedback}</p>}
            </div>
          ))}
        </div>
      ) : (
        // Show questions with answer inputs
        <div className="space-y-4">
          <div className="bg-blue-50 rounded-xl p-4 border border-blue-100 text-sm text-blue-700">
            <strong>Instructions:</strong> Answer all {questions.length} questions below, then click Submit Answers. AI will score each response and automatically determine if the candidate is HM-ready.
          </div>
          {questions.map((q, i) => (
            <div key={i} className="bg-white rounded-xl p-5 border border-gray-100">
              <div className="flex gap-3 mb-3">
                <span className="bg-blue-100 text-blue-700 font-bold text-sm w-8 h-8 rounded-full flex items-center justify-center shrink-0">{i + 1}</span>
                <p className="text-gray-700 leading-relaxed font-medium">{q}</p>
              </div>
              <textarea
                value={answers[i] || ""}
                onChange={e => { const a = [...answers]; a[i] = e.target.value; setAnswers(a); }}
                rows={3}
                placeholder="Enter candidate's answer here..."
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </div>
          ))}
          <button onClick={submitAnswers} disabled={submitting || answers.filter(a => a.trim()).length < questions.length}
            className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700 transition-all disabled:opacity-60">
            {submitting ? "Scoring answers with AI..." : `Submit ${questions.length} Answers for AI Screening`}
          </button>
        </div>
      )}
    </div>
  );
}

export default function CandidateDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("profile");
  const [generatingQ, setGeneratingQ] = useState(false);
  const [questions, setQuestions] = useState<string[]>([]);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  const API = "https://asky-recruitiq-ai.onrender.com/api";
  const token = localStorage.getItem("token");
  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const isAdmin = user.role === "admin";

  useEffect(() => { fetchCandidate(); }, [id]);

  async function fetchCandidate() {
    try {
      const res = await fetch(`${API}/candidates/${id}`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      const c = data.candidate || data;
      setCandidate(c);
      setQuestions(c.interviewQuestions || []);
    } finally { setLoading(false); }
  }

  async function generateQuestions() {
    setGeneratingQ(true);
    try {
      const res = await fetch(`${API}/candidates/${id}/questions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ jobTitle: candidate?.appliedFor || candidate?.jobTitle, skills: candidate?.topSkills }),
      });
      const data = await res.json();
      const qs = data.questions || [];
      setQuestions(qs);
      setCandidate(prev => prev ? { ...prev, interviewQuestions: qs } : prev);
    } catch { alert("Failed to generate questions."); }
    finally { setGeneratingQ(false); }
  }

  async function rescreenCandidate() {
    setLoading(true);
    try {
      const res = await fetch(`${API}/candidates/${id}/rescreen`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) { alert(data.message || "Re-screen failed"); setLoading(false); return; }
      setCandidate(prev => prev ? { ...prev, ...data.candidate } : null);
      alert(`✅ Re-screened! New AI Score: ${data.aiScore}`);
    } catch { alert("Re-screen failed."); }
    finally { setLoading(false); }
  }

  async function updateStatus(newStatus: string) {
    setUpdatingStatus(true);
    try {
      await fetch(`${API}/candidates/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: newStatus }),
      });
      setCandidate(prev => prev ? { ...prev, status: newStatus } : prev);
    } finally { setUpdatingStatus(false); }
  }

  if (loading) return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" /></div>;
  if (!candidate) return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><p className="text-gray-500">Candidate not found</p></div>;

  const score = candidate.aiScore || candidate.score || 0;
  const tierKey = candidate.tier?.replace(/-?Tier$/i, "");
  const tierColor = ({ A: "from-emerald-400 to-emerald-600", B: "from-blue-400 to-blue-600", C: "from-amber-400 to-amber-600" } as any)[tierKey] || "from-gray-400 to-gray-600";
  const tierBadge = ({ A: "bg-emerald-100 text-emerald-700", B: "bg-blue-100 text-blue-700", C: "bg-amber-100 text-amber-700" } as any)[tierKey] || "bg-gray-100 text-gray-600";
  const allSkills = candidate.topSkills || candidate.skills || [];
  const jobRole = candidate.appliedFor || candidate.jobTitle || "—";
  const currentStatus = STATUSES.find(s => s.value === (candidate.status || "cv_uploaded")) || STATUSES[0];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-6 py-4">
        <button onClick={() => navigate("/candidates")} className="text-gray-500 hover:text-blue-600 text-sm mb-3">← Back to Candidates</button>
        <div className="flex items-center gap-5">
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
              {candidate.experienceYears ? <span>📅 {candidate.experienceYears} yrs</span> : null}
              {candidate.domain && <span>🏷️ {candidate.domain}</span>}
            </div>
            {/* Project domains */}
            {(candidate.projectDomains?.length ?? 0) > 0 && (
              <div className="flex gap-1.5 mt-2 flex-wrap">
                {candidate.projectDomains!.map(d => (
                  <span key={d} className="bg-indigo-50 text-indigo-700 text-xs px-2.5 py-0.5 rounded-full border border-indigo-100 font-medium">{d}</span>
                ))}
              </div>
            )}
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="text-right">
              <div className="text-4xl font-black text-gray-900">{score}</div>
              <div className="text-xs text-gray-400">/ 100</div>
              <span className={`text-xs font-bold px-3 py-1 rounded-full mt-1 inline-block ${tierBadge}`}>{tierKey}-Tier</span>
            </div>
            {/* Status dropdown */}
            <select value={candidate.status || "cv_uploaded"} onChange={e => updateStatus(e.target.value)} disabled={updatingStatus}
              className={`text-xs font-semibold px-3 py-1.5 rounded-lg border-0 focus:ring-2 focus:ring-blue-500 cursor-pointer ${currentStatus.color}`}>
              {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            <button onClick={rescreenCandidate}
              className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg font-semibold hover:bg-blue-700 transition-all">
              🔄 Re-screen AI
            </button>
          </div>
        </div>

        {/* Skill match warning banner */}
        {candidate.primarySkillMatch === false && (
          <div className="mt-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-center gap-3">
            <span className="text-red-500 text-xl">⚠️</span>
            <div>
              <p className="font-bold text-red-700 text-sm">Primary Skill Mismatch</p>
              <p className="text-xs text-red-600">This candidate's primary skills do not match the required skill for this role. Score has been adjusted to reflect job fit.</p>
            </div>
            <span className="ml-auto text-xs bg-red-100 text-red-700 px-2 py-1 rounded-lg font-bold shrink-0">
              Job Fit: {candidate.jobFitScore ?? score}/100
            </span>
          </div>
        )}
        {candidate.primarySkillMatch === true && (
          <div className="mt-3 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2 flex items-center gap-2">
            <span className="text-emerald-500">✅</span>
            <p className="text-sm font-semibold text-emerald-700">Primary skill match confirmed</p>
            {candidate.primarySkillScore && <span className="ml-auto text-xs bg-emerald-100 text-emerald-700 px-2 py-1 rounded-lg font-bold">Skill Score: {candidate.primarySkillScore}/100</span>}
          </div>
        )}

        {/* Status pipeline bar */}
        <div className="mt-4 flex items-center gap-1">
          {STATUSES.map((s, i) => {
            const currentIdx = STATUSES.findIndex(st => st.value === (candidate.status || "cv_uploaded"));
            const isActive = i <= currentIdx;
            return (
              <div key={s.value} className="flex-1 flex flex-col items-center">
                <div className={`h-1.5 w-full rounded-full ${isActive ? "bg-blue-500" : "bg-gray-200"}`} />
                <span className={`text-xs mt-1 hidden md:block ${isActive ? "text-blue-600 font-medium" : "text-gray-400"}`}>{s.label}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-gray-100 px-6">
        <div className="flex gap-6">
          {["profile", "ai-analysis", "questions", "recommendation"].map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`py-3 px-1 text-sm font-semibold capitalize border-b-2 transition-all whitespace-nowrap ${activeTab === tab ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
              {tab === "ai-analysis" ? "AI Analysis" : tab === "questions" ? `Interview Questions ${questions.length > 0 ? `(${questions.length})` : ""}` : tab}
            </button>
          ))}
        </div>
      </div>

      <div className="p-6 max-w-5xl">

        {/* PROFILE TAB */}
        {activeTab === "profile" && (
          <div className="space-y-5">
            <div className="bg-white rounded-2xl p-6 border border-gray-100">
              <h2 className="font-bold text-gray-900 mb-4">Candidate Info</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                <div><span className="text-gray-400 text-xs uppercase">Domain</span><p className="font-semibold text-gray-900 mt-0.5">{candidate.domain || "—"}</p></div>
                <div><span className="text-gray-400 text-xs uppercase">Seniority</span><p className="font-semibold text-gray-900 mt-0.5">{candidate.seniority || "—"}</p></div>
                <div><span className="text-gray-400 text-xs uppercase">Experience</span><p className="font-semibold text-gray-900 mt-0.5">{candidate.experienceYears ? `${candidate.experienceYears} years` : "—"}</p></div>
                <div><span className="text-gray-400 text-xs uppercase">Risk Level</span><p className="font-semibold text-gray-900 mt-0.5 capitalize">{candidate.riskLevel || "medium"}</p></div>
                <div><span className="text-gray-400 text-xs uppercase">Applied</span><p className="font-semibold text-gray-900 mt-0.5">{(candidate.createdAt||candidate.appliedAt) ? new Date(candidate.createdAt||candidate.appliedAt!).toLocaleDateString() : "—"}</p></div>
                <div><span className="text-gray-400 text-xs uppercase">Status</span><p className="font-semibold text-gray-900 mt-0.5">{currentStatus.label}</p></div>
              </div>
            </div>

            {candidate.summary && (
              <div className="bg-white rounded-2xl p-6 border border-gray-100">
                <h2 className="font-bold text-gray-900 mb-3">AI Summary</h2>
                <p className="text-gray-600 leading-relaxed">{candidate.summary}</p>
              </div>
            )}

            {(candidate.technicalExperience || candidate.leadershipExperience || candidate.cloudExpertise) && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white rounded-2xl p-5 border border-gray-100">
                  <div className="text-blue-600 text-xs font-bold uppercase tracking-wider mb-2">🔧 Technical Experience</div>
                  <p className="text-gray-600 text-sm leading-relaxed">{candidate.technicalExperience || "—"}</p>
                </div>
                <div className="bg-white rounded-2xl p-5 border border-gray-100">
                  <div className="text-purple-600 text-xs font-bold uppercase tracking-wider mb-2">👥 Leadership Experience</div>
                  <p className="text-gray-600 text-sm leading-relaxed">{candidate.leadershipExperience || "—"}</p>
                </div>
                <div className="bg-white rounded-2xl p-5 border border-gray-100">
                  <div className="text-emerald-600 text-xs font-bold uppercase tracking-wider mb-2">☁️ Cloud Expertise</div>
                  <p className="text-gray-600 text-sm leading-relaxed">{candidate.cloudExpertise || "—"}</p>
                </div>
              </div>
            )}

            {((candidate.strengths?.length ?? 0) > 0 || (candidate.gaps?.length ?? 0) > 0) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {(candidate.strengths?.length ?? 0) > 0 && (
                  <div className="bg-white rounded-2xl p-5 border border-gray-100">
                    <h3 className="font-bold text-emerald-700 mb-3">✅ Strengths</h3>
                    <ul className="space-y-1.5">{candidate.strengths!.map((s, i) => <li key={i} className="text-sm text-gray-700">• {s}</li>)}</ul>
                  </div>
                )}
                {(candidate.gaps?.length ?? 0) > 0 && (
                  <div className="bg-white rounded-2xl p-5 border border-gray-100">
                    <h3 className="font-bold text-amber-700 mb-3">⚠️ Gaps</h3>
                    <ul className="space-y-1.5">{candidate.gaps!.map((g, i) => <li key={i} className="text-sm text-gray-700">• {g}</li>)}</ul>
                  </div>
                )}
              </div>
            )}

            {allSkills.length > 0 && (
              <div className="bg-white rounded-2xl p-6 border border-gray-100">
                <h2 className="font-bold text-gray-900 mb-3">Top Skills</h2>
                <div className="flex flex-wrap gap-2">
                  {allSkills.map(s => <span key={s} className="bg-blue-50 text-blue-700 text-sm font-medium px-3 py-1 rounded-full border border-blue-100">{s}</span>)}
                </div>
              </div>
            )}

            {((candidate.databases?.length ?? 0) > 0 || (candidate.frameworks?.length ?? 0) > 0 || (candidate.tools?.length ?? 0) > 0) && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {(candidate.databases?.length ?? 0) > 0 && (
                  <div className="bg-white rounded-2xl p-5 border border-gray-100">
                    <h3 className="font-bold text-gray-700 text-sm mb-3">🗄️ Databases</h3>
                    <div className="flex flex-wrap gap-2">{candidate.databases!.map(d => <span key={d} className="bg-orange-50 text-orange-700 text-xs font-medium px-2.5 py-1 rounded-full border border-orange-100">{d}</span>)}</div>
                  </div>
                )}
                {(candidate.frameworks?.length ?? 0) > 0 && (
                  <div className="bg-white rounded-2xl p-5 border border-gray-100">
                    <h3 className="font-bold text-gray-700 text-sm mb-3">⚙️ Frameworks</h3>
                    <div className="flex flex-wrap gap-2">{candidate.frameworks!.map(f => <span key={f} className="bg-violet-50 text-violet-700 text-xs font-medium px-2.5 py-1 rounded-full border border-violet-100">{f}</span>)}</div>
                  </div>
                )}
                {(candidate.tools?.length ?? 0) > 0 && (
                  <div className="bg-white rounded-2xl p-5 border border-gray-100">
                    <h3 className="font-bold text-gray-700 text-sm mb-3">🛠️ Tools</h3>
                    <div className="flex flex-wrap gap-2">{candidate.tools!.map(t => <span key={t} className="bg-gray-100 text-gray-700 text-xs font-medium px-2.5 py-1 rounded-full">{t}</span>)}</div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* AI ANALYSIS TAB */}
        {activeTab === "ai-analysis" && (
          <div className="space-y-5">
            <div className="bg-white rounded-2xl p-6 border border-gray-100">
              <h2 className="font-bold text-gray-900 mb-4">Overall AI Score</h2>
              <div className="flex items-center gap-4">
                <div className="text-5xl font-black text-gray-900">{score}</div>
                <div className="flex-1">
                  <div className="h-4 bg-gray-100 rounded-full">
                    <div className={`h-4 rounded-full ${score >= 80 ? "bg-emerald-500" : score >= 60 ? "bg-blue-500" : "bg-amber-500"}`} style={{ width: `${score}%` }} />
                  </div>
                  <p className="text-sm text-gray-500 mt-2">{score >= 80 ? "🌟 Excellent" : score >= 60 ? "👍 Good" : "🔍 Needs review"}</p>
                </div>
              </div>
            </div>
            {(candidate.skillScores?.length ?? 0) > 0 && (
              <div className="bg-white rounded-2xl p-6 border border-gray-100">
                <h2 className="font-bold text-gray-900 mb-5">Skill-by-Skill Scores</h2>
                <div className="space-y-4">
                  {candidate.skillScores!.map(({ skill, score: s }) => (
                    <div key={skill}>
                      <div className="flex justify-between text-sm mb-1.5">
                        <span className="font-medium text-gray-700">{skill}</span>
                        <span className="font-bold text-gray-900">{s}/100</span>
                      </div>
                      <div className="h-2.5 bg-gray-100 rounded-full">
                        <div className={`h-2.5 rounded-full ${s >= 80 ? "bg-emerald-500" : s >= 60 ? "bg-blue-500" : "bg-amber-500"}`} style={{ width: `${s}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {((candidate.strengths?.length ?? 0) > 0 || (candidate.gaps?.length ?? 0) > 0) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {(candidate.strengths?.length ?? 0) > 0 && (
                  <div className="bg-white rounded-2xl p-5 border border-gray-100">
                    <h3 className="font-bold text-emerald-700 mb-3">✅ Strengths</h3>
                    <ul className="space-y-1.5">{candidate.strengths!.map((s,i) => <li key={i} className="text-sm text-gray-700">• {s}</li>)}</ul>
                  </div>
                )}
                {(candidate.gaps?.length ?? 0) > 0 && (
                  <div className="bg-white rounded-2xl p-5 border border-gray-100">
                    <h3 className="font-bold text-amber-700 mb-3">⚠️ Gaps</h3>
                    <ul className="space-y-1.5">{candidate.gaps!.map((g,i) => <li key={i} className="text-sm text-gray-700">• {g}</li>)}</ul>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* INTERVIEW QUESTIONS TAB */}
        {activeTab === "questions" && (
          <QuestionsTab
            candidate={candidate}
            questions={questions}
            setQuestions={setQuestions}
            setCandidate={setCandidate}
            generatingQ={generatingQ}
            setGeneratingQ={setGeneratingQ}
            API={API}
            token={token || ""}
            id={id || ""}
          />
        )}

        {/* RECOMMENDATION TAB */}
        {activeTab === "recommendation" && (
          <div className="space-y-5">
            <div className="bg-white rounded-2xl p-6 border border-gray-100">
              <h2 className="font-bold text-gray-900 mb-4">AI Hiring Recommendation</h2>
              <div className={`inline-block px-5 py-2 rounded-full text-sm font-bold mb-4 ${
                candidate.recommendation === "Strong Hire" ? "bg-emerald-100 text-emerald-700" :
                candidate.recommendation === "Hire" ? "bg-blue-100 text-blue-700" :
                candidate.recommendation === "Maybe" ? "bg-amber-100 text-amber-700" :
                candidate.recommendation ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-600"}`}>
                {candidate.recommendation || (score >= 80 ? "Strong Hire" : score >= 60 ? "Hire" : score >= 40 ? "Maybe" : "No Hire")}
              </div>
              <p className="text-gray-600 leading-relaxed">
                {candidate.recommendationReason || (score >= 80 ? "Strong candidate — recommend moving forward to interview." : score >= 60 ? "Good candidate — consider for interview." : "Below average match — review manually before proceeding.")}
              </p>
            </div>

            {(candidate.databases?.length || candidate.frameworks?.length || candidate.tools?.length) ? (
              <div className="bg-white rounded-2xl p-6 border border-gray-100">
                <h2 className="font-bold text-gray-900 mb-4">Technology Stack</h2>
                <div className="space-y-3 text-sm">
                  {(candidate.databases?.length ?? 0) > 0 && (
                    <div className="flex gap-3 items-start">
                      <span className="text-orange-500 font-bold w-24 shrink-0">Databases</span>
                      <div className="flex flex-wrap gap-1.5">{candidate.databases!.map(d => <span key={d} className="bg-orange-50 text-orange-700 px-2.5 py-0.5 rounded-full text-xs font-medium border border-orange-100">{d}</span>)}</div>
                    </div>
                  )}
                  {(candidate.frameworks?.length ?? 0) > 0 && (
                    <div className="flex gap-3 items-start">
                      <span className="text-violet-500 font-bold w-24 shrink-0">Frameworks</span>
                      <div className="flex flex-wrap gap-1.5">{candidate.frameworks!.map(f => <span key={f} className="bg-violet-50 text-violet-700 px-2.5 py-0.5 rounded-full text-xs font-medium border border-violet-100">{f}</span>)}</div>
                    </div>
                  )}
                  {(candidate.tools?.length ?? 0) > 0 && (
                    <div className="flex gap-3 items-start">
                      <span className="text-gray-500 font-bold w-24 shrink-0">Tools</span>
                      <div className="flex flex-wrap gap-1.5">{candidate.tools!.map(t => <span key={t} className="bg-gray-100 text-gray-700 px-2.5 py-0.5 rounded-full text-xs font-medium">{t}</span>)}</div>
                    </div>
                  )}
                </div>
              </div>
            ) : null}

            {(candidate.skillScores?.length ?? 0) > 0 && (
              <div className="bg-white rounded-2xl p-6 border border-gray-100">
                <h2 className="font-bold text-gray-900 mb-4">Skill Scores</h2>
                <div className="grid grid-cols-2 gap-3">
                  {candidate.skillScores!.map(({ skill, score: s }) => (
                    <div key={skill} className="flex items-center gap-3">
                      <span className="text-sm text-gray-700 w-28 shrink-0">{skill}</span>
                      <div className="flex-1 h-2 bg-gray-100 rounded-full">
                        <div className={`h-2 rounded-full ${s >= 80 ? "bg-emerald-500" : s >= 60 ? "bg-blue-500" : "bg-amber-500"}`} style={{ width: `${s}%` }} />
                      </div>
                      <span className="text-xs font-bold text-gray-600 w-8">{s}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
