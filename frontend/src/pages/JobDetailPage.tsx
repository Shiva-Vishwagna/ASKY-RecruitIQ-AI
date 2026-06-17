import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import ShareJobButton from "../components/ShareJobButton";

interface Job {
  _id: string; title: string; department: string; location: string;
  status: string; description: string; requirements: string[];
  level?: string; requiredSkills?: string[]; minAiScore?: number; createdAt: string;
}
interface Candidate {
  _id: string; name: string; email: string;
  score?: number; aiScore?: number; screeningScore?: number;
  tier: string; riskLevel: string; status?: string;
  appliedAt?: string; createdAt?: string;
  topSkills?: string[]; domain?: string; seniority?: string; experienceYears?: number;
  primarySkillMatch?: boolean;
  jobFitScore?: number;
  interviewQuestions?: string[];
  screeningAnswers?: { question: string; answer: string; aiScore?: number; aiFeedback?: string }[];
}

const STAGES = [
  { value: "cv_uploaded",       label: "CV Uploaded",       color: "bg-gray-100 text-gray-600",     dot: "bg-gray-400" },
  { value: "ai_screened",       label: "AI Screened",       color: "bg-blue-100 text-blue-700",     dot: "bg-blue-500" },
  { value: "questions_sent",    label: "Questions Sent",    color: "bg-purple-100 text-purple-700", dot: "bg-purple-500" },
  { value: "answers_submitted", label: "Answers Submitted", color: "bg-amber-100 text-amber-700",   dot: "bg-amber-500" },
  { value: "hm_ready",          label: "HM Ready",          color: "bg-emerald-100 text-emerald-700", dot: "bg-emerald-500" },
  { value: "rejected",          label: "Rejected",          color: "bg-red-100 text-red-700",       dot: "bg-red-500" },
];

const tierColors: Record<string, string> = {
  A: "bg-emerald-100 text-emerald-700",
  B: "bg-blue-100 text-blue-700",
  C: "bg-amber-100 text-amber-700",
};

