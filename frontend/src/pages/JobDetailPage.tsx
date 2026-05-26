import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";

interface Job {
  _id: string;
  title: string;
  department: string;
  location: string;
  status: string;
  description: string;
  requirements: string[];
  createdAt: string;
}
interface Candidate {
  _id: string;
  name: string;
  email: string;
  score?: number;
  aiScore?: number;
  tier: string;
  riskLevel: string;
  appliedAt?: string;
  createdAt?: string;
}

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
  const [questions, setQuestions] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState("overview");
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  const API = "https://asky-recruitiq-ai.onrender.com/api";
  const token = localStorage.getItem("token");

  useEffect(() => {
    fetchJob();
    fetchCandidates();
    fetchQuestions();
  }, [id]);

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

  async function fetchQuestions() {
    try {
      const res = await fetch(`${API}/jobs/${id}/questions`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      setQuestions(data.questions || []);
    } catch { setQuestions([]); }
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
      fetchCandidates();
    } finally { setUploading(false); }
  }

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
    </div>
  );

  if (!job) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center"><p className="text-gray-500 text-lg">Job not found</p>
        <button onClick={() => navigate("/jobs")} className="mt-4 text-blue-600 hover:underline">← Back to Jobs</button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-100 px-6 py-4">
        <button onClick={() => navigate("/jobs")} className="text-gray-500 hover:text-blue-600 text-sm mb-3 flex items-center gap-1">
          ← Back to Jobs
        </button>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{job.title}</h1>
            <div className="flex gap-4 text-sm text-gray-500 mt-1">
              <span>🏢 {job.department}</span>
              <span>📍 {job.location || "Remote"}</span>
              <span>📅 {new Date(job.createdAt).toLocaleDateString()}</span>
            </div>
          </div>
          <span className={`px-3 py-1 rounded-full text-sm font-semibold capitalize ${job.status === "open" ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-600"}`}>
            {job.status}
          </span>
        </div>
      </div>

      <div className="bg-white border-b border-gray-100 px-6">
        <div className="flex gap-6">
          {["overview", "candidates", "questions"].map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`py-3 px-1 text-sm font-semibold capitalize border-b-2 transition-all ${activeTab === tab ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
              {tab === "questions" ? "Interview Questions" : tab}
              {tab === "candidates" && <span className="ml-2 bg-blue-50 text-blue-700 text-xs px-2 py-0.5 rounded-full">{candidates.length}</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="p-6">
        {activeTab === "overview" && (
          <div className="max-w-3xl space-y-6">
            <div className="bg-white rounded-2xl p-6 border border-gray-100">
              <h2 className="font-bold text-gray-900 text-lg mb-3">Job Description</h2>
              <p className="text-gray-600 leading-relaxed whitespace-pre-wrap">{job.description || "No description provided."}</p>
            </div>
            {job.requirements?.length > 0 && (
              <div className="bg-white rounded-2xl p-6 border border-gray-100">
                <h2 className="font-bold text-gray-900 text-lg mb-3">Requirements</h2>
                <ul className="space-y-2">
                  {job.requirements.map((r, i) => (
                    <li key={i} className="flex items-start gap-2 text-gray-600">
                      <span className="text-blue-500 mt-0.5">✓</span>{r}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {activeTab === "candidates" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-gray-900 text-lg">{candidates.length} Candidates</h2>
              <label className={`bg-blue-600 text-white px-4 py-2 rounded-xl font-semibold cursor-pointer hover:bg-blue-700 transition-all text-sm ${uploading ? "opacity-60 pointer-events-none" : ""}`}>
                {uploading ? "Uploading..." : "Upload Resumes"}
                <input type="file" multiple accept=".pdf,.doc,.docx" onChange={handleResumeUpload} className="hidden" />
              </label>
            </div>
            {candidates.length === 0 ? (
              <div className="bg-white rounded-2xl p-12 border border-gray-100 text-center text-gray-400">
                <div className="text-5xl mb-4">👤</div>
                <p className="font-medium">No candidates yet</p>
                <p className="text-sm mt-1">Upload resumes to start AI screening</p>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      {["Candidate", "Score", "Tier", "Risk", "Applied"].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {candidates.map(c => (
                      <tr key={c._id} onClick={() => navigate(`/candidates/${c._id}`)}
                        className="hover:bg-blue-50 cursor-pointer transition-colors">
                        <td className="px-4 py-3">
                          <div className="font-semibold text-gray-900">{c.name}</div>
                          <div className="text-sm text-gray-500">{c.email}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-16 h-2 bg-gray-100 rounded-full">
                              <div className="h-2 bg-blue-500 rounded-full" style={{ width: `${c.aiScore || c.score || 0}%` }} />
                            </div>
                            <span className="font-bold text-gray-900 text-sm">{c.aiScore || c.score || 0}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${tierColors[c.tier?.replace(/-?Tier$/i, "")] || "bg-gray-100 text-gray-600"}`}>
                            {c.tier?.replace(/-?Tier$/i, "")}-Tier
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-xs font-semibold px-2 py-1 rounded-full capitalize ${c.riskLevel === "low" ? "bg-green-100 text-green-700" : c.riskLevel === "high" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
                            {c.riskLevel || "medium"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500">{c.createdAt ? new Date(c.createdAt).toLocaleDateString() : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === "questions" && (
          <div className="max-w-3xl space-y-3">
            <h2 className="font-bold text-gray-900 text-lg">AI-Generated Interview Questions</h2>
            {questions.length === 0 ? (
              <div className="bg-white rounded-2xl p-12 border border-gray-100 text-center text-gray-400">
                <div className="text-5xl mb-4">❓</div>
                <p className="font-medium">No questions generated yet</p>
                <p className="text-sm mt-1">Questions will appear after candidates are screened</p>
              </div>
            ) : questions.map((q, i) => (
              <div key={i} className="bg-white rounded-xl p-5 border border-gray-100 flex gap-4">
                <span className="bg-blue-100 text-blue-700 font-bold text-sm w-8 h-8 rounded-full flex items-center justify-center shrink-0">{i + 1}</span>
                <p className="text-gray-700 leading-relaxed">{q}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
