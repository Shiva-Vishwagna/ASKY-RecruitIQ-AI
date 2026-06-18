import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import ShareJobButton from "../components/ShareJobButton";

interface Job {
  _id: string; title: string; department: string; location: string;
  status: string; description: string; requirements: string[];
  level?: string; requiredSkills?: string[]; minAiScore?: number; createdAt: string;
  questionBank?: { text: string; difficulty: "easy"|"medium"|"hard"; category: string }[];
}
interface Candidate {
  _id: string; name: string; email: string;
  score?: number; aiScore?: number; screeningScore?: number;
  tier: string; riskLevel: string; status?: string;
  appliedAt?: string; createdAt?: string; updatedAt?: string;
  topSkills?: string[]; domain?: string; seniority?: string; experienceYears?: number;
  primarySkillMatch?: boolean; jobFitScore?: number;
  interviewQuestions?: string[];
  screeningAnswers?: { question: string; aiScore?: number; aiFeedback?: string }[];
}

const STAGES = [
  { value:"cv_uploaded",       label:"CV Uploaded",       color:"bg-gray-100 text-gray-600",      dot:"bg-gray-400"    },
  { value:"ai_screened",       label:"AI Screened",       color:"bg-blue-100 text-blue-700",      dot:"bg-blue-500"    },
  { value:"questions_sent",    label:"Questions Sent",    color:"bg-purple-100 text-purple-700",  dot:"bg-purple-500"  },
  { value:"answers_submitted", label:"Answers Submitted", color:"bg-amber-100 text-amber-700",    dot:"bg-amber-500"   },
  { value:"hm_ready",          label:"HM Ready",          color:"bg-emerald-100 text-emerald-700",dot:"bg-emerald-500" },
  { value:"rejected",          label:"Rejected",          color:"bg-red-100 text-red-700",        dot:"bg-red-500"     },
];

const tierColors: Record<string,string> = {
  A:"bg-emerald-100 text-emerald-700", B:"bg-blue-100 text-blue-700", C:"bg-amber-100 text-amber-700",
};

const DIFF_COLORS = {
  easy:   "bg-emerald-100 text-emerald-700 border-emerald-200",
  medium: "bg-amber-100 text-amber-700 border-amber-200",
  hard:   "bg-red-100 text-red-700 border-red-200",
};
const DIFF_ACTIVE = {
  easy:   "bg-emerald-600 text-white border-emerald-600",
  medium: "bg-amber-500 text-white border-amber-500",
  hard:   "bg-red-600 text-white border-red-600",
};

const CATEGORIES = ["Technical","Behavioral","Situational","Leadership","Problem Solving","Communication","Domain Knowledge","Other"];

// ── Parse questions from plain text ──────────────────────────
function parseQuestionsFromText(text: string): string[] {
  const lines = text.split(/\n/).map(l => l.trim()).filter(Boolean);
  const questions: string[] = [];
  for (const line of lines) {
    // Remove numbering like "1.", "1)", "Q1.", "Q1:", "-", "•"
    const cleaned = line
      .replace(/^(Q\s*\d+[\.\:\)]\s*|[\d]+[\.\:\)]\s*|[-•*]\s*)/i, "")
      .trim();
    if (cleaned.length > 10 && cleaned.length < 500) {
      questions.push(cleaned);
    }
  }
  return questions.slice(0, 20);
}

