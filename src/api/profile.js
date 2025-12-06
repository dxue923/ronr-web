const BASE_URL = "/.netlify/functions/profile";

export async function fetchProfile(idToken) {
  const res = await fetch(BASE_URL, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${idToken}`,
    },
  });

  const data = await res.json().catch(() => null);
  // If the request returned 404, treat as "not found" and return null so
  // callers can gracefully fall back to cached/local data without throwing.
  if (res.status === 404) return null;

  if (!res.ok || !data || !data.email) {
    // Fallback: try to fetch by email/username from database
    let lookup = null;
    try {
      // Try to decode token for email/username
      const base64 = idToken.split(".")[1];
      const claims = JSON.parse(atob(base64));
      lookup = claims.email || claims.nickname || claims.sub;
    } catch {}
    if (lookup) {
      try {
        const qs = `?lookup=${encodeURIComponent(lookup)}`;
        const fallbackRes = await fetch(`${BASE}${qs}`, {
          method: "GET",
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${idToken}`,
          },
        });
        // If fallback lookup returns 404, return null (not an error)
        if (fallbackRes.status === 404) return null;
        const fallbackData = await fallbackRes.json().catch(() => null);
        if (fallbackRes.ok && fallbackData) {
          return fallbackData;
        }
      } catch {}
    }
    return null;
  }
  return data;
}

export async function updateProfile(idToken, updates) {
  const res = await fetch(BASE_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify(updates),
  });

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    throw new Error(data?.message || data?.error || "Failed to update profile");
  }
  return data;
}

// Lookup a profile by username (case-insensitive). Returns null if not found.
export async function findProfileByUsername(username) {
  const qs = `?lookup=${encodeURIComponent(username)}`;
  // Accept an optional accessToken argument for authenticated lookups
  return async function (accessToken) {
    const headers = { Accept: "application/json" };
    if (accessToken) {
      headers["Authorization"] = `Bearer ${accessToken}`;
    }
    const res = await fetch(`${BASE_URL}${qs}`, {
      method: "GET",
      headers,
    });
    if (res.status === 404) return null;
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(
        data?.message || data?.error || "Failed to lookup profile"
      );
    }
    return data;
  };
}

// Lightweight local cache helpers used by the UI to speed up initial render.
// These are intentionally simple and resilient — they swallow storage
// errors and return null when unavailable.
export function loadProfileFromStorage(email) {
  if (!email) return null;
  try {
    const key = `profile:${email}`;
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

export function saveProfileToStorage(email, profile) {
  if (!email || !profile) return;
  try {
    const key = `profile:${email}`;
    // store a lightweight snapshot only
    const snapshot = {
      name: profile.name || "",
      username: profile.username || "",
      email: profile.email || email,
      avatarUrl: profile.avatarUrl || null,
    };
    localStorage.setItem(key, JSON.stringify(snapshot));
    // Also write a generic `profileData` entry so other code that reads
    // `profileData` or `profileData:<email>` can find the latest snapshot.
    try {
      localStorage.setItem("profileData", JSON.stringify(snapshot));
    } catch (e) {}
    try {
      localStorage.setItem(`profileData:${email}`, JSON.stringify(snapshot));
    } catch (e) {}
    try {
      localStorage.setItem("activeProfileEmail", email);
    } catch (e) {}
  } catch (e) {
    // ignore storage errors
  }
}
