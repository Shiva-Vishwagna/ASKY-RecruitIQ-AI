import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";

// ── Types ─────────────────────────────────────────────────────
interface Breakdown { technical?: number; depth?: number; relevance?: number; }
interface Answer { question: string; aiScore?: number; scoreBreakdown?: Breakdown; aiFeedback?: string; }
interface Session {
  sessionType: "ai_generated"|"bank_questions";
  difficulty?: string;
  conductedAt?: string;
  screeningScore: number;
  screeningBreakdown?: Breakdown;
  answers?: Answer[];
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
  combinedScore?: number;
  hmReportType?: string;
  tier?: string; riskLevel?: string;
  status?: string;
  recommendation?: string; recommendationReason?: string;
  summary?: string; hmSummary?: string;
  strengths?: string[]; gaps?: string[];
  interviewFocusAreas?: string[];
  riskFlags?: { frequentJobChanges?: boolean; noticePeriodRisk?: string; missingMandatorySkills?: string[]; domainMismatch?: boolean };
  skillScores?: { skill: string; score: number }[];
  databases?: string[]; frameworks?: string[]; tools?: string[];
  technicalExperience?: string; leadershipExperience?: string; cloudExpertise?: string;
  jobId?: any;
}

// ── Constants ─────────────────────────────────────────────────
const STAGES = [
  { value:"cv_uploaded",       label:"CV Uploaded",       color:"bg-gray-100 text-gray-600"      },
  { value:"ai_screened",       label:"AI Screened",       color:"bg-blue-100 text-blue-700"      },
  { value:"questions_sent",    label:"Questions Sent",    color:"bg-purple-100 text-purple-700"  },
  { value:"answers_submitted", label:"Answers Submitted", color:"bg-amber-100 text-amber-700"    },
  { value:"hm_ready",          label:"HM Ready ✓",        color:"bg-emerald-100 text-emerald-700"},
  { value:"rejected",          label:"Rejected",          color:"bg-red-100 text-red-700"        },
];
const REC_STYLE: Record<string,string> = {
  "Strong Hire": "bg-emerald-100 text-emerald-700 border-emerald-300",
  "Hire":        "bg-blue-100 text-blue-700 border-blue-300",
  "Consider":    "bg-amber-100 text-amber-700 border-amber-300",
  "Weak Fit":    "bg-orange-100 text-orange-700 border-orange-300",
  "Reject":      "bg-red-100 text-red-700 border-red-300",
};
const DIFF_CFG = {
  easy:  { icon:"🟢", label:"Easy",   color:"bg-emerald-600 text-white", inactive:"bg-emerald-50 text-emerald-700 border border-emerald-200", desc:"0–2 yrs · Core concepts" },
  medium:{ icon:"🟡", label:"Medium", color:"bg-amber-500 text-white",   inactive:"bg-amber-50 text-amber-700 border border-amber-200",     desc:"3–5 yrs · Real scenarios" },
  hard:  { icon:"🔴", label:"Hard",   color:"bg-red-600 text-white",     inactive:"bg-red-50 text-red-700 border border-red-200",           desc:"6+ yrs · System design"  },
};
const API = "https://asky-recruitiq-ai.onrender.com/api";

