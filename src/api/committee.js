// src/api/committee.js

const BASE = "/.netlify/functions/committee";

// Get all committees (optionally filtered by current user as member)
export async function getCommittees() {
  let member = "";
  try {
    const activeEmail = localStorage.getItem("activeProfileEmail") || "";
    const key = activeEmail ? `profileData:${activeEmail}` : "profileData";
    const p = JSON.parse(localStorage.getItem(key) || "{}");
    member = (p.username || p.name || "").toString().trim();
  } catch {
    // if profile isn't in localStorage, just fetch all committees
  }

  const qs = member ? `?member=${encodeURIComponent(member)}` : "";
  const res = await fetch(`${BASE}${qs}`, {
    cache: "no-store",
    headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
  });

  if (!res.ok) {
    throw new Error(`Failed to load committees: ${res.status}`);
  }

  const data = await res.json().catch(() => []);
  return Array.isArray(data) ? data : [];
}

// Get one committee
export async function getCommittee(id) {
  const url = `${BASE}?id=${encodeURIComponent(id)}`;
  const res = await fetch(url, {
    cache: "no-store",
    headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
  });
  if (!res.ok) throw new Error(`Failed to load committee ${id}: ${res.status}`);
  return res.json(); // -> { id, name, createdAt, ... }
}

// Create full committee (id?, name, ownerId, members[], settings?)
export async function createCommittee(payload) {
  const res = await fetch(BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...payload,
      createdAt: payload.createdAt || new Date().toISOString(),
    }),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.error || `Failed to create committee: ${res.status}`);
  }

  return data;
}

// Update (PATCH) committee (by id in query or body)
export async function updateCommittee(id, updates) {
  const url = id ? `${BASE}?id=${encodeURIComponent(id)}` : BASE;

  const res = await fetch(url, {
    // Using POST + override to match backend behavior
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-HTTP-Method-Override": "PATCH",
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
    },
    body: JSON.stringify({ _method: "PATCH", id, ...updates }),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error("Failed to update committee");
  }
  return data;
}

// Delete a committee
export async function deleteCommittee(id) {
  const res = await fetch(`${BASE}?id=${encodeURIComponent(id)}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-HTTP-Method-Override": "DELETE",
    },
    body: JSON.stringify({ _method: "DELETE" }),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error("Failed to delete committee");
  }
  return data; // -> { message, deletedMotions, deletedDiscussions }
}
