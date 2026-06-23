import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

const API = 'https://asky-recruitiq-ai.onrender.com/api';

const STAGES: Record<string, string> = {
  cv_uploaded: 'CV Uploaded',
  ai_screened: 'AI Screened',
  questions_sent: 'Questions Sent',
  answers_submitted: 'Answers Submitted',
  hm_ready: 'HM Ready',
  rejected: 'Rejected',
};

interface Message {
  role: 'user' | 'bot';
  text: string;
  links?: { label: string; path: string }[];
}

function getDaysInStage(c: any): number {
  const date = new Date(c.updatedAt || c.createdAt || c.appliedAt || 0);
  return Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
}

// ── Smart answer engine ───────────────────────────────────────
function answerQuery(
  query: string,
  candidates: any[],
  jobs: any[]
): { text: string; links?: { label: string; path: string }[] } {
  const q = query.toLowerCase();

  // ── Navigation shortcuts ──────────────────────────────────
  if (q.includes('go to dashboard') || q === 'dashboard')
    return { text: '📊 Taking you to Dashboard!', links: [{ label: 'Go to Dashboard', path: '/dashboard' }] };
  if (q.includes('go to jobs') || q === 'jobs')
    return { text: '💼 Taking you to Jobs!', links: [{ label: 'Go to Jobs', path: '/jobs' }] };
  if (q.includes('go to candidates') || q === 'candidates')
    return { text: '👥 Taking you to Candidates!', links: [{ label: 'Go to Candidates', path: '/candidates' }] };
  if (q.includes('go to pipeline') || q.includes('pipeline view'))
    return { text: '🎯 Taking you to Pipeline View!', links: [{ label: 'Go to Pipeline', path: '/pipeline' }] };
  if (q.includes('go to analytics') || q === 'analytics')
    return { text: '📈 Taking you to Analytics!', links: [{ label: 'Go to Analytics', path: '/analytics' }] };

  // ── Today's attention / summary ───────────────────────────
  if (q.includes('attention') || q.includes('today') || q.includes('summary') || q.includes('what needs')) {
    const stuck = candidates.filter(c => getDaysInStage(c) >= 5 && c.status !== 'rejected' && c.status !== 'hm_ready');
    const pending = candidates.filter(c => c.status === 'answers_submitted');
    const hmReady = candidates.filter(c => c.status === 'hm_ready');
    const lines = [];
    if (stuck.length)   lines.push(`🔴 ${stuck.length} candidate(s) stuck 5+ days`);
    if (pending.length) lines.push(`🟡 ${pending.length} candidate(s) submitted answers — waiting for review`);
    if (hmReady.length) lines.push(`🟢 ${hmReady.length} candidate(s) ready for HM interview`);
    if (!lines.length)  lines.push('✅ All caught up! No urgent actions needed.');
    return { text: "Here's what needs your attention:\n\n" + lines.join('\n'), links: [{ label: 'View Candidates', path: '/candidates' }] };
  }

  // ── Stuck candidates ──────────────────────────────────────
  if (q.includes('stuck') || q.includes('not moving') || q.includes('pending')) {
    const stuck = candidates.filter(c => getDaysInStage(c) >= 5 && c.status !== 'rejected' && c.status !== 'hm_ready');
    if (!stuck.length) return { text: '✅ No candidates are stuck right now. All pipelines are moving!' };
    const list = stuck.slice(0, 5).map(c => `• ${c.name} — ${getDaysInStage(c)} days in ${STAGES[c.status || 'cv_uploaded'] || c.status}`).join('\n');
    return {
      text: `⚠️ ${stuck.length} candidate(s) stuck 5+ days:\n\n${list}${stuck.length > 5 ? `\n...and ${stuck.length - 5} more` : ''}`,
      links: [{ label: 'View Stuck Candidates', path: '/candidates' }]
    };
  }

  // ── HM Ready ─────────────────────────────────────────────
  if (q.includes('hm ready') || q.includes('hm-ready') || q.includes('hiring manager')) {
    const hm = candidates.filter(c => c.status === 'hm_ready');
    if (!hm.length) return { text: '📋 No candidates are HM Ready yet.' };
    const list = hm.slice(0, 5).map(c => `• ${c.name} — ${c.jobTitle || c.appliedFor || '—'} (Score: ${c.aiScore || c.score || 0})`).join('\n');
    return {
      text: `🎯 ${hm.length} candidate(s) are HM Ready:\n\n${list}`,
      links: [{ label: 'View HM Ready', path: '/candidates' }]
    };
  }

  // ── High scorers ──────────────────────────────────────────
  if (q.includes('high score') || q.includes('top candidate') || q.includes('best candidate') || q.includes('score above') || q.includes('scored above') || q.match(/score\s*(above|over|>\s*)\d+/)) {
    const match = q.match(/\d+/);
    const threshold = match ? parseInt(match[0]) : 80;
    const top = candidates.filter(c => (c.aiScore || c.score || 0) >= threshold)
      .sort((a, b) => (b.aiScore || b.score || 0) - (a.aiScore || a.score || 0))
      .slice(0, 5);
    if (!top.length) return { text: `📊 No candidates scored above ${threshold} yet.` };
    const list = top.map(c => `• ${c.name} — ${c.aiScore || c.score || 0}/100 (${c.jobTitle || c.appliedFor || '—'})`).join('\n');
    return { text: `🌟 Top candidates scoring ${threshold}+:\n\n${list}`, links: [{ label: 'View Candidates', path: '/candidates' }] };
  }

  // ── Answers submitted ─────────────────────────────────────
  if (q.includes('answer') || q.includes('submitted')) {
    const ans = candidates.filter(c => c.status === 'answers_submitted');
    if (!ans.length) return { text: '📋 No candidates have submitted answers yet.' };
    const list = ans.map(c => `• ${c.name} — ${c.jobTitle || c.appliedFor || '—'}`).join('\n');
    return {
      text: `📝 ${ans.length} candidate(s) submitted answers waiting for review:\n\n${list}`,
      links: [{ label: 'Review Now', path: '/candidates' }]
    };
  }

  // ── Candidates for a specific role ────────────────────────
  if (q.includes('for') || q.includes('role') || q.includes('job')) {
    const job = jobs.find(j => q.includes(j.title?.toLowerCase()));
    if (job) {
      const roleCandidates = candidates.filter(c =>
        (c.jobTitle || c.appliedFor || '').toLowerCase() === job.title.toLowerCase()
      );
      const stageSummary = Object.entries(STAGES)
        .map(([val, label]) => {
          const count = roleCandidates.filter(c => (c.status || 'cv_uploaded') === val).length;
          return count > 0 ? `${label}: ${count}` : null;
        })
        .filter(Boolean).join(', ');
      return {
        text: `💼 ${job.title} has ${roleCandidates.length} candidate(s).\n\nStage breakdown: ${stageSummary || 'None yet'}`,
        links: [{ label: `Open ${job.title} Pipeline`, path: `/jobs/${job._id}` }]
      };
    }
  }

  // ── Total counts ──────────────────────────────────────────
  if (q.includes('how many candidate') || q.includes('total candidate')) {
    return { text: `👥 You have ${candidates.length} total candidates across all roles.`, links: [{ label: 'View All', path: '/candidates' }] };
  }

  if (q.includes('how many job') || q.includes('total job') || q.includes('how many role') || q.includes('open role')) {
    const open = jobs.filter(j => j.status === 'open').length;
    return { text: `💼 You have ${jobs.length} total jobs, ${open} currently open.`, links: [{ label: 'View Jobs', path: '/jobs' }] };
  }

  // ── Rejected candidates ───────────────────────────────────
  if (q.includes('rejected') || q.includes('not fit')) {
    const rej = candidates.filter(c => c.status === 'rejected');
    return { text: `❌ ${rej.length} candidate(s) have been rejected so far.` };
  }

  // ── Average score ─────────────────────────────────────────
  if (q.includes('average score') || q.includes('avg score')) {
    const scores = candidates.map(c => c.aiScore || c.score || 0).filter(s => s > 0);
    const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
    return { text: `🎯 Average AI score across all candidates is ${avg}/100.` };
  }

  // ── A-Tier candidates ─────────────────────────────────────
  if (q.includes('a-tier') || q.includes('a tier') || q.includes('tier a')) {
    const aTier = candidates.filter(c => c.tier?.includes('A'));
    return {
      text: `⭐ You have ${aTier.length} A-Tier candidates.`,
      links: [{ label: 'View Candidates', path: '/candidates' }]
    };
  }

  // ── Questions sent ────────────────────────────────────────
  if (q.includes('question') || q.includes('screening')) {
    const qs = candidates.filter(c => c.status === 'questions_sent');
    return {
      text: `📨 ${qs.length} candidate(s) have been sent screening questions and haven't responded yet.`,
      links: [{ label: 'View Candidates', path: '/candidates' }]
    };
  }

  // ── Help ──────────────────────────────────────────────────
  if (q.includes('help') || q.includes('what can you') || q.includes('commands')) {
    return {
      text: `🤖 Here's what I can help with:\n\n• "What needs my attention today?"\n• "Show stuck candidates"\n• "Who is HM ready?"\n• "Candidates for Travel role"\n• "Top candidates scoring above 80"\n• "How many candidates total?"\n• "Show answers submitted"\n• "Average score"\n• "How many jobs are open?"\n• "Go to Pipeline View"\n• "Go to Dashboard"`
    };
  }

  // ── Fallback ──────────────────────────────────────────────
  return {
    text: `🤔 I'm not sure about that. Try asking:\n• "What needs attention today?"\n• "Show stuck candidates"\n• "Who is HM ready?"\n\nOr type "help" to see all commands.`
  };
}

