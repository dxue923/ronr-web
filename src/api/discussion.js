// src/api/Discussion.js

const DISCUSSION_ENDPOINT = "/.netlify/functions/discussion"; // base function URL

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

// get all comments, or all for a motion
export async function getCommentsForMotion(motionId) {
  const q = motionId ? `?motionId=${encodeURIComponent(motionId)}` : "";
  return callDiscussion(q, { method: "GET" });
}

// get a single comment by id
export async function getCommentById(commentId) {
  return callDiscussion(`?id=${encodeURIComponent(commentId)}`, {
    method: "GET",
  });
}

// create a new comment
export async function createComment({ motionId, authorId, text, position }) {
  return callDiscussion("", {
    method: "POST",
    body: JSON.stringify({
      motionId,
      authorId,
      text,
      position,
    }),
  });
}
