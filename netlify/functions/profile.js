// netlify/functions/profile.js
// Profile API — GET (sync) + POST (edit fields) using MongoDB

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

// Decode token in dev, verify in prod
function getClaims(authHeader = "") {
  // In local/dev, allow missing auth and generate a dev user
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    if (IS_NETLIFY_DEV || !DOMAIN || !AUDIENCE || !client) {
      return Promise.resolve({
        sub: "dev-user",
        email: "",
        name: "Dev User",
        nickname: "dev",
        picture: "",
      });
    }
    throw new Error("Invalid Authorization header");
  }
  const token = authHeader.slice(7);

  if (IS_NETLIFY_DEV || !DOMAIN || !AUDIENCE || !client) {
    // In local/dev mode allow non-JWT (opaque) tokens gracefully.
    const decoded = jwt.decode(token);
    if (!decoded) {
      return Promise.resolve({
        sub: "dev-user",
        email: "",
        name: "Dev User",
        nickname: "dev",
        picture: "",
      });
    }
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

// Base profile from Auth0 claims
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
    id: sub, // will become _id in Mongo
    username,
    name: name || username,
    email,
    avatarUrl: picture || "",
  };
}

// Helper: convert Mongo doc to client-safe object (id instead of _id)
function toClient(doc) {
  if (!doc) return null;
  const obj = doc.toObject ? doc.toObject() : { ...doc };
  obj.id = obj._id;
  delete obj._id;
  delete obj.__v;
  return obj;
}

export async function handler(event) {
  try {
    // 1) Auth
    const authHeader =
      event.headers.authorization || event.headers.Authorization || "";
    const claims = await getClaims(authHeader);
    const tokenProfile = mapAuth0(claims);

    // 2) DB
    await connectToDatabase();

    // Ensure profile exists or create it ONE TIME from Auth0 data
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
    // NOTE: we are NOT overwriting avatarUrl from token anymore
    // If you still want to keep email in sync, you could optionally:
    // profileDoc.email = tokenProfile.email || profileDoc.email;
    // await profileDoc.save();

    // ------------ GET ------------
    if (event.httpMethod === "GET") {
      const clientProfile = toClient(profileDoc);
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(clientProfile),
      };
    }

    // ------------ POST (editable fields) ------------
    if (event.httpMethod === "POST") {
      const body = JSON.parse(event.body || "{}");

      // Normalize + trim incoming editable fields
      const incomingUsername =
        typeof body.username === "string" ? body.username.trim() : undefined;
      const incomingName =
        typeof body.name === "string" ? body.name.trim() : undefined;
      const incomingAvatar =
        typeof body.avatarUrl === "string" ? body.avatarUrl : undefined;

      if (incomingUsername) profileDoc.username = incomingUsername;
      if (incomingName) profileDoc.name = incomingName;
      if (incomingAvatar !== undefined) profileDoc.avatarUrl = incomingAvatar;

      try {
        await profileDoc.save();
      } catch (saveErr) {
        if (saveErr && saveErr.code === 11000) {
          return {
            statusCode: 409,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              error: "Conflict",
              message: "Username already taken",
            }),
          };
        }
        throw saveErr;
      }

      const clientProfile = toClient(profileDoc);
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(clientProfile),
      };
    }

    // Any other method
    return {
      statusCode: 405,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Method Not Allowed" }),
    };
  } catch (err) {
    console.error("[profile] error", err);
    return {
      statusCode: 401,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Unauthorized", message: err.message }),
    };
  }
}
