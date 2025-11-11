// src/api/committee.js

const BASE = "/.netlify/functions/committee";

// Get all committees
export async function getCommittees() {
  const res = await fetch(BASE);
  if (!res.ok) throw new Error(`Failed to load committees: ${res.status}`);
  return res.json(); // -> [{ id, name, createdAt }]
}

// Get one committee
export async function getCommittee(id) {
  const res = await fetch(`${BASE}?id=${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error(`Failed to load committee ${id}: ${res.status}`);
  return res.json(); // -> { id, name, createdAt }
}

// Create a new committee (name only)
export async function createCommittee(payload) {
  const res = await fetch(BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Failed to create committee: ${res.status}`);
  }
  return res.json(); // -> { id, name, createdAt }
}

// Delete a committee
export async function deleteCommittee(id) {
  const res = await fetch(`${BASE}?id=${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Failed to delete committee: ${res.status}`);
  }
  return res.json(); // -> { message: string }
}