export default function JobDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [job, setJob] = useState<Job | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [activeTab, setActiveTab] = useState("pipeline");
  const [stageFilter, setStageFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);

  const API = "https://asky-recruitiq-ai.onrender.com/api";
  const token = localStorage.getItem("token");

  useEffect(() => { fetchJob(); fetchCandidates(); }, [id]);

  async function fetchJob() {
    try {
      const res = await fetch(`${API}/jobs/${id}`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      setJob(data.job || data);
    } finally { setLoading(false); }
  }

  async function fetchCandidates() {
    try {
      const res = await fetch(`${API}/jobs/${id}/candidates`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      setCandidates(data.candidates || data || []);
    } catch { setCandidates([]); }
  }

  async function handleResumeUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files?.length) return;
    setUploading(true);
    const formData = new FormData();
    Array.from(files).forEach(f => formData.append("resumes", f));
    formData.append("jobId", id || "");
    formData.append("jobTitle", job?.title || "");
    try {
      await fetch(`${API}/resumes/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      await fetchCandidates();
    } finally { setUploading(false); e.target.value = ""; }
  }

  async function updateCandidateStatus(candidateId: string, newStatus: string) {
    await fetch(`${API}/candidates/${candidateId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status: newStatus }),
    });
    setCandidates(prev => prev.map(c => c._id === candidateId ? { ...c, status: newStatus } : c));
    if (selectedCandidate?._id === candidateId) setSelectedCandidate(prev => prev ? { ...prev, status: newStatus } : null);
  }

  async function deleteCandidate(candidateId: string) {
    if (!window.confirm("Remove this candidate from the job?")) return;
    await fetch(`${API}/candidates/${candidateId}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
    setCandidates(prev => prev.filter(c => c._id !== candidateId));
    if (selectedCandidate?._id === candidateId) setSelectedCandidate(null);
  }

  if (loading) return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" /></div>;
  if (!job) return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><p className="text-gray-500">Job not found</p></div>;

  const filteredCandidates = stageFilter === "all" ? candidates : candidates.filter(c => (c.status || "cv_uploaded") === stageFilter);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-6 py-4">
        <button onClick={() => navigate("/jobs")} className="text-gray-500 hover:text-blue-600 text-sm mb-3">← Back to Jobs</button>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{job.title}</h1>
            <div className="flex gap-4 text-sm text-gray-500 mt-1 flex-wrap">
              <span>🏢 {job.department}</span>
              <span>📍 {job.location || "Remote"}</span>
              {job.level && <span>🎯 {job.level}</span>}
              {job.minAiScore && <span>⭐ Min Score: {job.minAiScore}</span>}
            </div>
            {(job.requiredSkills?.length ?? 0) > 0 && (
              <div className="flex gap-1.5 mt-2 flex-wrap">
                {job.requiredSkills!.map(s => <span key={s} className="bg-blue-50 text-blue-600 text-xs px-2.5 py-0.5 rounded-full border border-blue-100">{s}</span>)}
              </div>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className={`px-3 py-1 rounded-full text-sm font-semibold capitalize ${job.status === "open" ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-600"}`}>{job.status}</span>
            {/* ── Share JD Button ── */}
            <ShareJobButton
              jobId={id || ""}
              jobTitle={job.title}
              department={job.department}
              location={job.location}
            />
            <label className={`bg-blue-600 text-white px-4 py-2 rounded-xl font-semibold cursor-pointer hover:bg-blue-700 transition-all text-sm ${uploading ? "opacity-60 pointer-events-none" : ""}`}>
              {uploading ? "⏳ Uploading..." : "📎 Upload Resumes"}
              <input type="file" multiple accept=".pdf,.doc,.docx" onChange={handleResumeUpload} className="hidden" />
            </label>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-gray-100 px-6">
        <div className="flex gap-6">
          {["pipeline", "overview"].map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`py-3 px-1 text-sm font-semibold capitalize border-b-2 transition-all ${activeTab === tab ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
              {tab === "pipeline" ? `Pipeline (${candidates.length})` : "Job Overview"}
            </button>
          ))}
        </div>
      </div>

      {/* PIPELINE TAB */}
      {activeTab === "pipeline" && (
        <div className="flex h-[calc(100vh-200px)]">
          {/* Left: Stage filter + candidate list */}
          <div className="w-80 border-r border-gray-100 bg-white flex flex-col shrink-0">
            <div className="p-4 border-b border-gray-100">
              <button onClick={() => setStageFilter("all")}
                className={`w-full text-left px-3 py-2 rounded-xl text-sm font-semibold mb-1 transition-all ${stageFilter === "all" ? "bg-slate-800 text-white" : "text-gray-600 hover:bg-gray-50"}`}>
                All Candidates ({candidates.length})
              </button>
              {STAGES.map(s => {
                const count = candidates.filter(c => (c.status || "cv_uploaded") === s.value).length;
                return (
                  <button key={s.value} onClick={() => setStageFilter(s.value)}
                    className={`w-full text-left px-3 py-2 rounded-xl text-sm font-medium mb-0.5 flex items-center justify-between transition-all ${stageFilter === s.value ? "bg-slate-800 text-white" : "text-gray-600 hover:bg-gray-50"}`}>
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${s.dot}`} />
                      {s.label}
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${stageFilter === s.value ? "bg-white/20 text-white" : s.color}`}>{count}</span>
                  </button>
                );
              })}
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {filteredCandidates.length === 0 ? (
                <div className="text-center py-8 text-gray-400 text-sm">
                  <p>No candidates in this stage</p>
                  {stageFilter === "all" && <p className="mt-1">Upload resumes to get started</p>}
                </div>
              ) : filteredCandidates.map(c => {
                const stage = STAGES.find(s => s.value === (c.status || "cv_uploaded")) || STAGES[0];
                const score = c.aiScore || c.score || 0;
                const tierKey = c.tier?.replace(/-?Tier$/i, "");
                return (
                  <div key={c._id} onClick={() => setSelectedCandidate(c)}
                    className={`p-3 rounded-xl cursor-pointer border transition-all ${selectedCandidate?._id === c._id ? "border-blue-400 bg-blue-50" : "border-gray-100 bg-white hover:border-gray-300"}`}>
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
                        {c.name?.charAt(0)?.toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900 text-sm truncate">{c.name}</p>
                        <p className="text-xs text-gray-500 truncate">{c.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${tierColors[tierKey] || "bg-gray-100 text-gray-600"}`}>{tierKey}-Tier</span>
                      <div className="flex items-center gap-1.5">
                        <div className="w-12 h-1.5 bg-gray-100 rounded-full">
                          <div className={`h-1.5 rounded-full ${score >= 80 ? "bg-emerald-500" : score >= 60 ? "bg-blue-500" : "bg-amber-500"}`} style={{ width: `${score}%` }} />
                        </div>
                        <span className="text-xs font-bold text-gray-600">{score}</span>
                      </div>
                    </div>
                    <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${stage.color}`}>{stage.label}</span>
                      {c.primarySkillMatch === false && <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-bold">⚠ Mismatch</span>}
                      {c.primarySkillMatch === true && <span className="text-xs bg-emerald-100 text-emerald-600 px-2 py-0.5 rounded-full">✓ Match</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right: Candidate detail panel OR job insights */}
          <div className="flex-1 overflow-y-auto">
            {selectedCandidate ? (
              <CandidatePanel
                candidate={selectedCandidate}
                job={job}
                API={API}
                token={token || ""}
                onStatusChange={(newStatus) => updateCandidateStatus(selectedCandidate._id, newStatus)}
                onDelete={() => deleteCandidate(selectedCandidate._id)}
                onUpdate={(updated) => {
                  setSelectedCandidate(updated);
                  setCandidates(prev => prev.map(c => c._id === updated._id ? updated : c));
                }}
              />
            ) : (
              /* ── Job Insights Panel (replaces empty state) ── */
              <div className="p-6 space-y-5">
                <h2 className="font-bold text-gray-700 text-sm uppercase tracking-wide">📊 Pipeline Summary</h2>
                <div className="grid grid-cols-3 gap-3">
                  {STAGES.map(s => {
                    const count = candidates.filter(c => (c.status || "cv_uploaded") === s.value).length;
                    return (
                      <button key={s.value} onClick={() => setStageFilter(s.value)}
                        className={`rounded-2xl p-4 text-center border-2 transition-all hover:scale-105 ${count > 0 ? s.color + " border-current/20 cursor-pointer" : "bg-gray-50 text-gray-300 border-gray-100 cursor-default"}`}>
                        <div className="text-3xl font-black">{count}</div>
                        <div className="text-xs font-semibold mt-1 leading-tight">{s.label}</div>
                      </button>
                    );
                  })}
                </div>

                {/* Top Candidates */}
                {candidates.length > 0 ? (
                  <div className="bg-white rounded-2xl border border-gray-100 p-5">
                    <h3 className="font-bold text-gray-900 mb-4">🏆 Top Candidates by Score</h3>
                    <div className="space-y-2">
                      {[...candidates]
                        .sort((a, b) => (b.aiScore||b.score||0) - (a.aiScore||a.score||0))
                        .slice(0, 6)
                        .map(c => {
                          const score = c.aiScore || c.score || 0;
                          const tierKey = c.tier?.replace(/-?Tier$/i, "");
                          const stage = STAGES.find(s => s.value === (c.status || "cv_uploaded")) || STAGES[0];
                          return (
                            <div key={c._id} onClick={() => setSelectedCandidate(c)}
                              className="flex items-center gap-3 p-3 rounded-xl hover:bg-blue-50 cursor-pointer border border-transparent hover:border-blue-100 transition-all">
                              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-sm font-bold shrink-0">
                                {c.name?.charAt(0)?.toUpperCase()}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="font-semibold text-gray-900 text-sm truncate">{c.name}</div>
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${stage.color}`}>{stage.label}</span>
                              </div>
                              <div className="text-right shrink-0">
                                <div className={`text-sm font-black ${score >= 80 ? "text-emerald-600" : score >= 60 ? "text-blue-600" : "text-amber-600"}`}>{score}</div>
                                <div className={`text-xs font-bold ${tierColors[tierKey] || "text-gray-400"}`}>{tierKey}-Tier</div>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                ) : (
                  <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center text-gray-400">
                    <div className="text-5xl mb-3">📎</div>
                    <p className="font-medium">No candidates yet</p>
                    <p className="text-sm mt-1">Upload resumes or share the JD link to get applicants</p>
                  </div>
                )}

                {/* Quick Stats */}
                <div className="bg-white rounded-2xl border border-gray-100 p-5">
                  <h3 className="font-bold text-gray-900 mb-4">📈 Job Stats</h3>
                  <div className="space-y-3">
                    {[
                      { label: "Total Candidates",  value: candidates.length },
                      { label: "A-Tier Candidates", value: candidates.filter(c => c.tier?.includes("A")).length },
                      { label: "Average Score",     value: candidates.length ? Math.round(candidates.reduce((a,c) => a + (c.aiScore||c.score||0), 0) / candidates.length) + "/100" : "—" },
                      { label: "Min Required Score",value: `${job.minAiScore || 60}/100` },
                      { label: "HM Ready",          value: candidates.filter(c => c.status === "hm_ready").length },
                      { label: "Rejected",          value: candidates.filter(c => c.status === "rejected").length },
                    ].map(s => (
                      <div key={s.label} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                        <span className="text-sm text-gray-500">{s.label}</span>
                        <span className="text-sm font-bold text-gray-900">{s.value}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <p className="text-center text-gray-400 text-xs py-2">👈 Click a candidate on the left to view full details</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* OVERVIEW TAB */}
      {activeTab === "overview" && (
        <div className="p-6 max-w-3xl space-y-5">
          <div className="bg-white rounded-2xl p-6 border border-gray-100">
            <h2 className="font-bold text-gray-900 text-lg mb-3">Job Description</h2>
            <p className="text-gray-600 leading-relaxed whitespace-pre-wrap">{job.description || "No description provided."}</p>
          </div>
          {(job.requirements?.length ?? 0) > 0 && (
            <div className="bg-white rounded-2xl p-6 border border-gray-100">
              <h2 className="font-bold text-gray-900 text-lg mb-3">Requirements</h2>
              <ul className="space-y-2">
                {job.requirements.map((r, i) => <li key={i} className="flex items-start gap-2 text-gray-600"><span className="text-blue-500 mt-0.5">✓</span>{r}</li>)}
              </ul>
            </div>
          )}
          <div className="grid grid-cols-3 gap-4">
            {STAGES.filter(s => s.value !== "rejected").map(s => {
              const count = candidates.filter(c => (c.status || "cv_uploaded") === s.value).length;
              return (
                <div key={s.value} className={`rounded-2xl p-4 border ${s.color} border-current/20`}>
                  <div className="text-2xl font-black">{count}</div>
                  <div className="text-xs font-semibold mt-1">{s.label}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Candidate Detail Panel ───────────────────────────────────────────────
interface PanelProps {
  candidate: Candidate; job: Job;
  API: string; token: string;
  onStatusChange: (s: string) => void;
  onDelete: () => void;
  onUpdate: (c: Candidate) => void;
}

function CandidatePanel({ candidate, job, API, token, onStatusChange, onDelete, onUpdate }: PanelProps) {
  const navigate = useNavigate();
  const [tab, setTab] = useState("profile");
  const [questions, setQuestions] = useState<string[]>(candidate.interviewQuestions || []);
  const [generatingQ, setGeneratingQ] = useState(false);
  const [answers, setAnswers] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [screeningResult, setScreeningResult] = useState<{ screeningScore: number; combinedScore: number; status: string } | null>(null);

  const score = candidate.aiScore || candidate.score || 0;
  const tierKey = candidate.tier?.replace(/-?Tier$/i, "");
  const tierBadge = ({ A: "bg-emerald-100 text-emerald-700", B: "bg-blue-100 text-blue-700", C: "bg-amber-100 text-amber-700" } as any)[tierKey] || "bg-gray-100 text-gray-600";
  const currentStage = STAGES.find(s => s.value === (candidate.status || "cv_uploaded")) || STAGES[0];
  const hasAnswers = (candidate.screeningAnswers?.length ?? 0) > 0;

  async function generateQuestions() {
    setGeneratingQ(true);
    try {
      const res = await fetch(`${API}/candidates/${candidate._id}/questions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ jobTitle: job.title, skills: candidate.topSkills }),
      });
      const data = await res.json();
      const qs = data.questions || [];
      setQuestions(qs);
      setAnswers(new Array(qs.length).fill(""));
      onUpdate({ ...candidate, interviewQuestions: qs, status: "questions_sent" });
      onStatusChange("questions_sent");
      setTab("screening");
    } catch { alert("Failed to generate questions."); }
    finally { setGeneratingQ(false); }
  }

  async function submitAnswers() {
    if (answers.some(a => !a.trim())) { alert("Please fill in all answers."); return; }
    setSubmitting(true);
    try {
      const payload = questions.map((q, i) => ({ question: q, answer: answers[i] }));
      const res = await fetch(`${API}/candidates/${candidate._id}/answers`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ answers: payload }),
      });
      const data = await res.json();
      setScreeningResult({ screeningScore: data.screeningScore, combinedScore: data.combinedScore, status: data.status });
      onUpdate({ ...candidate, ...data.candidate });
      onStatusChange(data.status);
    } catch { alert("Failed to submit answers."); }
    finally { setSubmitting(false); }
  }

  return (
    <div className="h-full flex flex-col">
      <div className="bg-white border-b border-gray-100 p-5">
        <div className="flex items-start gap-4">
          <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${tierKey === "A" ? "from-emerald-400 to-emerald-600" : tierKey === "B" ? "from-blue-400 to-blue-600" : "from-amber-400 to-amber-600"} flex items-center justify-center text-white font-bold text-lg shrink-0`}>
            {candidate.name?.charAt(0)?.toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-bold text-gray-900 text-lg">{candidate.name}</h2>
              <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${tierBadge}`}>{tierKey}-Tier</span>
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${currentStage.color}`}>{currentStage.label}</span>
            </div>
            <div className="flex gap-3 text-xs text-gray-500 mt-1 flex-wrap">
              <span>✉️ {candidate.email}</span>
              {candidate.domain && <span>🏷️ {candidate.domain}</span>}
              {candidate.seniority && <span>🎯 {candidate.seniority}</span>}
              {candidate.experienceYears ? <span>📅 {candidate.experienceYears}y exp</span> : null}
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-3xl font-black text-gray-900">{score}</div>
            <div className="text-xs text-gray-400">AI Score</div>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-1">
          {STAGES.filter(s => s.value !== "rejected").map((s) => {
            const currentIdx = STAGES.findIndex(st => st.value === (candidate.status || "cv_uploaded"));
            const stageIdx = STAGES.findIndex(st => st.value === s.value);
            const isActive = stageIdx <= currentIdx;
            return (
              <div key={s.value} className="flex-1 flex flex-col items-center gap-1">
                <div className={`h-1.5 w-full rounded-full transition-all ${isActive ? "bg-blue-500" : "bg-gray-200"}`} />
                <span className={`text-xs hidden lg:block truncate w-full text-center ${isActive ? "text-blue-600 font-medium" : "text-gray-400"}`}>{s.label}</span>
              </div>
            );
          })}
        </div>

        <div className="flex gap-2 mt-4 flex-wrap">
          {!hasAnswers && questions.length === 0 && (candidate.status === "ai_screened" || candidate.status === "cv_uploaded") && (
            <button onClick={generateQuestions} disabled={generatingQ}
              className="bg-purple-600 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-purple-700 transition-all disabled:opacity-60">
              {generatingQ ? "Generating..." : "✨ Generate Questions"}
            </button>
          )}
          {questions.length > 0 && !hasAnswers && (
            <button onClick={() => setTab("screening")} className="bg-purple-600 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-purple-700 transition-all">
              📝 Fill Answers
            </button>
          )}
          {(candidate.status === "answers_submitted" || candidate.status === "hm_ready") && (
            <button onClick={() => onStatusChange("hm_ready")}
              className="bg-emerald-600 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-emerald-700 transition-all">
              ✓ Move to HM Ready
            </button>
          )}
          <button onClick={() => onStatusChange("rejected")}
            className="border border-red-200 text-red-500 px-4 py-2 rounded-xl text-sm font-semibold hover:bg-red-50 transition-all">
            Reject
          </button>
          <button onClick={() => navigate(`/candidates/${candidate._id}`)}
            className="border border-gray-200 text-gray-600 px-4 py-2 rounded-xl text-sm font-semibold hover:bg-gray-50 transition-all ml-auto">
            Full Profile →
          </button>
          <button onClick={onDelete} className="text-gray-400 hover:text-red-500 px-2 py-2 rounded-xl text-sm transition-all">🗑</button>
        </div>
      </div>

      <div className="bg-white border-b border-gray-100 px-5">
        <div className="flex gap-5">
          {["profile", "screening", "result"].map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`py-2.5 text-sm font-semibold capitalize border-b-2 transition-all ${tab === t ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
              {t === "screening" ? `Screening${questions.length > 0 ? ` (${questions.length}Q)` : ""}` : t === "result" && hasAnswers ? `Result ✓` : t}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {tab === "profile" && (
          <>
            <div className="bg-white rounded-2xl p-5 border border-gray-100">
              <h3 className="font-bold text-gray-900 mb-3">Quick Info</h3>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-gray-400 text-xs uppercase">Domain</span><p className="font-semibold mt-0.5">{candidate.domain || "—"}</p></div>
                <div><span className="text-gray-400 text-xs uppercase">Seniority</span><p className="font-semibold mt-0.5">{candidate.seniority || "—"}</p></div>
                <div><span className="text-gray-400 text-xs uppercase">Experience</span><p className="font-semibold mt-0.5">{candidate.experienceYears ? `${candidate.experienceYears}y` : "—"}</p></div>
                <div><span className="text-gray-400 text-xs uppercase">AI Score</span><p className="font-semibold mt-0.5">{score}/100</p></div>
              </div>
            </div>
            {(candidate.topSkills?.length ?? 0) > 0 && (
              <div className="bg-white rounded-2xl p-5 border border-gray-100">
                <h3 className="font-bold text-gray-900 mb-3">Top Skills</h3>
                <div className="flex flex-wrap gap-2">
                  {candidate.topSkills!.map(s => <span key={s} className="bg-blue-50 text-blue-700 text-xs font-medium px-2.5 py-1 rounded-full border border-blue-100">{s}</span>)}
                </div>
              </div>
            )}
            <div className="bg-white rounded-2xl p-5 border border-gray-100">
              <h3 className="font-bold text-gray-900 mb-3">Move Stage</h3>
              <div className="grid grid-cols-2 gap-2">
                {STAGES.map(s => (
                  <button key={s.value} onClick={() => onStatusChange(s.value)}
                    className={`text-xs font-semibold px-3 py-2 rounded-xl border transition-all text-left ${(candidate.status || "cv_uploaded") === s.value ? "border-blue-400 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-600 hover:border-gray-400"}`}>
                    <div className={`w-2 h-2 rounded-full ${s.dot} inline-block mr-1.5`} />{s.label}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {tab === "screening" && (
          <>
            {questions.length === 0 ? (
              <div className="bg-white rounded-2xl p-8 border border-gray-100 text-center">
                <div className="text-5xl mb-3">❓</div>
                <p className="font-semibold text-gray-700 mb-4">No questions generated yet</p>
                <button onClick={generateQuestions} disabled={generatingQ}
                  className="bg-purple-600 text-white px-6 py-3 rounded-xl font-semibold hover:bg-purple-700 disabled:opacity-60">
                  {generatingQ ? "Generating..." : "✨ Generate AI Questions"}
                </button>
              </div>
            ) : hasAnswers ? (
              <div className="bg-emerald-50 rounded-2xl p-5 border border-emerald-200 text-center">
                <p className="font-bold text-emerald-700 text-lg">✅ Answers already submitted</p>
                <p className="text-sm text-emerald-600 mt-1">Click "Result" tab to see scores</p>
              </div>
            ) : (
              <>
                <div className="bg-purple-50 rounded-xl p-4 border border-purple-100 text-sm text-purple-700">
                  <strong>Instructions:</strong> Record the candidate's verbal answers below. AI will score each answer and determine if they're HM-ready.
                </div>
                {questions.map((q, i) => (
                  <div key={i} className="bg-white rounded-xl p-5 border border-gray-100">
                    <div className="flex gap-3 mb-3">
                      <span className="bg-purple-100 text-purple-700 font-bold text-xs w-7 h-7 rounded-full flex items-center justify-center shrink-0">{i + 1}</span>
                      <p className="text-gray-800 text-sm font-medium leading-relaxed">{q}</p>
                    </div>
                    <textarea value={answers[i] || ""} onChange={e => { const a = [...answers]; a[i] = e.target.value; setAnswers(a); }}
                      rows={3} placeholder="Type candidate's answer here..."
                      className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none" />
                  </div>
                ))}
                <button onClick={submitAnswers} disabled={submitting || answers.filter(a => a.trim()).length < questions.length}
                  className="w-full bg-purple-600 text-white py-3 rounded-xl font-bold hover:bg-purple-700 transition-all disabled:opacity-60 text-sm">
                  {submitting ? "⏳ AI is scoring answers..." : `🚀 Submit ${questions.length} Answers for AI Scoring`}
                </button>
              </>
            )}
          </>
        )}

        {tab === "result" && (
          <>
            {!hasAnswers && !screeningResult ? (
              <div className="bg-white rounded-2xl p-8 border border-gray-100 text-center text-gray-400">
                <div className="text-5xl mb-3">📊</div>
                <p className="font-medium">No screening results yet</p>
                <p className="text-sm mt-1">Complete the screening tab first</p>
              </div>
            ) : (
              <>
                <div className="bg-white rounded-2xl p-5 border border-gray-100">
                  <h3 className="font-bold text-gray-900 mb-4">Screening Results</h3>
                  <div className="grid grid-cols-3 gap-4 text-center mb-4">
                    <div><div className="text-3xl font-black text-blue-600">{score}</div><div className="text-xs text-gray-500 mt-1">AI Resume Score</div></div>
                    <div><div className="text-3xl font-black text-purple-600">{candidate.screeningScore ?? "—"}</div><div className="text-xs text-gray-500 mt-1">Screening Score</div></div>
                    <div>
                      <div className="text-3xl font-black text-emerald-600">{candidate.screeningScore != null ? Math.round((score + candidate.screeningScore) / 2) : "—"}</div>
                      <div className="text-xs text-gray-500 mt-1">Combined Score</div>
                    </div>
                  </div>
                  <div className={`rounded-xl p-3 text-center font-bold text-sm ${candidate.status === "hm_ready" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                    {candidate.status === "hm_ready" ? "🎉 HM Ready — Candidate passed screening!" : "📋 Under Review — Combined score below threshold"}
                  </div>
                </div>
                {candidate.screeningAnswers?.map((sa, i) => (
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
                {candidate.status !== "hm_ready" && (
                  <button onClick={() => onStatusChange("hm_ready")}
                    className="w-full bg-emerald-600 text-white py-3 rounded-xl font-bold hover:bg-emerald-700 transition-all">
                    ✓ Manually Move to HM Ready
                  </button>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
