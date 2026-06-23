import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";

const API = "https://asky-recruitiq-ai.onrender.com/api";

export default function ApplyPage() {
  const { jobId } = useParams();
  const [job, setJob]         = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep]       = useState<"form" | "submitting" | "success" | "error">("form");
  const [result, setResult]   = useState<any>(null);
  const [form, setForm]       = useState({ name: "", email: "", phone: "" });
  const [file, setFile]       = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => { fetchJob(); }, [jobId]);

  async function fetchJob() {
    try {
      const res  = await fetch(`${API}/jobs/${jobId}`);
      const data = await res.json();
      setJob(data.job || data);
    } catch { setJob(null); }
    finally { setLoading(false); }
  }

  async function handleSubmit() {
    if (!form.name || !form.email || !file) return alert("Please fill all required fields and upload your resume.");
    setStep("submitting");
    try {
      const fd = new FormData();
      fd.append("resumes",  file);
      fd.append("jobId",    jobId || "");
      fd.append("jobTitle", job?.title || "");
      fd.append("name",     form.name);
      fd.append("email",    form.email);
      fd.append("phone",    form.phone);

      const res  = await fetch(`${API}/resumes/upload`, { method: "POST", body: fd });
      const data = await res.json();

      if (!res.ok) throw new Error(data.message || "Upload failed");
      setResult(data);
      setStep("success");
    } catch (err: any) {
      console.error(err);
      setStep("error");
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f && ["application/pdf","application/msword","application/vnd.openxmlformats-officedocument.wordprocessingml.document"].includes(f.type)) {
      setFile(f);
    } else {
      alert("Please upload a PDF or DOCX file.");
    }
  }

  if (loading) return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
    </div>
  );

  if (!job) return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-6">
      <div className="bg-white rounded-3xl p-12 text-center shadow-xl max-w-md">
        <div className="text-6xl mb-4">😕</div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">Job Not Found</h2>
        <p className="text-gray-500">This job posting may have been closed or the link is invalid.</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-6 py-4 shadow-sm">
        <div className="max-w-4xl mx-auto flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white font-bold text-lg">R</div>
          <div>
            <div className="font-bold text-gray-900">Recruit IQ</div>
            <div className="text-xs text-gray-400">Powered by AI Screening</div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-10">

        {/* ── SUCCESS STATE ── */}
        {step === "success" && (
          <div className="bg-white rounded-3xl p-12 text-center shadow-xl border border-gray-100">
            <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center text-4xl mx-auto mb-6">🎉</div>
            <h2 className="text-3xl font-black text-gray-900 mb-2">Application Submitted!</h2>
            <p className="text-gray-500 mb-8">Thank you <strong>{form.name}</strong>! Your resume has been received and AI-screened.</p>

            {/* AI Score Card */}
            {(result?.candidates?.[0] || result?.candidate) && (() => {
              const c = result.candidates?.[0] || result.candidate;
              const score = c.aiScore || c.score || 0;
              const tier  = c.tier?.replace(/-?Tier$/i,"") || "B";
              return (
                <div className="bg-gradient-to-br from-blue-600 to-indigo-600 rounded-2xl p-8 text-white mb-6 max-w-sm mx-auto">
                  <p className="text-blue-200 text-sm mb-2 font-medium">Your AI Match Score</p>
                  <div className="text-7xl font-black mb-2">{score}</div>
                  <div className="text-blue-200 text-sm mb-4">out of 100</div>
                  <div className={`inline-block px-4 py-2 rounded-full text-sm font-bold ${tier === "A" ? "bg-emerald-400 text-white" : tier === "B" ? "bg-blue-300 text-blue-900" : "bg-amber-400 text-amber-900"}`}>
                    {tier}-Tier Candidate
                  </div>
                  {c.summary && <p className="text-blue-100 text-sm mt-4 leading-relaxed">{c.summary}</p>}
                </div>
              );
            })()}

            <div className="bg-gray-50 rounded-2xl p-5 text-left max-w-sm mx-auto">
              <p className="text-sm font-bold text-gray-700 mb-3">What happens next?</p>
              {["Our team will review your application", "If shortlisted, you'll receive screening questions via email", "Top candidates will be invited for an interview"].map((s, i) => (
                <div key={i} className="flex items-start gap-3 mb-2">
                  <div className="w-5 h-5 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">{i+1}</div>
                  <p className="text-sm text-gray-600">{s}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── ERROR STATE ── */}
        {step === "error" && (
          <div className="bg-white rounded-3xl p-12 text-center shadow-xl border border-red-100">
            <div className="text-6xl mb-4">❌</div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Submission Failed</h2>
            <p className="text-gray-500 mb-6">Something went wrong. Please try again.</p>
            <button onClick={() => setStep("form")} className="bg-blue-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-blue-700 transition-all">
              Try Again
            </button>
          </div>
        )}

        {/* ── SUBMITTING STATE ── */}
        {step === "submitting" && (
          <div className="bg-white rounded-3xl p-16 text-center shadow-xl border border-gray-100">
            <div className="text-6xl mb-6 animate-bounce">🤖</div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">AI is screening your resume...</h2>
            <p className="text-gray-500 mb-8">This usually takes 15–30 seconds. Please wait.</p>
            <div className="flex justify-center gap-2">
              {[0,1,2].map(i => (
                <div key={i} className="w-3 h-3 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: `${i*150}ms` }} />
              ))}
            </div>
          </div>
        )}

        {/* ── FORM STATE ── */}
        {step === "form" && (
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">

            {/* LEFT: Job Info */}
            <div className="lg:col-span-2 space-y-5">
              {/* Job Card */}
              <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100">
                <span className={`text-xs font-bold px-3 py-1 rounded-full capitalize mb-4 inline-block ${job.status === "open" ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
                  {job.status}
                </span>
                <h1 className="text-2xl font-black text-gray-900 mb-3 leading-tight">{job.title}</h1>
                <div className="space-y-2 text-sm text-gray-500">
                  <div className="flex items-center gap-2">🏢 <span>{job.department}</span></div>
                  <div className="flex items-center gap-2">📍 <span>{job.location || "Remote"}</span></div>
                  {job.level && <div className="flex items-center gap-2">🎯 <span>{job.level} Level</span></div>}
                  {job.minAiScore && <div className="flex items-center gap-2">⭐ <span>Min AI Score: {job.minAiScore}/100</span></div>}
                </div>

                {/* Skills */}
                {(job.requiredSkills?.length ?? 0) > 0 && (
                  <div className="mt-4 pt-4 border-t border-gray-50">
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Required Skills</p>
                    <div className="flex flex-wrap gap-1.5">
                      {job.requiredSkills.map((s: string) => (
                        <span key={s} className="bg-blue-50 text-blue-600 text-xs px-2.5 py-1 rounded-full border border-blue-100 font-medium">{s}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Job Description */}
              {job.description && (
                <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100">
                  <h3 className="font-bold text-gray-900 mb-3">About the Role</h3>
                  <p className="text-gray-600 text-sm leading-relaxed whitespace-pre-wrap line-clamp-10">{job.description}</p>
                </div>
              )}

              {/* AI Screening badge */}
              <div className="bg-gradient-to-br from-blue-600 to-indigo-600 rounded-3xl p-5 text-white">
                <div className="text-2xl mb-2">🤖</div>
                <p className="font-bold mb-1">AI-Powered Screening</p>
                <p className="text-blue-200 text-xs leading-relaxed">Your resume will be instantly analyzed and scored by our AI. You'll see your match score right after applying!</p>
              </div>
            </div>

            {/* RIGHT: Application Form */}
            <div className="lg:col-span-3">
              <div className="bg-white rounded-3xl p-8 shadow-sm border border-gray-100">
                <h2 className="text-xl font-black text-gray-900 mb-1">Apply for this Role</h2>
                <p className="text-gray-400 text-sm mb-6">Fill in your details and upload your resume</p>

                <div className="space-y-4">
                  {/* Name */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">Full Name <span className="text-red-500">*</span></label>
                    <input value={form.name} onChange={e => setForm({...form, name: e.target.value})}
                      placeholder="John Doe"
                      className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                  </div>

                  {/* Email */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">Email Address <span className="text-red-500">*</span></label>
                    <input type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})}
                      placeholder="john@example.com"
                      className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                  </div>

                  {/* Phone */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">Phone Number</label>
                    <input type="tel" value={form.phone} onChange={e => setForm({...form, phone: e.target.value})}
                      placeholder="+91 9999999999"
                      className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                  </div>

                  {/* Resume Upload */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">Resume <span className="text-red-500">*</span></label>
                    <div
                      onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                      onDragLeave={() => setDragOver(false)}
                      onDrop={handleDrop}
                      className={`relative border-2 border-dashed rounded-2xl p-8 text-center transition-all ${dragOver ? "border-blue-400 bg-blue-50" : file ? "border-emerald-400 bg-emerald-50" : "border-gray-200 hover:border-blue-300 hover:bg-blue-50"}`}>
                      <input type="file" accept=".pdf,.doc,.docx"
                        onChange={e => e.target.files?.[0] && setFile(e.target.files[0])}
                        className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" />
                      {file ? (
                        <>
                          <div className="text-3xl mb-2">✅</div>
                          <p className="font-semibold text-emerald-700 text-sm">{file.name}</p>
                          <p className="text-xs text-emerald-500 mt-1">Ready to submit</p>
                        </>
                      ) : (
                        <>
                          <div className="text-3xl mb-2">📎</div>
                          <p className="font-semibold text-gray-600 text-sm">Drop your resume here or click to browse</p>
                          <p className="text-xs text-gray-400 mt-1">PDF, DOC, DOCX • Max 10MB</p>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Submit */}
                  <button onClick={handleSubmit}
                    disabled={!form.name || !form.email || !file}
                    className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white py-4 rounded-2xl font-bold text-base hover:from-blue-700 hover:to-indigo-700 transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-blue-200 mt-2">
                    🚀 Submit Application
                  </button>

                  <p className="text-xs text-gray-400 text-center">By applying, your resume will be AI-screened instantly. Your data is secure.</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
