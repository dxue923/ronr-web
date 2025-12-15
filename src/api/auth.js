// src/api/auth.js
// Helper to consistently obtain an API access token (preferred) and
// fall back to ID token when necessary. Adds dev-time logs to help
// diagnose token/audience mismatches between environments.

function safeDecode(token) {
  try {
    if (!token || typeof token !== "string") return null;
    const parts = token.split(".");
    if (parts.length < 2) return null;
    return JSON.parse(atob(parts[1]));
  } catch (e) {
    return null;
  }
}

export async function getApiToken({ getAccessTokenSilently, getIdTokenClaims }) {
  const audience = import.meta.env.VITE_AUTH0_AUDIENCE || "";

  // Try to get a proper access token for the API
  try {
    const token = await getAccessTokenSilently({
      authorizationParams: { audience },
    });
    const claims = safeDecode(token);
    const isAccess = !!(claims && claims.aud && (Array.isArray(claims.aud) ? claims.aud.includes(audience) : String(claims.aud) === String(audience)));
    if (import.meta.env.MODE !== "production") {
      // eslint-disable-next-line no-console
      console.info("[auth] acquired token via getAccessTokenSilently", { isAccess, audience, claims });
    }
    return { token, isAccessToken: isAccess, claims };
  } catch (err) {
    if (import.meta.env.MODE !== "production") {
      // eslint-disable-next-line no-console
      console.warn("[auth] getAccessTokenSilently failed, falling back to ID token", err && err.message ? err.message : err);
    }
  }

  // Fallback: use ID token raw if available (not recommended for API calls)
  try {
    const idClaims = await getIdTokenClaims().catch(() => null);
    const token = idClaims?.__raw || null;
    const claims = safeDecode(token);
    const isAccess = !!(claims && claims.aud && (Array.isArray(claims.aud) ? claims.aud.includes(audience) : String(claims.aud) === String(audience)));
    if (import.meta.env.MODE !== "production") {
      // eslint-disable-next-line no-console
      console.info("[auth] using ID token fallback", { isAccess, audience, claims });
    }
    return { token, isAccessToken: isAccess, claims };
  } catch (e) {
    return { token: null, isAccessToken: false, claims: null };
  }
}
