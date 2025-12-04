// src/api/motions.js
// Frontend helper for the motions Netlify function

const BASE_URL = "/.netlify/functions/motions";
// Retrieve auth token from localStorage if available
function getAuthToken() {
  try {
    return localStorage.getItem("authToken") || null;
  } catch {
    return null;
  }
}

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
export async function createMotion({
  title,
  description = "",
  committeeId,
  type,
  parentMotionId,
  meta,
  createdBy,
  createdById,
  createdByName,
  createdByUsername,
}) {
  if (!title || !title.trim()) throw new Error("Motion title is required");

  const payload = {
    title: title.trim(),
    description: description.trim(),
  };
  if (committeeId) payload.committeeId = committeeId;
  if (type) payload.type = type;
  if (parentMotionId) payload.parentMotionId = parentMotionId;
  if (meta && typeof meta === "object") payload.meta = meta;
  // Optional creator metadata pass-through
  if (createdBy && typeof createdBy === "object") payload.createdBy = createdBy;
  if (createdById) payload.createdById = createdById;
  if (createdByName) payload.createdByName = createdByName;
  if (createdByUsername) payload.createdByUsername = createdByUsername;

  const res = await fetch(BASE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(getAuthToken() ? { Authorization: `Bearer ${getAuthToken()}` } : {}),
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
      ...(getAuthToken() ? { Authorization: `Bearer ${getAuthToken()}` } : {}),
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
export async function castMotionVote(id, vote, voterId) {
  if (!id) throw new Error("Motion id is required");
  if (!vote) throw new Error("Vote is required");
  const normalizedVote = String(vote).toLowerCase();

  const res = await fetch(BASE_URL, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(getAuthToken() ? { Authorization: `Bearer ${getAuthToken()}` } : {}),
    },
    body: JSON.stringify({ id, vote: normalizedVote, voterId }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Failed to cast vote: ${res.status}`);
  }
  return data; // updated motion
}

// PATCH: save decision details and/or meta updates
export async function updateMotion(id, { status, decisionDetails, meta } = {}) {
  if (!id) throw new Error("Motion id is required");
  const body = { id };
  if (status) body.status = status;
  if (decisionDetails) body.decisionDetails = decisionDetails;
  if (meta) body.meta = meta;

  const res = await fetch(BASE_URL, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(getAuthToken() ? { Authorization: `Bearer ${getAuthToken()}` } : {}),
    },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Failed to update motion: ${res.status}`);
  }
  return data;
}

// Optional default export
const motionsApi = {
  fetchMotions,
  fetchMotion,
  createMotion,
  updateMotionStatus,
  castMotionVote,
  updateMotion,
};

export default motionsApi;
