import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";

// ── Types ─────────────────────────────────────────────────────
interface Breakdown { [key: string]: number }
interface Answer    { question: string; aiScore?: number; scoreBreakdown?: Breakdown; aiFeedback?: string }
interface Session   {
  _id?: string; sessionType: "ai_generated"|"bank_questions";
  difficulty?: string; conductedAt?: string; conductedBy?: string;
  screeningScore: number; screeningBreakdown?: Breakdown; answers?: Answer[]
}
interface RiskFlags {
  frequentJobChanges?: boolean; noticePeriodRisk?: string;
  missingMandatorySkills?: string[]; domainMismatch?: boolean
}
interface Candidate {
  _id: string; name: string; email: string; phone?: string;
  appliedFor?: string; jobTitle?: string;
  domain?: string; seniority?: string; experienceYears?: number;
  topSkills?: string[];
  aiScore?: number; score?: number;
  cvScoreBreakdown?: { skillsMatchScore?: number; stabilityScore?: number };
  screeningScore?: number; screeningBreakdown?: Breakdown;
  screeningSessions?: Session[];
  interviewQuestions?: string[];
  screeningAnswers?: Answer[];
  combinedScore?: number; hmReportType?: string;
  tier?: string; riskLevel?: string; status?: string;
  recommendation?: string; recommendationReason?: string;
  summary?: string; hmSummary?: string;
  strengths?: string[]; gaps?: string[];
  interviewFocusAreas?: string[];
  riskFlags?: RiskFlags;
  skillScores?: { skill: string; score: number }[];
  databases?: string[]; frameworks?: string[]; tools?: string[];
  technicalExperience?: string; leadershipExperience?: string; cloudExpertise?: string;
  roleType?: string;
  jobId?: { roleType?: string; scoringWeights?: { cvWeight: number; screeningWeight: number } };
  // Added fields
  notes?: { _id?: string; text: string; createdBy: string; createdAt: string }[];
  interviewDate?: string;
  interviewNotes?: string;
  source?: string;
  createdAt?: string;
  updatedAt?: string;
  companiesWorkedAt?: number;
  averageTenureYears?: number;
  shortTenureCompanies?: string[];
  projectDomains?: string[];
  uploadedByName?: string;
}

// ── Constants ─────────────────────────────────────────────────
const API = "https://asky-recruitiq-ai.onrender.com/api";
const STAGES = [
  { value:"cv_uploaded",       label:"CV Uploaded",       color:"bg-gray-100 text-gray-700"      },
  { value:"ai_screened",       label:"AI Screened",       color:"bg-blue-100 text-blue-700"      },
  { value:"questions_sent",    label:"Questions Sent",    color:"bg-purple-100 text-purple-700"  },
  { value:"answers_submitted", label:"Answers Submitted", color:"bg-amber-100 text-amber-700"    },
  { value:"hm_ready",          label:"HM Ready ✓",        color:"bg-emerald-100 text-emerald-700"},
  { value:"rejected",          label:"Rejected",          color:"bg-red-100 text-red-700"        },
];
const REC: Record<string,string> = {
  "Strong Hire":"bg-emerald-100 text-emerald-700 border-emerald-300",
  "Hire":       "bg-blue-100 text-blue-700 border-blue-300",
  "Consider":   "bg-amber-100 text-amber-700 border-amber-300",
  "Weak Fit":   "bg-orange-100 text-orange-700 border-orange-300",
  "Reject":     "bg-red-100 text-red-700 border-red-300",
};
const DIFF = {
  medium:{ icon:"🟡", label:"Medium", color:"bg-amber-500 text-white",   pale:"bg-amber-50 text-amber-800 border border-amber-200",       desc:"7 questions · Real scenarios" },
  hard:  { icon:"🔴", label:"Hard",   color:"bg-red-600 text-white",     pale:"bg-red-50 text-red-800 border border-red-200",             desc:"5 questions · System design"   },
};

function clr(n: number) { return n>=80?"text-emerald-600":n>=60?"text-blue-600":n>=40?"text-amber-600":"text-red-600"; }
function bgclr(n: number) { return n>=80?"bg-emerald-500":n>=60?"bg-blue-500":n>=40?"bg-amber-500":"bg-red-500"; }

