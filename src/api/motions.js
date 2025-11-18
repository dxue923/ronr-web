// src/api/motions.js
// Frontend helper for the motions Netlify function

const BASE_URL = "/.netlify/functions/motions";

// GET all motions, optionally filtered by committeeId
export async function fetchMotions(committeeId) {
  const url = new URL(BASE_URL, window.location.origin);
  if (committeeId) url.searchParams.set("committeeId", committeeId);

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Failed to load motions: ${res.status}`);
  return res.json();
}

// GET a single motion by id
export async function fetchMotion(id) {
  if (!id) throw new Error("Motion id is required");

  const url = new URL(BASE_URL, window.location.origin);
  url.searchParams.set("id", id);

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    if (res.status === 404) throw new Error("Motion not found");
    throw new Error(`Failed to load motion: ${res.status}`);
  }
  return res.json();
}

// POST a new motion
export async function createMotion({ title, description = "", committeeId }) {
  if (!title || !title.trim()) throw new Error("Motion title is required");

  const payload = {
    title: title.trim(),
    description: description.trim(),
  };
  if (committeeId) payload.committeeId = committeeId;

  const res = await fetch(BASE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    let message = `Failed to create motion: ${res.status}`;
    try {
      const parsed = JSON.parse(errBody);
      if (parsed && parsed.error) message = parsed.error;
    } catch {
      // ignore parse errors
    }
    throw new Error(message);
  }

  return res.json();
}

// PATCH: update motion status
export async function updateMotionStatus(id, status) {
  if (!id) throw new Error("Motion id is required");
  if (!status) throw new Error("Status is required");

  const res = await fetch(BASE_URL, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ id, status }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      data.error || `Failed to update motion status: ${res.status}`
    );
  }
  return data; // updated motion
}

// PATCH: cast a vote on a motion
export async function castMotionVote(id, vote) {
  if (!id) throw new Error("Motion id is required");
  if (!vote) throw new Error("Vote is required");
  const normalizedVote = String(vote).toLowerCase();

  const res = await fetch(BASE_URL, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ id, vote: normalizedVote }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Failed to cast vote: ${res.status}`);
  }
  return data; // updated motion
}

// Optional default export
const motionsApi = {
  fetchMotions,
  fetchMotion,
  createMotion,
  updateMotionStatus,
  castMotionVote,
};

export default motionsApi;
