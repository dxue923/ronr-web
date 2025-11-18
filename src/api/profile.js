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