// ── Helper: Score bar ─────────────────────────────────────────
function Bar({ label, score, color="bg-blue-500", weight="" }: { label:string; score:number; color?:string; weight?:string; key?:any }) {
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-gray-600">{label}{weight && <span className="text-gray-400 ml-1">({weight})</span>}</span>
        <span className="font-bold text-gray-900">{score}/100</span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-2 rounded-full ${color}`} style={{ width:`${Math.min(score,100)}%` }}/>
      </div>
    </div>
  );
}

// ── Helper: Score chip ────────────────────────────────────────
function ScoreChip({ score, label }: { score:number; label:string }) {
  const c = score>=80?"bg-emerald-100 text-emerald-700":score>=60?"bg-blue-100 text-blue-700":score>=40?"bg-amber-100 text-amber-700":"bg-red-100 text-red-700";
  return (
    <div className="text-center">
      <div className={`text-3xl font-black ${c.split(' ')[1]}`}>{score}</div>
      <div className="text-xs text-gray-400 mt-0.5">{label}</div>
    </div>
  );
}

export default function CandidateDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const token = localStorage.getItem("token");

  const [candidate, setCandidate] = useState<Candidate|null>(null);
  const [loading, setLoading]     = useState(true);
  const [tab, setTab]             = useState("overview");

  // Screening state
  const [qMode, setQMode]           = useState<"ai"|"bank">("ai");
  const [difficulty, setDifficulty] = useState<"easy"|"medium"|"hard">("medium");
  const [bankDiff, setBankDiff]     = useState<"all"|"easy"|"medium"|"hard">("all");
  const [questions, setQuestions]   = useState<string[]>([]);
  const [answers, setAnswers]       = useState<string[]>([]);
  const [generatingQ, setGeneratingQ] = useState(false);
  const [submitting, setSubmitting]   = useState(false);
  const [screenResult, setScreenResult] = useState<any>(null);

  // HM Report state
  const [hmMode, setHmMode]     = useState<"cv_only"|"cv_ai_questions"|"cv_bank_questions">("cv_only");
  const [submittingHM, setSubmittingHM] = useState(false);
  const [hmResult, setHmResult] = useState<any>(null);

  useEffect(() => { fetchCandidate(); }, [id]);

  async function fetchCandidate() {
    try {
      const r = await fetch(`${API}/candidates/${id}`, { headers:{ Authorization:`Bearer ${token}` } });
      const d = await r.json();
      const c = d.candidate || d;
      setCandidate(c);
      setQuestions(c.interviewQuestions || []);
    } finally { setLoading(false); }
  }

  async function updateStatus(s: string) {
    await fetch(`${API}/candidates/${id}`, {
      method:"PATCH", headers:{"Content-Type":"application/json", Authorization:`Bearer ${token}`},
      body: JSON.stringify({ status:s }),
    });
    setCandidate(prev => prev ? {...prev, status:s} : prev);
  }

  async function rescreen() {
    setLoading(true);
    try {
      const r = await fetch(`${API}/candidates/${id}/rescreen`, {
        method:"POST", headers:{"Content-Type":"application/json", Authorization:`Bearer ${token}`},
      });
      const d = await r.json();
      if (r.ok) { setCandidate(prev => prev ? {...prev,...d.candidate} : prev); }
      else alert(d.message || "Re-screen failed");
    } finally { setLoading(false); }
  }

  async function generateAIQuestions() {
    if (!candidate) return;
    setGeneratingQ(true);
    try {
      const r = await fetch(`${API}/candidates/${id}/questions`, {
        method:"POST",
        headers:{"Content-Type":"application/json", Authorization:`Bearer ${token}`},
        body: JSON.stringify({ jobTitle:candidate.appliedFor||candidate.jobTitle, skills:candidate.topSkills, difficulty }),
      });
      const d = await r.json();
      if (!r.ok) { alert(d.message||"Failed to generate questions"); return; }
      const qs = d.questions || [];
      setQuestions(qs); setAnswers(new Array(qs.length).fill(""));
      setCandidate(prev => prev ? {...prev, interviewQuestions:qs, status:"questions_sent"} : prev);
      setTab("screening");
    } catch(e:any) { alert("Error: "+e.message); }
    finally { setGeneratingQ(false); }
  }

  async function loadBankQuestions() {
    if (!candidate?.jobId) { alert("No job linked to this candidate"); return; }
    setGeneratingQ(true);
    try {
      const jobId = typeof candidate.jobId === "object" ? candidate.jobId._id : candidate.jobId;
      const url = `${API}/jobs/${jobId}/question-bank/random${bankDiff!=="all"?`?difficulty=${bankDiff}`:""}`;
      const r   = await fetch(url, { headers:{ Authorization:`Bearer ${token}` } });
      const d   = await r.json();
      if (!r.ok) { alert(d.message||"No questions in bank. Add questions to the Job's Question Bank first."); return; }
      const qs = d.questions || [];
      setQuestions(qs); setAnswers(new Array(qs.length).fill(""));
      setCandidate(prev => prev ? {...prev, interviewQuestions:qs, status:"questions_sent"} : prev);
      setTab("screening");
    } catch(e:any) { alert("Error: "+e.message); }
    finally { setGeneratingQ(false); }
  }

  async function submitAnswers() {
    if (answers.some(a=>!a.trim())) { alert("Please fill in all answers before submitting."); return; }
    setSubmitting(true);
    try {
      const payload = questions.map((q,i) => ({ question:q, answer:answers[i] }));
      const r = await fetch(`${API}/candidates/${id}/answers`, {
        method:"POST",
        headers:{"Content-Type":"application/json", Authorization:`Bearer ${token}`},
        body: JSON.stringify({ answers:payload, sessionType: qMode==="ai"?"ai_generated":"bank_questions", difficulty }),
      });
      const d = await r.json();
      setScreenResult(d);
      setCandidate(prev => prev ? {...prev,...d.candidate} : prev);
      setTab("hm-report");
    } catch(e:any) { alert("Error: "+e.message); }
    finally { setSubmitting(false); }
  }

  async function submitHMReport() {
    setSubmittingHM(true);
    try {
      // Determine which session to use
      const sessions = candidate?.screeningSessions || [];
      const targetType = hmMode==="cv_ai_questions" ? "ai_generated" : "bank_questions";
      const sessionIndex = hmMode!=="cv_only"
        ? sessions.filter(s=>s.sessionType===targetType).length - 1
        : undefined;

      const r = await fetch(`${API}/candidates/${id}/hm-report`, {
        method:"POST",
        headers:{"Content-Type":"application/json", Authorization:`Bearer ${token}`},
        body: JSON.stringify({ reportType:hmMode, sessionIndex }),
      });
      const d = await r.json();
      if (!r.ok) { alert(d.message||"Failed to set HM report"); return; }
      setHmResult(d);
      setCandidate(prev => prev ? {...prev, ...d.candidate, hmReportType:hmMode, combinedScore:d.finalScore, recommendation:d.recommendation, status:"hm_ready"} : prev);
    } catch(e:any) { alert("Error: "+e.message); }
    finally { setSubmittingHM(false); }
  }

  function generateHMScorecard() {
    if (!candidate) return;
    const c = candidate;
    const cvScore     = c.aiScore || c.score || 0;
    const screenScore = c.screeningScore || 0;
    const finalScore  = c.combinedScore || cvScore;
    const rec         = c.recommendation || "Pending";
    const date        = new Date().toLocaleDateString("en-IN", {day:"2-digit",month:"short",year:"numeric"});
    const tierKey     = (c.tier || "C-Tier").replace(/-?Tier$/i, "");
    const reportLabel = c.hmReportType === "cv_only" ? "CV Score Only" : c.hmReportType === "cv_ai_questions" ? "CV + AI Screening" : "CV + Bank Questions";

    function sc(n: number): string {
      return n >= 80 ? "#065f46" : n >= 60 ? "#1e40af" : n >= 40 ? "#92400e" : "#7f1d1d";
    }
    function bg(n: number): string {
      return n >= 80 ? "#d1fae5" : n >= 60 ? "#dbeafe" : n >= 40 ? "#fef3c7" : "#fee2e2";
    }
    function bar(n: number, color: string): string {
      return '<div style="height:8px;background:#e5e7eb;border-radius:4px"><div style="height:8px;width:' + n + '%;background:' + color + ';border-radius:4px"></div></div>';
    }
    function scoreRow(label: string, score: number, weight: string): string {
      return '<tr style="border-bottom:1px solid #f9fafb">'
        + '<td style="padding:9px 14px;font-size:12px;color:#374151;padding-left:24px">' + label + '</td>'
        + '<td style="padding:9px 14px;text-align:center;font-weight:700;font-size:14px;color:' + sc(score) + '">' + score + '</td>'
        + '<td style="padding:9px 14px;text-align:center;font-size:11px;color:#9ca3af">' + weight + '</td>'
        + '<td style="padding:9px 14px;width:130px">' + bar(score, sc(score)) + '</td>'
        + '</tr>';
    }

    const recColor = rec === "Strong Hire" ? "#065f46" : rec === "Hire" ? "#1e40af" : rec === "Consider" ? "#92400e" : rec === "Weak Fit" ? "#9a3412" : "#7f1d1d";
    const recBg    = rec === "Strong Hire" ? "#d1fae5" : rec === "Hire" ? "#dbeafe" : rec === "Consider" ? "#fef3c7" : rec === "Weak Fit" ? "#ffedd5" : "#fee2e2";
    const tierColor = tierKey === "A" ? "#065f46" : tierKey === "B" ? "#1e40af" : "#92400e";
    const tierBg    = tierKey === "A" ? "#d1fae5" : tierKey === "B" ? "#dbeafe" : "#fef3c7";

    const riskItems: string[] = [];
    if (c.riskFlags?.frequentJobChanges) riskItems.push("🔄 Frequent job changes");
    if (c.riskFlags?.domainMismatch)     riskItems.push("🎯 Domain mismatch");
    const missingSkills = c.riskFlags?.missingMandatorySkills || [];
    if (missingSkills.length > 0) riskItems.push("❌ Missing: " + missingSkills.join(", "));
    if (c.riskFlags?.noticePeriodRisk && c.riskFlags.noticePeriodRisk !== "Not mentioned" && c.riskFlags.noticePeriodRisk !== "")
      riskItems.push("⏰ " + c.riskFlags.noticePeriodRisk);

    // Build HTML using string concatenation
    let html = "";
    html += "<!DOCTYPE html><html><head><meta charset=\"UTF-8\">";
    html += "<title>HM Report — " + c.name + "</title>";
    html += "<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,\'Segoe UI\',Arial,sans-serif;background:#f9fafb;color:#111827}@media print{body{background:#fff}.np{display:none}}</style>";
    html += "</head><body>";

    // Print button
    html += "<div class=\"np\" style=\"position:fixed;top:16px;right:16px;z-index:99;display:flex;gap:8px\">";
    html += "<button onclick=\"window.print()\" style=\"background:#1d4ed8;color:#fff;border:none;padding:10px 20px;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer\">🖨 Print / Save PDF</button>";
    html += "<button onclick=\"window.close()\" style=\"background:#fff;color:#374151;border:1px solid #d1d5db;padding:10px 16px;border-radius:8px;font-size:14px;cursor:pointer\">✕ Close</button>";
    html += "</div>";

    html += "<div style=\"max-width:900px;margin:0 auto;padding:32px 24px\">";

    // Header
    html += "<div style=\"background:#0f172a;color:#fff;border-radius:16px;padding:32px;margin-bottom:20px\">";
    html += "<div style=\"display:flex;justify-content:space-between;align-items:flex-start\">";
    html += "<div>";
    html += "<div style=\"font-size:10px;letter-spacing:2px;color:#94a3b8;margin-bottom:6px\">HIRING MANAGER REPORT · " + reportLabel.toUpperCase() + "</div>";
    html += "<h1 style=\"font-size:26px;font-weight:800;margin-bottom:4px\">" + c.name + "</h1>";
    html += "<div style=\"color:#94a3b8;font-size:13px;margin-bottom:10px\">" + [c.email, c.phone].filter(Boolean).join(" · ") + "</div>";
    html += "<div style=\"display:flex;gap:8px;flex-wrap:wrap\">";
    if (c.appliedFor) html += "<span style=\"background:#1e293b;color:#e2e8f0;padding:4px 12px;border-radius:16px;font-size:12px\">💼 " + c.appliedFor + "</span>";
    if (c.domain)     html += "<span style=\"background:#1e293b;color:#e2e8f0;padding:4px 12px;border-radius:16px;font-size:12px\">🏷️ " + c.domain + "</span>";
    if (c.experienceYears) html += "<span style=\"background:#1e293b;color:#e2e8f0;padding:4px 12px;border-radius:16px;font-size:12px\">📅 " + c.experienceYears + " yrs</span>";
    if (c.seniority)  html += "<span style=\"background:#1e293b;color:#e2e8f0;padding:4px 12px;border-radius:16px;font-size:12px\">🎯 " + c.seniority + "</span>";
    html += "</div></div>";
    html += "<div style=\"text-align:right\">";
    html += "<div style=\"font-size:48px;font-weight:900;line-height:1\">" + finalScore + "</div>";
    html += "<div style=\"color:#94a3b8;font-size:11px;margin-top:2px\">Final Score / 100</div>";
    html += "<div style=\"margin-top:8px;display:flex;gap:6px;justify-content:flex-end\">";
    html += "<span style=\"background:" + tierBg + ";color:" + tierColor + ";padding:4px 12px;border-radius:16px;font-size:12px;font-weight:700\">" + tierKey + "-Tier</span>";
    html += "</div><div style=\"color:#64748b;font-size:10px;margin-top:6px\">" + date + "</div>";
    html += "</div></div></div>";

    // Recommendation
    html += "<div style=\"background:" + recBg + ";border:2px solid " + recColor + "30;border-radius:12px;padding:18px;margin-bottom:20px;display:flex;justify-content:space-between;align-items:center\">";
    html += "<div><div style=\"font-size:10px;font-weight:600;color:" + recColor + ";text-transform:uppercase;letter-spacing:1px;margin-bottom:3px\">HIRING RECOMMENDATION</div>";
    html += "<div style=\"font-size:22px;font-weight:800;color:" + recColor + "\">" + rec + "</div></div>";
    if (c.recommendationReason) html += "<div style=\"font-size:13px;color:#374151;max-width:55%;line-height:1.6\">" + c.recommendationReason + "</div>";
    html += "</div>";

    // Score cards
    html += "<div style=\"display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-bottom:20px\">";
    html += "<div style=\"background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:18px;text-align:center\">";
    html += "<div style=\"font-size:10px;color:#6b7280;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px\">📄 CV Score</div>";
    html += "<div style=\"font-size:36px;font-weight:900;color:" + sc(cvScore) + "\">" + cvScore + "</div>";
    html += "<div style=\"font-size:10px;color:#9ca3af;margin-top:2px\">Skills 70% + Stability 30%</div></div>";
    html += "<div style=\"background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:18px;text-align:center\">";
    html += "<div style=\"font-size:10px;color:#6b7280;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px\">🎙️ Screening</div>";
    html += "<div style=\"font-size:36px;font-weight:900;color:" + (screenScore ? sc(screenScore) : "#d1d5db") + "\">" + (screenScore || "—") + "</div>";
    html += "<div style=\"font-size:10px;color:#9ca3af;margin-top:2px\">" + (c.hmReportType === "cv_only" ? "Not included" : "Technical Interview") + "</div></div>";
    html += "<div style=\"background:#0f172a;border-radius:12px;padding:18px;text-align:center\">";
    html += "<div style=\"font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px\">🏆 Final Score</div>";
    html += "<div style=\"font-size:36px;font-weight:900;color:#fff\">" + finalScore + "</div>";
    html += "<div style=\"font-size:10px;color:#64748b;margin-top:2px\">" + (c.hmReportType === "cv_only" ? "CV Score Only" : "CV 60% + Screen 40%") + "</div></div>";
    html += "</div>";

    // Score breakdown table
    html += "<div style=\"background:#fff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;margin-bottom:20px\">";
    html += "<div style=\"padding:14px 18px;background:#f9fafb;border-bottom:1px solid #f3f4f6\"><div style=\"font-size:13px;font-weight:700;color:#111827\">📊 Score Breakdown</div></div>";
    html += "<table style=\"width:100%;border-collapse:collapse\">";
    html += "<thead><tr style=\"background:#f9fafb\">";
    html += "<th style=\"padding:8px 14px;text-align:left;font-size:11px;color:#6b7280\">Parameter</th>";
    html += "<th style=\"padding:8px 14px;text-align:center;font-size:11px;color:#6b7280\">Score</th>";
    html += "<th style=\"padding:8px 14px;text-align:center;font-size:11px;color:#6b7280\">Weight</th>";
    html += "<th style=\"padding:8px 14px;font-size:11px;color:#6b7280\">Visual</th>";
    html += "</tr></thead><tbody>";
    html += "<tr style=\"background:#eff6ff\"><td colspan=\"4\" style=\"padding:7px 14px;font-size:11px;font-weight:700;color:#1d4ed8\">📄 RESUME MATCH (" + cvScore + "/100)</td></tr>";
    html += scoreRow("Skills Match & Technical Depth", c.cvScoreBreakdown?.skillsMatchScore || 0, "70%");
    html += scoreRow("Stability & Reliability", c.cvScoreBreakdown?.stabilityScore || 0, "30%");
    if (c.hmReportType !== "cv_only") {
      html += "<tr style=\"background:#f5f3ff\"><td colspan=\"4\" style=\"padding:7px 14px;font-size:11px;font-weight:700;color:#7c3aed\">🎙️ TECHNICAL SCREENING (" + screenScore + "/100)</td></tr>";
      html += scoreRow("Technical Accuracy", c.screeningBreakdown?.technical || 0, "40%");
      html += scoreRow("Technical Depth",    c.screeningBreakdown?.depth     || 0, "40%");
      html += scoreRow("Role Relevance",     c.screeningBreakdown?.relevance || 0, "20%");
    }
    html += "<tr style=\"background:#0f172a\">";
    html += "<td style=\"padding:12px 14px;font-size:13px;font-weight:800;color:#fff\">🏆 FINAL SCORE</td>";
    html += "<td style=\"padding:12px 14px;text-align:center;font-size:20px;font-weight:900;color:#fff\">" + finalScore + "</td>";
    html += "<td style=\"padding:12px 14px;text-align:center;font-size:11px;color:#64748b\">" + (c.hmReportType === "cv_only" ? "100%" : "60%+40%") + "</td>";
    html += "<td style=\"padding:12px 14px\"><span style=\"background:" + recBg + ";color:" + recColor + ";padding:3px 12px;border-radius:10px;font-size:11px;font-weight:700\">" + rec + "</span></td>";
    html += "</tr></tbody></table></div>";

    // HM Summary
    if (c.hmSummary || c.summary) {
      html += "<div style=\"background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:20px;margin-bottom:20px\">";
      html += "<div style=\"font-size:13px;font-weight:700;color:#111827;text-transform:uppercase;letter-spacing:1px;margin-bottom:10px\">🎯 Hiring Manager Briefing</div>";
      html += "<p style=\"font-size:13px;color:#374151;line-height:1.75\">" + (c.hmSummary || c.summary) + "</p></div>";
    }

    // Strengths & Gaps
    const hasStrengths = (c.strengths?.length || 0) > 0;
    const hasGaps      = (c.gaps?.length      || 0) > 0;
    if (hasStrengths || hasGaps) {
      html += "<div style=\"display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:20px\">";
      if (hasStrengths) {
        html += "<div style=\"background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:18px\">";
        html += "<div style=\"font-size:12px;font-weight:700;color:#065f46;text-transform:uppercase;letter-spacing:1px;margin-bottom:10px\">✅ STRENGTHS</div>";
        c.strengths!.forEach(s => { html += "<div style=\"font-size:12px;color:#374151;margin-bottom:6px;padding-left:10px;border-left:3px solid #22c55e\">" + s + "</div>"; });
        html += "</div>";
      }
      if (hasGaps) {
        html += "<div style=\"background:#fffbeb;border:1px solid #fde68a;border-radius:12px;padding:18px\">";
        html += "<div style=\"font-size:12px;font-weight:700;color:#92400e;text-transform:uppercase;letter-spacing:1px;margin-bottom:10px\">⚠️ CONCERNS</div>";
        c.gaps!.forEach(g => { html += "<div style=\"font-size:12px;color:#374151;margin-bottom:6px;padding-left:10px;border-left:3px solid #f59e0b\">" + g + "</div>"; });
        html += "</div>";
      }
      html += "</div>";
    }

    // Interview Focus Areas
    if ((c.interviewFocusAreas?.length || 0) > 0) {
      html += "<div style=\"background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:20px;margin-bottom:20px\">";
      html += "<div style=\"font-size:13px;font-weight:700;color:#111827;text-transform:uppercase;letter-spacing:1px;margin-bottom:12px\">🎯 HM Interview Focus Areas</div>";
      c.interviewFocusAreas!.forEach((a, i) => {
        html += "<div style=\"display:flex;gap:10px;margin-bottom:8px;align-items:flex-start\">";
        html += "<span style=\"min-width:22px;height:22px;background:#0f172a;color:#fff;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:10px;font-weight:700\">" + (i + 1) + "</span>";
        html += "<p style=\"font-size:12px;color:#374151;line-height:1.5\">" + a + "</p></div>";
      });
      html += "</div>";
    }

    // Risk Flags
    if (riskItems.length > 0) {
      html += "<div style=\"background:#fef2f2;border:1px solid #fecaca;border-radius:12px;padding:18px;margin-bottom:20px\">";
      html += "<div style=\"font-size:12px;font-weight:700;color:#991b1b;text-transform:uppercase;letter-spacing:1px;margin-bottom:10px\">⚠️ RISK FLAGS</div>";
      riskItems.forEach(r => { html += "<div style=\"font-size:12px;color:#7f1d1d;margin-bottom:5px\">" + r + "</div>"; });
      html += "</div>";
    }

    // Screening Q&A
    if (c.hmReportType !== "cv_only" && (c.screeningAnswers?.length || 0) > 0) {
      html += "<div style=\"background:#fff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;margin-bottom:20px\">";
      html += "<div style=\"padding:14px 18px;background:#f9fafb;border-bottom:1px solid #f3f4f6\"><div style=\"font-size:13px;font-weight:700;color:#111827\">🎙️ Technical Screening Q&A</div></div>";
      c.screeningAnswers!.forEach((a, i) => {
        html += "<div style=\"padding:14px 18px;border-bottom:1px solid #f9fafb\">";
        html += "<div style=\"display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:4px\">";
        html += "<div style=\"font-size:12px;font-weight:600;color:#374151;flex:1\">Q" + (i + 1) + ": " + (a.question || "") + "</div>";
        if (a.aiScore != null) {
          html += "<span style=\"background:" + bg(a.aiScore || 0) + ";color:" + sc(a.aiScore || 0) + ";padding:2px 10px;border-radius:10px;font-size:11px;font-weight:700;margin-left:10px\">" + a.aiScore + "/100</span>";
        }
        html += "</div>";
        if (a.aiFeedback) html += "<div style=\"font-size:11px;color:#6b7280;font-style:italic\">💡 " + a.aiFeedback + "</div>";
        html += "</div>";
      });
      html += "</div>";
    }

    // Tech Stack
    const hasDbs  = (c.databases?.length  || 0) > 0;
    const hasFws  = (c.frameworks?.length  || 0) > 0;
    const hasTools = (c.tools?.length      || 0) > 0;
    if (hasDbs || hasFws || hasTools) {
      html += "<div style=\"background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:20px;margin-bottom:20px\">";
      html += "<div style=\"font-size:13px;font-weight:700;color:#111827;text-transform:uppercase;letter-spacing:1px;margin-bottom:14px\">💻 Tech Stack</div>";
      html += "<div style=\"display:grid;grid-template-columns:repeat(3,1fr);gap:12px\">";
      if (hasDbs) {
        html += "<div><div style=\"font-size:10px;color:#6b7280;font-weight:600;margin-bottom:6px\">🗄️ DATABASES</div><div style=\"display:flex;flex-wrap:wrap;gap:5px\">";
        c.databases!.forEach(d => { html += "<span style=\"background:#fff7ed;color:#c2410c;padding:2px 8px;border-radius:10px;font-size:11px;border:1px solid #fed7aa\">" + d + "</span>"; });
        html += "</div></div>";
      }
      if (hasFws) {
        html += "<div><div style=\"font-size:10px;color:#6b7280;font-weight:600;margin-bottom:6px\">⚙️ FRAMEWORKS</div><div style=\"display:flex;flex-wrap:wrap;gap:5px\">";
        c.frameworks!.forEach(f => { html += "<span style=\"background:#f5f3ff;color:#6d28d9;padding:2px 8px;border-radius:10px;font-size:11px;border:1px solid #ddd6fe\">" + f + "</span>"; });
        html += "</div></div>";
      }
      if (hasTools) {
        html += "<div><div style=\"font-size:10px;color:#6b7280;font-weight:600;margin-bottom:6px\">🛠️ TOOLS</div><div style=\"display:flex;flex-wrap:wrap;gap:5px\">";
        c.tools!.forEach(t => { html += "<span style=\"background:#f9fafb;color:#374151;padding:2px 8px;border-radius:10px;font-size:11px;border:1px solid #e5e7eb\">" + t + "</span>"; });
        html += "</div></div>";
      }
      html += "</div></div>";
    }

    // Footer
    html += "<div style=\"border-top:1px solid #e5e7eb;padding-top:14px;display:flex;justify-content:space-between\">";
    html += "<div style=\"font-size:10px;color:#9ca3af\">Generated by ASKY RecruitIQ · " + date + "</div>";
    html += "<div style=\"font-size:10px;color:#9ca3af\">Confidential — Internal Use Only</div>";
    html += "</div></div></body></html>";

    const w = window.open("", "_blank", "width=1000,height=800");
    if (w) { w.document.write(html); w.document.close(); }
  }


  if (loading) return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"/></div>;
  if (!candidate) return <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-500">Candidate not found</div>;

  const cvScore     = candidate.aiScore || candidate.score || 0;
  const screenScore = candidate.screeningScore || 0;
  const combined    = candidate.combinedScore || cvScore;
  const tierKey     = (candidate.tier||"C-Tier").replace(/-?Tier$/i,"");
  const tierColor   = ({A:"from-emerald-400 to-emerald-600",B:"from-blue-400 to-blue-600",C:"from-amber-400 to-amber-600"} as any)[tierKey]||"from-gray-400 to-gray-600";
  const rec         = candidate.recommendation || (cvScore>=80?"Strong Hire":cvScore>=70?"Hire":cvScore>=55?"Consider":cvScore>=40?"Weak Fit":"Reject");
  const curStage    = STAGES.find(s=>s.value===(candidate.status||"cv_uploaded"))||STAGES[0];
  const hasScreening = screenScore > 0;
  const hasSessions  = (candidate.screeningSessions||[]).length > 0;
  const aiSessions   = (candidate.screeningSessions||[]).filter(s=>s.sessionType==="ai_generated");
  const bankSessions = (candidate.screeningSessions||[]).filter(s=>s.sessionType==="bank_questions");

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── Header ── */}
      <div className="bg-white border-b border-gray-100 px-6 py-4">
        <button onClick={() => navigate("/candidates")} className="text-gray-500 hover:text-blue-600 text-sm mb-3 flex items-center gap-1">← Back to Candidates</button>
        <div className="flex items-start gap-5">
          <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${tierColor} flex items-center justify-center text-white text-xl font-bold shadow`}>
            {candidate.name?.charAt(0)?.toUpperCase()}
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-gray-900">{candidate.name}</h1>
            <div className="flex gap-4 text-sm text-gray-500 mt-0.5 flex-wrap">
              <span>✉️ {candidate.email}</span>
              {candidate.phone && <span>📞 {candidate.phone}</span>}
              <span>💼 <strong className="text-gray-700">{candidate.appliedFor||candidate.jobTitle||"—"}</strong></span>
              {candidate.seniority && <span>🎯 {candidate.seniority}</span>}
              {candidate.experienceYears ? <span>📅 {candidate.experienceYears}y</span> : null}
            </div>
          </div>
          {/* Score display */}
          <div className="flex items-center gap-4 shrink-0">
            <ScoreChip score={cvScore} label="CV Score"/>
            {hasScreening && <>
              <span className="text-gray-300 text-lg">+</span>
              <ScoreChip score={screenScore} label="Screening"/>
              <span className="text-gray-300 text-lg">=</span>
              <div className="text-center bg-slate-800 rounded-xl px-4 py-2">
                <div className="text-3xl font-black text-white">{combined}</div>
                <div className="text-xs text-gray-400">Combined</div>
              </div>
            </>}
          </div>
          {/* Actions */}
          <div className="flex flex-col gap-2 items-end shrink-0">
            <div className="flex gap-2">
              <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${({A:"bg-emerald-100 text-emerald-700",B:"bg-blue-100 text-blue-700",C:"bg-amber-100 text-amber-700"} as any)[tierKey]||"bg-gray-100 text-gray-600"}`}>{tierKey}-Tier</span>
              <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${REC_STYLE[rec]||"bg-gray-100 text-gray-600 border-gray-200"}`}>{rec}</span>
            </div>
            <select value={candidate.status||"cv_uploaded"} onChange={e=>updateStatus(e.target.value)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-lg focus:ring-2 focus:ring-blue-500 cursor-pointer border-0 ${curStage.color}`}>
              {STAGES.map(s=><option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            <div className="flex gap-2">
              <button onClick={rescreen} className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg font-semibold hover:bg-blue-700">🔄 Re-screen CV</button>
              {candidate.status==="hm_ready" && (
                <button onClick={generateHMScorecard} className="text-xs bg-slate-800 text-white px-3 py-1.5 rounded-lg font-semibold hover:bg-slate-700">📋 HM Report</button>
              )}
            </div>
          </div>
        </div>

        {/* Risk flags */}
        {(candidate.riskFlags?.frequentJobChanges || (candidate.riskFlags?.missingMandatorySkills||[]).length>0 || candidate.riskFlags?.domainMismatch) && (
          <div className="mt-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex gap-3 flex-wrap">
            <span className="text-sm font-bold text-red-700">⚠️ Risk Flags:</span>
            {candidate.riskFlags?.frequentJobChanges && <span className="text-xs bg-red-100 text-red-700 px-2.5 py-1 rounded-full font-semibold">🔄 Frequent job changes</span>}
            {candidate.riskFlags?.domainMismatch     && <span className="text-xs bg-orange-100 text-orange-700 px-2.5 py-1 rounded-full font-semibold">🎯 Domain mismatch</span>}
            {(candidate.riskFlags?.missingMandatorySkills||[]).map(s=><span key={s} className="text-xs bg-amber-100 text-amber-700 px-2.5 py-1 rounded-full font-semibold">Missing: {s}</span>)}
          </div>
        )}

        {/* Pipeline progress */}
        <div className="mt-3 flex gap-1">
          {STAGES.map((s,i)=>{
            const ci = STAGES.findIndex(st=>st.value===(candidate.status||"cv_uploaded"));
            return <div key={s.value} className="flex-1"><div className={`h-1.5 rounded-full ${i<=ci?"bg-blue-500":"bg-gray-200"}`}/></div>;
          })}
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="bg-white border-b border-gray-100 px-6">
        <div className="flex gap-6 overflow-x-auto">
          {[
            { key:"overview",   label:"Overview"                                                          },
            { key:"score",      label:"Score Breakdown"                                                   },
            { key:"ai-insights",label:"AI Insights"                                                       },
            { key:"generate",   label:"Generate Questions"                                                },
            { key:"screening",  label:`Screening${questions.length>0?` (${questions.length}Q)`:""}`      },
            { key:"sessions",   label:`Sessions${hasSessions?` (${(candidate.screeningSessions||[]).length})`:""}`},
            { key:"hm-report",  label:`📋 HM Report${candidate.status==="hm_ready"?" ✓":""}`             },
          ].map(t=>(
            <button key={t.key} onClick={()=>setTab(t.key)}
              className={`py-3 px-1 text-sm font-semibold border-b-2 whitespace-nowrap transition-all ${tab===t.key?"border-blue-600 text-blue-600":"border-transparent text-gray-500 hover:text-gray-700"}`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-6 max-w-5xl">

        {/* ── OVERVIEW ── */}
        {tab==="overview" && (
          <div className="space-y-5">
            <div className="bg-white rounded-2xl p-6 border border-gray-100">
              <h2 className="font-bold text-gray-900 mb-5">Candidate Fit Score</h2>
              <div className="grid grid-cols-3 gap-4 mb-5">
                <div className="text-center bg-blue-50 rounded-2xl p-5 border border-blue-100">
                  <div className="text-4xl font-black text-blue-600">{cvScore}</div>
                  <div className="text-sm font-bold text-blue-700 mt-1">CV / Resume</div>
                  <div className="text-xs text-blue-400 mt-0.5">Skills 70% + Stability 30%</div>
                </div>
                <div className={`text-center rounded-2xl p-5 border ${hasScreening?"bg-purple-50 border-purple-100":"bg-gray-50 border-gray-100"}`}>
                  <div className={`text-4xl font-black ${hasScreening?"text-purple-600":"text-gray-300"}`}>{hasScreening?screenScore:"—"}</div>
                  <div className={`text-sm font-bold mt-1 ${hasScreening?"text-purple-700":"text-gray-400"}`}>Technical Screening</div>
                  <div className="text-xs text-gray-400 mt-0.5">{hasScreening?"Accuracy 40% + Depth 40% + Fit 20%":"Complete screening to score"}</div>
                </div>
                <div className="text-center bg-slate-800 rounded-2xl p-5">
                  <div className="text-4xl font-black text-white">{combined}</div>
                  <div className="text-sm font-bold text-gray-300 mt-1">Overall Score</div>
                  <div className="text-xs text-gray-500 mt-0.5">{hasScreening?"CV 60% + Screen 40%":"CV score (screening pending)"}</div>
                </div>
              </div>
              <div className={`rounded-xl p-4 border text-center ${REC_STYLE[rec]||"bg-gray-50 border-gray-100"}`}>
                <div className="text-xs font-bold uppercase tracking-wide opacity-60 mb-1">Fit Recommendation</div>
                <div className="text-xl font-black">{rec}</div>
              </div>
            </div>

            {(candidate.hmSummary||candidate.summary) && (
              <div className="bg-white rounded-2xl p-6 border border-gray-100">
                <h2 className="font-bold text-gray-900 mb-3">🎯 Hiring Manager Briefing</h2>
                <p className="text-gray-600 leading-relaxed">{candidate.hmSummary||candidate.summary}</p>
              </div>
            )}

            {(candidate.topSkills?.length||0)>0 && (
              <div className="bg-white rounded-2xl p-5 border border-gray-100">
                <h3 className="font-bold text-gray-900 mb-3">Top Skills</h3>
                <div className="flex flex-wrap gap-2">
                  {candidate.topSkills!.map(s=><span key={s} className="bg-blue-50 text-blue-700 text-sm font-medium px-3 py-1 rounded-full border border-blue-100">{s}</span>)}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── SCORE BREAKDOWN ── */}
        {tab==="score" && (
          <div className="space-y-5">
            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-50 bg-gray-50">
                <h2 className="font-bold text-gray-900">Transparent Score Breakdown</h2>
                <p className="text-xs text-gray-400 mt-0.5">Exactly how the score is calculated</p>
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
                  <tr className="bg-blue-50"><td className="px-5 py-3 font-bold text-blue-700 text-sm" colSpan={4}>📄 Resume Match ({cvScore}/100)</td></tr>
                  {[
                    {label:"Skills Match & Technical Depth",score:candidate.cvScoreBreakdown?.skillsMatchScore||0,weight:"70%",color:"bg-blue-500"},
                    {label:"Stability & Reliability",         score:candidate.cvScoreBreakdown?.stabilityScore||0,  weight:"30%",color:"bg-indigo-500"},
                  ].map(r=>(
                    <tr key={r.label} className="hover:bg-gray-50">
                      <td className="px-5 py-3 text-sm text-gray-700 pl-9">{r.label}</td>
                      <td className="px-5 py-3 text-center font-bold text-gray-900">{r.score}</td>
                      <td className="px-5 py-3 text-center text-xs text-gray-400">{r.weight}</td>
                      <td className="px-5 py-3"><div className="w-24 h-2 bg-gray-100 rounded-full"><div className={`h-2 rounded-full ${r.color}`} style={{width:`${r.score}%`}}/></div></td>
                    </tr>
                  ))}
                  {hasScreening && <>
                    <tr className="bg-purple-50"><td className="px-5 py-3 font-bold text-purple-700 text-sm" colSpan={4}>🎙️ Technical Screening ({screenScore}/100)</td></tr>
                    {[
                      {label:"Technical Accuracy",score:candidate.screeningBreakdown?.technical||0,weight:"40%",color:"bg-purple-500"},
                      {label:"Technical Depth",   score:candidate.screeningBreakdown?.depth||0,    weight:"40%",color:"bg-violet-500"},
                      {label:"Role Relevance",    score:candidate.screeningBreakdown?.relevance||0,weight:"20%",color:"bg-fuchsia-500"},
                    ].map(r=>(
                      <tr key={r.label} className="hover:bg-gray-50">
                        <td className="px-5 py-3 text-sm text-gray-700 pl-9">{r.label}</td>
                        <td className="px-5 py-3 text-center font-bold text-gray-900">{r.score}</td>
                        <td className="px-5 py-3 text-center text-xs text-gray-400">{r.weight}</td>
                        <td className="px-5 py-3"><div className="w-24 h-2 bg-gray-100 rounded-full"><div className={`h-2 rounded-full ${r.color}`} style={{width:`${r.score}%`}}/></div></td>
                      </tr>
                    ))}
                  </>}
                  <tr className="bg-slate-800">
                    <td className="px-5 py-4 font-black text-white">🏆 Overall Candidate Score</td>
                    <td className="px-5 py-4 text-center text-2xl font-black text-white">{combined}</td>
                    <td className="px-5 py-4 text-center text-xs text-gray-400">{hasScreening?"60%+40%":"CV Only"}</td>
                    <td className="px-5 py-4"><span className={`text-xs font-bold px-3 py-1 rounded-full border ${REC_STYLE[rec]||""}`}>{rec}</span></td>
                  </tr>
                </tbody>
              </table>
            </div>
            {(candidate.skillScores?.length||0)>0 && (
              <div className="bg-white rounded-2xl p-6 border border-gray-100">
                <h3 className="font-bold text-gray-900 mb-4">Skill Proficiency</h3>
                <div className="space-y-3">
                  {candidate.skillScores!.map(({skill,score:s})=>(
                    <Bar key={skill} label={skill} score={s} color={s>=80?"bg-emerald-500":s>=60?"bg-blue-500":"bg-amber-500"}/>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── AI INSIGHTS ── */}
        {tab==="ai-insights" && (
          <div className="space-y-5">
            {((candidate.strengths?.length||0)+(candidate.gaps?.length||0))>0 && (
              <div className="grid grid-cols-2 gap-4">
                {(candidate.strengths?.length||0)>0 && (
                  <div className="bg-white rounded-2xl p-5 border border-gray-100">
                    <h3 className="font-bold text-emerald-700 mb-3">✅ Strengths</h3>
                    <ul className="space-y-2">{candidate.strengths!.map((s,i)=><li key={i} className="text-sm text-gray-700 flex gap-2"><span className="text-emerald-500 shrink-0">•</span>{s}</li>)}</ul>
                  </div>
                )}
                {(candidate.gaps?.length||0)>0 && (
                  <div className="bg-white rounded-2xl p-5 border border-gray-100">
                    <h3 className="font-bold text-amber-700 mb-3">⚠️ Concerns / Gaps</h3>
                    <ul className="space-y-2">{candidate.gaps!.map((g,i)=><li key={i} className="text-sm text-gray-700 flex gap-2"><span className="text-amber-500 shrink-0">•</span>{g}</li>)}</ul>
                  </div>
                )}
              </div>
            )}
            {(candidate.interviewFocusAreas?.length||0)>0 && (
              <div className="bg-white rounded-2xl p-5 border border-gray-100">
                <h3 className="font-bold text-gray-900 mb-3">🎯 HM Interview Focus Areas</h3>
                <div className="space-y-2">
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
                {candidate.technicalExperience && <div className="bg-blue-50 rounded-xl p-4"><div className="text-blue-600 text-xs font-bold uppercase mb-2">🔧 Technical</div><p className="text-gray-600 text-sm">{candidate.technicalExperience}</p></div>}
                {candidate.leadershipExperience && <div className="bg-purple-50 rounded-xl p-4"><div className="text-purple-600 text-xs font-bold uppercase mb-2">👥 Leadership</div><p className="text-gray-600 text-sm">{candidate.leadershipExperience}</p></div>}
                {candidate.cloudExpertise && <div className="bg-emerald-50 rounded-xl p-4"><div className="text-emerald-600 text-xs font-bold uppercase mb-2">☁️ Cloud</div><p className="text-gray-600 text-sm">{candidate.cloudExpertise}</p></div>}
              </div>
            )}
          </div>
        )}

        {/* ── GENERATE QUESTIONS ── */}
        {tab==="generate" && (
          <div className="space-y-5">
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <h2 className="font-bold text-gray-900 text-lg mb-4">Generate Interview Questions</h2>

              {/* Mode Toggle */}
              <div className="bg-gray-100 rounded-2xl p-1.5 flex gap-1 mb-5">
                <button onClick={()=>setQMode("ai")}
                  className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 ${qMode==="ai"?"bg-blue-600 text-white shadow-sm":"text-gray-600"}`}>
                  🤖 AI Generated
                </button>
                <button onClick={()=>setQMode("bank")}
                  className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 ${qMode==="bank"?"bg-purple-600 text-white shadow-sm":"text-gray-600"}`}>
                  📋 From Job Bank
                </button>
              </div>

              {/* AI Mode */}
              {qMode==="ai" && (
                <div className="space-y-4">
                  <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
                    <p className="text-sm font-bold text-blue-900 mb-1">🤖 AI generates 8 technical questions</p>
                    <p className="text-xs text-blue-600">Based on candidate's skills: {(candidate.topSkills||[]).slice(0,3).join(", ")||"General"}</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-gray-600 uppercase tracking-wide mb-2">Difficulty Level</p>
                    <div className="grid grid-cols-3 gap-3">
                      {(Object.entries(DIFF_CFG) as [keyof typeof DIFF_CFG, typeof DIFF_CFG["easy"]][]).map(([key,cfg])=>(
                        <button key={key} onClick={()=>setDifficulty(key)}
                          className={`p-4 rounded-xl text-left transition-all ${difficulty===key?cfg.color:cfg.inactive}`}>
                          <div className="text-lg mb-1">{cfg.icon}</div>
                          <div className="font-bold text-sm">{cfg.label}</div>
                          <div className="text-xs mt-0.5 opacity-70">{cfg.desc}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                  <button onClick={generateAIQuestions} disabled={generatingQ}
                    className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700 disabled:opacity-60">
                    {generatingQ?"⏳ Generating...":"✨ Generate Technical Questions"}
                  </button>
                </div>
              )}

              {/* Bank Mode */}
              {qMode==="bank" && (
                <div className="space-y-4">
                  <div className="bg-purple-50 rounded-xl p-4 border border-purple-100">
                    <p className="text-sm font-bold text-purple-900 mb-1">📋 Pick 8 random questions from job's Question Bank</p>
                    <p className="text-xs text-purple-600">Questions are shuffled and picked randomly each time</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-gray-600 uppercase tracking-wide mb-2">Filter by Difficulty (optional)</p>
                    <div className="flex gap-2">
                      {(["all","easy","medium","hard"] as const).map(d=>(
                        <button key={d} onClick={()=>setBankDiff(d)}
                          className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-all capitalize ${bankDiff===d?"bg-purple-600 text-white border-purple-600":"border-gray-200 text-gray-600"}`}>
                          {d==="all"?"All":d==="easy"?"🟢 Easy":d==="medium"?"🟡 Med":"🔴 Hard"}
                        </button>
                      ))}
                    </div>
                  </div>
                  <button onClick={loadBankQuestions} disabled={generatingQ}
                    className="w-full bg-purple-600 text-white py-3 rounded-xl font-bold hover:bg-purple-700 disabled:opacity-60">
                    {generatingQ?"⏳ Loading...":"🎲 Pick 8 Random from Bank"}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── SCREENING ── */}
        {tab==="screening" && (
          <div className="space-y-4">
            {questions.length===0 ? (
              <div className="bg-white rounded-2xl p-10 border border-gray-100 text-center">
                <div className="text-5xl mb-4">❓</div>
                <p className="font-semibold text-gray-700 mb-4">No questions generated yet</p>
                <button onClick={()=>setTab("generate")} className="bg-blue-600 text-white px-6 py-3 rounded-xl font-semibold">✨ Go to Generate Questions</button>
              </div>
            ) : (
              <>
                <div className={`rounded-xl p-4 border text-sm font-medium ${qMode==="ai"?"bg-blue-50 border-blue-100 text-blue-700":"bg-purple-50 border-purple-100 text-purple-700"}`}>
                  {qMode==="ai"?`🤖 AI-Generated ${DIFF_CFG[difficulty]?.icon} ${DIFF_CFG[difficulty]?.label} Questions`:"📋 Job Bank Questions"} · {questions.length} questions
                </div>
                <div className="bg-amber-50 rounded-xl p-4 border border-amber-100 text-sm text-amber-700">
                  <strong>Instructions:</strong> Record the candidate's verbal answers below. AI will score each answer technically.
                </div>
                {questions.map((q,i)=>(
                  <div key={i} className="bg-white rounded-xl p-5 border border-gray-100">
                    <div className="flex gap-3 mb-3">
                      <span className="bg-blue-100 text-blue-700 font-bold text-xs w-7 h-7 rounded-full flex items-center justify-center shrink-0">{i+1}</span>
                      <p className="text-gray-800 text-sm font-medium leading-relaxed">{q}</p>
                    </div>
                    <textarea value={answers[i]||""} onChange={e=>{const a=[...answers];a[i]=e.target.value;setAnswers(a);}}
                      rows={3} placeholder="Type candidate's answer here..."
                      className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"/>
                  </div>
                ))}
                {screenResult ? (
                  <div className="bg-emerald-50 rounded-xl p-5 border border-emerald-200">
                    <p className="font-bold text-emerald-700">✅ Screening complete! Screening Score: {screenResult.screeningScore}/100</p>
                    <p className="text-sm text-emerald-600 mt-1">Combined Score: {screenResult.combinedScore}/100 · {screenResult.recommendation}</p>
                    <button onClick={()=>setTab("hm-report")} className="mt-3 bg-emerald-700 text-white px-5 py-2 rounded-xl text-sm font-bold hover:bg-emerald-800">
                      📋 Set HM Report →
                    </button>
                  </div>
                ) : (
                  <button onClick={submitAnswers} disabled={submitting||answers.filter(a=>a.trim()).length<questions.length}
                    className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700 disabled:opacity-60">
                    {submitting?"⏳ AI scoring answers...":  `🚀 Submit ${questions.length} Answers`}
                  </button>
                )}
              </>
            )}
          </div>
        )}

        {/* ── SESSIONS ── */}
        {tab==="sessions" && (
          <div className="space-y-4">
            <h2 className="font-bold text-gray-900 text-lg">Screening Sessions History</h2>
            {!hasSessions ? (
              <div className="bg-white rounded-2xl p-10 border border-gray-100 text-center text-gray-400">
                <div className="text-4xl mb-3">📋</div>
                <p>No screening sessions yet. Complete a screening to see history.</p>
              </div>
            ) : (candidate.screeningSessions||[]).map((s,i)=>(
              <div key={i} className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                <div className={`px-5 py-3 flex items-center justify-between ${s.sessionType==="ai_generated"?"bg-blue-50":"bg-purple-50"}`}>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold">{s.sessionType==="ai_generated"?"🤖 AI Generated":"📋 Job Bank"}</span>
                    {s.difficulty && <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${DIFF_CFG[s.difficulty as keyof typeof DIFF_CFG]?.inactive||""}`}>{DIFF_CFG[s.difficulty as keyof typeof DIFF_CFG]?.icon} {s.difficulty}</span>}
                    <span className="text-xs text-gray-400">{s.conductedAt ? new Date(s.conductedAt).toLocaleDateString() : ""}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-500">by {s.conductedBy||"Recruiter"}</span>
                    <span className={`text-sm font-black ${s.screeningScore>=80?"text-emerald-600":s.screeningScore>=60?"text-blue-600":"text-amber-600"}`}>{s.screeningScore}/100</span>
                  </div>
                </div>
                {(s.answers||[]).length>0 && (
                  <div className="divide-y divide-gray-50">
                    {s.answers!.map((a,j)=>(
                      <div key={j} className="px-5 py-3 flex items-start justify-between gap-4">
                        <p className="text-xs text-gray-700 flex-1">{a.question}</p>
                        {a.aiScore!=null && <span className={`text-xs font-bold px-2 py-0.5 rounded-full shrink-0 ${a.aiScore>=80?"bg-emerald-100 text-emerald-700":a.aiScore>=60?"bg-blue-100 text-blue-700":"bg-amber-100 text-amber-700"}`}>{a.aiScore}</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ── HM REPORT ── */}
        {tab==="hm-report" && (
          <div className="space-y-5">
            <div className="bg-white rounded-2xl border border-gray-100 p-6">
              <h2 className="font-bold text-gray-900 text-lg mb-2">📋 Select Report to Share with HM</h2>
              <p className="text-sm text-gray-500 mb-6">Choose what evidence to include in the Hiring Manager report. The score will be calculated based on your selection.</p>

              {/* 3 options */}
              <div className="space-y-3 mb-6">
                {/* Option 1: CV Only */}
                <button onClick={()=>setHmMode("cv_only")}
                  className={`w-full p-5 rounded-xl border-2 text-left transition-all ${hmMode==="cv_only"?"border-blue-500 bg-blue-50":"border-gray-200 hover:border-gray-300"}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">📄</span>
                      <div>
                        <div className="font-bold text-gray-900">CV / Resume Score Only</div>
                        <div className="text-sm text-gray-500 mt-0.5">Share based on AI analysis of resume alone</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`text-2xl font-black ${cvScore>=80?"text-emerald-600":cvScore>=60?"text-blue-600":"text-amber-600"}`}>{cvScore}</div>
                      <div className="text-xs text-gray-400">Score</div>
                    </div>
                  </div>
                  <div className="mt-3 text-xs text-gray-400 flex items-center gap-2">
                    <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded font-medium">Skills {candidate.cvScoreBreakdown?.skillsMatchScore||0}</span>
                    <span className="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded font-medium">Stability {candidate.cvScoreBreakdown?.stabilityScore||0}</span>
                  </div>
                </button>

                {/* Option 2: CV + AI Questions */}
                <button onClick={()=>setHmMode("cv_ai_questions")} disabled={aiSessions.length===0}
                  className={`w-full p-5 rounded-xl border-2 text-left transition-all ${aiSessions.length===0?"opacity-40 cursor-not-allowed border-gray-100":hmMode==="cv_ai_questions"?"border-blue-500 bg-blue-50":"border-gray-200 hover:border-gray-300"}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">🤖</span>
                      <div>
                        <div className="font-bold text-gray-900">CV + AI Generated Questions</div>
                        <div className="text-sm text-gray-500 mt-0.5">
                          {aiSessions.length>0 ? `${aiSessions.length} session(s) available · Latest: ${aiSessions[aiSessions.length-1]?.screeningScore||0}/100` : "No AI screening sessions yet — go to Generate Questions"}
                        </div>
                      </div>
                    </div>
                    {aiSessions.length>0 && (
                      <div className="text-right">
                        <div className="text-2xl font-black text-purple-600">
                          {Math.round((cvScore*0.6)+(aiSessions[aiSessions.length-1].screeningScore*0.4))}
                        </div>
                        <div className="text-xs text-gray-400">Combined</div>
                      </div>
                    )}
                  </div>
                  {aiSessions.length>0 && (
                    <div className="mt-3 text-xs text-gray-400 flex items-center gap-2">
                      <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded font-medium">CV {cvScore} × 60%</span>
                      <span>+</span>
                      <span className="bg-purple-100 text-purple-700 px-2 py-0.5 rounded font-medium">Screen {aiSessions[aiSessions.length-1]?.screeningScore||0} × 40%</span>
                    </div>
                  )}
                </button>

                {/* Option 3: CV + Bank Questions */}
                <button onClick={()=>setHmMode("cv_bank_questions")} disabled={bankSessions.length===0}
                  className={`w-full p-5 rounded-xl border-2 text-left transition-all ${bankSessions.length===0?"opacity-40 cursor-not-allowed border-gray-100":hmMode==="cv_bank_questions"?"border-purple-500 bg-purple-50":"border-gray-200 hover:border-gray-300"}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">📋</span>
                      <div>
                        <div className="font-bold text-gray-900">CV + Job Bank Questions</div>
                        <div className="text-sm text-gray-500 mt-0.5">
                          {bankSessions.length>0 ? `${bankSessions.length} session(s) available · Latest: ${bankSessions[bankSessions.length-1]?.screeningScore||0}/100` : "No bank screening sessions yet — go to Generate Questions"}
                        </div>
                      </div>
                    </div>
                    {bankSessions.length>0 && (
                      <div className="text-right">
                        <div className="text-2xl font-black text-purple-600">
                          {Math.round((cvScore*0.6)+(bankSessions[bankSessions.length-1].screeningScore*0.4))}
                        </div>
                        <div className="text-xs text-gray-400">Combined</div>
                      </div>
                    )}
                  </div>
                  {bankSessions.length>0 && (
                    <div className="mt-3 text-xs text-gray-400 flex items-center gap-2">
                      <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded font-medium">CV {cvScore} × 60%</span>
                      <span>+</span>
                      <span className="bg-purple-100 text-purple-700 px-2 py-0.5 rounded font-medium">Screen {bankSessions[bankSessions.length-1]?.screeningScore||0} × 40%</span>
                    </div>
                  )}
                </button>
              </div>

              {/* Submit button */}
              {hmResult ? (
                <div className="bg-emerald-50 rounded-xl p-5 border border-emerald-200 mb-4">
                  <p className="font-bold text-emerald-700 text-lg">✅ Candidate is HM Ready!</p>
                  <p className="text-sm text-emerald-600 mt-1">Report type: <strong>{hmResult.reportType?.replace(/_/g," ").replace(/\b\w/g,l=>l.toUpperCase())}</strong> · Final Score: <strong>{hmResult.finalScore}/100</strong> · Recommendation: <strong>{hmResult.recommendation}</strong></p>
                </div>
              ) : (
                <button onClick={submitHMReport} disabled={submittingHM}
                  className="w-full bg-slate-800 text-white py-4 rounded-xl font-bold hover:bg-slate-900 disabled:opacity-60 text-base">
                  {submittingHM?"⏳ Saving...":"✅ Mark as HM Ready & Set Report"}
                </button>
              )}

              {/* Generate Report button */}
              {candidate.status==="hm_ready" && (
                <button onClick={generateHMScorecard}
                  className="w-full mt-3 border-2 border-slate-800 text-slate-800 py-3 rounded-xl font-bold hover:bg-slate-50 text-sm flex items-center justify-center gap-2">
                  📋 Open Printable HM Report
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
