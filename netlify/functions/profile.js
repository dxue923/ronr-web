// netlify/functions/profile.js
// Profile API — GET (sync) + POST (edit fields)

import fs from "fs";
import path from "path";
import jwt from "jsonwebtoken";
import jwksClient from "jwks-rsa";

const DOMAIN = process.env.AUTH0_DOMAIN;
const AUDIENCE = process.env.AUTH0_AUDIENCE;
const IS_NETLIFY_DEV = process.env.NETLIFY_DEV === "true";

const client =
  DOMAIN &&
  jwksClient({
    jwksUri: `https://${DOMAIN}/.well-known/jwks.json`,
  });

function getKey(header, callback) {
  if (!client) return callback(new Error("JWKS client not configured"));
  client.getSigningKey(header.kid, (err, key) => {
    if (err) return callback(err);
    callback(null, key.getPublicKey());
  });
}

const DATA_PATH = path.join(process.cwd(), "netlify", "functions", "data.json");

function readData() {
  try {
    return JSON.parse(fs.readFileSync(DATA_PATH, "utf-8"));
  } catch {
    return { profile: [] };
  }
}

function writeData(data) {
  fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2), "utf-8");
}

// Decode token in dev, verify in prod
function getClaims(authHeader = "") {
  if (!authHeader.startsWith("Bearer ")) {
    throw new Error("Invalid Authorization header");
  }
  const token = authHeader.slice(7);

  if (IS_NETLIFY_DEV || !DOMAIN || !AUDIENCE || !client) {
    const decoded = jwt.decode(token);
    if (!decoded) throw new Error("Could not decode token");
    return Promise.resolve(decoded);
  }

  return new Promise((resolve, reject) => {
    jwt.verify(
      token,
      getKey,
      {
        algorithms: ["RS256"],
        audience: AUDIENCE,
        issuer: `https://${DOMAIN}/`,
      },
      (err, decoded) => {
        if (err) return reject(err);
        resolve(decoded);
      }
    );
  });
}

// Base profile
function mapAuth0(decoded) {
  const {
    sub = "dev-user",
    email = "",
    name = "",
    nickname = "",
    picture = "",
  } = decoded;

  const username = nickname || email || "user";

  return {
    id: sub,
    username,
    name: name || username,
    email,
    avatarUrl: picture || "",
  };
}

export async function handler(event) {
  try {
    const authHeader =
      event.headers.authorization || event.headers.Authorization || "";
    const claims = await getClaims(authHeader);
    const tokenProfile = mapAuth0(claims);

    const data = readData();
    if (!Array.isArray(data.profile)) data.profile = [];

    let idx = data.profile.findIndex((p) => p.id === tokenProfile.id);

    // Create first profile
    if (idx === -1) {
      data.profile.push(tokenProfile);
      idx = data.profile.length - 1;
      writeData(data);
    }

    const existing = data.profile[idx];

    // ------------ GET ------------
    if (event.httpMethod === "GET") {
      const merged = {
        ...tokenProfile,
        ...existing,
      };
      data.profile[idx] = merged;
      writeData(data);

      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(merged),
      };
    }

    // ------------ POST (editable fields) ------------
    if (event.httpMethod === "POST") {
      const body = JSON.parse(event.body || "{}");

      const allowed = {};
      if (typeof body.username === "string") allowed.username = body.username;
      if (typeof body.name === "string") allowed.name = body.name;
      if (typeof body.avatarUrl === "string")
        allowed.avatarUrl = body.avatarUrl;

      if (Object.keys(allowed).length === 0) {
        return {
          statusCode: 400,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ error: "No valid fields to update" }),
        };
      }

      const updated = {
        ...existing,
        ...allowed,
      };

      data.profile[idx] = updated;
      writeData(data);

      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updated),
      };
    }

    return { statusCode: 405, body: "Method Not Allowed" };
  } catch (err) {
    console.error("[profile] error", err);
    return {
      statusCode: 401,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Unauthorized", message: err.message }),
    };
  }
}
