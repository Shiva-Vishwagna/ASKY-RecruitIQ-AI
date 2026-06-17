interface Candidate {
  name: string; email: string; phone?: string;
  jobTitle?: string; appliedFor?: string;
  aiScore?: number; score?: number; screeningScore?: number;
  tier: string; riskLevel?: string;
  domain?: string; seniority?: string; experienceYears?: number;
  summary?: string;
  topSkills?: string[]; skills?: string[];
  strengths?: string[]; gaps?: string[];
  technicalExperience?: string; leadershipExperience?: string; cloudExpertise?: string;
  recommendation?: string; recommendationReason?: string;
  status?: string;
  createdAt?: string; appliedAt?: string;
}

const STATUSES: Record<string, string> = {
  cv_uploaded: "CV Uploaded", ai_screened: "AI Screened",
  questions_sent: "Questions Sent", answers_submitted: "Answers Submitted",
  hm_ready: "HM Ready", rejected: "Rejected",
};

export default function ScorecardButton({ candidate }: { candidate: Candidate }) {

  function downloadScorecard() {
    const score     = candidate.aiScore || candidate.score || 0;
    const tierKey   = candidate.tier?.replace(/-?Tier$/i, "") || "B";
    const allSkills = candidate.topSkills || candidate.skills || [];
    const date      = new Date(candidate.createdAt || candidate.appliedAt || Date.now()).toLocaleDateString("en-IN", { day:"numeric", month:"long", year:"numeric" });
    const status    = STATUSES[candidate.status || "cv_uploaded"] || candidate.status || "—";

    const scoreColor = score >= 80 ? "#16a34a" : score >= 60 ? "#2563eb" : "#d97706";
    const tierColor  = tierKey === "A" ? "#16a34a" : tierKey === "B" ? "#2563eb" : "#d97706";
    const tierBg     = tierKey === "A" ? "#dcfce7" : tierKey === "B" ? "#dbeafe" : "#fef3c7";

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <title>Scorecard – ${candidate.name}</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background:#f8fafc; color:#1e293b; }
    .page { max-width:800px; margin:0 auto; background:white; min-height:100vh; }
    .header { background:linear-gradient(135deg,#1e40af,#4f46e5); color:white; padding:40px; }
    .header-top { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:24px; }
    .brand { font-size:13px; font-weight:700; opacity:0.8; letter-spacing:1px; text-transform:uppercase; }
    .date  { font-size:13px; opacity:0.7; }
    .candidate-name { font-size:32px; font-weight:900; margin-bottom:6px; }
    .candidate-meta { font-size:14px; opacity:0.8; display:flex; gap:20px; flex-wrap:wrap; }
    .body { padding:40px; }
    .score-section { display:flex; gap:20px; margin-bottom:32px; }
    .score-card { flex:1; background:#f8fafc; border-radius:16px; padding:24px; text-align:center; border:2px solid #e2e8f0; }
    .score-big { font-size:56px; font-weight:900; line-height:1; }
    .score-label { font-size:12px; color:#64748b; margin-top:6px; font-weight:600; text-transform:uppercase; letter-spacing:0.5px; }
    .tier-badge { display:inline-block; padding:8px 20px; border-radius:100px; font-size:14px; font-weight:800; background:${tierBg}; color:${tierColor}; border:2px solid ${tierColor}30; }
    .section { margin-bottom:28px; }
    .section-title { font-size:11px; font-weight:800; color:#94a3b8; text-transform:uppercase; letter-spacing:1px; margin-bottom:12px; padding-bottom:8px; border-bottom:2px solid #f1f5f9; }
    .info-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
    .info-item { background:#f8fafc; border-radius:10px; padding:12px 16px; }
    .info-item-label { font-size:11px; color:#94a3b8; font-weight:600; text-transform:uppercase; margin-bottom:3px; }
    .info-item-value { font-size:14px; font-weight:700; color:#1e293b; }
    .summary { background:#eff6ff; border-radius:12px; padding:16px; font-size:14px; color:#1e40af; line-height:1.7; border-left:4px solid #3b82f6; }
    .skills { display:flex; flex-wrap:wrap; gap:8px; }
    .skill { background:#eff6ff; color:#1d4ed8; border-radius:100px; padding:5px 14px; font-size:12px; font-weight:600; border:1px solid #bfdbfe; }
    .two-col { display:grid; grid-template-columns:1fr 1fr; gap:20px; }
    .list-box { background:#f8fafc; border-radius:12px; padding:16px; }
    .list-box-title { font-size:12px; font-weight:800; margin-bottom:10px; }
    .list-item { font-size:13px; color:#475569; margin-bottom:6px; line-height:1.5; }
    .strengths-box .list-box-title { color:#16a34a; }
    .gaps-box .list-box-title { color:#d97706; }
    .exp-grid { display:grid; grid-template-columns:1fr 1fr 1fr; gap:12px; }
    .exp-card { background:#f8fafc; border-radius:12px; padding:14px; border-top:3px solid #e2e8f0; }
    .exp-card-label { font-size:10px; font-weight:800; color:#94a3b8; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:6px; }
    .exp-card-value { font-size:12px; color:#334155; line-height:1.5; }
    .recommendation { text-align:center; padding:24px; background:#f0fdf4; border-radius:16px; border:2px solid #bbf7d0; }
    .rec-label { font-size:12px; color:#94a3b8; font-weight:600; margin-bottom:8px; text-transform:uppercase; }
    .rec-value { font-size:24px; font-weight:900; color:#16a34a; }
    .footer { background:#f8fafc; padding:24px 40px; border-top:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center; }
    .footer-brand { font-size:13px; font-weight:700; color:#64748b; }
    .footer-note { font-size:11px; color:#94a3b8; }
    @media print { body { background:white; } .page { box-shadow:none; } }
  </style>
</head>
<body>
<div class="page">
  <!-- Header -->
  <div class="header">
    <div class="header-top">
      <div class="brand">Recruit IQ · AI Scorecard</div>
      <div class="date">Generated: ${date}</div>
    </div>
    <div class="candidate-name">${candidate.name}</div>
    <div class="candidate-meta">
      <span>✉ ${candidate.email}</span>
      ${candidate.phone ? `<span>📞 ${candidate.phone}</span>` : ""}
      <span>💼 ${candidate.jobTitle || candidate.appliedFor || "—"}</span>
      <span>📋 ${status}</span>
    </div>
  </div>

  <div class="body">

    <!-- Score Section -->
    <div class="score-section">
      <div class="score-card">
        <div class="score-big" style="color:${scoreColor}">${score}</div>
        <div class="score-label">AI Resume Score</div>
      </div>
      ${candidate.screeningScore != null ? `
      <div class="score-card">
        <div class="score-big" style="color:#7c3aed">${candidate.screeningScore}</div>
        <div class="score-label">Screening Score</div>
      </div>
      <div class="score-card">
        <div class="score-big" style="color:#0891b2">${Math.round((score + candidate.screeningScore) / 2)}</div>
        <div class="score-label">Combined Score</div>
      </div>` : ""}
      <div class="score-card">
        <div style="margin-bottom:12px"><span class="tier-badge">${tierKey}-Tier</span></div>
        <div class="score-label">Tier Classification</div>
        <div style="margin-top:10px; font-size:12px; color:#94a3b8">${candidate.riskLevel ? `Risk: ${candidate.riskLevel}` : ""}</div>
      </div>
    </div>

    <!-- Candidate Info -->
    <div class="section">
      <div class="section-title">Candidate Profile</div>
      <div class="info-grid">
        ${candidate.domain ? `<div class="info-item"><div class="info-item-label">Domain</div><div class="info-item-value">${candidate.domain}</div></div>` : ""}
        ${candidate.seniority ? `<div class="info-item"><div class="info-item-label">Seniority</div><div class="info-item-value">${candidate.seniority}</div></div>` : ""}
        ${candidate.experienceYears ? `<div class="info-item"><div class="info-item-label">Experience</div><div class="info-item-value">${candidate.experienceYears} years</div></div>` : ""}
        <div class="info-item"><div class="info-item-label">Applied For</div><div class="info-item-value">${candidate.jobTitle || candidate.appliedFor || "—"}</div></div>
      </div>
    </div>

    <!-- Summary -->
    ${candidate.summary ? `
    <div class="section">
      <div class="section-title">AI Summary</div>
      <div class="summary">${candidate.summary}</div>
    </div>` : ""}

    <!-- Skills -->
    ${allSkills.length > 0 ? `
    <div class="section">
      <div class="section-title">Top Skills</div>
      <div class="skills">${allSkills.map((s: string) => `<span class="skill">${s}</span>`).join("")}</div>
    </div>` : ""}

    <!-- Strengths & Gaps -->
    ${((candidate.strengths?.length ?? 0) > 0 || (candidate.gaps?.length ?? 0) > 0) ? `
    <div class="section">
      <div class="section-title">Strengths & Gaps</div>
      <div class="two-col">
        ${(candidate.strengths?.length ?? 0) > 0 ? `
        <div class="list-box strengths-box">
          <div class="list-box-title">✅ Strengths</div>
          ${candidate.strengths!.map(s => `<div class="list-item">• ${s}</div>`).join("")}
        </div>` : ""}
        ${(candidate.gaps?.length ?? 0) > 0 ? `
        <div class="list-box gaps-box">
          <div class="list-box-title">⚠️ Areas to Explore</div>
          ${candidate.gaps!.map(g => `<div class="list-item">• ${g}</div>`).join("")}
        </div>` : ""}
      </div>
    </div>` : ""}

    <!-- Experience Breakdown -->
    ${(candidate.technicalExperience || candidate.leadershipExperience || candidate.cloudExpertise) ? `
    <div class="section">
      <div class="section-title">Experience Breakdown</div>
      <div class="exp-grid">
        ${candidate.technicalExperience ? `<div class="exp-card" style="border-top-color:#3b82f6"><div class="exp-card-label">🔧 Technical</div><div class="exp-card-value">${candidate.technicalExperience}</div></div>` : ""}
        ${candidate.leadershipExperience ? `<div class="exp-card" style="border-top-color:#8b5cf6"><div class="exp-card-label">👥 Leadership</div><div class="exp-card-value">${candidate.leadershipExperience}</div></div>` : ""}
        ${candidate.cloudExpertise ? `<div class="exp-card" style="border-top-color:#10b981"><div class="exp-card-label">☁️ Cloud</div><div class="exp-card-value">${candidate.cloudExpertise}</div></div>` : ""}
      </div>
    </div>` : ""}

    <!-- Recommendation -->
    ${candidate.recommendation ? `
    <div class="section">
      <div class="recommendation">
        <div class="rec-label">AI Hiring Recommendation</div>
        <div class="rec-value" style="color:${candidate.recommendation === "Strong Hire" ? "#16a34a" : candidate.recommendation === "Hire" ? "#2563eb" : candidate.recommendation === "Maybe" ? "#d97706" : "#dc2626"}">${candidate.recommendation}</div>
        ${candidate.recommendationReason ? `<p style="font-size:13px;color:#475569;margin-top:10px;line-height:1.6">${candidate.recommendationReason}</p>` : ""}
      </div>
    </div>` : ""}

  </div>

  <!-- Footer -->
  <div class="footer">
    <div class="footer-brand">Recruit IQ · AI Scorecard</div>
    <div class="footer-note">Confidential — For internal recruitment use only</div>
  </div>
</div>
<script>window.onload = () => window.print();</script>
</body>
</html>`;

    const blob = new Blob([html], { type: "text/html" });
    const url  = URL.createObjectURL(blob);
    const win  = window.open(url, "_blank");
    if (!win) {
      const a = document.createElement("a");
      a.href = url; a.download = `Scorecard_${candidate.name.replace(/\s+/g,"_")}.html`; a.click();
    }
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  return (
    <button onClick={downloadScorecard}
      className="flex items-center gap-2 border border-gray-200 bg-white text-gray-700 px-4 py-2.5 rounded-xl font-semibold hover:bg-gray-50 transition-all text-sm shadow-sm">
      📄 Download Scorecard
    </button>
  );
}
