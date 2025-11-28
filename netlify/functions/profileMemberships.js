// netlify/functions/profileMemberships.js
// Manage memberships inside the current user's Profile:
// POST   -> join committee or change role
// DELETE -> leave committee

import jwt from "jsonwebtoken";
import jwksClient from "jwks-rsa";

import { connectToDatabase } from "../../db/mongoose.js";
import Profile from "../../models/Profile.js";

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

// Same token handling as profile.js
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

// Helper: convert Profile doc to client shape (id instead of _id)
function toClient(profileDoc) {
  if (!profileDoc) return null;
  const obj = profileDoc.toObject ? profileDoc.toObject() : { ...profileDoc };
  obj.id = obj._id;
  delete obj._id;
  delete obj.__v;
  return obj;
}

export const handler = async (event) => {
  try {
    const method = event.httpMethod || "GET";

    // Auth
    const authHeader =
      event.headers.authorization || event.headers.Authorization || "";
    const claims = await getClaims(authHeader);
    const tokenProfile = mapAuth0(claims);

    await connectToDatabase();

    // Ensure profile exists
    let profileDoc = await Profile.findById(tokenProfile.id);
    if (!profileDoc) {
      profileDoc = await Profile.create({
        _id: tokenProfile.id,
        username: tokenProfile.username,
        name: tokenProfile.name,
        email: tokenProfile.email,
        avatarUrl: tokenProfile.avatarUrl,
        memberships: [],
      });
    }

    // ---------- POST: join or update role ----------
    if (method === "POST") {
      const body = JSON.parse(event.body || "{}");
      const committeeId = (body.committeeId || "").toString().trim();
      const role = (body.role || "member").toString();

      if (!committeeId) {
        return {
          statusCode: 400,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ error: "committeeId is required" }),
        };
      }

      const memberships = profileDoc.memberships || [];
      const idx = memberships.findIndex(
        (m) => m.committeeId === committeeId
      );

      if (idx === -1) {
        // join new committee
        memberships.push({
          committeeId,
          role,
          joinedAt: new Date().toISOString(),
        });
      } else {
        // update role for existing membership
        memberships[idx].role = role;
      }

      profileDoc.memberships = memberships;
      await profileDoc.save();

      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toClient(profileDoc)),
      };
    }

    // ---------- DELETE: leave committee ----------
    if (method === "DELETE") {
      const params = event.queryStringParameters || {};
      const committeeIdParam = (params.committeeId || "").toString().trim();
      const body = event.body ? JSON.parse(event.body) : {};
      const committeeIdBody = (body.committeeId || "").toString().trim();

      const committeeId = committeeIdParam || committeeIdBody;

      if (!committeeId) {
        return {
          statusCode: 400,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ error: "committeeId is required" }),
        };
      }

      const beforeCount = profileDoc.memberships.length;
      profileDoc.memberships = profileDoc.memberships.filter(
        (m) => m.committeeId !== committeeId
      );

      if (profileDoc.memberships.length === beforeCount) {
        return {
          statusCode: 404,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ error: "Membership not found" }),
        };
      }

      await profileDoc.save();

      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: `Left committee ${committeeId}`,
          profile: toClient(profileDoc),
        }),
      };
    }

    // No GET here; use /profile GET to see memberships
    return {
      statusCode: 405,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Method Not Allowed" }),
    };
  } catch (err) {
    console.error("[profileMemberships] error", err);
    return {
      statusCode: 401,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Unauthorized", message: err.message }),
    };
  }
};
