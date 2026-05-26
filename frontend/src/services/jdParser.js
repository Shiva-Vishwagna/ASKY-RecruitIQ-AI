const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

export async function parseResumeWithAI(file) {
  const formData = new FormData();
  formData.append("resume", file);

  const response = await fetch(`${API_URL}/jd/parse-resume`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.message || "Resume parsing failed.");
  }

  const data = await response.json();
  return data.skillMap;
}