// ── Quick suggestion chips ────────────────────────────────────
const SUGGESTIONS = [
  "What needs attention today?",
  "Show stuck candidates",
  "Who is HM ready?",
  "Top candidates scoring above 80",
  "How many jobs are open?",
  "Show answers submitted",
];

export default function RecruiterBot() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { role: 'bot', text: "👋 Hi! I'm your Recruiter Assistant. Ask me anything about your candidates, jobs, or pipeline!\n\nTry: \"What needs my attention today?\"" }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [candidates, setCandidates] = useState<any[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [dataLoaded, setDataLoaded] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const token = localStorage.getItem('token');

  useEffect(() => {
    if (open && !dataLoaded) loadData();
  }, [open]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100);
  }, [open]);

  async function loadData() {
    try {
      const [cRes, jRes] = await Promise.all([
        fetch(`${API}/candidates`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API}/jobs`,       { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      const cData = await cRes.json();
      const jData = await jRes.json();
      setCandidates(cData.candidates || cData || []);
      setJobs(jData.jobs || jData || []);
      setDataLoaded(true);
    } catch {
      setDataLoaded(true);
    }
  }

  async function sendMessage(text?: string) {
    const msg = (text || input).trim();
    if (!msg) return;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: msg }]);
    setLoading(true);

    // Reload data on each message for freshness
    let freshCandidates = candidates;
    let freshJobs = jobs;
    if (!dataLoaded) {
      try {
        const [cRes, jRes] = await Promise.all([
          fetch(`${API}/candidates`, { headers: { Authorization: `Bearer ${token}` } }),
          fetch(`${API}/jobs`,       { headers: { Authorization: `Bearer ${token}` } }),
        ]);
        const cData = await cRes.json();
        const jData = await jRes.json();
        freshCandidates = cData.candidates || cData || [];
        freshJobs = jData.jobs || jData || [];
        setCandidates(freshCandidates);
        setJobs(freshJobs);
        setDataLoaded(true);
      } catch {}
    }

    // Small delay for UX
    await new Promise(r => setTimeout(r, 400));

    const answer = answerQuery(msg, freshCandidates, freshJobs);
    setMessages(prev => [...prev, { role: 'bot', text: answer.text, links: answer.links }]);
    setLoading(false);
  }

  function handleLink(path: string) {
    navigate(path);
    setOpen(false);
  }

  return (
    <>
      {/* Floating Button */}
      <button
        onClick={() => setOpen(!open)}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-2xl flex items-center justify-center text-2xl transition-all hover:scale-110 active:scale-95"
        title="Recruiter Assistant">
        {open ? '✕' : '🤖'}
      </button>

      {/* Chat Window */}
      {open && (
        <div className="fixed bottom-24 right-6 z-50 w-96 max-h-[600px] bg-white rounded-2xl shadow-2xl border border-gray-100 flex flex-col overflow-hidden">

          {/* Header */}
          <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-4 py-3 flex items-center gap-3">
            <div className="w-9 h-9 bg-white/20 rounded-full flex items-center justify-center text-xl">🤖</div>
            <div className="flex-1">
              <div className="text-white font-bold text-sm">Recruiter Assistant</div>
              <div className="text-blue-200 text-xs">Powered by your live data</div>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
              <span className="text-blue-200 text-xs">Live</span>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 max-h-80">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] ${msg.role === 'user'
                  ? 'bg-blue-600 text-white rounded-2xl rounded-br-sm px-4 py-2.5 text-sm'
                  : 'bg-gray-50 border border-gray-100 text-gray-800 rounded-2xl rounded-bl-sm px-4 py-2.5 text-sm'}`}>
                  <p className="whitespace-pre-wrap leading-relaxed">{msg.text}</p>
                  {msg.links && msg.links.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {msg.links.map((link, li) => (
                        <button key={li} onClick={() => handleLink(link.path)}
                          className="text-xs bg-blue-600 text-white px-3 py-1 rounded-full hover:bg-blue-700 transition-all font-semibold">
                          {link.label} →
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-gray-50 border border-gray-100 rounded-2xl rounded-bl-sm px-4 py-3">
                  <div className="flex gap-1">
                    <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Suggestion Chips */}
          {messages.length <= 2 && (
            <div className="px-4 pb-2">
              <p className="text-xs text-gray-400 mb-2 font-medium">Quick questions:</p>
              <div className="flex flex-wrap gap-1.5">
                {SUGGESTIONS.slice(0, 4).map((s, i) => (
                  <button key={i} onClick={() => sendMessage(s)}
                    className="text-xs bg-blue-50 text-blue-600 border border-blue-100 px-3 py-1.5 rounded-full hover:bg-blue-100 transition-all font-medium">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Input */}
          <div className="p-3 border-t border-gray-100 bg-gray-50">
            <div className="flex gap-2">
              <input
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                placeholder="Ask anything about your pipeline..."
                className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              />
              <button onClick={() => sendMessage()} disabled={!input.trim() || loading}
                className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-blue-700 transition-all disabled:opacity-50">
                ↑
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-1.5 text-center">Type "help" to see all commands</p>
          </div>
        </div>
      )}
    </>
  );
}
