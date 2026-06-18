// ScorecardButton.tsx — HM-Ready Candidate Scorecard (Print/Download)

interface Candidate {
  _id?: string;
  name?: string;
  email?: string;
  phone?: string;
  appliedFor?: string;
  domain?: string;
  seniority?: string;
  experienceYears?: number;
  topSkills?: string[];
  aiScore?: number;
  score?: number;
  cvScoreBreakdown?: {
    skillsMatchScore?: number;
    stabilityScore?: number;
  };
  screeningScore?: number;
  screeningBreakdown?: {
    technical?: number;
    depth?: number;
    relevance?: number;
  };
  combinedScore?: number;
  tier?: string;
  recommendation?: string;
  recommendationReason?: string;
  summary?: string;
  hmSummary?: string;
  strengths?: string[];
  gaps?: string[];
  interviewFocusAreas?: string[];
  riskFlags?: {
    frequentJobChanges?: boolean;
    noticePeriodRisk?: string;
    missingMandatorySkills?: string[];
    domainMismatch?: boolean;
  };
  screeningAnswers?: {
    question?: string;
    aiScore?: number;
    aiFeedback?: string;
  }[];
  databases?: string[];
  frameworks?: string[];
  tools?: string[];
  skillScores?: { skill: string; score: number }[];
  createdAt?: string;
}

