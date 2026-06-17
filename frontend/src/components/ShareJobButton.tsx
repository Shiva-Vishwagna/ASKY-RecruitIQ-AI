import { useState } from "react";

interface Props {
  jobId: string;
  jobTitle: string;
  department?: string;
  location?: string;
}

export default function ShareJobButton({ jobId, jobTitle, department, location }: Props) {
  const [open, setOpen]     = useState(false);
  const [copied, setCopied] = useState(false);

  const applyLink = `${window.location.origin}/apply/${jobId}`;

  const message = `Hi! We have an exciting opportunity for you.\n\n🚀 *${jobTitle}*\n🏢 ${department || ""} ${location ? "· " + location : ""}\n\nApply here (takes 2 mins): ${applyLink}`;

  function copyLink() {
    navigator.clipboard.writeText(applyLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function shareWhatsApp() {
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, "_blank");
    setOpen(false);
  }

  function shareEmail() {
    const subject = encodeURIComponent(`Job Opportunity: ${jobTitle}`);
    const body    = encodeURIComponent(`Hi,\n\nWe have an exciting opportunity that matches your profile.\n\nRole: ${jobTitle}\nDepartment: ${department || "—"}\nLocation: ${location || "Remote"}\n\nClick the link below to apply (takes just 2 minutes):\n${applyLink}\n\nLooking forward to your application!\n\nBest regards,\nRecruitment Team`);
    window.open(`mailto:?subject=${subject}&body=${body}`, "_blank");
    setOpen(false);
  }

  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)}
        className="flex items-center gap-2 bg-white border border-gray-200 text-gray-700 px-4 py-2.5 rounded-xl font-semibold hover:bg-gray-50 transition-all text-sm shadow-sm">
        📤 Share JD
        <span className="text-gray-400 text-xs">▾</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-12 z-50 bg-white rounded-2xl shadow-2xl border border-gray-100 p-4 w-72">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">Share this Job</p>

            {/* Apply Link Preview */}
            <div className="bg-gray-50 rounded-xl p-3 mb-3 border border-gray-100">
              <p className="text-xs text-gray-400 mb-1 font-medium">Candidate Apply Link</p>
              <p className="text-xs text-blue-600 font-mono break-all leading-relaxed">{applyLink}</p>
            </div>

            {/* Share Options */}
            <div className="space-y-2">
              <button onClick={copyLink}
                className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left ${copied ? "border-emerald-300 bg-emerald-50" : "border-gray-100 hover:bg-gray-50"}`}>
                <span className="text-xl">{copied ? "✅" : "📋"}</span>
                <div>
                  <div className="text-sm font-semibold text-gray-800">{copied ? "Copied!" : "Copy Link"}</div>
                  <div className="text-xs text-gray-400">Share anywhere</div>
                </div>
              </button>

              <button onClick={shareWhatsApp}
                className="w-full flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:bg-green-50 hover:border-green-200 transition-all text-left">
                <span className="text-xl">💬</span>
                <div>
                  <div className="text-sm font-semibold text-gray-800">Share on WhatsApp</div>
                  <div className="text-xs text-gray-400">Opens WhatsApp with pre-filled message</div>
                </div>
              </button>

              <button onClick={shareEmail}
                className="w-full flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:bg-blue-50 hover:border-blue-200 transition-all text-left">
                <span className="text-xl">📧</span>
                <div>
                  <div className="text-sm font-semibold text-gray-800">Share via Email</div>
                  <div className="text-xs text-gray-400">Opens email with job details</div>
                </div>
              </button>
            </div>

            <div className="mt-3 pt-3 border-t border-gray-100">
              <p className="text-xs text-gray-400 text-center">Candidates apply directly — no login needed</p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
