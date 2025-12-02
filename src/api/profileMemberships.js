const BASE = "/.netlify/functions/profileMemberships";

export async function fetchMemberships(token) {
  const headers = { Accept: "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(BASE, { method: "GET", headers });
  const data = await res.json().catch(() => []);
  if (!res.ok) throw new Error(data.error || `Failed: ${res.status}`);
  return Array.isArray(data) ? data : [];
}

export async function joinCommittee(committeeId, role = "member", token) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(BASE, {
    method: "POST",
    headers,
    body: JSON.stringify({ committeeId, role }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok)
    throw new Error(data.error || `Membership join failed: ${res.status}`);
  return data;
}

export async function leaveCommittee(committeeId, token) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const url = `${BASE}?committeeId=${encodeURIComponent(committeeId)}`;
  const res = await fetch(url, { method: "DELETE", headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok)
    throw new Error(data.error || `Membership leave failed: ${res.status}`);
  return data;
}

export default { fetchMemberships, joinCommittee, leaveCommittee };