export default function ScorecardButton({ candidate }: { candidate: Candidate }) {
  function generateScorecard() {
    const cvScore       = candidate.aiScore || candidate.score || 0;
    const screenScore   = candidate.screeningScore || 0;
    const combinedScore = candidate.combinedScore || cvScore;
    const tierKey       = (candidate.tier || 'C-Tier').replace(/-?Tier$/i, '');
    const rec           = candidate.recommendation || (combinedScore >= 85 ? 'Strong Hire' : combinedScore >= 72 ? 'Hire' : combinedScore >= 58 ? 'Consider' : combinedScore >= 42 ? 'Weak Fit' : 'Reject');
    const hasScreening  = screenScore > 0;
    const date          = new Date().toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' });

    const recColor = rec === 'Strong Hire' ? '#065f46' : rec === 'Hire' ? '#1e40af' : rec === 'Consider' ? '#92400e' : rec === 'Weak Fit' ? '#9a3412' : '#7f1d1d';
    const recBg    = rec === 'Strong Hire' ? '#d1fae5' : rec === 'Hire' ? '#dbeafe' : rec === 'Consider' ? '#fef3c7' : rec === 'Weak Fit' ? '#ffedd5' : '#fee2e2';
    const tierColor = tierKey === 'A' ? '#065f46' : tierKey === 'B' ? '#1e40af' : '#92400e';
    const tierBg    = tierKey === 'A' ? '#d1fae5' : tierKey === 'B' ? '#dbeafe' : '#fef3c7';

    const scoreColor = (s: number) => s >= 80 ? '#065f46' : s >= 60 ? '#1e40af' : s >= 40 ? '#92400e' : '#7f1d1d';
    const scoreBg    = (s: number) => s >= 80 ? '#d1fae5' : s >= 60 ? '#dbeafe' : s >= 40 ? '#fef3c7' : '#fee2e2';

    const bar = (score: number, color: string) =>
      `<div style="height:8px;background:#e5e7eb;border-radius:4px;overflow:hidden">
        <div style="height:8px;width:${score}%;background:${color};border-radius:4px"></div>
      </div>`;

    const scoreRow = (label: string, score: number, weight: string) =>
      `<tr style="border-bottom:1px solid #f3f4f6">
        <td style="padding:10px 14px;font-size:13px;color:#374151">${label}</td>
        <td style="padding:10px 14px;text-align:center;font-weight:700;font-size:15px;color:${scoreColor(score)}">${score}</td>
        <td style="padding:10px 14px;text-align:center;font-size:12px;color:#9ca3af">${weight}</td>
        <td style="padding:10px 14px;width:140px">${bar(score, scoreColor(score))}</td>
      </tr>`;

    const riskFlags = [];
    if (candidate.riskFlags?.frequentJobChanges)                          riskFlags.push('🔄 Frequent job changes detected');
    if (candidate.riskFlags?.domainMismatch)                              riskFlags.push('🎯 Domain mismatch with role');
    if ((candidate.riskFlags?.missingMandatorySkills || []).length > 0)  riskFlags.push(`❌ Missing skills: ${candidate.riskFlags!.missingMandatorySkills!.join(', ')}`);
    if (candidate.riskFlags?.noticePeriodRisk && candidate.riskFlags.noticePeriodRisk !== 'Not mentioned' && candidate.riskFlags.noticePeriodRisk !== '')
      riskFlags.push(`⏰ Notice period: ${candidate.riskFlags.noticePeriodRisk}`);

    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>HM Scorecard — ${candidate.name}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: -apple-system, 'Segoe UI', Arial, sans-serif; background:#f9fafb; color:#111827; }
  @media print {
    body { background:#fff; }
    .no-print { display:none !important; }
    .page-break { page-break-after: always; }
  }
</style>
</head>
<body>

<!-- Print Button -->
<div class="no-print" style="position:fixed;top:20px;right:20px;z-index:99;display:flex;gap:10px">
  <button onclick="window.print()" style="background:#1d4ed8;color:#fff;border:none;padding:10px 22px;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer">🖨 Print / Save as PDF</button>
  <button onclick="window.close()" style="background:#fff;color:#374151;border:1px solid #d1d5db;padding:10px 18px;border-radius:8px;font-size:14px;cursor:pointer">✕ Close</button>
</div>

<div style="max-width:900px;margin:0 auto;padding:32px 24px">

  <!-- HEADER -->
  <div style="background:#0f172a;color:#fff;border-radius:16px;padding:32px;margin-bottom:24px">
    <div style="display:flex;justify-content:space-between;align-items:flex-start">
      <div>
        <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#94a3b8;margin-bottom:8px">HIRING MANAGER SCORECARD</div>
        <h1 style="font-size:28px;font-weight:800;margin-bottom:6px">${candidate.name || 'Candidate'}</h1>
        <div style="color:#94a3b8;font-size:14px;margin-bottom:12px">
          ${[candidate.email, candidate.phone].filter(Boolean).join(' · ')}
        </div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
          <span style="background:#1e293b;color:#e2e8f0;padding:5px 14px;border-radius:20px;font-size:13px">💼 ${candidate.appliedFor || 'Not specified'}</span>
          ${candidate.domain ? `<span style="background:#1e293b;color:#e2e8f0;padding:5px 14px;border-radius:20px;font-size:13px">🏷️ ${candidate.domain}</span>` : ''}
          ${candidate.experienceYears ? `<span style="background:#1e293b;color:#e2e8f0;padding:5px 14px;border-radius:20px;font-size:13px">📅 ${candidate.experienceYears} yrs</span>` : ''}
          ${candidate.seniority ? `<span style="background:#1e293b;color:#e2e8f0;padding:5px 14px;border-radius:20px;font-size:13px">🎯 ${candidate.seniority}</span>` : ''}
        </div>
      </div>
      <div style="text-align:right">
        <div style="font-size:52px;font-weight:900;line-height:1">${combinedScore}</div>
        <div style="color:#94a3b8;font-size:12px;margin-top:4px">${hasScreening ? 'Combined Score' : 'CV Score'} / 100</div>
        <div style="margin-top:10px;display:flex;gap:8px;justify-content:flex-end">
          <span style="background:${tierBg};color:${tierColor};padding:5px 14px;border-radius:20px;font-size:13px;font-weight:700">${tierKey}-Tier</span>
          <span style="background:${recBg};color:${recColor};padding:5px 14px;border-radius:20px;font-size:13px;font-weight:700">${rec}</span>
        </div>
        <div style="color:#64748b;font-size:11px;margin-top:8px">Generated: ${date}</div>
      </div>
    </div>
  </div>

  <!-- SCORE SUMMARY CARDS -->
  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:24px">
    <div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:20px;text-align:center">
      <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">📄 CV / Resume Score</div>
      <div style="font-size:40px;font-weight:900;color:${scoreColor(cvScore)}">${cvScore}</div>
      <div style="font-size:11px;color:#9ca3af;margin-top:4px">Skills 70% + Stability 30%</div>
    </div>
    <div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:20px;text-align:center">
      <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">🎙️ Screening Score</div>
      <div style="font-size:40px;font-weight:900;color:${hasScreening ? scoreColor(screenScore) : '#d1d5db'}">${hasScreening ? screenScore : '—'}</div>
      <div style="font-size:11px;color:#9ca3af;margin-top:4px">${hasScreening ? 'Technical Interview' : 'Pending Screening'}</div>
    </div>
    <div style="background:#0f172a;border-radius:12px;padding:20px;text-align:center">
      <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">🏆 Overall Fit Score</div>
      <div style="font-size:40px;font-weight:900;color:#fff">${combinedScore}</div>
      <div style="font-size:11px;color:#64748b;margin-top:4px">${hasScreening ? 'CV 60% + Screen 40%' : 'CV Score (screen pending)'}</div>
    </div>
  </div>

  <!-- RECOMMENDATION BANNER -->
  <div style="background:${recBg};border:2px solid ${recColor}30;border-radius:12px;padding:20px;margin-bottom:24px;display:flex;justify-content:space-between;align-items:center">
    <div>
      <div style="font-size:11px;color:${recColor};text-transform:uppercase;letter-spacing:1px;font-weight:600;margin-bottom:4px">HIRING RECOMMENDATION</div>
      <div style="font-size:22px;font-weight:800;color:${recColor}">${rec}</div>
    </div>
    ${candidate.recommendationReason ? `<div style="max-width:60%;font-size:13px;color:#374151;line-height:1.6">${candidate.recommendationReason}</div>` : ''}
  </div>

  <!-- HM BRIEFING SUMMARY -->
  ${(candidate.hmSummary || candidate.summary) ? `
  <div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:24px;margin-bottom:24px">
    <h3 style="font-size:14px;font-weight:700;color:#111827;margin-bottom:12px;text-transform:uppercase;letter-spacing:1px">🎯 Hiring Manager Briefing</h3>
    <p style="font-size:14px;color:#374151;line-height:1.75">${candidate.hmSummary || candidate.summary}</p>
  </div>` : ''}

  <!-- SCORE BREAKDOWN TABLE -->
  <div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;margin-bottom:24px">
    <div style="padding:16px 20px;border-bottom:1px solid #f3f4f6;background:#f9fafb">
      <h3 style="font-size:14px;font-weight:700;color:#111827;text-transform:uppercase;letter-spacing:1px">📊 Score Breakdown</h3>
    </div>
    <table style="width:100%;border-collapse:collapse">
      <thead>
        <tr style="background:#f9fafb">
          <th style="padding:10px 14px;text-align:left;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:1px">Parameter</th>
          <th style="padding:10px 14px;text-align:center;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:1px">Score</th>
          <th style="padding:10px 14px;text-align:center;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:1px">Weight</th>
          <th style="padding:10px 14px;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:1px">Visual</th>
        </tr>
      </thead>
      <tbody>
        <tr style="background:#eff6ff">
          <td colspan="4" style="padding:8px 14px;font-size:12px;font-weight:700;color:#1d4ed8">📄 RESUME MATCH (${cvScore}/100)</td>
        </tr>
        ${scoreRow('Skills Match & Technical Depth', candidate.cvScoreBreakdown?.skillsMatchScore || 0, '70%')}
        ${scoreRow('Stability & Reliability', candidate.cvScoreBreakdown?.stabilityScore || 0, '30%')}
        ${hasScreening ? `
        <tr style="background:#f5f3ff">
          <td colspan="4" style="padding:8px 14px;font-size:12px;font-weight:700;color:#7c3aed">🎙️ TECHNICAL SCREENING (${screenScore}/100)</td>
        </tr>
        ${scoreRow('Technical Accuracy', candidate.screeningBreakdown?.technical || 0, '40%')}
        ${scoreRow('Technical Depth', candidate.screeningBreakdown?.depth || 0, '40%')}
        ${scoreRow('Role Relevance', candidate.screeningBreakdown?.relevance || 0, '20%')}
        ` : ''}
        <tr style="background:#0f172a">
          <td style="padding:14px;font-size:14px;font-weight:800;color:#fff">🏆 OVERALL CANDIDATE SCORE</td>
          <td style="padding:14px;text-align:center;font-size:22px;font-weight:900;color:#fff">${combinedScore}</td>
          <td style="padding:14px;text-align:center;font-size:12px;color:#64748b">${hasScreening ? '60%+40%' : 'CV Only'}</td>
          <td style="padding:14px"><span style="background:${recBg};color:${recColor};padding:4px 14px;border-radius:12px;font-size:12px;font-weight:700">${rec}</span></td>
        </tr>
      </tbody>
    </table>
  </div>

  <!-- STRENGTHS & GAPS -->
  ${((candidate.strengths?.length || 0) > 0 || (candidate.gaps?.length || 0) > 0) ? `
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px">
    ${(candidate.strengths?.length || 0) > 0 ? `
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:20px">
      <h3 style="font-size:13px;font-weight:700;color:#065f46;margin-bottom:12px;text-transform:uppercase;letter-spacing:1px">✅ STRENGTHS</h3>
      ${candidate.strengths!.map(s => `<div style="font-size:13px;color:#374151;margin-bottom:8px;padding-left:12px;border-left:3px solid #22c55e">${s}</div>`).join('')}
    </div>` : ''}
    ${(candidate.gaps?.length || 0) > 0 ? `
    <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:12px;padding:20px">
      <h3 style="font-size:13px;font-weight:700;color:#92400e;margin-bottom:12px;text-transform:uppercase;letter-spacing:1px">⚠️ CONCERNS / GAPS</h3>
      ${candidate.gaps!.map(g => `<div style="font-size:13px;color:#374151;margin-bottom:8px;padding-left:12px;border-left:3px solid #f59e0b">${g}</div>`).join('')}
    </div>` : ''}
  </div>` : ''}

  <!-- HM INTERVIEW FOCUS AREAS -->
  ${(candidate.interviewFocusAreas?.length || 0) > 0 ? `
  <div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:24px;margin-bottom:24px">
    <h3 style="font-size:13px;font-weight:700;color:#111827;margin-bottom:14px;text-transform:uppercase;letter-spacing:1px">🎯 HM INTERVIEW FOCUS AREAS</h3>
    ${candidate.interviewFocusAreas!.map((area, i) =>
      `<div style="display:flex;gap:12px;margin-bottom:10px;align-items:flex-start">
        <span style="min-width:24px;height:24px;background:#0f172a;color:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700">${i+1}</span>
        <p style="font-size:13px;color:#374151;line-height:1.5">${area}</p>
      </div>`
    ).join('')}
  </div>` : ''}

  <!-- RISK FLAGS -->
  ${riskFlags.length > 0 ? `
  <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:12px;padding:20px;margin-bottom:24px">
    <h3 style="font-size:13px;font-weight:700;color:#991b1b;margin-bottom:12px;text-transform:uppercase;letter-spacing:1px">⚠️ RISK FLAGS</h3>
    ${riskFlags.map(r => `<div style="font-size:13px;color:#7f1d1d;margin-bottom:6px">${r}</div>`).join('')}
  </div>` : ''}

  <!-- SKILL SCORES -->
  ${(candidate.skillScores?.length || 0) > 0 ? `
  <div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:24px;margin-bottom:24px">
    <h3 style="font-size:13px;font-weight:700;color:#111827;margin-bottom:16px;text-transform:uppercase;letter-spacing:1px">🛠️ SKILL PROFICIENCY</h3>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      ${candidate.skillScores!.map(s =>
        `<div>
          <div style="display:flex;justify-content:space-between;margin-bottom:4px">
            <span style="font-size:13px;color:#374151;font-weight:500">${s.skill}</span>
            <span style="font-size:13px;font-weight:700;color:${scoreColor(s.score)}">${s.score}</span>
          </div>
          ${bar(s.score, scoreColor(s.score))}
        </div>`
      ).join('')}
    </div>
  </div>` : ''}

  <!-- TECH STACK -->
  ${((candidate.databases?.length || 0) + (candidate.frameworks?.length || 0) + (candidate.tools?.length || 0)) > 0 ? `
  <div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:24px;margin-bottom:24px">
    <h3 style="font-size:13px;font-weight:700;color:#111827;margin-bottom:16px;text-transform:uppercase;letter-spacing:1px">💻 TECHNICAL STACK</h3>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px">
      ${(candidate.databases?.length || 0) > 0 ? `
      <div>
        <div style="font-size:11px;color:#6b7280;font-weight:600;margin-bottom:8px">🗄️ DATABASES</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px">${candidate.databases!.map(d => `<span style="background:#fff7ed;color:#c2410c;padding:3px 10px;border-radius:12px;font-size:12px;border:1px solid #fed7aa">${d}</span>`).join('')}</div>
      </div>` : ''}
      ${(candidate.frameworks?.length || 0) > 0 ? `
      <div>
        <div style="font-size:11px;color:#6b7280;font-weight:600;margin-bottom:8px">⚙️ FRAMEWORKS</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px">${candidate.frameworks!.map(f => `<span style="background:#f5f3ff;color:#6d28d9;padding:3px 10px;border-radius:12px;font-size:12px;border:1px solid #ddd6fe">${f}</span>`).join('')}</div>
      </div>` : ''}
      ${(candidate.tools?.length || 0) > 0 ? `
      <div>
        <div style="font-size:11px;color:#6b7280;font-weight:600;margin-bottom:8px">🛠️ TOOLS</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px">${candidate.tools!.map(t => `<span style="background:#f9fafb;color:#374151;padding:3px 10px;border-radius:12px;font-size:12px;border:1px solid #e5e7eb">${t}</span>`).join('')}</div>
      </div>` : ''}
    </div>
  </div>` : ''}

  <!-- SCREENING Q&A -->
  ${(candidate.screeningAnswers?.length || 0) > 0 ? `
  <div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;margin-bottom:24px">
    <div style="padding:16px 20px;border-bottom:1px solid #f3f4f6;background:#f9fafb">
      <h3 style="font-size:13px;font-weight:700;color:#111827;text-transform:uppercase;letter-spacing:1px">🎙️ TECHNICAL SCREENING RESULTS</h3>
    </div>
    ${candidate.screeningAnswers!.map((sa, i) =>
      `<div style="padding:16px 20px;border-bottom:1px solid #f9fafb">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px">
          <div style="font-size:13px;font-weight:600;color:#374151;flex:1">Q${i+1}: ${sa.question || ''}</div>
          ${sa.aiScore != null ? `<span style="background:${scoreBg(sa.aiScore)};color:${scoreColor(sa.aiScore)};padding:3px 12px;border-radius:12px;font-size:12px;font-weight:700;margin-left:12px">${sa.aiScore}/100</span>` : ''}
        </div>
        ${sa.aiFeedback ? `<div style="font-size:12px;color:#6b7280;font-style:italic">💡 ${sa.aiFeedback}</div>` : ''}
      </div>`
    ).join('')}
  </div>` : ''}

  <!-- FOOTER -->
  <div style="border-top:1px solid #e5e7eb;padding-top:16px;display:flex;justify-content:space-between;align-items:center">
    <div style="font-size:11px;color:#9ca3af">Generated by ASKY RecruitIQ · ${date}</div>
    <div style="font-size:11px;color:#9ca3af">Confidential — For Internal Hiring Use Only</div>
  </div>

</div>
</body>
</html>`;

    const win = window.open('', '_blank', 'width=1000,height=800');
    if (win) {
      win.document.write(html);
      win.document.close();
    }
  }

  return (
    <button
      onClick={generateScorecard}
      className="text-xs bg-slate-800 text-white px-3 py-1.5 rounded-lg font-semibold hover:bg-slate-700 transition-all flex items-center gap-1.5"
      title="Open printable HM Scorecard"
    >
      📋 HM Report
    </button>
  );
}
