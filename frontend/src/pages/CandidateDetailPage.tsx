import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";

interface Candidate {
  _id: string;
  name: string;
  email: string;
  phone?: string;
  jobTitle: string;
  score: number;
  tier: string;
  riskLevel: string;
  appliedAt: string;
  summary?: string;
  skills?: string[];
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

  const API = import.meta.env.VITE_API_URL || "http://localhost:5000/api";
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

  const tierColor = { A: "from-emerald-400 to-emerald-600", B: "from-blue-400 to-blue-600", C: "from-amber-400 to-amber-600" }[candidate.tier] || "from-gray-400 to-gray-600";

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
              <span>💼 Applied for: <strong className="text-gray-700">{candidate.jobTitle}</strong></span>
            </div>
          </div>
          <div className="text-right">
            <div className="text-4xl font-black text-gray-900">{candidate.score}</div>
            <div className="text-sm text-gray-500">AI Score</div>
            <span className={`text-xs font-bold px-3 py-1 rounded-full mt-1 inline-block ${candidate.tier === "A" ? "bg-emerald-100 text-emerald-700" : candidate.tier === "B" ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700"}`}>
              {candidate.tier}-Tier
            </span>
          </div>
        </div>
      </div>

      {/* Tabs */}
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
        {/* Profile Tab */}
        {activeTab === "profile" && (
          <div className="space-y-5">
            {candidate.summary && (
              <div className="bg-white rounded-2xl p-6 border border-gray-100">
                <h2 className="font-bold text-gray-900 mb-3">Resume Summary</h2>
                <p className="text-gray-600 leading-relaxed">{candidate.summary}</p>
              </div>
            )}
            {(candidate.skills?.length ?? 0) > 0 && (
              <div className="bg-white rounded-2xl p-6 border border-gray-100">
                <h2 className="font-bold text-gray-900 mb-3">Detected Skills</h2>
                <div className="flex flex-wrap gap-2">
                  {candidate.skills!.map(s => (
                    <span key={s} className="bg-blue-50 text-blue-700 text-sm font-medium px-3 py-1 rounded-full border border-blue-100">{s}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* AI Analysis Tab */}
        {activeTab === "ai-analysis" ? (
          <div className="space-y-5">
            {candidate.scoreBreakdown ? (
              <div className="bg-white rounded-2xl p-6 border border-gray-100">
                <h2 className="font-bold text-gray-900 mb-5">Score Breakdown</h2>
                <div className="space-y-4">
                  {Object.entries(candidate.scoreBreakdown).map(([key, val]) => (
                    <div key={key}>
                      <div className="flex justify-between text-sm mb-1.5">
                        <span className="font-medium text-gray-700 capitalize">{key}</span>
                        <span className="font-bold text-gray-900">{val}/100</span>
                      </div>
                      <div className="h-2.5 bg-gray-100 rounded-full">
                        <div className={`h-2.5 rounded-full ${val >= 80 ? "bg-emerald-500" : val >= 60 ? "bg-blue-500" : "bg-amber-500"}`}
                          style={{ width: `${val}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            {(candidate.missingSkills?.length ?? 0) > 0 ? (
              <div className="bg-white rounded-2xl p-6 border border-gray-100">
                <h2 className="font-bold text-gray-900 mb-3">Skill Gaps</h2>
                <div className="flex flex-wrap gap-2">
                  {candidate.missingSkills!.map(s => (
                    <span key={s} className="bg-red-50 text-red-600 text-sm font-medium px-3 py-1 rounded-full border border-red-100">⚠ {s}</span>
                  ))}
                </div>
              </div>
            ) : null}
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
        ) : null}

        {/* Feedback Tab */}
        {activeTab === "feedback" && (
          <div className="space-y-5">
            <div className="bg-white rounded-2xl p-6 border border-gray-100">
              <h2 className="font-bold text-gray-900 mb-4">Add Interview Feedback</h2>
              <div className="mb-4">
                <label className="block text-sm font-semibold text-gray-700 mb-2">Rating</label>
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map(r => (
                    <button key={r} onClick={() => setFeedbackRating(r)}
                      className={`w-10 h-10 rounded-xl font-bold text-sm transition-all ${feedbackRating >= r ? "bg-amber-400 text-white" : "bg-gray-100 text-gray-400"}`}>
                      ★
                    </button>
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

        {/* Recommendation Tab */}
        {activeTab === "recommendation" && (
          <div className="space-y-5">
            {candidate.recommendation ? (
              <div className="bg-white rounded-2xl p-6 border border-gray-100">
                <h2 className="font-bold text-gray-900 mb-3">AI Recommendation</h2>
                <div className={`inline-block px-4 py-1.5 rounded-full text-sm font-bold mb-4 ${
                  candidate.recommendation === "Strong Hire" ? "bg-emerald-100 text-emerald-700" :
                  candidate.recommendation === "Hire" ? "bg-blue-100 text-blue-700" :
                  candidate.recommendation === "Maybe" ? "bg-amber-100 text-amber-700" :
                  "bg-red-100 text-red-700"
                }`}>
                  {candidate.recommendation}
                </div>
                {candidate.recommendationReason && (
                  <p className="text-gray-600 leading-relaxed">{candidate.recommendationReason}</p>
                )}
              </div>
            ) : (
              <div className="bg-white rounded-2xl p-6 border border-gray-100">
                <p className="text-gray-500 text-sm">No recommendation available for this candidate yet.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
