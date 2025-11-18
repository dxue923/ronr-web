// src/api/committeeMembers.js

const BASE_URL = "/.netlify/functions/committeeMembers";

// Get all members (optional filters: committeeId, userId)
export async function fetchMembers({ committeeId, userId } = {}) {
  const url = new URL(BASE_URL, window.location.origin);
  if (committeeId) url.searchParams.set("committeeId", committeeId);
  if (userId) url.searchParams.set("userId", userId);

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: { Accept: "application/json" },
  });
  if (!res.ok)
    throw new Error(`Failed to load committee members: ${res.status}`);
  return res.json();
}

// Get a single member by id
export async function fetchMember(id) {
  if (!id) throw new Error("Member id is required");
  const url = new URL(BASE_URL, window.location.origin);
  url.searchParams.set("id", id);

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Failed to load member: ${res.status}`);
  return res.json();
}

// Add a new committee member
export async function createMember({ userId, name, role, committeeId }) {
  if (!userId || !role || !committeeId)
    throw new Error("userId, role, and committeeId are required");

  const body = JSON.stringify({
    userId: String(userId).trim(),
    name: String(name || "").trim(),
    role: String(role).trim(),
    committeeId: String(committeeId).trim(),
  });

  const res = await fetch(BASE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok)
    throw new Error(data.error || `Failed to create member: ${res.status}`);
  return data;
}

// Delete a committee member by id
export async function deleteMember(id) {
  if (!id) throw new Error("Member id is required");
  const url = new URL(BASE_URL, window.location.origin);
  url.searchParams.set("id", id);

  const res = await fetch(url.toString(), {
    method: "DELETE",
    headers: { Accept: "application/json" },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok)
    throw new Error(data.error || `Failed to delete member: ${res.status}`);
  return data; // { deletedId }
}

// Convenience default export
export default {
  fetchMembers,
  fetchMember,
  createMember,
  deleteMember,
};
