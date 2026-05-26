import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";

interface Candidate {
  _id: string;
  name: string;
  email: string;
  phone?: string;
  jobTitle?: string;
  appliedFor?: string;
  score?: number;
  aiScore?: number;
  tier: string;
  riskLevel?: string;
  appliedAt?: string;
  createdAt?: string;
  summary?: string;
  topSkills?: string[];
  skills?: string[];
  domain?: string;
  seniority?: string;
  experienceYears?: number;
  missingSkills?: string[];
  riskFlags?: string[];
  recommendation?: string;
  recommendationReason?: string;
  scoreBreakdown?: { skills: number; experience: number; education: number; overall: number; };
  interviewFeedback?: { interviewer: string; rating: number; notes: string; date: string; }[];
}

export default function CandidateDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("profile");
  const [feedbackNote, setFeedbackNote] = useState("");
  const [feedbackRating, setFeedbackRating] = useState(3);
  const [savingFeedback, setSavingFeedback] = useState(false);

  const API = "https://asky-recruitiq-ai.onrender.com/api";
  const token = localStorage.getItem("token");

  useEffect(() => { fetchCandidate(); }, [id]);

  async function fetchCandidate() {
    try {
      const res = await fetch(`${API}/candidates/${id}`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      setCandidate(data.candidate || data);
    } finally { setLoading(false); }
  }

  async function saveFeedback() {
    setSavingFeedback(true);
    try {
      await fetch(`${API}/candidates/${id}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ rating: feedbackRating, notes: feedbackNote }),
      });
      setFeedbackNote(""); fetchCandidate();
    } finally { setSavingFeedback(false); }
  }

  if (loading) return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" /></div>;
  if (!candidate) return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><p className="text-gray-500">Candidate not found</p></div>;

  const score = candidate.aiScore || candidate.score || 0;
  const tierKey = candidate.tier?.replace(/-?Tier$/i, "");
  const tierColor = { A: "from-emerald-400 to-emerald-600", B: "from-blue-400 to-blue-600", C: "from-amber-400 to-amber-600" }[tierKey] || "from-gray-400 to-gray-600";
  const tierBadge = { A: "bg-emerald-100 text-emerald-700", B: "bg-blue-100 text-blue-700", C: "bg-amber-100 text-amber-700" }[tierKey] || "bg-gray-100 text-gray-600";
  const allSkills = candidate.topSkills || candidate.skills || [];
  const jobRole = candidate.appliedFor || candidate.jobTitle || "—";

  return (
    <div className="min-h-screen bg-gray-50">
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
              <span>💼 Applied for: <strong className="text-gray-700">{jobRole}</strong></span>
              {candidate.seniority && <span>🎯 {candidate.seniority}</span>}
              {candidate.experienceYears ? <span>📅 {candidate.experienceYears} yrs exp</span> : null}
            </div>
          </div>
          <div className="text-right">
            <div className="text-4xl font-black text-gray-900">{score}</div>
            <div className="text-sm text-gray-500">AI Score</div>
            <span className={`text-xs font-bold px-3 py-1 rounded-full mt-1 inline-block ${tierBadge}`}>{tierKey}-Tier</span>
          </div>
        </div>
      </div>

      <div className="bg-white border-b border-gray-100 px-6">
        <div className="flex gap-6">
          {["profile", "ai-analysis", "feedback", "recommendation"].map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`py-3 px-1 text-sm font-semibold capitalize border-b-2 transition-all whitespace-nowrap ${activeTab === tab ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
              {tab === "ai-analysis" ? "AI Analysis" : tab}
            </button>
          ))}
        </div>
      </div>

      <div className="p-6 max-w-4xl">
        {activeTab === "profile" && (
          <div className="space-y-5">
            <div className="bg-white rounded-2xl p-6 border border-gray-100">
              <h2 className="font-bold text-gray-900 mb-4">Candidate Info</h2>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><span className="text-gray-500">Domain</span><p className="font-semibold text-gray-900 mt-0.5">{candidate.domain || "—"}</p></div>
                <div><span className="text-gray-500">Seniority</span><p className="font-semibold text-gray-900 mt-0.5">{candidate.seniority || "—"}</p></div>
                <div><span className="text-gray-500">Experience</span><p className="font-semibold text-gray-900 mt-0.5">{candidate.experienceYears ? `${candidate.experienceYears} years` : "—"}</p></div>
                <div><span className="text-gray-500">Risk Level</span><p className="font-semibold text-gray-900 mt-0.5 capitalize">{candidate.riskLevel || "medium"}</p></div>
                <div><span className="text-gray-500">Applied</span><p className="font-semibold text-gray-900 mt-0.5">{(candidate.createdAt||candidate.appliedAt) ? new Date(candidate.createdAt||candidate.appliedAt!).toLocaleDateString() : "—"}</p></div>
              </div>
            </div>
            {candidate.summary && (
              <div className="bg-white rounded-2xl p-6 border border-gray-100">
                <h2 className="font-bold text-gray-900 mb-3">AI Summary</h2>
                <p className="text-gray-600 leading-relaxed">{candidate.summary}</p>
              </div>
            )}
            {allSkills.length > 0 && (
              <div className="bg-white rounded-2xl p-6 border border-gray-100">
                <h2 className="font-bold text-gray-900 mb-3">Top Skills</h2>
                <div className="flex flex-wrap gap-2">
                  {allSkills.map(s => (
                    <span key={s} className="bg-blue-50 text-blue-700 text-sm font-medium px-3 py-1 rounded-full border border-blue-100">{s}</span>
                  ))}
                </div>
              </div>
            )}
            {allSkills.length === 0 && !candidate.summary && (
              <div className="bg-white rounded-2xl p-8 border border-gray-100 text-center text-gray-400">
                <div className="text-4xl mb-3">📄</div>
                <p className="font-medium">Upload a resume to see AI-extracted profile data</p>
              </div>
            )}
          </div>
        )}

        {activeTab === "ai-analysis" && (
          <div className="space-y-5">
            <div className="bg-white rounded-2xl p-6 border border-gray-100">
              <h2 className="font-bold text-gray-900 mb-3">AI Score</h2>
              <div className="flex items-center gap-4">
                <div className="text-5xl font-black text-gray-900">{score}</div>
                <div className="flex-1">
                  <div className="h-3 bg-gray-100 rounded-full">
                    <div className={`h-3 rounded-full ${score >= 80 ? "bg-emerald-500" : score >= 60 ? "bg-blue-500" : "bg-amber-500"}`} style={{ width: `${score}%` }} />
                  </div>
                  <p className="text-sm text-gray-500 mt-2">{score >= 80 ? "Excellent candidate" : score >= 60 ? "Good candidate" : "Needs review"}</p>
                </div>
              </div>
            </div>
            {(candidate.missingSkills?.length ?? 0) > 0 && (
              <div className="bg-white rounded-2xl p-6 border border-gray-100">
                <h2 className="font-bold text-gray-900 mb-3">Skill Gaps</h2>
                <div className="flex flex-wrap gap-2">
                  {candidate.missingSkills!.map(s => (
                    <span key={s} className="bg-red-50 text-red-600 text-sm font-medium px-3 py-1 rounded-full border border-red-100">⚠ {s}</span>
                  ))}
                </div>
              </div>
            )}
            {(candidate.riskFlags?.length ?? 0) > 0 && (
              <div className="bg-white rounded-2xl p-6 border border-gray-100">
                <h2 className="font-bold text-gray-900 mb-3">Risk Flags</h2>
                <div className="space-y-2">
                  {candidate.riskFlags!.map((f, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm text-red-600 bg-red-50 px-4 py-2.5 rounded-xl">
                      <span className="shrink-0 mt-0.5">🚩</span>{f}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === "feedback" && (
          <div className="space-y-5">
            <div className="bg-white rounded-2xl p-6 border border-gray-100">
              <h2 className="font-bold text-gray-900 mb-4">Add Interview Feedback</h2>
              <div className="mb-4">
                <label className="block text-sm font-semibold text-gray-700 mb-2">Rating</label>
                <div className="flex gap-2">
                  {[1,2,3,4,5].map(r => (
                    <button key={r} onClick={() => setFeedbackRating(r)}
                      className={`w-10 h-10 rounded-xl font-bold text-sm transition-all ${feedbackRating >= r ? "bg-amber-400 text-white" : "bg-gray-100 text-gray-400"}`}>★</button>
                  ))}
                  <span className="ml-2 self-center text-sm text-gray-500">{feedbackRating}/5</span>
                </div>
              </div>
              <textarea value={feedbackNote} onChange={e => setFeedbackNote(e.target.value)} rows={4}
                placeholder="Share your interview observations..."
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none mb-4" />
              <button onClick={saveFeedback} disabled={savingFeedback || !feedbackNote}
                className="bg-blue-600 text-white px-6 py-2.5 rounded-xl font-semibold hover:bg-blue-700 transition-all disabled:opacity-60 text-sm">
                {savingFeedback ? "Saving..." : "Save Feedback"}
              </button>
            </div>
            {candidate.interviewFeedback?.map((f, i) => (
              <div key={i} className="bg-white rounded-2xl p-5 border border-gray-100">
                <div className="flex justify-between mb-2">
                  <span className="font-semibold text-gray-900 text-sm">{f.interviewer}</span>
                  <div className="flex gap-1">{[...Array(5)].map((_, s) => <span key={s} className={s < f.rating ? "text-amber-400" : "text-gray-200"}>★</span>)}</div>
                </div>
                <p className="text-gray-600 text-sm">{f.notes}</p>
                <p className="text-xs text-gray-400 mt-2">{new Date(f.date).toLocaleDateString()}</p>
              </div>
            ))}
          </div>
        )}

        {activeTab === "recommendation" && (
          <div className="space-y-5">
            <div className="bg-white rounded-2xl p-6 border border-gray-100">
              <h2 className="font-bold text-gray-900 mb-3">AI Recommendation</h2>
              {candidate.recommendation ? (
                <>
                  <div className={`inline-block px-4 py-1.5 rounded-full text-sm font-bold mb-4 ${candidate.recommendation === "Strong Hire" ? "bg-emerald-100 text-emerald-700" : candidate.recommendation === "Hire" ? "bg-blue-100 text-blue-700" : candidate.recommendation === "Maybe" ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"}`}>
                    {candidate.recommendation}
                  </div>
                  {candidate.recommendationReason && <p className="text-gray-600 leading-relaxed">{candidate.recommendationReason}</p>}
                </>
              ) : (
                <p className="text-gray-500 text-sm">Based on AI Score of <strong>{score}</strong>: {score >= 80 ? "Strong candidate — recommend moving forward." : score >= 60 ? "Good candidate — consider for interview." : "Below average — review manually before proceeding."}</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