function Bar({ label, score, weight="" }: { label:string; score:number; weight?:string }) {
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-gray-600">{label}{weight && <span className="text-gray-400 ml-1">({weight})</span>}</span>
        <span className={`font-bold ${clr(score)}`}>{score}/100</span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-2 rounded-full ${bgclr(score)}`} style={{ width:`${Math.min(score,100)}%` }}/>
      </div>
    </div>
  );
}

export default function CandidateDetailPage() {
  const { id }   = useParams();
  const navigate = useNavigate();
  const token    = localStorage.getItem("token") || "";

  const [candidate, setCandidate] = useState<Candidate|null>(null);
  const [loading, setLoading]     = useState(true);
  const [tab, setTab]             = useState("overview");

  // Question / screening state
  const [qMode, setQMode]       = useState<"ai"|"bank">("ai");
  const [difficulty, setDifficulty] = useState<"medium"|"hard">("medium");
  const [bankDiff, setBankDiff] = useState<"all"|"easy"|"medium"|"hard">("all");
  const [questions, setQuestions] = useState<string[]>([]);
  const [answers, setAnswers]     = useState<string[]>([]);
  const [genLoading, setGenLoading]   = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [transcriptMode, setTranscriptMode] = useState<"manual"|"transcript">("manual");
  const [newNote, setNewNote] = useState("");
  const [noteLoading, setNoteLoading] = useState(false);
  const [interviewDate, setInterviewDate] = useState("");
  const [interviewNotes, setInterviewNotes] = useState("");
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [scheduleSaved, setScheduleSaved] = useState(false);
  const [transcriptText, setTranscriptText] = useState("");
  const [transcriptLoading, setTranscriptLoading] = useState(false);
  const [transcriptFile, setTranscriptFile] = useState<File|null>(null);
  const [screenResult, setScreenResult]   = useState<any>(null);
  const [rescreenLoading, setRescreenLoading] = useState(false);

  // HM report state
  const [hmMode, setHmMode]       = useState<"cv_only"|"cv_ai_questions"|"cv_bank_questions">("cv_only");
  const [hmLoading, setHmLoading] = useState(false);
  const [hmDone, setHmDone]       = useState(false);

  useEffect(() => { load(); }, [id]);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch(`${API}/candidates/${id}`, { headers:{ Authorization:`Bearer ${token}` } });
      const d = await r.json();
      const c = d.candidate || d;
      setCandidate(c);
      setQuestions(c.interviewQuestions || []);
      if (c.status === "hm_ready") setHmDone(true);
      if (c.interviewDate) setInterviewDate(c.interviewDate.substring(0, 10));
      if (c.interviewNotes) setInterviewNotes(c.interviewNotes);
    } finally { setLoading(false); }
  }

  async function updateStatus(s: string) {
    await fetch(`${API}/candidates/${id}`, {
      method:"PATCH",
      headers:{"Content-Type":"application/json", Authorization:`Bearer ${token}`},
      body: JSON.stringify({ status:s }),
    });
    setCandidate(p => p ? {...p, status:s} : p);
  }

  async function rescreen() {
    setRescreenLoading(true);
    try {
      const r = await fetch(`${API}/candidates/${id}/rescreen`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      });
      const d = await r.json();
      if (!r.ok) {
        if (r.status === 503 || (d.message || "").includes("rate limit")) {
          alert("⚠️ AI providers are busy right now (rate limited). The system will auto-retry in 10 seconds. Please try again in 1 minute.");
        } else if ((d.message || "").includes("Not enough")) {
          alert("❌ Not enough data to re-screen. Please re-upload the candidate's CV file for a fresh screening.");
        } else {
          alert(d.message || "Re-screen failed. Please try again in a moment.");
        }
        return;
      }
      // Fully replace candidate with fresh data from server
      const fresh = d.candidate;
      if (fresh) {
        setCandidate(fresh);
        if (fresh.status === "hm_ready") setHmDone(true);
        if (fresh.interviewDate) setInterviewDate(fresh.interviewDate.substring(0, 10));
      }
      // Reload page data to reflect all updated scores
      await load();
    } catch(err) {
      alert("Re-screen failed — network error. Please try again.");
    } finally {
      setRescreenLoading(false);
    }
  }

  async function generateAI() {
    if (!candidate) return;
    setGenLoading(true);
    const questionCount = isTech ? (difficulty === "hard" ? 5 : 7) : 7;
    try {
      const r = await fetch(`${API}/candidates/${id}/questions`, {
        method:"POST",
        headers:{"Content-Type":"application/json", Authorization:`Bearer ${token}`},
        body: JSON.stringify({
          jobTitle:  candidate.appliedFor || candidate.jobTitle,
          skills:    candidate.topSkills,
          difficulty: isTech ? difficulty : "medium",
          roleType:  roleType,
          count:     questionCount,
          mode:      "ai",
          theoryFocus: true,
        }),
      });
      const d = await r.json();
      if (!r.ok) { alert(d.message || "Failed to generate questions"); return; }
      const qs = d.questions || [];
      setQuestions(qs);
      setAnswers(new Array(qs.length).fill(""));
      setCandidate(p => p ? {...p, interviewQuestions:qs, status:"questions_sent"} : p);
      setTab("screening");
    } finally { setGenLoading(false); }
  }

  async function loadBank() {
    if (!candidate) return;
    const jobId = typeof candidate.jobId === "object" ? (candidate.jobId as any)?._id : candidate.jobId;
    if (!jobId) { alert("No job linked to this candidate"); return; }
    setGenLoading(true);
    try {
      const url = `${API}/jobs/${jobId}/question-bank/random?difficulty=medium`;
      const r   = await fetch(url, { headers:{ Authorization:`Bearer ${token}` } });
      const d   = await r.json();
      if (!r.ok) { alert(d.message || "No questions in bank"); return; }
      const qs = d.questions || [];
      setQuestions(qs);
      setAnswers(new Array(qs.length).fill(""));
      setCandidate(p => p ? {...p, interviewQuestions:qs, status:"questions_sent"} : p);
      setTab("screening");
    } finally { setGenLoading(false); }
  }

  async function addNote() {
    if (!newNote.trim()) return;
    setNoteLoading(true);
    try {
      const r = await fetch(`${API}/candidates/${id}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ text: newNote.trim() })
      });
      const d = await r.json();
      if (r.ok) {
        setCandidate(p => p ? { ...p, notes: d.notes } : p);
        setNewNote("");
      }
    } finally { setNoteLoading(false); }
  }

  async function deleteNote(noteId: string) {
    if (!window.confirm("Delete this note?")) return;
    const r = await fetch(`${API}/candidates/${id}/notes/${noteId}`, {
      method: "DELETE", headers: { Authorization: `Bearer ${token}` }
    });
    const d = await r.json();
    if (r.ok) setCandidate(p => p ? { ...p, notes: d.notes } : p);
  }

  async function saveInterviewSchedule() {
    setScheduleLoading(true);
    try {
      const r = await fetch(`${API}/candidates/${id}/interview-date`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ interviewDate, interviewNotes })
      });
      if (r.ok) {
        setScheduleSaved(true);
        setCandidate(p => p ? { ...p, interviewDate, interviewNotes } : p);
        setTimeout(() => setScheduleSaved(false), 3000);
      }
    } finally { setScheduleLoading(false); }
  }

  async function uploadTranscript() {
    if (!transcriptText.trim() && !transcriptFile) {
      alert("Please paste a transcript or upload a file");
      return;
    }
    setTranscriptLoading(true);
    try {
      let text = transcriptText;
      // If file uploaded, read it as text
      if (transcriptFile) {
        text = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target?.result as string || "");
          reader.readAsText(transcriptFile);
        });
      }

      // Send transcript + questions to backend for AI extraction
      const r = await fetch(`${API}/candidates/${id}/transcript-screen`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          transcript: text,
          questions: questions,
          sessionType: qMode === "ai" ? "ai_generated" : "bank_questions",
          difficulty: isTech ? difficulty : "medium",
          meetingSource: "webex"
        }),
      });
      const d = await r.json();
      if (!r.ok) { alert(d.message || "Transcript processing failed"); return; }
      setScreenResult(d);
      setCandidate(p => p ? {
        ...p,
        screeningScore: d.session?.screeningScore || d.overallScore || 0,
        screeningSessions: [...(p.screeningSessions || []), d.session],
        combinedScore: d.session?.screeningScore || 0,
        status: "answers_submitted"
      } : p);
      setTab("hm-report");
    } catch(err) {
      alert("Failed to process transcript. Please try again.");
    } finally { setTranscriptLoading(false); }
  }

  async function submitAnswers() {
    if (answers.some(a => !a.trim())) { alert("Please answer all questions"); return; }
    setSubmitLoading(true);
    try {
      const r = await fetch(`${API}/candidates/${id}/answers`, {
        method:"POST",
        headers:{"Content-Type":"application/json", Authorization:`Bearer ${token}`},
        body: JSON.stringify({
          questions: questions,
          answers: answers,
          sessionType: qMode==="ai"?"ai_generated":"bank_questions",
          difficulty
        }),
      });
      const d = await r.json();
      if (!r.ok) { alert(d.message || "Scoring failed. Please try again."); return; }
      setScreenResult(d);
      setCandidate(p => p ? {
        ...p,
        screeningScore: d.session?.screeningScore || d.overallScore || 0,
        screeningSessions: [...(p.screeningSessions||[]), d.session],
        combinedScore: d.session?.screeningScore || 0,
        status: "answers_submitted"
      } : p);
      setTab("hm-report");
    } catch(err) {
      alert("Failed to submit answers. Please try again.");
    } finally { setSubmitLoading(false); }
  }

  async function setHMReport() {
    const sessions   = candidate?.screeningSessions || [];
    const targetType = hmMode === "cv_ai_questions" ? "ai_generated" : "bank_questions";
    const sessionIdx = hmMode !== "cv_only"
      ? sessions.filter(s=>s.sessionType===targetType).length - 1
      : undefined;

    setHmLoading(true);
    try {
      const r = await fetch(`${API}/candidates/${id}/hm-report`, {
        method:"POST",
        headers:{"Content-Type":"application/json", Authorization:`Bearer ${token}`},
        body: JSON.stringify({ hmReportType:hmMode, reportType:hmMode, sessionIndex:sessionIdx }),
      });
      const d = await r.json();
      if (!r.ok) { alert(d.message || "Failed"); return; }
      setHmDone(true);
      setCandidate(p => p ? {...p, ...d.candidate, hmReportType:hmMode, combinedScore:d.finalScore, recommendation:d.recommendation, status:"hm_ready"} : p);
    } finally { setHmLoading(false); }
  }

  // ── Export Functions ────────────────────────────────────────
  function exportPDF() {
    const lastSession = sessions[sessions.length - 1];
    const html = generateReportHTML(candidate, lastSession, hmMode, cvScore);
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 500);
  }

  function exportWord() {
    const lastSession = sessions[sessions.length - 1];
    const html = generateReportHTML(candidate, lastSession, hmMode, cvScore);
    const blob = new Blob([html], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `HM_Report_${candidate.name?.replace(/\s+/g,'_')}_${new Date().toISOString().slice(0,10)}.doc`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function generateReportHTML(c: any, session: any, mode: string, cvSc: number) {
    const combinedScore = c.combinedScore || cvSc;
    const recColor = combinedScore >= 80 ? '#16a34a' : combinedScore >= 60 ? '#2563eb' : combinedScore >= 40 ? '#d97706' : '#dc2626';
    const date = new Date().toLocaleDateString('en-IN', { day:'2-digit', month:'long', year:'numeric' });
    const qaRows = (session?.answers || []).map((a: any, i: number) => `
      <tr style="border-bottom:1px solid #e5e7eb;">
        <td style="padding:12px 16px;vertical-align:top;width:40px;color:#6b7280;font-size:13px;">${i+1}</td>
        <td style="padding:12px 16px;vertical-align:top;">
          <div style="font-weight:600;color:#111827;font-size:13px;margin-bottom:6px;">${a.question || ''}</div>
          <div style="color:#374151;font-size:13px;background:#f9fafb;padding:8px 12px;border-radius:6px;margin-bottom:6px;">${a.userAnswer || 'No answer provided'}</div>
          ${a.aiFeedback ? `<div style="color:#6b7280;font-size:12px;font-style:italic;">💡 ${a.aiFeedback}</div>` : ''}
        </td>
        <td style="padding:12px 16px;vertical-align:top;text-align:center;width:70px;">
          <span style="font-weight:700;font-size:16px;color:${(a.aiScore||0)>=70?'#16a34a':(a.aiScore||0)>=50?'#2563eb':'#dc2626'}">${a.aiScore||0}</span>
          <div style="color:#9ca3af;font-size:11px;">/100</div>
        </td>
      </tr>`).join('');

    return `<!DOCTYPE html><html><head><meta charset="UTF-8">
    <title>HM Report - ${c.name}</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 0; padding: 40px; color: #111827; background: white; }
      @media print { body { padding: 20px; } .no-print { display: none !important; } }
      h1,h2,h3 { margin: 0; }
      table { width: 100%; border-collapse: collapse; }
    </style></head><body>
    <!-- Header -->
    <div style="background:linear-gradient(135deg,#1e3a5f,#2563eb);color:white;padding:32px;border-radius:12px;margin-bottom:24px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div>
          <div style="font-size:12px;opacity:0.7;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">Hiring Manager Report</div>
          <h1 style="font-size:28px;font-weight:800;margin-bottom:4px;">${c.name}</h1>
          <div style="opacity:0.85;font-size:14px;">${c.appliedFor || c.jobTitle || 'Position'} · ${c.seniority || ''} · ${c.experienceYears || 0} years exp</div>
          ${c.email ? `<div style="opacity:0.7;font-size:13px;margin-top:4px;">📧 ${c.email}${c.phone ? ` · 📞 ${c.phone}` : ''}</div>` : ''}
        </div>
        <div style="text-align:right;">
          <div style="font-size:48px;font-weight:900;line-height:1;">${combinedScore}</div>
          <div style="font-size:12px;opacity:0.7;">/100 Final Score</div>
          <div style="margin-top:8px;background:white;color:${recColor};padding:4px 12px;border-radius:20px;font-weight:700;font-size:13px;display:inline-block;">${c.recommendation || 'Pending'}</div>
        </div>
      </div>
    </div>

    <!-- Score Summary -->
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:24px;">
      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:16px;text-align:center;">
        <div style="font-size:28px;font-weight:800;color:#16a34a;">${cvSc}</div>
        <div style="font-size:12px;color:#6b7280;margin-top:2px;">CV Score</div>
      </div>
      <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:16px;text-align:center;">
        <div style="font-size:28px;font-weight:800;color:#2563eb;">${c.cvScoreBreakdown?.skillsMatchScore||0}</div>
        <div style="font-size:12px;color:#6b7280;margin-top:2px;">Skills Match</div>
      </div>
      <div style="background:#f5f3ff;border:1px solid #ddd6fe;border-radius:10px;padding:16px;text-align:center;">
        <div style="font-size:28px;font-weight:800;color:#7c3aed;">${c.cvScoreBreakdown?.stabilityScore||0}</div>
        <div style="font-size:12px;color:#6b7280;margin-top:2px;">Stability Score</div>
      </div>
      <div style="background:#fef9c3;border:1px solid #fde68a;border-radius:10px;padding:16px;text-align:center;">
        <div style="font-size:28px;font-weight:800;color:#b45309;">${session?.screeningScore||0}</div>
        <div style="font-size:12px;color:#6b7280;margin-top:2px;">Screening Score</div>
      </div>
    </div>

    <!-- Stability Details -->
    ${(c.companiesWorkedAt || c.averageTenureYears) ? `
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px;margin-bottom:24px;">
      <h3 style="font-size:14px;font-weight:700;color:#374151;margin-bottom:10px;">📊 Career Stability Analysis</h3>
      <div style="display:flex;gap:20px;flex-wrap:wrap;">
        <span style="font-size:13px;color:#374151;">🏢 <strong>${c.companiesWorkedAt||0}</strong> companies worked</span>
        <span style="font-size:13px;color:${(c.averageTenureYears||0)>=2?'#16a34a':'#d97706'};">⏱️ Avg <strong>${c.averageTenureYears||0}y</strong> per company ${(c.averageTenureYears||0)<2?'⚠️ Below 2yr':'✅'}</span>
        ${(c.shortTenureCompanies||[]).length>0 ? `<span style="font-size:13px;color:#d97706;">⚠️ Short tenure: ${c.shortTenureCompanies.join(', ')}</span>` : ''}
      </div>
    </div>` : ''}

    <!-- AI Summary -->
    ${c.summary ? `
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px;margin-bottom:24px;">
      <h3 style="font-size:14px;font-weight:700;color:#374151;margin-bottom:8px;">🤖 AI Summary</h3>
      <p style="font-size:13px;color:#374151;line-height:1.6;margin:0;">${c.summary}</p>
    </div>` : ''}

    <!-- Skills & Profile -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px;">
      ${(c.topSkills||[]).length>0 ? `
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px;">
        <h3 style="font-size:14px;font-weight:700;color:#374151;margin-bottom:10px;">🛠️ Top Skills</h3>
        <div style="display:flex;flex-wrap:wrap;gap:6px;">
          ${(c.topSkills||[]).map((s: string)=>`<span style="background:#dbeafe;color:#1d4ed8;padding:4px 10px;border-radius:20px;font-size:12px;font-weight:600;">${s}</span>`).join('')}
        </div>
      </div>` : ''}
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px;">
        <h3 style="font-size:14px;font-weight:700;color:#374151;margin-bottom:10px;">✅ Strengths & ⚠️ Gaps</h3>
        ${(c.strengths||[]).slice(0,3).map((s: string)=>`<div style="font-size:12px;color:#374151;margin-bottom:4px;">✅ ${s}</div>`).join('')}
        ${(c.gaps||[]).slice(0,3).map((g: string)=>`<div style="font-size:12px;color:#b45309;margin-bottom:4px;">⚠️ ${g}</div>`).join('')}
      </div>
    </div>

    <!-- Q&A Section -->
    ${session?.answers?.length > 0 ? `
    <div style="margin-bottom:24px;">
      <h3 style="font-size:16px;font-weight:700;color:#111827;margin-bottom:12px;">📝 Screening Questions & Answers</h3>
      <div style="font-size:12px;color:#6b7280;margin-bottom:8px;">Session: ${session.sessionType === 'ai_generated' ? 'AI Generated' : 'Question Bank'} · Difficulty: ${session.difficulty || 'Medium'} · Score: ${session.screeningScore||0}/100</div>
      <table style="width:100%;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;">
        <thead>
          <tr style="background:#f9fafb;">
            <th style="padding:10px 16px;text-align:left;font-size:12px;color:#6b7280;width:40px;">#</th>
            <th style="padding:10px 16px;text-align:left;font-size:12px;color:#6b7280;">Question & Answer</th>
            <th style="padding:10px 16px;text-align:center;font-size:12px;color:#6b7280;width:70px;">Score</th>
          </tr>
        </thead>
        <tbody>${qaRows}</tbody>
      </table>
    </div>` : ''}

    <!-- Risk Flags -->
    ${(c.riskFlags?.frequentJobChanges || c.riskFlags?.domainMismatch || (c.riskFlags?.missingMandatorySkills||[]).length>0) ? `
    <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;padding:16px;margin-bottom:24px;">
      <h3 style="font-size:14px;font-weight:700;color:#c2410c;margin-bottom:10px;">⚠️ Risk Flags</h3>
      ${c.riskFlags?.frequentJobChanges ? '<div style="font-size:13px;color:#c2410c;margin-bottom:4px;">🔄 Frequent job changes detected</div>' : ''}
      ${c.riskFlags?.domainMismatch ? '<div style="font-size:13px;color:#c2410c;margin-bottom:4px;">🎯 Domain mismatch</div>' : ''}
      ${(c.riskFlags?.missingMandatorySkills||[]).map((s: string)=>`<div style="font-size:13px;color:#c2410c;margin-bottom:4px;">❌ Missing: ${s}</div>`).join('')}
    </div>` : ''}

    <!-- Footer -->
    <div style="border-top:1px solid #e5e7eb;padding-top:16px;margin-top:24px;display:flex;justify-content:space-between;color:#9ca3af;font-size:12px;">
      <span>Generated by Recruit IQ · ${date}</span>
      <span>Report Type: ${mode.replace(/_/g,' ').replace(/\b\w/g,(l: string)=>l.toUpperCase())}</span>
      <span>Confidential — Internal Use Only</span>
    </div>

    <div class="no-print" style="margin-top:24px;text-align:center;">
      <button onclick="window.print()" style="background:#1e3a5f;color:white;border:none;padding:12px 32px;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;">🖨️ Print / Save as PDF</button>
    </div>
    </body></html>`;
  }

  // ── Derived values ─────────────────────────────────────────
  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"/>
    </div>
  );
  if (!candidate) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-500">Candidate not found</div>
  );

  const cvScore    = candidate.aiScore || candidate.score || 0;
  const screenScore = (candidate.screeningScore && candidate.screeningScore > 0) ? candidate.screeningScore : null;
  const combined   = screenScore ? (candidate.combinedScore || Math.round(cvScore*0.6 + screenScore*0.4)) : cvScore;
  const roleType   = candidate.roleType || (candidate.jobId as any)?.roleType || "technical";
  const isTech     = roleType !== "non_technical";
  const tierKey    = (candidate.tier || "C-Tier").replace(/-?Tier$/i, "");
  const TIER_BG    = ({A:"bg-emerald-100 text-emerald-700",B:"bg-blue-100 text-blue-700",C:"bg-amber-100 text-amber-700"} as any)[tierKey] || "bg-gray-100 text-gray-600";
  const TIER_GRAD  = ({A:"from-emerald-400 to-emerald-600",B:"from-blue-400 to-blue-600",C:"from-amber-400 to-amber-600"} as any)[tierKey] || "from-gray-400 to-gray-600";
  const rec        = (cvScore>=85?"Strong Hire":cvScore>=72?"Hire":cvScore>=58?"Consider":cvScore>=42?"Weak Fit":"Reject");
  const curStage   = STAGES.find(s=>s.value===(candidate.status||"cv_uploaded")) || STAGES[0];
  const sessions   = candidate.screeningSessions || [];
  const aiSess     = sessions.filter(s=>s.sessionType==="ai_generated");
  const bankSess   = sessions.filter(s=>s.sessionType==="bank_questions");
  const hasAI      = aiSess.length > 0;
  const hasBank    = bankSess.length > 0;
  const hasInsights = !!(candidate.summary || candidate.hmSummary || (candidate.strengths?.length||0) > 0);

  // score breakdown labels by role type
  const cvLabel1 = isTech ? "Skills Match & Technical Depth" : "Experience Relevance to Role";
  const cvW1     = isTech ? "70%" : "60%";
  const cvW2     = isTech ? "30%" : "40%";

  return (
    <div className="min-h-screen bg-gray-50">

      {/* ── HEADER ── */}
      <div className="bg-white border-b border-gray-100 px-6 py-4">
        <button onClick={()=>navigate("/candidates")} className="text-sm text-gray-500 hover:text-blue-600 mb-3 flex items-center gap-1">← Candidates</button>

        <div className="flex items-start gap-4">
          {/* Avatar */}
          <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${TIER_GRAD} flex items-center justify-center text-white text-xl font-bold shadow shrink-0`}>
            {candidate.name?.charAt(0)?.toUpperCase()}
          </div>

          {/* Name + info */}
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold text-gray-900">{candidate.name}</h1>
            <div className="flex flex-wrap gap-3 text-sm text-gray-500 mt-0.5">
              {candidate.email && <span>✉️ {candidate.email}</span>}
              {candidate.phone && <span>📞 {candidate.phone}</span>}
              {(candidate.appliedFor||candidate.jobTitle) && <span>💼 <strong className="text-gray-800">{candidate.appliedFor||candidate.jobTitle}</strong></span>}
              {candidate.seniority && <span>🎯 {candidate.seniority}</span>}
              {candidate.experienceYears ? <span>📅 {candidate.experienceYears}y exp</span> : null}
              {candidate.domain && <span>🏷️ {candidate.domain}</span>}
            </div>
            <div className="flex items-center gap-2 mt-2">
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${TIER_BG}`}>{tierKey}-Tier</span>
              <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${REC[rec]||"bg-gray-100 text-gray-600 border-gray-200"}`}>{rec}</span>
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${isTech?"bg-blue-100 text-blue-700":"bg-amber-100 text-amber-700"}`}>
                {isTech?"💻 Technical":"🤝 Non-Technical"}
              </span>
            </div>
          </div>

          {/* Score + actions */}
          <div className="flex items-center gap-3 shrink-0">
            {/* CV Score */}
            <div className="text-center">
              <div className={`text-4xl font-black ${cvScore>0?clr(cvScore):"text-red-400"}`}>{cvScore||"—"}</div>
              <div className="text-xs text-gray-400 mt-0.5">CV Score</div>
            </div>

            {screenScore && (
              <>
                <span className="text-gray-300 text-xl">+</span>
                <div className="text-center">
                  <div className={`text-4xl font-black ${clr(screenScore)}`}>{screenScore}</div>
                  <div className="text-xs text-gray-400 mt-0.5">Screening</div>
                </div>
                <span className="text-gray-300 text-xl">=</span>
                <div className="text-center bg-slate-800 rounded-xl px-4 py-2">
                  <div className="text-4xl font-black text-white">{combined}</div>
                  <div className="text-xs text-gray-400 mt-0.5">Combined</div>
                </div>
              </>
            )}

            {!screenScore && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-2 text-center">
                <div className="text-xs font-semibold text-amber-700">Screening pending</div>
                <button onClick={()=>setTab("generate")} className="text-xs text-amber-600 underline mt-0.5">Generate questions →</button>
              </div>
            )}
          </div>

          {/* Buttons */}
          <div className="flex flex-col gap-2 shrink-0 items-end">
            <select value={candidate.status||"cv_uploaded"} onChange={e=>updateStatus(e.target.value)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-lg border-0 cursor-pointer focus:ring-2 focus:ring-blue-500 ${curStage.color}`}>
              {STAGES.map(s=><option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            <div className="flex gap-2">
              <button onClick={rescreen} disabled={rescreenLoading}
                className={`text-xs px-3 py-1.5 rounded-lg font-semibold transition-all ${cvScore===0?"bg-red-600 text-white hover:bg-red-700":"bg-blue-600 text-white hover:bg-blue-700"} disabled:opacity-60`}>
                {rescreenLoading ? "⏳..." : cvScore===0 ? "🔄 Run AI Screening" : "🔄 Re-screen"}
              </button>
              {candidate.status==="hm_ready" && (
                <button onClick={()=>setTab("hm-report")} className="text-xs bg-slate-800 text-white px-3 py-1.5 rounded-lg font-semibold hover:bg-slate-700">📋 HM Report</button>
              )}
            </div>
            {cvScore===0 && (
              <div className="text-xs text-amber-500 font-medium">⚠️ Click "Run AI Screening" to generate score</div>
            )}
          </div>
        </div>

        {/* Risk flags + Stability */}
        {(candidate.riskFlags?.frequentJobChanges || (candidate.riskFlags?.missingMandatorySkills||[]).length>0 || candidate.riskFlags?.domainMismatch || (candidate as any).shortTenureCompanies?.length>0) && (
          <div className="mt-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            <span className="text-xs font-bold text-red-700 mr-3">⚠️ Risk Flags:</span>
            {candidate.riskFlags?.frequentJobChanges && <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded-full font-semibold mr-2">🔄 Frequent job changes</span>}
            {candidate.riskFlags?.domainMismatch     && <span className="text-xs bg-orange-100 text-orange-700 px-2 py-1 rounded-full font-semibold mr-2">🎯 Domain mismatch</span>}
            {(candidate.riskFlags?.missingMandatorySkills||[]).map(s=><span key={s} className="text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded-full font-semibold mr-2">Missing: {s}</span>)}
            {((candidate as any).shortTenureCompanies||[]).map((c:string)=><span key={c} className="text-xs bg-orange-100 text-orange-700 px-2 py-1 rounded-full font-semibold mr-2">⏱️ {c}</span>)}
          </div>
        )}
        {/* Stability Summary */}
        {(candidate as any).companiesWorkedAt > 0 && (
          <div className="mt-2 flex gap-3 flex-wrap">
            <span className="text-xs bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full">🏢 {(candidate as any).companiesWorkedAt} companies</span>
            {(candidate as any).averageTenureYears > 0 && (
              <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${(candidate as any).averageTenureYears >= 2 ? "bg-emerald-100 text-emerald-700" : "bg-orange-100 text-orange-700"}`}>
                ⏱️ Avg {(candidate as any).averageTenureYears}y per company {(candidate as any).averageTenureYears < 2 ? "⚠️" : "✅"}
              </span>
            )}
          </div>
        )}

        {/* Pipeline progress */}
        <div className="mt-3 flex gap-1">
          {STAGES.map((s,i)=>{
            const ci = STAGES.findIndex(st=>st.value===(candidate.status||"cv_uploaded"));
            return <div key={s.value} className="flex-1 flex flex-col items-center gap-1">
              <div className={`h-1.5 w-full rounded-full ${i<=ci?"bg-blue-500":"bg-gray-200"}`}/>
            </div>;
          })}
        </div>
      </div>

      {/* ── TABS ── */}
      <div className="bg-white border-b border-gray-100 px-6">
        <div className="flex gap-5 overflow-x-auto">
          {[
            { key:"overview",    label:"Overview"                                               },
            { key:"score",       label:"Score Breakdown"                                        },
            { key:"ai-insights", label:"AI Insights" + (!hasInsights?" ⚠️":"")                 },
            { key:"tech-acumen", label:"🔬 Tech Acumen"                                        },
            { key:"generate",    label:"Generate Questions"                                     },
            { key:"screening",   label:`Screening${questions.length>0?` (${questions.length}Q)`:""}`},
            { key:"sessions",    label:`Sessions${sessions.length>0?` (${sessions.length})`:""}`},
            { key:"notes",      label:`📝 Notes${(candidate.notes?.length||0)>0?` (${candidate.notes?.length})`:""}` },
            { key:"timeline",   label:"⏱️ Timeline" },
            { key:"hm-report",   label:`📋 HM Report${candidate.status==="hm_ready"?" ✓":""}` },
          ].map(t=>(
            <button key={t.key} onClick={()=>setTab(t.key)}
              className={`py-3 text-sm font-semibold border-b-2 whitespace-nowrap transition-all shrink-0 ${tab===t.key?"border-blue-600 text-blue-600":"border-transparent text-gray-500 hover:text-gray-700"}`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── TAB CONTENT ── */}
      <div className="p-6 max-w-5xl space-y-5">

        {/* OVERVIEW */}
        {tab==="overview" && (
          <>
            {/* Score cards */}
            <div className="bg-white rounded-2xl p-6 border border-gray-100">
              <h2 className="font-bold text-gray-900 mb-4">Candidate Fit Score</h2>
              <div className="grid grid-cols-3 gap-4 mb-4">
                <div className="text-center bg-blue-50 rounded-2xl p-5 border border-blue-100">
                  <div className={`text-4xl font-black ${cvScore>0?clr(cvScore):"text-red-400"}`}>{cvScore||"—"}</div>
                  <div className="text-sm font-bold text-blue-700 mt-1">CV / Resume</div>
                  <div className="text-xs text-gray-400 mt-0.5">{isTech?"Skills 70% + Stability 30%":"Experience 60% + Stability 40%"}</div>
                </div>
                <div className={`text-center rounded-2xl p-5 border ${screenScore?"bg-purple-50 border-purple-100":"bg-amber-50 border-amber-200"}`}>
                  {screenScore ? (
                    <>
                      <div className={`text-4xl font-black ${clr(screenScore)}`}>{screenScore}</div>
                      <div className="text-sm font-bold text-purple-700 mt-1">Screening Score</div>
                      <div className="text-xs text-gray-400 mt-0.5">{isTech?"Technical interview":"Functional interview"}</div>
                    </>
                  ) : (
                    <>
                      <div className="text-3xl text-amber-300 mt-1">⏳</div>
                      <div className="text-sm font-bold text-amber-600 mt-1">Screening Pending</div>
                      <div className="text-xs text-amber-400 mt-0.5">Go to Generate Questions tab</div>
                    </>
                  )}
                </div>
                <div className={`text-center rounded-2xl p-5 ${screenScore?"bg-slate-800":"bg-slate-100 border border-slate-200"}`}>
                  <div className={`text-4xl font-black ${screenScore?"text-white":"text-slate-400"}`}>{combined}</div>
                  <div className={`text-sm font-bold mt-1 ${screenScore?"text-gray-300":"text-slate-500"}`}>{screenScore?"Final Score":"CV Score Only"}</div>
                  <div className={`text-xs mt-0.5 ${screenScore?"text-gray-500":"text-slate-400"}`}>{screenScore?"CV 60% + Screen 40%":"Complete screening to update"}</div>
                </div>
              </div>
              <div className={`rounded-xl p-4 border text-center ${REC[rec]||"bg-gray-50 border-gray-100"}`}>
                <div className="text-xs font-bold uppercase tracking-wide opacity-60 mb-1">
                  {screenScore?"Fit Recommendation (CV + Screening)":"Fit Recommendation (CV Only)"}
                </div>
                <div className="text-xl font-black">{rec}</div>
              </div>
            </div>

            {/* Info grid */}
            <div className="bg-white rounded-2xl p-5 border border-gray-100">
              <h3 className="font-bold text-gray-900 mb-3">Profile</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                {[
                  {l:"Domain",    v:candidate.domain},
                  {l:"Seniority", v:candidate.seniority},
                  {l:"Experience",v:candidate.experienceYears?`${candidate.experienceYears} years`:undefined},
                  {l:"Applied For",v:candidate.appliedFor||candidate.jobTitle},
                ].map(({l,v})=>v ? (
                  <div key={l}><span className="text-xs text-gray-400 uppercase font-bold">{l}</span><p className="font-semibold text-gray-800 mt-0.5">{v}</p></div>
                ) : null)}
              </div>
            </div>

            {/* HM Summary */}
            {(candidate.hmSummary||candidate.summary) && (
              <div className="bg-white rounded-2xl p-5 border border-gray-100">
                <h3 className="font-bold text-gray-900 mb-2">🎯 Hiring Manager Briefing</h3>
                <p className="text-gray-600 text-sm leading-relaxed">{candidate.hmSummary||candidate.summary}</p>
              </div>
            )}

            {/* Skills */}
            {(candidate.topSkills?.length||0)>0 && (
              <div className="bg-white rounded-2xl p-5 border border-gray-100">
                <h3 className="font-bold text-gray-900 mb-3">Key Skills</h3>
                <div className="flex flex-wrap gap-2">
                  {candidate.topSkills!.map(s=><span key={s} className="bg-blue-50 text-blue-700 text-sm font-medium px-3 py-1 rounded-full border border-blue-100">{s}</span>)}
                </div>
              </div>
            )}
          </>
        )}

        {/* SCORE BREAKDOWN */}
        {tab==="score" && (
          <>
            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
              <div className="px-5 py-4 bg-gray-50 border-b border-gray-100">
                <h2 className="font-bold text-gray-900">Score Breakdown</h2>
                <p className="text-xs text-gray-400 mt-0.5">How the final score is calculated</p>
              </div>
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    {["Parameter","Score","Weight",""].map(h=><th key={h} className="px-5 py-3 text-left text-xs font-bold text-gray-500 uppercase">{h}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  <tr className="bg-blue-50"><td className="px-5 py-2.5 font-bold text-blue-700 text-xs uppercase" colSpan={4}>📄 Resume Match ({cvScore}/100)</td></tr>
                  {[
                    { label:cvLabel1, score:candidate.cvScoreBreakdown?.skillsMatchScore||0, weight:cvW1, color:"bg-blue-500" },
                    { label:"Stability & Reliability", score:candidate.cvScoreBreakdown?.stabilityScore||0, weight:cvW2, color:"bg-indigo-500" },
                  ].map(r=>(
                    <tr key={r.label} className="hover:bg-gray-50">
                      <td className="px-5 py-3 text-sm text-gray-700 pl-9">{r.label}</td>
                      <td className={`px-5 py-3 text-center font-bold ${clr(r.score)}`}>{r.score}</td>
                      <td className="px-5 py-3 text-center text-xs text-gray-400">{r.weight}</td>
                      <td className="px-5 py-3"><div className="w-24 h-2 bg-gray-100 rounded-full"><div className={`h-2 rounded-full ${r.color}`} style={{width:`${r.score}%`}}/></div></td>
                    </tr>
                  ))}

                  {screenScore ? (
                    <>
                      <tr className="bg-purple-50"><td className="px-5 py-2.5 font-bold text-purple-700 text-xs uppercase" colSpan={4}>🎙️ {isTech?"Technical":"Functional"} Screening ({screenScore}/100)</td></tr>
                      {Object.entries(candidate.screeningBreakdown || {}).map(([k,v])=>{ const score=Number(v)||0; return (
                        <tr key={k} className="hover:bg-gray-50">
                          <td className="px-5 py-3 text-sm text-gray-700 pl-9 capitalize">{k.replace(/([A-Z])/g,' $1').trim()}</td>
                          <td className={`px-5 py-3 text-center font-bold ${clr(score)}`}>{score}</td>
                          <td className="px-5 py-3 text-center text-xs text-gray-400">—</td>
                          <td className="px-5 py-3"><div className="w-24 h-2 bg-gray-100 rounded-full"><div className="h-2 rounded-full bg-purple-500" style={{width:`${score}%`}}/></div></td>
                        </tr>); })}
                    </>
                  ) : (
                    <tr className="bg-amber-50"><td className="px-5 py-4 text-amber-700 text-sm font-semibold pl-5" colSpan={4}>⏳ Screening not completed yet — generate questions to start screening</td></tr>
                  )}

                  <tr className="bg-slate-800">
                    <td className="px-5 py-4 font-black text-white">{screenScore?"🏆 Final Combined Score":"🏆 CV Score (Screening Pending)"}</td>
                    <td className={`px-5 py-4 text-center text-2xl font-black text-white`}>{combined}</td>
                    <td className="px-5 py-4 text-center text-xs text-gray-400">{screenScore?"60%+40%":"CV Only"}</td>
                    <td className="px-5 py-4"><span className={`text-xs font-bold px-3 py-1 rounded-full border ${REC[rec]||""}`}>{rec}</span></td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Skill scores */}
            {(candidate.skillScores?.length||0)>0 && (
              <div className="bg-white rounded-2xl p-5 border border-gray-100">
                <h3 className="font-bold text-gray-900 mb-4">Skill Proficiency</h3>
                <div className="space-y-3">
                  {candidate.skillScores!.map(({skill,score:s})=><Bar key={skill} label={skill} score={s}/>)}
                </div>
              </div>
            )}
          </>
        )}

        {/* AI INSIGHTS */}
        {tab==="ai-insights" && (
          <>
            {!hasInsights ? (
              <div className="bg-white rounded-2xl p-12 border border-gray-100 text-center">
                <div className="text-5xl mb-4">🤖</div>
                <p className="font-bold text-gray-700 text-lg mb-2">No AI Insights Yet</p>
                <p className="text-sm text-gray-500 mb-6">Click "Re-screen CV" to run AI analysis and generate insights</p>
                <button onClick={rescreen} disabled={rescreenLoading}
                  className="bg-blue-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-blue-700 disabled:opacity-60">
                  {rescreenLoading?"⏳ Running AI...":"🔄 Run AI Screening Now"}
                </button>
              </div>
            ) : (
              <>
                {(candidate.hmSummary||candidate.summary) && (
                  <div className="bg-white rounded-2xl p-5 border border-gray-100">
                    <h3 className="font-bold text-gray-900 mb-3">🎯 Hiring Manager Briefing</h3>
                    <p className="text-gray-600 text-sm leading-relaxed">{candidate.hmSummary||candidate.summary}</p>
                    {candidate.recommendationReason && <p className="text-xs text-gray-400 mt-3 italic">{candidate.recommendationReason}</p>}
                  </div>
                )}

                {((candidate.strengths?.length||0)+(candidate.gaps?.length||0))>0 && (
                  <div className="grid grid-cols-2 gap-4">
                    {(candidate.strengths?.length||0)>0 && (
                      <div className="bg-emerald-50 rounded-2xl p-5 border border-emerald-100">
                        <h3 className="font-bold text-emerald-800 mb-3">✅ Strengths</h3>
                        <ul className="space-y-2">{candidate.strengths!.map((s,i)=><li key={i} className="text-sm text-gray-700 flex gap-2 items-start"><span className="text-emerald-500 shrink-0">•</span>{s}</li>)}</ul>
                      </div>
                    )}
                    {(candidate.gaps?.length||0)>0 && (
                      <div className="bg-amber-50 rounded-2xl p-5 border border-amber-100">
                        <h3 className="font-bold text-amber-800 mb-3">⚠️ Concerns / Gaps</h3>
                        <ul className="space-y-2">{candidate.gaps!.map((g,i)=><li key={i} className="text-sm text-gray-700 flex gap-2 items-start"><span className="text-amber-500 shrink-0">•</span>{g}</li>)}</ul>
                      </div>
                    )}
                  </div>
                )}

                {(candidate.interviewFocusAreas?.length||0)>0 && (
                  <div className="bg-white rounded-2xl p-5 border border-gray-100">
                    <h3 className="font-bold text-gray-900 mb-4">🎯 HM Interview Focus Areas</h3>
                    <div className="space-y-3">
                      {candidate.interviewFocusAreas!.map((a,i)=>(
                        <div key={i} className="flex gap-3 items-start">
                          <span className="w-6 h-6 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-xs font-bold shrink-0">{i+1}</span>
                          <p className="text-sm text-gray-700">{a}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {(candidate.technicalExperience||candidate.leadershipExperience||candidate.cloudExpertise) && (
                  <div className="grid grid-cols-3 gap-4">
                    {candidate.technicalExperience && <div className="bg-blue-50 rounded-xl p-4 border border-blue-100"><div className="text-xs font-bold text-blue-700 uppercase mb-2">🔧 {isTech?"Technical":"Domain"} Experience</div><p className="text-sm text-gray-700 leading-relaxed">{candidate.technicalExperience}</p></div>}
                    {candidate.leadershipExperience && candidate.leadershipExperience!=="None mentioned" && <div className="bg-purple-50 rounded-xl p-4 border border-purple-100"><div className="text-xs font-bold text-purple-700 uppercase mb-2">👥 Leadership</div><p className="text-sm text-gray-700 leading-relaxed">{candidate.leadershipExperience}</p></div>}
                    {candidate.cloudExpertise && candidate.cloudExpertise!=="None mentioned" && <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-100"><div className="text-xs font-bold text-emerald-700 uppercase mb-2">☁️ Cloud / Tools</div><p className="text-sm text-gray-700 leading-relaxed">{candidate.cloudExpertise}</p></div>}
                  </div>
                )}

                {((candidate.databases?.length||0)+(candidate.frameworks?.length||0)+(candidate.tools?.length||0))>0 && (
                  <div className="bg-white rounded-2xl p-5 border border-gray-100">
                    <h3 className="font-bold text-gray-900 mb-4">💻 {isTech?"Tech Stack":"Tools & Systems"}</h3>
                    <div className="grid grid-cols-3 gap-4">
                      {(candidate.databases?.length||0)>0 && <div><div className="text-xs font-bold text-gray-400 uppercase mb-2">🗄️ Databases</div><div className="flex flex-wrap gap-1.5">{candidate.databases!.map(d=><span key={d} className="bg-orange-50 text-orange-700 text-xs px-2.5 py-1 rounded-full border border-orange-100">{d}</span>)}</div></div>}
                      {(candidate.frameworks?.length||0)>0 && <div><div className="text-xs font-bold text-gray-400 uppercase mb-2">⚙️ Frameworks</div><div className="flex flex-wrap gap-1.5">{candidate.frameworks!.map(f=><span key={f} className="bg-violet-50 text-violet-700 text-xs px-2.5 py-1 rounded-full border border-violet-100">{f}</span>)}</div></div>}
                      {(candidate.tools?.length||0)>0 && <div><div className="text-xs font-bold text-gray-400 uppercase mb-2">🛠️ Tools</div><div className="flex flex-wrap gap-1.5">{candidate.tools!.map(t=><span key={t} className="bg-gray-100 text-gray-700 text-xs px-2.5 py-1 rounded-full">{t}</span>)}</div></div>}
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}

        {/* GENERATE QUESTIONS */}
        {tab==="tech-acumen" && (
          <div className="space-y-4">

            {/* Header */}
            <div className="bg-gradient-to-r from-indigo-600 to-blue-600 rounded-2xl p-5 text-white">
              <h2 className="text-lg font-bold mb-1">🔬 Technology Acumen</h2>
              <p className="text-blue-200 text-sm">Skill depth analysis extracted from CV — no extra AI tokens used</p>
            </div>

            {/* Skill Scores - from AI extraction */}
            {(candidate as any).skillScores?.length > 0 && (
              <div className="bg-white rounded-2xl p-5 border border-gray-100">
                <h3 className="font-bold text-gray-900 mb-4">📊 Skill Proficiency Scores</h3>
                <div className="space-y-3">
                  {(candidate as any).skillScores.map((s: any, i: number) => (
                    <div key={i}>
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-sm font-semibold text-gray-700">{s.skill}</span>
                        <span className={`text-sm font-bold ${s.score >= 80 ? 'text-emerald-600' : s.score >= 60 ? 'text-blue-600' : s.score >= 40 ? 'text-amber-600' : 'text-red-500'}`}>
                          {s.score}/100
                        </span>
                      </div>
                      <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={`h-2.5 rounded-full transition-all ${s.score >= 80 ? 'bg-emerald-500' : s.score >= 60 ? 'bg-blue-500' : s.score >= 40 ? 'bg-amber-500' : 'bg-red-400'}`}
                          style={{ width: `${s.score}%` }}
                        />
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        {s.score >= 80 ? '⭐ Expert' : s.score >= 60 ? '✅ Proficient' : s.score >= 40 ? '🔄 Intermediate' : '🌱 Beginner'}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Tech Stack Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

              {/* Frameworks */}
              {(candidate as any).frameworks?.length > 0 && (
                <div className="bg-white rounded-2xl p-5 border border-gray-100">
                  <h3 className="font-bold text-gray-900 mb-3">🧩 Frameworks & Libraries</h3>
                  <div className="flex flex-wrap gap-2">
                    {(candidate as any).frameworks.map((f: string, i: number) => (
                      <span key={i} className="bg-purple-50 text-purple-700 border border-purple-200 text-xs font-semibold px-3 py-1.5 rounded-full">
                        {f}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Databases */}
              {(candidate as any).databases?.length > 0 && (
                <div className="bg-white rounded-2xl p-5 border border-gray-100">
                  <h3 className="font-bold text-gray-900 mb-3">🗄️ Databases</h3>
                  <div className="flex flex-wrap gap-2">
                    {(candidate as any).databases.map((d: string, i: number) => (
                      <span key={i} className="bg-blue-50 text-blue-700 border border-blue-200 text-xs font-semibold px-3 py-1.5 rounded-full">
                        {d}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Tools */}
              {(candidate as any).tools?.length > 0 && (
                <div className="bg-white rounded-2xl p-5 border border-gray-100">
                  <h3 className="font-bold text-gray-900 mb-3">🛠️ Tools & Platforms</h3>
                  <div className="flex flex-wrap gap-2">
                    {(candidate as any).tools.map((t: string, i: number) => (
                      <span key={i} className="bg-amber-50 text-amber-700 border border-amber-200 text-xs font-semibold px-3 py-1.5 rounded-full">
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Project Domains */}
              {(candidate as any).projectDomains?.length > 0 && (
                <div className="bg-white rounded-2xl p-5 border border-gray-100">
                  <h3 className="font-bold text-gray-900 mb-3">🏗️ Project Domains</h3>
                  <div className="flex flex-wrap gap-2">
                    {(candidate as any).projectDomains.map((d: string, i: number) => (
                      <span key={i} className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-semibold px-3 py-1.5 rounded-full">
                        {d}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Technical Experience Summary */}
            {candidate.technicalExperience && (
              <div className="bg-white rounded-2xl p-5 border border-gray-100">
                <h3 className="font-bold text-gray-900 mb-3">💼 Technical Background</h3>
                <p className="text-sm text-gray-600 leading-relaxed">{candidate.technicalExperience}</p>
              </div>
            )}

            {/* Top Skills with level indicators */}
            {(candidate.topSkills?.length || 0) > 0 && (
              <div className="bg-white rounded-2xl p-5 border border-gray-100">
                <h3 className="font-bold text-gray-900 mb-3">⭐ Core Skills</h3>
                <div className="flex flex-wrap gap-2">
                  {candidate.topSkills!.map((s, i) => (
                    <span key={i} className="bg-indigo-50 text-indigo-700 border border-indigo-200 text-sm font-semibold px-3 py-1.5 rounded-full">
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Empty state */}
            {!(candidate as any).skillScores?.length &&
             !(candidate as any).frameworks?.length &&
             !(candidate as any).databases?.length &&
             !(candidate as any).tools?.length && (
              <div className="bg-gray-50 rounded-2xl p-10 text-center border border-gray-100">
                <div className="text-4xl mb-3">🔬</div>
                <p className="font-bold text-gray-600">No tech data yet</p>
                <p className="text-sm text-gray-400 mt-1">Re-screen the CV to extract technology details</p>
                <button onClick={rescreen} disabled={rescreenLoading}
                  className="mt-4 bg-blue-600 text-white px-5 py-2 rounded-xl font-bold text-sm hover:bg-blue-700 disabled:opacity-60">
                  {rescreenLoading ? "⏳ Running..." : "🔄 Extract Tech Data"}
                </button>
              </div>
            )}

            {/* Token info note */}
            <div className="bg-gray-50 rounded-xl p-3 border border-gray-100 flex items-center gap-2">
              <span className="text-green-600 text-lg">✅</span>
              <p className="text-xs text-gray-500">This data was extracted during CV upload — <strong>no additional AI tokens consumed</strong> when viewing this tab.</p>
            </div>

          </div>
        )}

        {tab==="generate" && (
          <div className="bg-white rounded-2xl p-6 border border-gray-100">
            <h2 className="font-bold text-gray-900 text-lg mb-4">Generate Interview Questions</h2>

            {/* Role type badge */}
            <div className={`mb-5 flex items-center gap-3 px-4 py-3 rounded-xl ${isTech?"bg-blue-50 border border-blue-100":"bg-amber-50 border border-amber-100"}`}>
              <span className="text-xl">{isTech?"💻":"🤝"}</span>
              <div>
                <p className={`text-sm font-bold ${isTech?"text-blue-800":"text-amber-800"}`}>{isTech?"Technical Role":"Non-Technical Role"}</p>
                <p className={`text-xs ${isTech?"text-blue-600":"text-amber-600"}`}>
                  {isTech?"Questions: technical skills, system design, debugging":"Questions: domain knowledge, scenarios, communication, judgment"}
                </p>
              </div>
            </div>

            {/* Mode toggle */}
            <div className="bg-gray-100 rounded-2xl p-1.5 flex gap-1 mb-5">
              {(["ai","bank"] as const).map(m=>(
                <button key={m} onClick={()=>setQMode(m)}
                  className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all ${qMode===m?(m==="ai"?"bg-blue-600 text-white":"bg-purple-600 text-white"):"text-gray-600 hover:text-gray-900"}`}>
                  {m==="ai"?"🤖 AI Generated":"📋 From Job Bank"}
                </button>
              ))}
            </div>

            {/* AI mode */}
            {qMode==="ai" && (
              <div className="space-y-4">
                <div className={`rounded-xl p-4 border ${isTech?"bg-blue-50 border-blue-100":"bg-amber-50 border-amber-100"}`}>
                  <p className={`text-sm font-bold mb-1 ${isTech?"text-blue-900":"text-amber-900"}`}>
                    {isTech
                      ? `AI generates ${difficulty==="hard"?"5":"7"} theory-based technical questions`
                      : "AI generates 7 role-specific theory questions"}
                  </p>
                  <p className={`text-xs ${isTech?"text-blue-600":"text-amber-600"}`}>
                    {isTech
                      ? `Skills: ${(candidate.topSkills||[]).slice(0,3).join(", ")||"General"}`
                      : `Domain: ${candidate.domain||candidate.appliedFor||"General"}`}
                  </p>
                </div>

                {/* Difficulty — IT roles: Medium + Hard | Non-IT: Medium only */}
                <div>
                  <p className="text-xs font-bold text-gray-600 uppercase tracking-wide mb-2">Difficulty Level</p>
                  {isTech ? (
                    <div className="grid grid-cols-2 gap-3">
                      {(["medium","hard"] as const).map(k=>(
                        <button key={k} onClick={()=>setDifficulty(k)}
                          className={`p-4 rounded-xl text-left transition-all ${difficulty===k?DIFF[k].color:DIFF[k].pale}`}>
                          <div className="text-lg mb-1">{DIFF[k].icon}</div>
                          <div className="font-bold text-sm">{DIFF[k].label}</div>
                          <div className="text-xs opacity-70 mt-0.5">{DIFF[k].desc}</div>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-3">
                      <div className={`p-4 rounded-xl text-left ${DIFF["medium"].color}`}>
                        <div className="text-lg mb-1">{DIFF["medium"].icon}</div>
                        <div className="font-bold text-sm">Medium</div>
                        <div className="text-xs opacity-70 mt-0.5">7 questions · Role-specific scenarios</div>
                      </div>
                    </div>
                  )}
                </div>

                <button onClick={generateAI} disabled={genLoading}
                  className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700 disabled:opacity-60">
                  {genLoading?"⏳ Generating...":"✨ Generate Questions"}
                </button>
              </div>
            )}

            {/* Bank mode — Medium only */}
            {qMode==="bank" && (
              <div className="space-y-4">
                <div className="bg-purple-50 rounded-xl p-4 border border-purple-100">
                  <p className="text-sm font-bold text-purple-900 mb-1">📋 Medium difficulty questions from the job bank</p>
                  <p className="text-xs text-purple-600">Questions shuffled and picked randomly from the bank</p>
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                  <p className="text-xs text-amber-700 font-semibold">🟡 Medium difficulty only — suitable for all candidates</p>
                </div>
                <button onClick={loadBank} disabled={genLoading}
                  className="w-full bg-purple-600 text-white py-3 rounded-xl font-bold hover:bg-purple-700 disabled:opacity-60">
                  {genLoading?"⏳ Loading...":"🎲 Pick Questions from Bank"}
                </button>
              </div>
            )}
          </div>
        )}

        {/* SCREENING */}
        {tab==="screening" && (
          <div className="space-y-4">
            {questions.length===0 ? (
              <div className="bg-white rounded-2xl p-10 border border-gray-100 text-center">
                <div className="text-4xl mb-3">❓</div>
                <p className="font-bold text-gray-700 mb-4">No questions yet</p>
                <button onClick={()=>setTab("generate")} className="bg-blue-600 text-white px-6 py-3 rounded-xl font-bold">✨ Generate Questions First</button>
              </div>
            ) : screenResult ? (
              <div className="bg-emerald-50 rounded-2xl p-5 border border-emerald-200">
                <p className="font-bold text-emerald-800 text-lg">✅ Screening Complete!</p>
                <p className="text-sm text-emerald-700 mt-1">Screening Score: <strong>{screenResult.screeningScore}/100</strong> · Combined: <strong>{screenResult.combinedScore}/100</strong> · {screenResult.recommendation}</p>
                <button onClick={()=>setTab("hm-report")} className="mt-3 bg-emerald-700 text-white px-5 py-2 rounded-xl text-sm font-bold">📋 Set HM Report →</button>
              </div>
            ) : (
              <>
                <div className={`rounded-xl p-3 border text-sm font-semibold ${qMode==="ai"?"bg-blue-50 border-blue-100 text-blue-700":"bg-purple-50 border-purple-100 text-purple-700"}`}>
                  {qMode==="ai"?`🤖 AI Questions — ${DIFF[difficulty].icon} ${DIFF[difficulty].label}`:"📋 Job Bank Questions"} · {questions.length}Q
                </div>
                {/* Mode Toggle - Manual vs Transcript */}
                <div className="bg-gray-100 rounded-2xl p-1.5 flex gap-1">
                  <button onClick={() => setTranscriptMode("manual")}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${transcriptMode==="manual" ? "bg-white text-blue-600 shadow-sm" : "text-gray-500"}`}>
                    ✏️ Manual Entry
                  </button>
                  <button onClick={() => setTranscriptMode("transcript")}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${transcriptMode==="transcript" ? "bg-white text-purple-600 shadow-sm" : "text-gray-500"}`}>
                    🎙️ Upload Transcript
                  </button>
                </div>

                {transcriptMode === "manual" ? (
                  <>
                    <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 text-sm text-amber-700">
                      <strong>Recruiter:</strong> Ask each question. Record the candidate's answer. AI will score each response.
                    </div>
                    {questions.map((q,i)=>(
                      <div key={i} className="bg-white rounded-xl p-5 border border-gray-100">
                        <div className="flex gap-3 mb-3">
                          <span className="w-7 h-7 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-xs font-bold shrink-0">{i+1}</span>
                          <p className="text-sm font-medium text-gray-800 leading-relaxed">{q}</p>
                        </div>
                        <textarea value={answers[i]||""} onChange={e=>{const a=[...answers];a[i]=e.target.value;setAnswers(a);}}
                          rows={3} placeholder="Record candidate's answer here..."
                          className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"/>
                      </div>
                    ))}
                    <button onClick={submitAnswers} disabled={submitLoading||answers.filter(a=>a.trim()).length<questions.length}
                      className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700 disabled:opacity-60">
                      {submitLoading?"⏳ AI scoring...":"🚀 Submit Answers for AI Scoring"}
                    </button>
                  </>
                ) : (
                  <>
                    {/* Transcript Upload Mode */}
                    <div className="bg-purple-50 border border-purple-100 rounded-xl p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-2xl">🎙️</span>
                        <div>
                          <p className="text-sm font-bold text-purple-900">Webex / Teams / Zoom Transcript</p>
                          <p className="text-xs text-purple-600">AI will extract answers from the meeting transcript and match them to the questions above</p>
                        </div>
                      </div>
                    </div>

                    {/* Questions summary */}
                    <div className="bg-white rounded-xl border border-gray-100 p-4">
                      <p className="text-xs font-bold text-gray-500 uppercase mb-2">Questions AI will look for in transcript:</p>
                      {questions.map((q,i) => (
                        <div key={i} className="flex gap-2 mb-1.5 items-start">
                          <span className="w-5 h-5 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">{i+1}</span>
                          <p className="text-xs text-gray-600">{q}</p>
                        </div>
                      ))}
                    </div>

                    {/* Upload Options */}
                    <div className="space-y-3">
                      {/* File Upload */}
                      <div className="bg-white rounded-xl border-2 border-dashed border-purple-200 p-4 text-center hover:border-purple-400 transition-all">
                        <input
                          type="file"
                          accept=".txt,.vtt,.srt,.doc,.docx"
                          id="transcript-file"
                          className="hidden"
                          onChange={e => {
                            const f = e.target.files?.[0];
                            if (f) { setTranscriptFile(f); setTranscriptText(""); }
                          }}
                        />
                        <label htmlFor="transcript-file" className="cursor-pointer">
                          <div className="text-3xl mb-2">📄</div>
                          <p className="text-sm font-semibold text-gray-700">
                            {transcriptFile ? `✅ ${transcriptFile.name}` : "Upload transcript file"}
                          </p>
                          <p className="text-xs text-gray-400 mt-1">Supports .txt, .vtt, .srt, .docx</p>
                          <div className="mt-2 bg-purple-600 text-white px-4 py-1.5 rounded-lg text-xs font-bold inline-block hover:bg-purple-700">
                            Choose File
                          </div>
                        </label>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="flex-1 h-px bg-gray-200"/>
                        <span className="text-xs text-gray-400 font-medium">OR</span>
                        <div className="flex-1 h-px bg-gray-200"/>
                      </div>

                      {/* Paste Text */}
                      <div>
                        <label className="block text-xs font-bold text-gray-600 uppercase mb-2">Paste transcript text directly</label>
                        <textarea
                          value={transcriptText}
                          onChange={e => { setTranscriptText(e.target.value); setTranscriptFile(null); }}
                          rows={8}
                          placeholder={`Paste your Webex/Teams/Zoom meeting transcript here...

Example format:
[00:01:23] Interviewer: Can you explain React hooks?
[00:01:45] Candidate: Sure, React hooks are functions that let you use state and lifecycle features...
[00:03:12] Interviewer: How would you handle performance issues?
[00:03:30] Candidate: I would start by profiling the app using React DevTools...`}
                          className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-purple-500 font-mono"
                        />
                      </div>
                    </div>

                    {/* How it works */}
                    <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                      <p className="text-xs font-bold text-gray-600 mb-2">🤖 How AI processes the transcript:</p>
                      <div className="space-y-1.5">
                        {[
                          "Reads the full meeting transcript",
                          "Identifies candidate's responses to each question",
                          "Scores each answer based on accuracy, depth and relevance",
                          "Generates a screening score just like manual entry"
                        ].map((step, i) => (
                          <div key={i} className="flex gap-2 items-center">
                            <span className="w-4 h-4 bg-purple-100 text-purple-700 rounded-full flex items-center justify-center text-xs font-bold shrink-0">{i+1}</span>
                            <p className="text-xs text-gray-600">{step}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    <button
                      onClick={uploadTranscript}
                      disabled={transcriptLoading || (!transcriptText.trim() && !transcriptFile)}
                      className="w-full bg-purple-600 text-white py-3 rounded-xl font-bold hover:bg-purple-700 disabled:opacity-60 flex items-center justify-center gap-2">
                      {transcriptLoading ? (
                        <><span className="animate-spin">⏳</span> AI is reading transcript...</>
                      ) : (
                        <><span>🎙️</span> Process Transcript & Score</>
                      )}
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        )}

        {/* SESSIONS */}
        {tab==="sessions" && (
          <div className="space-y-4">
            <h2 className="font-bold text-gray-900">Screening History</h2>
            {sessions.length===0 ? (
              <div className="bg-white rounded-2xl p-10 border border-gray-100 text-center text-gray-400">
                <div className="text-4xl mb-3">📋</div><p>No screening sessions yet</p>
              </div>
            ) : sessions.map((s,i)=>(
              <div key={i} className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                <div className={`px-5 py-3 flex items-center justify-between ${s.sessionType==="ai_generated"?"bg-blue-50":"bg-purple-50"}`}>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold">{s.sessionType==="ai_generated"?"🤖 AI":"📋 Bank"}</span>
                    {s.difficulty && <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${DIFF[s.difficulty as keyof typeof DIFF]?.pale||""}`}>{s.difficulty}</span>}
                    <span className="text-xs text-gray-400">{s.conductedAt?new Date(s.conductedAt).toLocaleDateString():""}</span>
                    <span className="text-xs text-gray-400">{s.conductedBy}</span>
                  </div>
                  <span className={`text-lg font-black ${clr(s.screeningScore)}`}>{s.screeningScore}/100</span>
                </div>
                {(s.answers||[]).slice(0,3).map((a,j)=>(
                  <div key={j} className="px-5 py-3 border-b border-gray-50 flex justify-between gap-4">
                    <p className="text-xs text-gray-600 flex-1 truncate">{a.question}</p>
                    {a.aiScore!=null && <span className={`text-xs font-bold shrink-0 ${clr(a.aiScore)}`}>{a.aiScore}/100</span>}
                  </div>
                ))}
                {(s.answers||[]).length>3 && <div className="px-5 py-2 text-xs text-gray-400">+{(s.answers||[]).length-3} more answers</div>}
              </div>
            ))}
          </div>
        )}

        {/* HM REPORT */}
        {tab==="notes" && (
          <div className="space-y-4">
            {/* Add note */}
            <div className="bg-white rounded-2xl p-5 border border-gray-100">
              <h3 className="font-bold text-gray-900 mb-1">📝 Recruiter Notes</h3>
              <p className="text-xs text-gray-400 mb-3">Record call observations, interview feedback, follow-ups — visible to your team only</p>
              <textarea value={newNote} onChange={e => setNewNote(e.target.value)}
                rows={3} placeholder="Type your note, observation or follow-up here..."
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 mb-3"/>
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-400">Notes are visible to all recruiters on this candidate</span>
                <button onClick={addNote} disabled={!newNote.trim() || noteLoading}
                  className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-blue-700 disabled:opacity-50">
                  {noteLoading ? "Saving..." : "Add Note"}
                </button>
              </div>
            </div>

            {/* Notes list */}
            {(candidate.notes?.length || 0) === 0 ? (
              <div className="bg-gray-50 rounded-2xl p-10 text-center border border-gray-100">
                <div className="text-4xl mb-3">📝</div>
                <p className="font-bold text-gray-500">No notes yet</p>
                <p className="text-sm text-gray-400 mt-1">Add observations, call notes, or follow-ups above</p>
              </div>
            ) : (
              <div className="space-y-3">
                {[...(candidate.notes||[])].reverse().map((note: any, i: number) => (
                  <div key={note._id || i} className="bg-white rounded-2xl p-4 border border-gray-100">
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-xs font-bold">
                          {note.createdBy?.charAt(0)?.toUpperCase()}
                        </div>
                        <div>
                          <span className="text-sm font-semibold text-gray-900">{note.createdBy}</span>
                          <span className="text-xs text-gray-400 ml-2">{new Date(note.createdAt).toLocaleString('en-IN', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' })}</span>
                        </div>
                      </div>
                      <button onClick={() => deleteNote(note._id)}
                        className="text-gray-300 hover:text-red-500 text-xs transition-colors">🗑</button>
                    </div>
                    <p className="text-sm text-gray-700 leading-relaxed pl-9">{note.text}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Interview scheduling */}
            <div className="bg-blue-50 rounded-2xl p-5 border border-blue-100">
              <h3 className="font-bold text-blue-900 mb-1">📅 Schedule Interview</h3>
              <p className="text-xs text-blue-600 mb-3">Set a proposed interview date — this will appear on the candidate's Timeline tab</p>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="block text-xs font-bold text-blue-700 mb-1">Interview Date</label>
                  <input type="date" value={interviewDate} onChange={e => setInterviewDate(e.target.value)}
                    className="w-full border border-blue-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"/>
                </div>
                <div>
                  <label className="block text-xs font-bold text-blue-700 mb-1">Notes (optional)</label>
                  <input type="text" value={interviewNotes} onChange={e => setInterviewNotes(e.target.value)}
                    placeholder="e.g. Video call with HM, Panel interview, Technical round..."
                    className="w-full border border-blue-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"/>
                </div>
              </div>
              <button onClick={saveInterviewSchedule} disabled={scheduleLoading}
                className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${scheduleSaved ? "bg-emerald-600 text-white" : "bg-blue-600 text-white hover:bg-blue-700"} disabled:opacity-50`}>
                {scheduleLoading ? "Saving..." : scheduleSaved ? "✅ Saved!" : "💾 Save Schedule"}
              </button>
            </div>
          </div>
        )}

        {tab==="timeline" && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl p-5 border border-gray-100">
              <h3 className="font-bold text-gray-900 mb-4">⏱️ Candidate Activity Timeline</h3>
              <div className="relative">
                <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-100"/>
                {[
                  { icon:"📄", label:"CV Uploaded", color:"bg-gray-100 text-gray-600", date: candidate.createdAt, detail: `Applied for ${candidate.appliedFor || candidate.jobTitle || "—"}` },
                  candidate.aiScore ? { icon:"🤖", label:"AI Screened", color:"bg-blue-100 text-blue-700", date: candidate.updatedAt, detail: `CV Score: ${candidate.aiScore}/100 · ${candidate.tier}` } : null,
                  (candidate.interviewQuestions?.length||0)>0 ? { icon:"❓", label:"Questions Generated", color:"bg-purple-100 text-purple-700", date: candidate.updatedAt, detail: `${candidate.interviewQuestions?.length} questions sent` } : null,
                  candidate.screeningScore ? { icon:"✍️", label:"Answers Submitted", color:"bg-amber-100 text-amber-700", date: candidate.updatedAt, detail: `Screening Score: ${candidate.screeningScore}/100` } : null,
                  candidate.status === "hm_ready" ? { icon:"🎯", label:"HM Ready", color:"bg-emerald-100 text-emerald-700", date: candidate.updatedAt, detail: `Combined Score: ${candidate.combinedScore}/100 · ${candidate.recommendation}` } : null,
                  candidate.status === "rejected" ? { icon:"❌", label:"Rejected", color:"bg-red-100 text-red-700", date: candidate.updatedAt, detail: "Candidate was rejected" } : null,
                  candidate.interviewDate ? { icon:"📅", label:"Interview Scheduled", color:"bg-indigo-100 text-indigo-700", date: candidate.interviewDate, detail: candidate.interviewNotes || "Interview date set" } : null,
                  ...(candidate.notes||[]).map((n:any) => ({ icon:"📝", label:`Note by ${n.createdBy}`, color:"bg-gray-100 text-gray-600", date: n.createdAt, detail: n.text.substring(0, 80) + (n.text.length > 80 ? "..." : "") }))
                ].filter(Boolean).sort((a:any,b:any) => new Date(a.date||0).getTime() - new Date(b.date||0).getTime()).map((event:any, i:number) => (
                  <div key={i} className="flex gap-4 mb-5 relative">
                    <div className={`w-8 h-8 rounded-full ${event.color} flex items-center justify-center text-sm flex-shrink-0 z-10`}>{event.icon}</div>
                    <div className="flex-1 pt-1">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-gray-900">{event.label}</span>
                        <span className="text-xs text-gray-400">{event.date ? new Date(event.date).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'2-digit', hour:'2-digit', minute:'2-digit' }) : "—"}</span>
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">{event.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab==="hm-report" && (
          <div className="bg-white rounded-2xl p-6 border border-gray-100">
            <h2 className="font-bold text-gray-900 text-lg mb-2">📋 Choose Report for Hiring Manager</h2>
            <p className="text-sm text-gray-500 mb-6">Select what evidence to base the final score on. The HM sees only what you choose.</p>

            <div className="space-y-3 mb-6">
              {/* Option 1 */}
              <button onClick={()=>setHmMode("cv_only")}
                className={`w-full p-5 rounded-xl border-2 text-left transition-all ${hmMode==="cv_only"?"border-blue-500 bg-blue-50":"border-gray-200 hover:border-blue-200"}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">📄</span>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-gray-900">AI CV Screening Score Only</span>
                        <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-semibold">Always available</span>
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">{isTech?"Skills depth 70% + Stability 30%":"Experience relevance 60% + Stability 40%"}</p>
                    </div>
                  </div>
                  <div className={`text-3xl font-black shrink-0 ml-4 ${clr(cvScore)}`}>{cvScore}</div>
                </div>
                <div className="mt-2 flex gap-2 flex-wrap">
                  <span className="text-xs bg-blue-100 text-blue-700 px-2.5 py-1 rounded-full">{cvLabel1}: {candidate.cvScoreBreakdown?.skillsMatchScore||0}</span>
                  <span className="text-xs bg-indigo-100 text-indigo-700 px-2.5 py-1 rounded-full">Stability: {candidate.cvScoreBreakdown?.stabilityScore||0}</span>
                </div>
              </button>

              {/* Option 2 */}
              <button onClick={()=>{ if(hasAI) setHmMode("cv_ai_questions"); }}
                className={`w-full p-5 rounded-xl border-2 text-left transition-all ${!hasAI?"border-gray-100 bg-gray-50 cursor-not-allowed":hmMode==="cv_ai_questions"?"border-purple-500 bg-purple-50":"border-gray-200 hover:border-purple-200"}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className={`text-2xl ${!hasAI?"grayscale opacity-40":""}`}>🤖</span>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`font-bold ${!hasAI?"text-gray-400":"text-gray-900"}`}>CV + AI Generated Questions</span>
                        {!hasAI
                          ? <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-semibold">Complete AI screening first</span>
                          : <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-semibold">{aiSess.length} session{aiSess.length>1?"s":""}</span>
                        }
                      </div>
                      <p className={`text-xs mt-0.5 ${!hasAI?"text-gray-400":"text-gray-500"}`}>
                        {hasAI?`Latest: ${aiSess[aiSess.length-1]?.screeningScore||0}/100`:"Go to Generate Questions → AI Generated"}
                      </p>
                    </div>
                  </div>
                  {hasAI && <div className={`text-3xl font-black shrink-0 ml-4 ${clr(Math.round(cvScore*0.6+(aiSess[aiSess.length-1].screeningScore||0)*0.4))}`}>{Math.round(cvScore*0.6+(aiSess[aiSess.length-1].screeningScore||0)*0.4)}</div>}
                </div>
                {hasAI && <div className="mt-2 flex gap-2"><span className="text-xs bg-blue-100 text-blue-700 px-2.5 py-1 rounded-full">CV {cvScore}×60%</span><span className="text-xs text-gray-300">+</span><span className="text-xs bg-purple-100 text-purple-700 px-2.5 py-1 rounded-full">Screen {aiSess[aiSess.length-1]?.screeningScore||0}×40%</span></div>}
              </button>

              {/* Option 3 */}
              <button onClick={()=>{ if(hasBank) setHmMode("cv_bank_questions"); }}
                className={`w-full p-5 rounded-xl border-2 text-left transition-all ${!hasBank?"border-gray-100 bg-gray-50 cursor-not-allowed":hmMode==="cv_bank_questions"?"border-emerald-500 bg-emerald-50":"border-gray-200 hover:border-emerald-200"}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className={`text-2xl ${!hasBank?"grayscale opacity-40":""}`}>📋</span>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`font-bold ${!hasBank?"text-gray-400":"text-gray-900"}`}>CV + Question Bank Screening</span>
                        {!hasBank
                          ? <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-semibold">Complete bank screening first</span>
                          : <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-semibold">{bankSess.length} session{bankSess.length>1?"s":""}</span>
                        }
                      </div>
                      <p className={`text-xs mt-0.5 ${!hasBank?"text-gray-400":"text-gray-500"}`}>
                        {hasBank?`Latest: ${bankSess[bankSess.length-1]?.screeningScore||0}/100`:"Go to Generate Questions → From Job Bank"}
                      </p>
                    </div>
                  </div>
                  {hasBank && <div className={`text-3xl font-black shrink-0 ml-4 ${clr(Math.round(cvScore*0.6+(bankSess[bankSess.length-1].screeningScore||0)*0.4))}`}>{Math.round(cvScore*0.6+(bankSess[bankSess.length-1].screeningScore||0)*0.4)}</div>}
                </div>
                {hasBank && <div className="mt-2 flex gap-2"><span className="text-xs bg-blue-100 text-blue-700 px-2.5 py-1 rounded-full">CV {cvScore}×60%</span><span className="text-xs text-gray-300">+</span><span className="text-xs bg-emerald-100 text-emerald-700 px-2.5 py-1 rounded-full">Screen {bankSess[bankSess.length-1]?.screeningScore||0}×40%</span></div>}
              </button>
            </div>

            {hmDone ? (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5">
                <div className="text-center mb-4">
                  <p className="font-bold text-emerald-800 text-lg">✅ Candidate is HM Ready!</p>
                  <p className="text-sm text-emerald-600 mt-1">Report: <strong>{hmMode.replace(/_/g," ").replace(/\w/g,l=>l.toUpperCase())}</strong> · Final Score: <strong>{candidate.combinedScore}/100</strong> · {candidate.recommendation}</p>
                </div>
                <div className="flex gap-3 justify-center flex-wrap">
                  <button onClick={exportPDF}
                    className="flex items-center gap-2 bg-red-600 text-white px-5 py-2.5 rounded-xl font-bold hover:bg-red-700 transition-all text-sm shadow-sm">
                    📄 Download PDF
                  </button>
                  <button onClick={exportWord}
                    className="flex items-center gap-2 bg-blue-700 text-white px-5 py-2.5 rounded-xl font-bold hover:bg-blue-800 transition-all text-sm shadow-sm">
                    📝 Download Word
                  </button>
                  <button onClick={exportPDF}
                    className="flex items-center gap-2 bg-slate-600 text-white px-5 py-2.5 rounded-xl font-bold hover:bg-slate-700 transition-all text-sm shadow-sm">
                    🖨️ Print Report
                  </button>
                </div>
              </div>
            ) : (
              <button onClick={setHMReport} disabled={hmLoading}
                className="w-full bg-slate-800 text-white py-4 rounded-xl font-bold hover:bg-slate-900 disabled:opacity-60 text-base">
                {hmLoading?"⏳ Generating Report...":"✅ Confirm & Generate HM Report"}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
