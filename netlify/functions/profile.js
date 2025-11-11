// netlify/functions/profile.js
// Profile API that syncs basic fields from Auth0 into data.json/profile[]

const fs = require("fs");
const path = require("path");
const jwt = require("jsonwebtoken");
const jwks = require("jwks-rsa");

// store right next to this function
const DATA = path.join(__dirname, "data.json");

// Auth0 envs (optional in dev)
const DOMAIN = process.env.AUTH0_DOMAIN;
const AUD = process.env.AUTH0_AUDIENCE;

console.log("[profile] init — DOMAIN =", DOMAIN, "AUD =", AUD);

// JWKS client (only if DOMAIN set)
const client =
  DOMAIN &&
  jwks({
    jwksUri: `https://${DOMAIN}/.well-known/jwks.json`,
  });

const getKey = (header, cb) => {
  if (!client) return cb(new Error("JWKS client not configured"));
  client.getSigningKey(header.kid, (err, key) => {
    if (err) return cb(err);
    cb(null, key.getPublicKey());
  });
};

// verify token, or decode in dev
const verify = (authHeader) =>
  new Promise((resolve, reject) => {
    if (!authHeader) return reject("no auth header");
    const token = authHeader.split(" ")[1];
    if (!token) return reject("no bearer token");

    // dev fallback
    if (!DOMAIN || !AUD) {
      console.warn("[profile] missing DOMAIN/AUDIENCE — decode fallback");
      return resolve(jwt.decode(token) || {});
    }

    jwt.verify(
      token,
      getKey,
      {
        audience: AUD,
        issuer: `https://${DOMAIN}/`,
        algorithms: ["RS256"],
      },
      (err, decoded) => {
        if (err) return reject(err.message || err);
        resolve(decoded);
      }
    );
  });

function readData() {
  try {
    if (fs.existsSync(DATA)) {
      return JSON.parse(fs.readFileSync(DATA, "utf8"));
    }
  } catch (e) {
    console.error("[profile] readData error:", e);
  }
  return {
    profile: [],
    committees: [],
    committeeMembers: [],
    motions: [],
    comments: [],
  };
}

function writeData(obj) {
  try {
    fs.writeFileSync(DATA, JSON.stringify(obj, null, 2));
  } catch (e) {
    console.error("[profile] writeData error:", e);
  }
}

// take claims from Auth0 and map to our shape
function buildProfileFromToken(userId, claims) {
  return {
    id: userId,
    username: claims.nickname || "you",
    name: claims.name || "You",
    email: claims.email || "",
    bio: "",
    avatarUrl: claims.picture || "",
    memberships: [],
  };
}

// fill missing local fields from the token, but don't wipe local edits
function backfillProfile(existing, claims) {
  const patched = { ...existing };

  if (!patched.username && claims.nickname) patched.username = claims.nickname;
  if (!patched.name && claims.name) patched.name = claims.name;
  if (!patched.email && claims.email) patched.email = claims.email;
  if (!patched.avatarUrl && claims.picture) patched.avatarUrl = claims.picture;

  return patched;
}

exports.handler = async (event) => {
  const { httpMethod: method, headers, body } = event;

  // CORS
  if (method === "OPTIONS") {
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET,PUT,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    };
  }

  // Auth
  let claims;
  try {
    claims = await verify(headers.authorization);
  } catch (err) {
    return {
      statusCode: 401,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({
        error: "Unauthorized",
        reason: err,
        haveDomain: !!DOMAIN,
        haveAudience: !!AUD,
      }),
    };
  }

  const userId = claims.sub || claims.user_id || "dev-user";

  // load data.json
  const data = readData();
  if (!Array.isArray(data.profile)) {
    data.profile = [];
  }

  // find existing profile
  const idx = data.profile.findIndex((p) => p.id === userId);

  let currentProfile;
  if (idx === -1) {
    // first time: build from token
    currentProfile = buildProfileFromToken(userId, claims);
    data.profile.push(currentProfile);
    writeData(data);
  } else {
    // existing: backfill any empty fields from token
    const updated = backfillProfile(data.profile[idx], claims);
    data.profile[idx] = updated;
    currentProfile = updated;
    // we can write here too, but to reduce writes you could skip
    writeData(data);
  }

  if (method === "GET") {
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(currentProfile),
    };
  }

  if (method === "PUT") {
    const incoming = JSON.parse(body || "{}");
    const merged = { ...currentProfile, ...incoming };

    // write back to correct index
    const i = data.profile.findIndex((p) => p.id === userId);
    if (i === -1) {
      data.profile.push(merged);
    } else {
      data.profile[i] = merged;
    }
    writeData(data);

    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(merged),
    };
  }

  return {
    statusCode: 405,
    headers: { "Access-Control-Allow-Origin": "*" },
    body: JSON.stringify({ error: "Method not allowed" }),
  };
};
