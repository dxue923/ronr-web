const DISCUSSION_ENDPOINT = "/.netlify/functions/discussion";

// shared fetch helper
async function callDiscussion(endpoint = "", options = {}) {
  const res = await fetch(`${DISCUSSION_ENDPOINT}${endpoint}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    let msg = `Discussion API error: ${res.status}`;
    try {
      const body = await res.json();
      if (body?.error) msg += ` – ${body.error}`;
    } catch {}
    throw new Error(msg);
  }
  return res.json();
}

export async function fetchComments({ motionId, id } = {}) {
  let query = "";
  if (motionId) query = `?motionId=${encodeURIComponent(motionId)}`;
  else if (id) query = `?id=${encodeURIComponent(id)}`;

  return callDiscussion(query, { method: "GET" });
}

export async function createComment({
  motionId,
  author,
  text,
  stance,
  avatarUrl,
}) {
  return callDiscussion("", {
    method: "POST",
    body: JSON.stringify({ motionId, author, text, stance, avatarUrl }),
  });
}

export default { fetchComments, createComment };
