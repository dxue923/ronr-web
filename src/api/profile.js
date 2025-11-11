// src/api/profile.js
// DEBUGGING version – logs token info, headers, and responses

const FUNCTIONS_BASE =
  import.meta.env.VITE_FUNCTIONS_BASE || "/.netlify/functions";
const PROFILE_URL = `${FUNCTIONS_BASE}/profile`;

async function getToken(getAccessTokenSilently) {
  const audience = import.meta.env.VITE_AUTH0_AUDIENCE;
  try {
    const token = audience
      ? await getAccessTokenSilently({ audience })
      : await getAccessTokenSilently();

    console.log(
      "%c[ProfileAPI] Got token:",
      "color:green",
      token?.slice(0, 30) + "..."
    );
    return token;
  } catch (err) {
    console.error("[ProfileAPI] getAccessTokenSilently failed:", err);
    throw err;
  }
}

async function handleResponse(res, action) {
  console.log(`[ProfileAPI] ${action} → status`, res.status);

  const text = await res.text();
  console.log(`[ProfileAPI] ${action} → body:`, text);

  if (!res.ok) {
    throw new Error(`${action} failed (${res.status}): ${text}`);
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

// ---------- Get current user profile ----------
export async function getProfile(getAccessTokenSilently) {
  const token = await getToken(getAccessTokenSilently);

  console.log("[ProfileAPI] Sending GET with headers:", {
    Authorization: `Bearer ${token?.slice(0, 15)}...`,
  });

  const res = await fetch(PROFILE_URL, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });

  return handleResponse(res, "Profile GET");
}

// ---------- Update user profile ----------
export async function updateProfile(getAccessTokenSilently, partialProfile) {
  const token = await getToken(getAccessTokenSilently);

  console.log(
    "[ProfileAPI] Sending PUT to",
    PROFILE_URL,
    "with body:",
    partialProfile
  );

  const res = await fetch(PROFILE_URL, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(partialProfile),
  });

  return handleResponse(res, "Profile PUT");
}
