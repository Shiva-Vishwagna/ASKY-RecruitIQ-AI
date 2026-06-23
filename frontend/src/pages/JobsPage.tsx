import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

interface Job {
  _id: string; title: string; department: string; location: string;
  status: "open" | "closed" | "on-hold"; candidateCount: number;
  createdAt: string; description?: string; level?: string;
  requiredSkills?: string[]; minAiScore?: number;
}

const statusColors: Record<string, string> = {
  open:     "bg-emerald-100 text-emerald-700 border border-emerald-200",
  closed:   "bg-red-100 text-red-700 border border-red-200",
  "on-hold":"bg-amber-100 text-amber-700 border border-amber-200",
};

const statusOptions = [
  { value: "open",    label: "Open",    icon: "🟢" },
  { value: "on-hold", label: "On Hold", icon: "🟡" },
  { value: "closed",  label: "Closed",  icon: "🔴" },
];

const SKILL_SUGGESTIONS = ["Java","Python","React","Node.js","Spring Boot","Angular","Vue","TypeScript","Docker","Kubernetes","AWS","Azure","PostgreSQL","MongoDB","Redis","Microservices","REST API","GraphQL","CI/CD","Git"];

export default function JobsPage() {
  const navigate = useNavigate();
  const [jobs, setJobs]               = useState<Job[]>([]);
  const [loading, setLoading]         = useState(true);
  const [search, setSearch]           = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showModal, setShowModal]     = useState(false);
  const [skillInput, setSkillInput]   = useState("");
  const [newJob, setNewJob]           = useState({
    title: "", department: "", location: "", description: "",
    primarySkill: "", level: "Mid", requiredSkills: [] as string[], minAiScore: 60,
    roleType: "technical" as "technical"|"non_technical",
  });
  const [creating, setCreating]       = useState(false);

  // Inline title edit
  const [editingTitleId, setEditingTitleId]       = useState<string | null>(null);
  const [editingTitleValue, setEditingTitleValue] = useState("");
  const [savingTitle, setSavingTitle]             = useState(false);

  // Status change dropdown
  const [statusMenuId, setStatusMenuId]   = useState<string | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null);

  const API   = "https://asky-recruitiq-ai.onrender.com/api";
  const token = localStorage.getItem("token");
  const user  = JSON.parse(localStorage.getItem("user") || "{}");
  const isAdmin = user?.role === "admin";

  useEffect(() => {
    fetchJobs();
    // Close status menu on outside click
    const handler = () => setStatusMenuId(null);
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, []);

  async function fetchJobs() {
    try {
      const res = await fetch(`${API}/jobs`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      setJobs(data.jobs || data || []);
    } catch { setJobs([]); }
    finally { setLoading(false); }
  }

  async function createJob() {
    if (!newJob.title || !newJob.department) return;
    setCreating(true);
    try {
      const res = await fetch(`${API}/jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...newJob }),
      });
      if (res.ok) {
        setShowModal(false);
        setNewJob({ title: "", department: "", location: "", description: "", primarySkill: "", level: "Mid", requiredSkills: [], minAiScore: 60, roleType: "technical" } as any);
        fetchJobs();
      }
    } finally { setCreating(false); }
  }

  async function saveTitle(jobId: string) {
    if (!editingTitleValue.trim()) return;
    setSavingTitle(true);
    try {
      const res = await fetch(`${API}/jobs/${jobId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ title: editingTitleValue.trim() }),
      });
      if (res.ok) {
        setJobs(jobs.map(j => j._id === jobId ? { ...j, title: editingTitleValue.trim() } : j));
        setEditingTitleId(null);
      } else { alert("Failed to update title."); }
    } catch { alert("Error updating title."); }
    finally { setSavingTitle(false); }
  }

  async function updateJobStatus(jobId: string, newStatus: string) {
    setUpdatingStatus(jobId);
    setStatusMenuId(null);
    try {
      const res = await fetch(`${API}/jobs/${jobId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        setJobs(jobs.map(j => j._id === jobId ? { ...j, status: newStatus as Job["status"] } : j));
      } else { alert("Failed to update status."); }
    } catch { alert("Error updating status."); }
    finally { setUpdatingStatus(null); }
  }

  function addSkill(skill: string) {
    const s = skill.trim();
    if (s && !newJob.requiredSkills.includes(s)) setNewJob({ ...newJob, requiredSkills: [...newJob.requiredSkills, s] });
    setSkillInput("");
  }

  function removeSkill(skill: string) {
    setNewJob({ ...newJob, requiredSkills: newJob.requiredSkills.filter(s => s !== skill) });
  }

  const filtered = jobs.filter(j => {
    const matchSearch = j.title.toLowerCase().includes(search.toLowerCase()) || j.department.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || j.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const levelScores: Record<string, number> = { Junior: 40, Mid: 60, Senior: 75, Lead: 85 };

  // Count by status
  const counts = { all: jobs.length, open: jobs.filter(j=>j.status==="open").length, closed: jobs.filter(j=>j.status==="closed").length, "on-hold": jobs.filter(j=>j.status==="on-hold").length };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Job Postings</h1>
          <p className="text-gray-500 mt-1">Manage all open and closed positions</p>
        </div>
        <button onClick={() => setShowModal(true)} className="bg-blue-600 text-white px-5 py-2.5 rounded-xl font-semibold hover:bg-blue-700 transition-all shadow-sm">
          + Create New Job
        </button>
      </div>

      {/* Search + Filter */}
      <div className="flex gap-3 mb-6 flex-wrap items-center">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search jobs..."
          className="border border-gray-200 rounded-xl px-4 py-2 w-72 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
        {(["all","open","on-hold","closed"] as const).map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`px-4 py-2 rounded-xl font-medium capitalize transition-all flex items-center gap-1.5 ${statusFilter === s ? "bg-blue-600 text-white" : "bg-white border border-gray-200 text-gray-600 hover:border-blue-400"}`}>
            {s === "open" ? "🟢" : s === "on-hold" ? "🟡" : s === "closed" ? "🔴" : ""}
            {s === "all" ? "All Jobs" : s === "on-hold" ? "On Hold" : s.charAt(0).toUpperCase()+s.slice(1)}
            <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ml-1 ${statusFilter === s ? "bg-white/20 text-white" : "bg-gray-100 text-gray-500"}`}>
              {counts[s]}
            </span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-white rounded-2xl p-6 border border-gray-100 animate-pulse">
              <div className="h-5 bg-gray-100 rounded w-3/4 mb-3" /><div className="h-4 bg-gray-100 rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <div className="text-5xl mb-4">📋</div>
          <p className="text-lg font-medium">No jobs found</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(job => (
            <div key={job._id}
              className={`bg-white rounded-2xl p-6 border transition-all group relative ${
                job.status === "closed" ? "border-red-100 opacity-80" :
                job.status === "on-hold" ? "border-amber-100" :
                "border-gray-100 hover:border-blue-300 hover:shadow-md"
              }`}>

              {/* ── Card Header ── */}
              <div className="flex items-start justify-between mb-3">

                {/* Title with inline edit */}
                {isAdmin && editingTitleId === job._id ? (
                  <div className="flex items-center gap-2 flex-1 mr-2" onClick={e => e.stopPropagation()}>
                    <input autoFocus value={editingTitleValue}
                      onChange={e => setEditingTitleValue(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") saveTitle(job._id); if (e.key === "Escape") setEditingTitleId(null); }}
                      className="border border-blue-400 rounded-lg px-2 py-1 text-sm font-bold text-gray-900 w-full focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    <button onClick={() => saveTitle(job._id)} disabled={savingTitle}
                      className="text-xs bg-blue-600 text-white px-2 py-1 rounded-lg hover:bg-blue-700 shrink-0">
                      {savingTitle ? "..." : "✓"}
                    </button>
                    <button onClick={() => setEditingTitleId(null)}
                      className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-lg hover:bg-gray-200 shrink-0">✕</button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 flex-1 mr-2">
                    <h3 className="font-bold text-gray-900 text-lg leading-tight group-hover:text-blue-600 transition-colors cursor-pointer"
                      onClick={() => navigate(`/jobs/${job._id}`)}>
                      {job.title}
                    </h3>
                    {isAdmin && (
                      <button onClick={e => { e.stopPropagation(); setEditingTitleId(job._id); setEditingTitleValue(job.title); }}
                        title="Edit title"
                        className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-blue-600 shrink-0">
                        ✏️
                      </button>
                    )}
                  </div>
                )}

                {/* ── Status Badge with dropdown ── */}
                <div className="relative shrink-0" onClick={e => e.stopPropagation()}>
                  <button
                    onClick={e => { e.stopPropagation(); setStatusMenuId(statusMenuId === job._id ? null : job._id); }}
                    disabled={updatingStatus === job._id}
                    className={`text-xs font-semibold px-2.5 py-1 rounded-full capitalize flex items-center gap-1 transition-all hover:opacity-80 ${statusColors[job.status]}`}>
                    {updatingStatus === job._id ? (
                      <span className="animate-spin">⏳</span>
                    ) : (
                      <>
                        {job.status === "open" ? "🟢" : job.status === "on-hold" ? "🟡" : "🔴"}
                        {job.status === "on-hold" ? "On Hold" : job.status}
                        <span className="text-xs opacity-60">▾</span>
                      </>
                    )}
                  </button>

                  {/* Status dropdown menu */}
                  {statusMenuId === job._id && (
                    <div className="absolute right-0 top-8 z-50 bg-white rounded-2xl shadow-2xl border border-gray-100 p-2 w-44">
                      <p className="text-xs font-bold text-gray-400 uppercase tracking-wide px-2 pb-2">Change Status</p>
                      {statusOptions.map(opt => (
                        <button key={opt.value}
                          onClick={() => updateJobStatus(job._id, opt.value)}
                          className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold transition-all text-left ${
                            job.status === opt.value
                              ? "bg-blue-50 text-blue-700"
                              : "text-gray-600 hover:bg-gray-50"
                          }`}>
                          <span>{opt.icon}</span>
                          <span>{opt.label}</span>
                          {job.status === opt.value && <span className="ml-auto text-blue-500 text-xs">✓</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Card body */}
              <div onClick={() => editingTitleId !== job._id && navigate(`/jobs/${job._id}`)} className="cursor-pointer">
                <div className="space-y-1.5 text-sm text-gray-500">
                  <div className="flex items-center gap-2">🏢 <span>{job.department}</span></div>
                  <div className="flex items-center gap-2">📍 <span>{job.location || "Remote"}</span></div>
                  {job.level && <div className="flex items-center gap-2">🎯 <span>{job.level} Level</span></div>}
                  {(job as any).primarySkill && <div className="flex items-center gap-2">🔑 <span>Primary: {(job as any).primarySkill}</span></div>}
                  {job.minAiScore ? <div className="flex items-center gap-2">⭐ <span>Min Score: {job.minAiScore}</span></div> : null}
                </div>
                {(job.requiredSkills?.length ?? 0) > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1">
                    {job.requiredSkills!.slice(0, 4).map(s => (
                      <span key={s} className="bg-blue-50 text-blue-600 text-xs px-2 py-0.5 rounded-full">{s}</span>
                    ))}
                    {(job.requiredSkills!.length > 4) && <span className="text-xs text-gray-400">+{job.requiredSkills!.length - 4}</span>}
                  </div>
                )}
                <div className="mt-4 pt-4 border-t border-gray-50 flex items-center justify-between">
                  <span className="bg-blue-50 text-blue-700 text-sm font-semibold px-3 py-1 rounded-full">{job.candidateCount || 0} candidates</span>
                  {job.status === "closed" ? (
                    <span className="text-red-400 text-xs font-semibold">Position Closed</span>
                  ) : job.status === "on-hold" ? (
                    <span className="text-amber-500 text-xs font-semibold">Hiring Paused</span>
                  ) : (
                    <span className="text-blue-500 text-sm font-medium group-hover:underline">View →</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Job Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-8 w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Create New Job</h2>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Job Title *</label>
                  <input value={newJob.title} onChange={e => setNewJob({ ...newJob, title: e.target.value })}
                    placeholder="e.g. Senior Java Developer"
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Department *</label>
                  <input value={newJob.department} onChange={e => setNewJob({ ...newJob, department: e.target.value })}
                    placeholder="e.g. Engineering"
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Location</label>
                <input value={newJob.location} onChange={e => setNewJob({ ...newJob, location: e.target.value })}
                  placeholder="e.g. Hyderabad / Remote"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Job Description</label>
                <textarea value={newJob.description} onChange={e => setNewJob({ ...newJob, description: e.target.value })}
                  rows={3} placeholder="Paste job description..."
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
              </div>
              <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
                <h3 className="font-bold text-blue-800 mb-3">⚙️ Level Engine</h3>
                <div className="mb-4">
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Primary Skill Required <span className="text-red-500">*</span></label>
                  <input value={newJob.primarySkill} onChange={e => setNewJob({ ...newJob, primarySkill: e.target.value })}
                    placeholder="e.g. React, Java, Python, Angular..."
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-sm" />
                  <p className="text-xs text-gray-400 mt-1">Candidates without this skill will automatically receive a lower AI score</p>
                </div>
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Experience Level</label>
                    <select value={newJob.level}
                      onChange={e => setNewJob({ ...newJob, level: e.target.value, minAiScore: levelScores[e.target.value] || 60 })}
                      className="w-full border border-gray-200 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                      <option value="Junior">Junior</option>
                      <option value="Mid">Mid</option>
                      <option value="Senior">Senior</option>
                      <option value="Lead">Lead</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Min AI Score ({newJob.level})</label>
                    <input type="number" min="0" max="100" value={newJob.minAiScore}
                      onChange={e => setNewJob({ ...newJob, minAiScore: Number(e.target.value) })}
                      className="w-full border border-gray-200 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
                  </div>
                </div>
                {/* Role Type Toggle */}
                <div className="col-span-2">
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Role Type</label>
                  <div className="grid grid-cols-2 gap-3">
                    <button type="button" onClick={() => setNewJob({...newJob, roleType: "technical" as any})}
                      className={`p-4 rounded-xl border-2 text-left transition-all ${(newJob as any).roleType === "non_technical" ? "border-gray-200" : "border-blue-500 bg-blue-50"}`}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xl">💻</span>
                        <span className="font-bold text-gray-900">Technical / IT Role</span>
                        {(newJob as any).roleType !== "non_technical" && <span className="ml-auto text-blue-600 text-xs font-bold bg-blue-100 px-2 py-0.5 rounded-full">Selected</span>}
                      </div>
                      <p className="text-xs text-gray-500">Software, Engineering, DevOps, Data, Product</p>
                      <p className="text-xs text-gray-400 mt-0.5">CV: Skills depth 70% + Stability 30%</p>
                    </button>
                    <button type="button" onClick={() => setNewJob({...newJob, roleType: "non_technical" as any})}
                      className={`p-4 rounded-xl border-2 text-left transition-all ${(newJob as any).roleType === "non_technical" ? "border-amber-500 bg-amber-50" : "border-gray-200"}`}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xl">🤝</span>
                        <span className="font-bold text-gray-900">Non-Technical Role</span>
                        {(newJob as any).roleType === "non_technical" && <span className="ml-auto text-amber-600 text-xs font-bold bg-amber-100 px-2 py-0.5 rounded-full">Selected</span>}
                      </div>
                      <p className="text-xs text-gray-500">Sales, Travel, HR, Ops, Marketing, Finance</p>
                      <p className="text-xs text-gray-400 mt-0.5">CV: Experience relevance 60% + Stability 40%</p>
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Required Skills</label>
                  <div className="flex gap-2 mb-2">
                    <input value={skillInput} onChange={e => setSkillInput(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && addSkill(skillInput)}
                      placeholder="Type skill and press Enter..."
                      className="flex-1 border border-gray-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
                    <button onClick={() => addSkill(skillInput)} className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-semibold">Add</button>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {SKILL_SUGGESTIONS.filter(s => !newJob.requiredSkills.includes(s)).slice(0, 10).map(s => (
                      <button key={s} onClick={() => addSkill(s)}
                        className="text-xs bg-white border border-gray-200 text-gray-600 px-2.5 py-1 rounded-full hover:border-blue-400 hover:text-blue-600 transition-colors">
                        + {s}
                      </button>
                    ))}
                  </div>
                  {newJob.requiredSkills.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {newJob.requiredSkills.map(s => (
                        <span key={s} className="bg-blue-100 text-blue-700 text-xs font-medium px-3 py-1 rounded-full flex items-center gap-1.5">
                          {s}<button onClick={() => removeSkill(s)} className="text-blue-400 hover:text-red-500 font-bold">×</button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowModal(false)} className="flex-1 border border-gray-200 py-2.5 rounded-xl font-semibold text-gray-600 hover:bg-gray-50 transition-all">Cancel</button>
              <button onClick={createJob} disabled={creating} className="flex-1 bg-blue-600 text-white py-2.5 rounded-xl font-semibold hover:bg-blue-700 transition-all disabled:opacity-60">
                {creating ? "Creating..." : "Create Job"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
