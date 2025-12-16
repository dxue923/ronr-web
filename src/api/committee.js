// src/api/committee.js

const BASE = "/.netlify/functions/committee";

function getAuthHeader() {
  try {
    const token = localStorage.getItem("authToken");
    if (token) return { Authorization: `Bearer ${token}` };
  } catch {}
  return {};
}

// Get all committees (optionally filtered by current user as member)
export async function getCommittees(memberOverride) {
  let member = "";
  try {
    const activeEmail = localStorage.getItem("activeProfileEmail") || "";
    const key = activeEmail ? `profileData:${activeEmail}` : "profileData";
    const p = JSON.parse(localStorage.getItem(key) || "{}");
    const emailLocal = (p.email || activeEmail || "").split("@")[0] || "";
    member = (p.username || emailLocal || p.name || "").toString().trim();
  } catch {
    // if profile isn't in localStorage, just fetch all committees
  }
  // Prefer explicit override when provided (e.g., from Auth0 user email)
  if (typeof memberOverride === "string" && memberOverride.trim()) {
    member = memberOverride.trim();
  }

  const qs = member ? `?member=${encodeURIComponent(member)}` : "";
  const res = await fetch(`${BASE}${qs}`, {
    cache: "no-store",
    headers: {
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
      ...getAuthHeader(),
    },
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
    headers: {
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
      ...getAuthHeader(),
    },
  });
  if (!res.ok) throw new Error(`Failed to load committee ${id}: ${res.status}`);
  return res.json(); // -> { id, name, createdAt, ... }
}

// Create full committee (id?, name, ownerId, members[], settings?)
// Create a committee. If `token` is provided it will be used for Authorization.
export async function createCommittee(payload, token = null) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  else Object.assign(headers, getAuthHeader());

  const res = await fetch(BASE, {
    method: "POST",
    headers,
    body: JSON.stringify({
      ...payload,
      createdAt: payload.createdAt || new Date().toISOString(),
    }),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    // Capture details to help diagnose 401/403 in the browser
    try {
      const text = await res.text().catch(() => null);
      const err = {
        url: BASE,
        method: "POST",
        status: res.status,
        statusText: res.statusText,
        responseBody: text || data || null,
        timestamp: new Date().toISOString(),
      };
      try {
        localStorage.setItem("lastApiError", JSON.stringify(err));
      } catch {}
      // eslint-disable-next-line no-console
      console.error("API createCommittee failed", err);
    } catch (e) {}
    throw new Error(data?.error || `Failed to create committee: ${res.status}`);
  }

  return data;
}

// Update (PATCH) committee (by id in query or body)
// Update a committee. If `token` is provided it will be used for Authorization.
export async function updateCommittee(id, updates, token = null) {
  const url = id ? `${BASE}?id=${encodeURIComponent(id)}` : BASE;
  const headers = {
    "Content-Type": "application/json",
    "X-HTTP-Method-Override": "PATCH",
    "Cache-Control": "no-cache",
    Pragma: "no-cache",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  else Object.assign(headers, getAuthHeader());

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ _method: "PATCH", id, ...updates }),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    try {
      const text = await res.text().catch(() => null);
      const err = {
        url: url,
        method: "PATCH",
        status: res.status,
        statusText: res.statusText,
        responseBody: text || data || null,
        timestamp: new Date().toISOString(),
      };
      try {
        localStorage.setItem("lastApiError", JSON.stringify(err));
      } catch {}
      // eslint-disable-next-line no-console
      console.error("API updateCommittee failed", err);
    } catch (e) {}
    throw new Error("Failed to update committee");
  }
  return data;
}

// Delete a committee
export async function deleteCommittee(id) {
  const res = await fetch(`${BASE}?id=${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: {
      ...getAuthHeader(),
    },
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error("Failed to delete committee");
  }
  return data; // -> { message, deletedMotions, deletedDiscussions }
}
