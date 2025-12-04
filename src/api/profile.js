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

  if (!res.ok) {
    throw new Error(data?.message || data?.error || "Failed to load profile");
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
// ----- Local cached profile helpers -----
const PROFILE_KEY_PREFIX = "profile:";

export function loadProfileFromStorage(email) {
  if (!email) return null;
  try {
    const raw = localStorage.getItem(`${PROFILE_KEY_PREFIX}${email}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveProfileToStorage(email, profile) {
  if (!email || !profile) return;
  try {
    const payload = {
      name: profile.name ?? "",
      username: profile.username ?? "",
      email: profile.email ?? email,
      avatarUrl: profile.avatarUrl ?? null,
    };
    localStorage.setItem(
      `${PROFILE_KEY_PREFIX}${email}`,
      JSON.stringify(payload)
    );
  } catch {
    // ignore storage errors
  }
}
