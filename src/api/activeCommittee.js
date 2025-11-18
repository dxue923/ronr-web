// src/api/activeCommittee.js

const BASE_URL = "/.netlify/functions/activeCommittee";

// Get the current activeCommitteeId (and committee object)
export async function getActiveCommittee() {
  const res = await fetch(BASE_URL, {
    method: "GET",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Failed to get active committee: ${res.status}`);
  return res.json();
}

// Set activeCommitteeId to the given committee ID
export async function setActiveCommittee(id) {
  if (!id) throw new Error("Committee ID is required");
  const res = await fetch(BASE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ id }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok)
    throw new Error(
      body.error || `Failed to set active committee: ${res.status}`
    );
  return body;
}

// Default export for convenience
export default { getActiveCommittee, setActiveCommittee };