export default function JobDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [job, setJob]               = useState<Job | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [activeTab, setActiveTab]   = useState("pipeline");
  const [stageFilter, setStageFilter] = useState("all");
  const [loading, setLoading]       = useState(true);
  const [uploading, setUploading]   = useState(false);
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);

  // Question bank
  const [questionBank, setQuestionBank] = useState<{text:string;difficulty:"easy"|"medium"|"hard";category:string}[]>([]);
  const [newQ, setNewQ]                 = useState({text:"",difficulty:"medium" as "easy"|"medium"|"hard",category:"Technical"});
  const [savingBank, setSavingBank]     = useState(false);
  const [bankSaved, setBankSaved]       = useState(false);
  const [importing, setImporting]       = useState(false);
  const [importPreview, setImportPreview] = useState<string[]>([]);
  const [showImportPreview, setShowImportPreview] = useState(false);
  const [importDifficulty, setImportDifficulty]   = useState<"easy"|"medium"|"hard">("medium");
  const [importCategory, setImportCategory]       = useState("Technical");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const API   = "https://asky-recruitiq-ai.onrender.com/api";
  const token = localStorage.getItem("token");

  useEffect(() => { fetchJob(); fetchCandidates(); }, [id]);

  async function fetchJob() {
    try {
      const res  = await fetch(`${API}/jobs/${id}`, { headers: { Authorization:`Bearer ${token}` } });
      const data = await res.json();
      const j    = data.job || data;
      setJob(j);
      setQuestionBank(j.questionBank || []);
    } finally { setLoading(false); }
  }

  async function fetchCandidates() {
    try {
      const res  = await fetch(`${API}/jobs/${id}/candidates`, { headers: { Authorization:`Bearer ${token}` } });
      const data = await res.json();
      setCandidates(data.candidates || data || []);
    } catch { setCandidates([]); }
  }

  async function handleResumeUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files?.length) return;
    setUploading(true);
    const fd = new FormData();
    Array.from(files).forEach(f => fd.append("resumes", f));
    fd.append("jobId", id||""); fd.append("jobTitle", job?.title||"");
    try {
      await fetch(`${API}/resumes/upload`, { method:"POST", headers:{Authorization:`Bearer ${token}`}, body:fd });
      await fetchCandidates();
    } finally { setUploading(false); e.target.value=""; }
  }

  async function updateCandidateStatus(candidateId: string, newStatus: string) {
    await fetch(`${API}/candidates/${candidateId}`, {
      method:"PATCH", headers:{"Content-Type":"application/json", Authorization:`Bearer ${token}`},
      body: JSON.stringify({ status: newStatus }),
    });
    setCandidates(prev => prev.map(c => c._id === candidateId ? {...c, status:newStatus} : c));
    if (selectedCandidate?._id === candidateId) setSelectedCandidate(prev => prev ? {...prev, status:newStatus} : null);
  }

  async function deleteCandidate(candidateId: string) {
    if (!window.confirm("Remove this candidate?")) return;
    await fetch(`${API}/candidates/${candidateId}`, { method:"DELETE", headers:{Authorization:`Bearer ${token}`} });
    setCandidates(prev => prev.filter(c => c._id !== candidateId));
    if (selectedCandidate?._id === candidateId) setSelectedCandidate(null);
  }

  // ── Question Bank ─────────────────────────────────────────
  function addQuestion() {
    if (!newQ.text.trim()) return;
    if (questionBank.length >= 20) { alert("Maximum 20 questions. Remove some first."); return; }
    setQuestionBank(prev => [...prev, {...newQ, text:newQ.text.trim()}]);
    setNewQ({text:"", difficulty:"medium", category:"Technical"});
    setBankSaved(false);
  }

  function removeQuestion(idx: number) {
    setQuestionBank(prev => prev.filter((_,i) => i !== idx));
    setBankSaved(false);
  }

  function updateQuestion(idx: number, field: string, value: string) {
    setQuestionBank(prev => prev.map((q,i) => i === idx ? {...q, [field]:value} : q));
    setBankSaved(false);
  }

  async function saveQuestionBank() {
    setSavingBank(true);
    try {
      const res = await fetch(`${API}/jobs/${id}/question-bank`, {
        method:"POST",
        headers:{"Content-Type":"application/json", Authorization:`Bearer ${token}`},
        body: JSON.stringify({ questions: questionBank }),
      });
      if (res.ok) { setBankSaved(true); setTimeout(() => setBankSaved(false), 3000); }
      else alert("Failed to save.");
    } catch { alert("Error saving."); }
    finally { setSavingBank(false); }
  }

  // ── Word / Text file import ───────────────────────────────
  async function handleFileImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      let text = "";

      if (file.name.endsWith(".txt")) {
        // Plain text file
        text = await file.text();
      } else if (file.name.endsWith(".docx")) {
        // DOCX — use mammoth via a simple ArrayBuffer read
        // We extract text client-side using a basic DOCX XML parser
        const buffer = await file.arrayBuffer();
        const zip    = await (window as any).JSZip?.loadAsync(buffer);
        if (zip) {
          const xml = await zip.file("word/document.xml")?.async("string");
          if (xml) text = xml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
        } else {
          // Fallback: just read as text
          text = await file.text();
        }
      } else if (file.name.endsWith(".doc")) {
        alert("Old .doc format not supported. Please save as .docx or .txt");
        setImporting(false); return;
      } else {
        text = await file.text();
      }

      const parsed = parseQuestionsFromText(text);
      if (parsed.length === 0) {
        alert("No questions found. Make sure each question is on a separate line.");
        setImporting(false); return;
      }
      setImportPreview(parsed);
      setShowImportPreview(true);
    } catch (err) {
      alert("Could not read file. Try saving as .txt format.");
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function confirmImport() {
    const remaining = 20 - questionBank.length;
    if (remaining <= 0) { alert("Question bank is full (20 max). Remove some first."); return; }
    const toAdd = importPreview.slice(0, remaining).map(text => ({
      text, difficulty: importDifficulty, category: importCategory
    }));
    setQuestionBank(prev => [...prev, ...toAdd]);
    setBankSaved(false);
    setShowImportPreview(false);
    setImportPreview([]);
  }

  if (loading) return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"/></div>;
  if (!job) return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><p className="text-gray-500">Job not found</p></div>;

  const filteredCandidates = stageFilter === "all" ? candidates : candidates.filter(c => (c.status||"cv_uploaded") === stageFilter);
  const easyCount   = questionBank.filter(q => q.difficulty === "easy").length;
  const mediumCount = questionBank.filter(q => q.difficulty === "medium").length;
  const hardCount   = questionBank.filter(q => q.difficulty === "hard").length;

  return (
    <div className="min-h-screen bg-gray-50">

      {/* Import Preview Modal */}
      {showImportPreview && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-2xl w-full shadow-2xl max-h-[80vh] flex flex-col">
            <h3 className="font-bold text-gray-900 text-lg mb-1">📋 Preview Imported Questions</h3>
            <p className="text-sm text-gray-500 mb-4">{importPreview.length} question(s) found. Set difficulty and category before importing.</p>

            {/* Difficulty + Category for all imported */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Difficulty for all</label>
                <div className="flex gap-2">
                  {(["easy","medium","hard"] as const).map(d => (
                    <button key={d} onClick={() => setImportDifficulty(d)}
                      className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-all ${importDifficulty === d ? DIFF_ACTIVE[d] : DIFF_COLORS[d]}`}>
                      {d === "easy" ? "🟢" : d === "medium" ? "🟡" : "🔴"} {d}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Category for all</label>
                <select value={importCategory} onChange={e => setImportCategory(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>

            {/* Preview list */}
            <div className="flex-1 overflow-y-auto space-y-2 mb-4 border border-gray-100 rounded-xl p-3">
              {importPreview.map((q, i) => (
                <div key={i} className="flex gap-3 items-start p-2 rounded-lg hover:bg-gray-50">
                  <span className="w-6 h-6 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">{i+1}</span>
                  <p className="text-sm text-gray-700">{q}</p>
                  <button onClick={() => setImportPreview(prev => prev.filter((_,idx) => idx !== i))}
                    className="text-red-400 hover:text-red-600 text-xs shrink-0 mt-0.5">✕</button>
                </div>
              ))}
            </div>

            <div className="flex gap-3">
              <button onClick={() => { setShowImportPreview(false); setImportPreview([]); }}
                className="flex-1 border border-gray-200 py-2.5 rounded-xl font-semibold text-gray-600 hover:bg-gray-50">Cancel</button>
              <button onClick={confirmImport}
                className="flex-1 bg-blue-600 text-white py-2.5 rounded-xl font-bold hover:bg-blue-700">
                ✅ Import {Math.min(importPreview.length, 20 - questionBank.length)} Questions
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-6 py-4">
        <button onClick={() => navigate("/jobs")} className="text-gray-500 hover:text-blue-600 text-sm mb-3">← Back to Jobs</button>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{job.title}</h1>
            <div className="flex gap-4 text-sm text-gray-500 mt-1 flex-wrap">
              <span>🏢 {job.department}</span>
              <span>📍 {job.location||"Remote"}</span>
              {job.level && <span>🎯 {job.level}</span>}
              {job.minAiScore && <span>⭐ Min Score: {job.minAiScore}</span>}
            </div>
            {(job.requiredSkills?.length??0) > 0 && (
              <div className="flex gap-1.5 mt-2 flex-wrap">
                {job.requiredSkills!.map(s => <span key={s} className="bg-blue-50 text-blue-600 text-xs px-2.5 py-0.5 rounded-full border border-blue-100">{s}</span>)}
              </div>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className={`px-3 py-1 rounded-full text-sm font-semibold capitalize ${job.status==="open"?"bg-emerald-100 text-emerald-700":"bg-gray-100 text-gray-600"}`}>{job.status}</span>
            <ShareJobButton jobId={id||""} jobTitle={job.title} department={job.department} location={job.location}/>
            <label className={`bg-blue-600 text-white px-4 py-2 rounded-xl font-semibold cursor-pointer hover:bg-blue-700 transition-all text-sm ${uploading?"opacity-60 pointer-events-none":""}`}>
              {uploading?"⏳ Uploading...":"📎 Upload Resumes"}
              <input type="file" multiple accept=".pdf,.doc,.docx" onChange={handleResumeUpload} className="hidden"/>
            </label>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-gray-100 px-6">
        <div className="flex gap-6">
          {[
            { key:"pipeline",      label:`Pipeline (${candidates.length})`       },
            { key:"question-bank", label:`📋 Question Bank (${questionBank.length}/20)` },
            { key:"overview",      label:"Job Overview"                          },
          ].map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={`py-3 px-1 text-sm font-semibold border-b-2 transition-all whitespace-nowrap ${activeTab===tab.key?"border-blue-600 text-blue-600":"border-transparent text-gray-500 hover:text-gray-700"}`}>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── PIPELINE TAB ── */}
      {activeTab === "pipeline" && (
        <div className="flex h-[calc(100vh-200px)]">
          <div className="w-80 border-r border-gray-100 bg-white flex flex-col shrink-0">
            <div className="p-4 border-b border-gray-100">
              <button onClick={() => setStageFilter("all")}
                className={`w-full text-left px-3 py-2 rounded-xl text-sm font-semibold mb-1 transition-all ${stageFilter==="all"?"bg-slate-800 text-white":"text-gray-600 hover:bg-gray-50"}`}>
                All Candidates ({candidates.length})
              </button>
              {STAGES.map(s => {
                const count = candidates.filter(c => (c.status||"cv_uploaded")===s.value).length;
                return (
                  <button key={s.value} onClick={() => setStageFilter(s.value)}
                    className={`w-full text-left px-3 py-2 rounded-xl text-sm font-medium mb-0.5 flex items-center justify-between transition-all ${stageFilter===s.value?"bg-slate-800 text-white":"text-gray-600 hover:bg-gray-50"}`}>
                    <div className="flex items-center gap-2"><div className={`w-2 h-2 rounded-full ${s.dot}`}/>{s.label}</div>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${stageFilter===s.value?"bg-white/20 text-white":s.color}`}>{count}</span>
                  </button>
                );
              })}
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {filteredCandidates.length === 0 ? (
                <div className="text-center py-8 text-gray-400 text-sm">
                  <p>No candidates in this stage</p>
                  {stageFilter==="all" && <p className="mt-1">Upload resumes to get started</p>}
                </div>
              ) : filteredCandidates.map(c => {
                const stage   = STAGES.find(s => s.value===(c.status||"cv_uploaded"))||STAGES[0];
                const score   = c.aiScore||c.score||0;
                const tierKey = c.tier?.replace(/-?Tier$/i,"");
                return (
                  <div key={c._id} onClick={() => setSelectedCandidate(c)}
                    className={`p-3 rounded-xl cursor-pointer border transition-all ${selectedCandidate?._id===c._id?"border-blue-400 bg-blue-50":"border-gray-100 bg-white hover:border-gray-300"}`}>
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
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${tierColors[tierKey]||"bg-gray-100 text-gray-600"}`}>{tierKey}-Tier</span>
                      <div className="flex items-center gap-1.5">
                        <div className="w-12 h-1.5 bg-gray-100 rounded-full">
                          <div className={`h-1.5 rounded-full ${score>=80?"bg-emerald-500":score>=60?"bg-blue-500":"bg-amber-500"}`} style={{width:`${score}%`}}/>
                        </div>
                        <span className="text-xs font-bold text-gray-600">{score}</span>
                      </div>
                    </div>
                    <div className="mt-2"><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${stage.color}`}>{stage.label}</span></div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {selectedCandidate ? (
              <CandidatePanel candidate={selectedCandidate} job={job} API={API} token={token||""}
                onStatusChange={s => updateCandidateStatus(selectedCandidate._id, s)}
                onDelete={() => deleteCandidate(selectedCandidate._id)}
                onUpdate={updated => { setSelectedCandidate(updated); setCandidates(prev => prev.map(c => c._id===updated._id?updated:c)); }}
              />
            ) : (
              <div className="p-6 space-y-5">
                <h2 className="font-bold text-gray-700 text-sm uppercase tracking-wide">📊 Pipeline Summary</h2>
                <div className="grid grid-cols-3 gap-3">
                  {STAGES.map(s => {
                    const count = candidates.filter(c => (c.status||"cv_uploaded")===s.value).length;
                    return (
                      <button key={s.value} onClick={() => setStageFilter(s.value)}
                        className={`rounded-2xl p-4 text-center border-2 transition-all hover:scale-105 ${count>0?s.color+" border-current/20":"bg-gray-50 text-gray-300 border-gray-100"}`}>
                        <div className="text-3xl font-black">{count}</div>
                        <div className="text-xs font-semibold mt-1 leading-tight">{s.label}</div>
                      </button>
                    );
                  })}
                </div>
                {candidates.length > 0 && (
                  <div className="bg-white rounded-2xl border border-gray-100 p-5">
                    <h3 className="font-bold text-gray-900 mb-4">🏆 Top Candidates</h3>
                    <div className="space-y-2">
                      {[...candidates].sort((a,b)=>(b.aiScore||b.score||0)-(a.aiScore||a.score||0)).slice(0,5).map(c => {
                        const score=c.aiScore||c.score||0; const tierKey=c.tier?.replace(/-?Tier$/i,"");
                        const stage=STAGES.find(s=>s.value===(c.status||"cv_uploaded"))||STAGES[0];
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
                              <div className={`text-sm font-black ${score>=80?"text-emerald-600":score>=60?"text-blue-600":"text-amber-600"}`}>{score}</div>
                              <div className={`text-xs font-bold ${tierColors[tierKey]||"text-gray-400"}`}>{tierKey}-Tier</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                <div className="bg-white rounded-2xl border border-gray-100 p-5">
                  <h3 className="font-bold text-gray-900 mb-4">📈 Job Stats</h3>
                  <div className="space-y-3">
                    {[
                      {label:"Total Candidates",  value:candidates.length},
                      {label:"A-Tier Candidates", value:candidates.filter(c=>c.tier?.includes("A")).length},
                      {label:"Average Score",     value:candidates.length?Math.round(candidates.reduce((a,c)=>a+(c.aiScore||c.score||0),0)/candidates.length)+"/100":"—"},
                      {label:"HM Ready",          value:candidates.filter(c=>c.status==="hm_ready").length},
                      {label:"Question Bank",     value:`${questionBank.length} questions`},
                    ].map(s => (
                      <div key={s.label} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                        <span className="text-sm text-gray-500">{s.label}</span>
                        <span className="text-sm font-bold text-gray-900">{s.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <p className="text-center text-gray-400 text-xs py-2">👈 Click a candidate to view details</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── QUESTION BANK TAB ── */}
      {activeTab === "question-bank" && (
        <div className="p-6 max-w-4xl">
          <div className="flex items-start justify-between mb-6">
            <div>
              <h2 className="text-xl font-bold text-gray-900">📋 Question Bank</h2>
              <p className="text-gray-500 text-sm mt-1">Add 10–20 questions. During screening, 8 will be randomly picked and shuffled.</p>
            </div>
            <button onClick={saveQuestionBank} disabled={savingBank||questionBank.length===0}
              className={`px-5 py-2.5 rounded-xl font-bold text-sm transition-all ${bankSaved?"bg-emerald-600 text-white":"bg-blue-600 text-white hover:bg-blue-700"} disabled:opacity-50`}>
              {savingBank?"Saving...":bankSaved?"✅ Saved!":"💾 Save Question Bank"}
            </button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-4 gap-3 mb-5">
            {[
              {label:"Total",    value:questionBank.length, color:"text-gray-900",    bg:"bg-gray-50",     border:"border-gray-100"},
              {label:"🟢 Easy",  value:easyCount,           color:"text-emerald-600", bg:"bg-emerald-50",  border:"border-emerald-100"},
              {label:"🟡 Medium",value:mediumCount,         color:"text-amber-600",   bg:"bg-amber-50",    border:"border-amber-100"},
              {label:"🔴 Hard",  value:hardCount,           color:"text-red-600",     bg:"bg-red-50",      border:"border-red-100"},
            ].map(s => (
              <div key={s.label} className={`${s.bg} border ${s.border} rounded-2xl p-4 text-center`}>
                <div className={`text-2xl font-black ${s.color}`}>{s.value}</div>
                <div className="text-xs text-gray-500 mt-1 font-medium">{s.label}</div>
              </div>
            ))}
          </div>

          {/* Status message */}
          {questionBank.length === 0 && <div className="bg-gray-50 border border-gray-100 rounded-xl p-4 mb-4 text-center text-gray-400 text-sm">No questions yet. Add manually or upload a Word/text file below.</div>}
          {questionBank.length > 0 && questionBank.length < 8 && <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 text-sm text-amber-700">⚠️ Add at least 8 questions to enable random selection. Currently: {questionBank.length}</div>}
          {questionBank.length >= 10 && <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 mb-4 text-sm text-emerald-700">✅ {questionBank.length} questions ready — 8 will be randomly picked during screening.</div>}

          {/* ── TWO WAYS TO ADD ── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">

            {/* Option 1: Upload Word/Text file */}
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <h3 className="font-bold text-gray-900 mb-1">📁 Upload from File</h3>
              <p className="text-xs text-gray-400 mb-4">Upload a Word (.docx) or Text (.txt) file — one question per line</p>
              <div className="bg-gray-50 border-2 border-dashed border-gray-200 rounded-xl p-6 text-center hover:border-blue-300 transition-all">
                <input ref={fileInputRef} type="file" accept=".txt,.docx" onChange={handleFileImport} className="hidden" id="question-file-input"/>
                <label htmlFor="question-file-input" className="cursor-pointer">
                  <div className="text-3xl mb-2">📄</div>
                  <p className="text-sm font-semibold text-gray-700">{importing ? "Reading file..." : "Click to choose file"}</p>
                  <p className="text-xs text-gray-400 mt-1">Supports .docx and .txt</p>
                  <div className="mt-3 bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-bold inline-block hover:bg-blue-700 transition-all">
                    {importing ? "⏳ Reading..." : "📁 Choose File"}
                  </div>
                </label>
              </div>
              <div className="mt-3 bg-blue-50 rounded-xl p-3 border border-blue-100">
                <p className="text-xs font-bold text-blue-700 mb-1">📝 File format tips:</p>
                <ul className="text-xs text-blue-600 space-y-0.5">
                  <li>• One question per line</li>
                  <li>• Numbering like "1.", "Q1." is auto-removed</li>
                  <li>• Min 10 characters per question</li>
                  <li>• Max 20 questions will be imported</li>
                </ul>
              </div>
            </div>

            {/* Option 2: Add manually */}
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <h3 className="font-bold text-gray-900 mb-1">✏️ Add Manually</h3>
              <p className="text-xs text-gray-400 mb-4">Type a question and set its difficulty and category</p>
              <div className="space-y-3">
                <textarea value={newQ.text} onChange={e => setNewQ({...newQ, text:e.target.value})}
                  onKeyDown={e => { if(e.key==="Enter" && e.ctrlKey) addQuestion(); }}
                  placeholder="Type your question here... (Ctrl+Enter to add)"
                  rows={3}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"/>
                <div className="grid grid-cols-3 gap-2">
                  {(["easy","medium","hard"] as const).map(d => (
                    <button key={d} onClick={() => setNewQ({...newQ, difficulty:d})}
                      className={`py-2 rounded-xl text-xs font-bold border transition-all capitalize ${newQ.difficulty===d?DIFF_ACTIVE[d]:DIFF_COLORS[d]}`}>
                      {d==="easy"?"🟢":d==="medium"?"🟡":"🔴"} {d}
                    </button>
                  ))}
                </div>
                <select value={newQ.category} onChange={e => setNewQ({...newQ, category:e.target.value})}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <button onClick={addQuestion} disabled={!newQ.text.trim()||questionBank.length>=20}
                  className="w-full bg-blue-600 text-white py-2.5 rounded-xl font-bold text-sm hover:bg-blue-700 transition-all disabled:opacity-50">
                  ➕ Add Question {questionBank.length>=20?"(Bank Full)":""}
                </button>
              </div>
            </div>
          </div>

          {/* Question list */}
          {questionBank.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-gray-900">Questions ({questionBank.length}/20)</h3>
                {questionBank.length > 0 && (
                  <button onClick={() => { if(window.confirm("Clear all questions?")) { setQuestionBank([]); setBankSaved(false); }}}
                    className="text-xs text-red-500 hover:text-red-700 font-medium border border-red-200 px-3 py-1 rounded-lg">
                    🗑 Clear All
                  </button>
                )}
              </div>
              {questionBank.map((q, idx) => (
                <div key={idx} className="bg-white rounded-2xl border border-gray-100 p-4 flex gap-4">
                  <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-black shrink-0 mt-0.5">{idx+1}</div>
                  <div className="flex-1 min-w-0">
                    <textarea value={q.text} onChange={e => updateQuestion(idx,"text",e.target.value)}
                      rows={2} className="w-full text-sm text-gray-800 font-medium bg-transparent border-0 focus:outline-none resize-none p-0"/>
                    <div className="flex gap-2 mt-2">
                      <select value={q.difficulty} onChange={e => updateQuestion(idx,"difficulty",e.target.value)}
                        className={`text-xs font-bold px-2.5 py-1 rounded-full border cursor-pointer focus:outline-none ${DIFF_COLORS[q.difficulty]}`}>
                        <option value="easy">🟢 Easy</option>
                        <option value="medium">🟡 Medium</option>
                        <option value="hard">🔴 Hard</option>
                      </select>
                      <select value={q.category} onChange={e => updateQuestion(idx,"category",e.target.value)}
                        className="text-xs text-gray-500 bg-gray-50 border border-gray-200 px-2.5 py-1 rounded-full cursor-pointer focus:outline-none">
                        {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                  </div>
                  <button onClick={() => removeQuestion(idx)} className="text-red-400 hover:text-red-600 hover:bg-red-50 p-2 rounded-xl transition-all shrink-0">🗑</button>
                </div>
              ))}
              <div className="flex justify-end pt-2">
                <button onClick={saveQuestionBank} disabled={savingBank}
                  className={`px-6 py-3 rounded-xl font-bold text-sm transition-all ${bankSaved?"bg-emerald-600 text-white":"bg-blue-600 text-white hover:bg-blue-700"} disabled:opacity-50`}>
                  {savingBank?"Saving...":bankSaved?"✅ Saved!":"💾 Save Question Bank"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── OVERVIEW TAB ── */}
      {activeTab === "overview" && (
        <div className="p-6 max-w-3xl space-y-5">
          <div className="bg-white rounded-2xl p-6 border border-gray-100">
            <h2 className="font-bold text-gray-900 text-lg mb-3">Job Description</h2>
            <p className="text-gray-600 leading-relaxed whitespace-pre-wrap">{job.description||"No description provided."}</p>
          </div>
          {(job.requirements?.length??0)>0 && (
            <div className="bg-white rounded-2xl p-6 border border-gray-100">
              <h2 className="font-bold text-gray-900 text-lg mb-3">Requirements</h2>
              <ul className="space-y-2">{job.requirements.map((r,i)=><li key={i} className="flex items-start gap-2 text-gray-600"><span className="text-blue-500 mt-0.5">✓</span>{r}</li>)}</ul>
            </div>
          )}
          <div className="grid grid-cols-3 gap-4">
            {STAGES.filter(s=>s.value!=="rejected").map(s=>{
              const count=candidates.filter(c=>(c.status||"cv_uploaded")===s.value).length;
              return <div key={s.value} className={`rounded-2xl p-4 border ${s.color} border-current/20`}><div className="text-2xl font-black">{count}</div><div className="text-xs font-semibold mt-1">{s.label}</div></div>;
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Candidate Panel ───────────────────────────────────────────
interface PanelProps {
  candidate: Candidate; job: Job; API: string; token: string;
  onStatusChange:(s:string)=>void; onDelete:()=>void; onUpdate:(c:Candidate)=>void;
}

function CandidatePanel({ candidate, job, API, token, onStatusChange, onDelete, onUpdate }:PanelProps) {
  const navigate = useNavigate();
  const [tab, setTab]                 = useState("profile");
  const [questions, setQuestions]     = useState<string[]>(candidate.interviewQuestions||[]);
  const [generatingQ, setGeneratingQ] = useState(false);
  const [answers, setAnswers]         = useState<string[]>([]);
  const [submitting, setSubmitting]   = useState(false);
  const [screeningResult, setScreeningResult] = useState<any>(null);

  // ── Question mode ─────────────────────────────────────────
  const [questionMode, setQuestionMode]   = useState<"ai"|"bank">("ai");
  const [aiDifficulty, setAiDifficulty]   = useState<"easy"|"medium"|"hard">("medium");
  const [bankDifficulty, setBankDifficulty] = useState<"all"|"easy"|"medium"|"hard">("all");
  const bankAvailable = (job.questionBank?.length||0) >= 8;

  const score      = candidate.aiScore||candidate.score||0;
  const tierKey    = candidate.tier?.replace(/-?Tier$/i,"");
  const tierBadge  = ({A:"bg-emerald-100 text-emerald-700",B:"bg-blue-100 text-blue-700",C:"bg-amber-100 text-amber-700"} as any)[tierKey]||"bg-gray-100 text-gray-600";
  const curStage   = STAGES.find(s=>s.value===(candidate.status||"cv_uploaded"))||STAGES[0];
  const hasAnswers = (candidate.screeningAnswers?.length??0) > 0;

  const diffCfg = {
    easy:  {icon:"🟢",label:"Easy",   desc:"Basic concepts · 0–2 yrs"},
    medium:{icon:"🟡",label:"Medium", desc:"Scenario-based · 3–5 yrs"},
    hard:  {icon:"🔴",label:"Hard",   desc:"Architecture · 6+ yrs"},
  };

  async function generateAIQuestions() {
    setGeneratingQ(true);
    try {
      const res  = await fetch(`${API}/candidates/${candidate._id}/questions`, {
        method:"POST",
        headers:{"Content-Type":"application/json", Authorization:`Bearer ${token}`},
        body: JSON.stringify({ jobTitle:job.title, skills:candidate.topSkills, difficulty:aiDifficulty }),
      });
      const data = await res.json();
      const qs   = data.questions||[];
      setQuestions(qs); setAnswers(new Array(qs.length).fill(""));
      onUpdate({...candidate, interviewQuestions:qs, status:"questions_sent"});
      onStatusChange("questions_sent");
      setTab("screening");
    } catch { alert("Failed to generate AI questions."); }
    finally { setGeneratingQ(false); }
  }

  async function generateBankQuestions() {
    setGeneratingQ(true);
    try {
      const url  = `${API}/jobs/${job._id}/question-bank/random${bankDifficulty!=="all"?`?difficulty=${bankDifficulty}`:""}`;
      const res  = await fetch(url, { headers:{Authorization:`Bearer ${token}`} });
      const data = await res.json();
      if (!res.ok) { alert(data.message||"Could not load questions from bank."); return; }
      const qs = data.questions||[];
      setQuestions(qs); setAnswers(new Array(qs.length).fill(""));
      onUpdate({...candidate, interviewQuestions:qs, status:"questions_sent"});
      onStatusChange("questions_sent");
      setTab("screening");
    } catch { alert("Failed to load questions from bank."); }
    finally { setGeneratingQ(false); }
  }

  async function submitAnswers() {
    if (answers.some(a=>!a.trim())) { alert("Please fill in all answers."); return; }
    setSubmitting(true);
    try {
      const payload = questions.map((q,i) => ({question:q, answer:answers[i]}));
      const res  = await fetch(`${API}/candidates/${candidate._id}/answers`, {
        method:"POST",
        headers:{"Content-Type":"application/json", Authorization:`Bearer ${token}`},
        body: JSON.stringify({ answers:payload }),
      });
      const data = await res.json();
      setScreeningResult(data);
      onUpdate({...candidate, ...data.candidate});
      onStatusChange(data.status);
    } catch { alert("Failed to submit answers."); }
    finally { setSubmitting(false); }
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 p-5">
        <div className="flex items-start gap-4">
          <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${tierKey==="A"?"from-emerald-400 to-emerald-600":tierKey==="B"?"from-blue-400 to-blue-600":"from-amber-400 to-amber-600"} flex items-center justify-center text-white font-bold text-lg shrink-0`}>
            {candidate.name?.charAt(0)?.toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-bold text-gray-900 text-lg">{candidate.name}</h2>
              <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${tierBadge}`}>{tierKey}-Tier</span>
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${curStage.color}`}>{curStage.label}</span>
            </div>
            <div className="flex gap-3 text-xs text-gray-500 mt-1 flex-wrap">
              <span>✉️ {candidate.email}</span>
              {candidate.domain && <span>🏷️ {candidate.domain}</span>}
              {candidate.experienceYears ? <span>📅 {candidate.experienceYears}y exp</span>:null}
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-3xl font-black text-gray-900">{score}</div>
            <div className="text-xs text-gray-400">AI Score</div>
          </div>
        </div>
        <div className="mt-4 flex items-center gap-1">
          {STAGES.filter(s=>s.value!=="rejected").map(s => {
            const curIdx=STAGES.findIndex(st=>st.value===(candidate.status||"cv_uploaded"));
            const sIdx=STAGES.findIndex(st=>st.value===s.value);
            return <div key={s.value} className="flex-1"><div className={`h-1.5 w-full rounded-full ${sIdx<=curIdx?"bg-blue-500":"bg-gray-200"}`}/></div>;
          })}
        </div>
        <div className="flex gap-2 mt-4 flex-wrap">
          {!hasAnswers && questions.length===0 && (
            <button onClick={() => setTab("generate")} className="bg-purple-600 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-purple-700 transition-all">✨ Generate Questions</button>
          )}
          {questions.length>0 && !hasAnswers && (
            <button onClick={() => setTab("screening")} className="bg-purple-600 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-purple-700 transition-all">📝 Fill Answers</button>
          )}
          {(candidate.status==="answers_submitted"||candidate.status==="hm_ready") && (
            <button onClick={() => onStatusChange("hm_ready")} className="bg-emerald-600 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-emerald-700 transition-all">✓ HM Ready</button>
          )}
          <button onClick={() => onStatusChange("rejected")} className="border border-red-200 text-red-500 px-4 py-2 rounded-xl text-sm font-semibold hover:bg-red-50 transition-all">Reject</button>
          <button onClick={() => navigate(`/candidates/${candidate._id}`)} className="border border-gray-200 text-gray-600 px-4 py-2 rounded-xl text-sm font-semibold hover:bg-gray-50 transition-all ml-auto">Full Profile →</button>
          <button onClick={onDelete} className="text-gray-400 hover:text-red-500 px-2 py-2 rounded-xl text-sm">🗑</button>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-gray-100 px-5">
        <div className="flex gap-5">
          {["profile","generate","screening","result"].map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`py-2.5 text-sm font-semibold capitalize border-b-2 transition-all ${tab===t?"border-blue-600 text-blue-600":"border-transparent text-gray-500 hover:text-gray-700"}`}>
              {t==="generate"?"Generate Questions":t==="screening"?`Screening${questions.length>0?` (${questions.length}Q)`:""}`:(t==="result"&&hasAnswers)?"Result ✓":t}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-4">

        {/* PROFILE */}
        {tab==="profile" && (
          <>
            <div className="bg-white rounded-2xl p-5 border border-gray-100">
              <h3 className="font-bold text-gray-900 mb-3">Quick Info</h3>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-gray-400 text-xs uppercase">Domain</span><p className="font-semibold mt-0.5">{candidate.domain||"—"}</p></div>
                <div><span className="text-gray-400 text-xs uppercase">Seniority</span><p className="font-semibold mt-0.5">{candidate.seniority||"—"}</p></div>
                <div><span className="text-gray-400 text-xs uppercase">Experience</span><p className="font-semibold mt-0.5">{candidate.experienceYears?`${candidate.experienceYears}y`:"—"}</p></div>
                <div><span className="text-gray-400 text-xs uppercase">AI Score</span><p className="font-semibold mt-0.5">{score}/100</p></div>
              </div>
            </div>
            {(candidate.topSkills?.length??0)>0 && (
              <div className="bg-white rounded-2xl p-5 border border-gray-100">
                <h3 className="font-bold text-gray-900 mb-3">Top Skills</h3>
                <div className="flex flex-wrap gap-2">
                  {candidate.topSkills!.map(s=><span key={s} className="bg-blue-50 text-blue-700 text-xs font-medium px-2.5 py-1 rounded-full border border-blue-100">{s}</span>)}
                </div>
              </div>
            )}
            <div className="bg-white rounded-2xl p-5 border border-gray-100">
              <h3 className="font-bold text-gray-900 mb-3">Move Stage</h3>
              <div className="grid grid-cols-2 gap-2">
                {STAGES.map(s=>(
                  <button key={s.value} onClick={()=>onStatusChange(s.value)}
                    className={`text-xs font-semibold px-3 py-2 rounded-xl border transition-all text-left ${(candidate.status||"cv_uploaded")===s.value?"border-blue-400 bg-blue-50 text-blue-700":"border-gray-200 text-gray-600 hover:border-gray-400"}`}>
                    <div className={`w-2 h-2 rounded-full ${s.dot} inline-block mr-1.5`}/>{s.label}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {/* GENERATE QUESTIONS */}
        {tab==="generate" && (
          <div className="space-y-4">
            <h3 className="font-bold text-gray-900 text-lg">Generate Interview Questions</h3>

            {/* Mode Toggle */}
            <div className="bg-gray-100 rounded-2xl p-1.5 flex gap-1">
              <button onClick={() => setQuestionMode("ai")}
                className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 ${questionMode==="ai"?"bg-blue-600 text-white shadow-sm":"text-gray-600 hover:text-gray-800"}`}>
                🤖 AI Generated
              </button>
              <button onClick={() => setQuestionMode("bank")} disabled={!bankAvailable}
                className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 ${questionMode==="bank"?"bg-purple-600 text-white shadow-sm":"text-gray-600 hover:text-gray-800"} disabled:opacity-40 disabled:cursor-not-allowed`}>
                📋 From Job Bank
                {!bankAvailable && <span className="text-xs opacity-70 ml-1">(need 8+)</span>}
              </button>
            </div>

            {/* ── AI MODE ── */}
            {questionMode==="ai" && (
              <div className="bg-blue-50 rounded-2xl border border-blue-100 p-5 space-y-4">
                <div>
                  <p className="text-sm font-bold text-blue-900 mb-1">🤖 AI will generate 8 questions based on candidate skills and selected difficulty</p>
                  <p className="text-xs text-blue-600">Role: {job.title} · Skills: {(candidate.topSkills||[]).slice(0,3).join(", ") || "General"}</p>
                </div>
                <div>
                  <p className="text-xs font-bold text-gray-700 uppercase tracking-wide mb-2">Select Difficulty Level</p>
                  <div className="grid grid-cols-3 gap-3">
                    {(["easy","medium","hard"] as const).map(d => (
                      <button key={d} onClick={() => setAiDifficulty(d)}
                        className={`p-4 rounded-xl border-2 text-left transition-all ${aiDifficulty===d?DIFF_ACTIVE[d]+" border-current":DIFF_COLORS[d]+" hover:opacity-80"}`}>
                        <div className="text-xl mb-1">{diffCfg[d].icon}</div>
                        <div className="font-bold text-sm">{diffCfg[d].label}</div>
                        <div className="text-xs mt-0.5 opacity-75">{diffCfg[d].desc}</div>
                      </button>
                    ))}
                  </div>
                </div>
                <button onClick={generateAIQuestions} disabled={generatingQ}
                  className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700 transition-all disabled:opacity-60">
                  {generatingQ?"⏳ AI Generating questions...":"✨ Generate " + diffCfg[aiDifficulty].label + " Questions"}
                </button>
              </div>
            )}

            {/* ── JOB BANK MODE ── */}
            {questionMode==="bank" && (
              <div className="bg-purple-50 rounded-2xl border border-purple-100 p-5 space-y-4">
                <div>
                  <p className="text-sm font-bold text-purple-900 mb-1">📋 Pick 8 random questions from this job's question bank</p>
                  <p className="text-xs text-purple-600">{job.questionBank?.length||0} questions in bank · Shuffled and picked randomly each time</p>
                </div>

                {/* Bank difficulty counts */}
                <div className="grid grid-cols-3 gap-2">
                  {(["easy","medium","hard"] as const).map(d => {
                    const count = job.questionBank?.filter(q=>q.difficulty===d).length||0;
                    return (
                      <div key={d} className={`rounded-xl p-3 text-center border ${DIFF_COLORS[d]}`}>
                        <div className="font-black text-lg">{count}</div>
                        <div className="text-xs capitalize font-medium mt-0.5">{d}</div>
                      </div>
                    );
                  })}
                </div>

                {/* Filter by difficulty */}
                <div>
                  <p className="text-xs font-bold text-gray-600 uppercase tracking-wide mb-2">Filter questions by difficulty (optional)</p>
                  <div className="flex gap-2">
                    {(["all","easy","medium","hard"] as const).map(d => (
                      <button key={d} onClick={() => setBankDifficulty(d)}
                        className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-all ${bankDifficulty===d?"bg-purple-600 text-white border-purple-600":"border-gray-200 text-gray-600 hover:border-purple-300"}`}>
                        {d==="all"?"All":d==="easy"?"🟢 Easy":d==="medium"?"🟡 Med":"🔴 Hard"}
                      </button>
                    ))}
                  </div>
                </div>

                <button onClick={generateBankQuestions} disabled={generatingQ}
                  className="w-full bg-purple-600 text-white py-3 rounded-xl font-bold hover:bg-purple-700 transition-all disabled:opacity-60">
                  {generatingQ?"⏳ Loading...":"🎲 Pick 8 Random Questions from Bank"}
                </button>
                <p className="text-xs text-center text-purple-400">Questions are shuffled randomly each time you click</p>
              </div>
            )}

            {/* Bank not available warning */}
            {questionMode==="bank" && !bankAvailable && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-center">
                <p className="text-sm text-amber-700 font-medium">The question bank needs at least 8 questions.</p>
                <p className="text-xs text-amber-500 mt-1">Go to the "📋 Question Bank" tab to add questions.</p>
              </div>
            )}
          </div>
        )}

        {/* SCREENING */}
        {tab==="screening" && (
          <>
            {questions.length===0 ? (
              <div className="bg-white rounded-2xl p-8 border border-gray-100 text-center">
                <div className="text-5xl mb-3">❓</div>
                <p className="font-semibold text-gray-700 mb-4">No questions generated yet</p>
                <button onClick={() => setTab("generate")} className="bg-blue-600 text-white px-6 py-3 rounded-xl font-semibold hover:bg-blue-700">✨ Generate Questions</button>
              </div>
            ) : hasAnswers ? (
              <div className="bg-emerald-50 rounded-2xl p-5 border border-emerald-200 text-center">
                <p className="font-bold text-emerald-700 text-lg">✅ Answers already submitted</p>
                <p className="text-sm text-emerald-600 mt-1">Click "Result ✓" tab to see scores</p>
              </div>
            ) : (
              <>
                <div className="bg-purple-50 rounded-xl p-4 border border-purple-100 text-sm text-purple-700">
                  <strong>Instructions:</strong> Record the candidate's verbal answers below. AI will score each and determine next stage.
                </div>
                {questions.map((q,i) => (
                  <div key={i} className="bg-white rounded-xl p-5 border border-gray-100">
                    <div className="flex gap-3 mb-3">
                      <span className="bg-purple-100 text-purple-700 font-bold text-xs w-7 h-7 rounded-full flex items-center justify-center shrink-0">{i+1}</span>
                      <p className="text-gray-800 text-sm font-medium leading-relaxed">{q}</p>
                    </div>
                    <textarea value={answers[i]||""} onChange={e=>{const a=[...answers];a[i]=e.target.value;setAnswers(a);}}
                      rows={3} placeholder="Type candidate's answer here..."
                      className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"/>
                  </div>
                ))}
                <button onClick={submitAnswers} disabled={submitting||answers.filter(a=>a.trim()).length<questions.length}
                  className="w-full bg-purple-600 text-white py-3 rounded-xl font-bold hover:bg-purple-700 transition-all disabled:opacity-60 text-sm">
                  {submitting?"⏳ AI scoring...":  `🚀 Submit ${questions.length} Answers for AI Scoring`}
                </button>
              </>
            )}
          </>
        )}

        {/* RESULT */}
        {tab==="result" && (
          <>
            {!hasAnswers && !screeningResult ? (
              <div className="bg-white rounded-2xl p-8 border border-gray-100 text-center text-gray-400">
                <div className="text-5xl mb-3">📊</div>
                <p className="font-medium">No screening results yet</p>
                <p className="text-sm mt-1">Complete screening tab first</p>
              </div>
            ) : (
              <>
                <div className="bg-white rounded-2xl p-5 border border-gray-100">
                  <h3 className="font-bold text-gray-900 mb-4">Screening Results</h3>
                  <div className="grid grid-cols-3 gap-4 text-center mb-4">
                    <div><div className="text-3xl font-black text-blue-600">{score}</div><div className="text-xs text-gray-500 mt-1">AI Resume Score</div></div>
                    <div><div className="text-3xl font-black text-purple-600">{candidate.screeningScore??"—"}</div><div className="text-xs text-gray-500 mt-1">Screening Score</div></div>
                    <div><div className="text-3xl font-black text-emerald-600">{candidate.screeningScore!=null?Math.round((score+(candidate.screeningScore??0))/2):"—"}</div><div className="text-xs text-gray-500 mt-1">Combined Score</div></div>
                  </div>
                  <div className={`rounded-xl p-3 text-center font-bold text-sm ${candidate.status==="hm_ready"?"bg-emerald-100 text-emerald-700":"bg-amber-100 text-amber-700"}`}>
                    {candidate.status==="hm_ready"?"🎉 HM Ready — Passed screening!":"📋 Under Review"}
                  </div>
                </div>
                {candidate.screeningAnswers?.map((sa,i) => (
                  <div key={i} className="bg-white rounded-xl p-5 border border-gray-100">
                    <div className="flex items-start justify-between mb-2">
                      <p className="font-semibold text-gray-800 text-sm flex-1">Q{i+1}: {sa.question}</p>
                      {sa.aiScore!==undefined && (
                        <span className={`text-xs font-bold px-2.5 py-1 rounded-full ml-3 shrink-0 ${sa.aiScore>=80?"bg-emerald-100 text-emerald-700":sa.aiScore>=60?"bg-blue-100 text-blue-700":"bg-amber-100 text-amber-700"}`}>
                          {sa.aiScore}/100
                        </span>
                      )}
                    </div>
                    {sa.aiFeedback && <p className="text-xs text-gray-500 italic">💡 {sa.aiFeedback}</p>}
                  </div>
                ))}
                {candidate.status!=="hm_ready" && (
                  <button onClick={() => onStatusChange("hm_ready")} className="w-full bg-emerald-600 text-white py-3 rounded-xl font-bold hover:bg-emerald-700 transition-all">✓ Manually Move to HM Ready</button>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
