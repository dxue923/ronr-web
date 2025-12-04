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

  // Default username should be the email local-part (before '@')
  const emailLocalPart =
    email && typeof email === "string" ? email.split("@")[0] : "";
  const username = emailLocalPart || nickname || "user";

  return {
    id: sub, // will become _id in Mongo
    username,
    // Keep name empty until explicitly set by the user
    name: "",
    email,
    // Keep avatar empty until explicitly set by the user
    avatarUrl: "",
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
    try {
      await connectToDatabase();
    } catch (connErr) {
      // Fail gracefully: return minimal profile from token without exposing connection errors
      console.error("[profile] DB connect error", connErr?.message || connErr);
      if (event.httpMethod === "GET") {
        const minimal = {
          id: tokenProfile.id,
          username: tokenProfile.username,
          // Leave name empty for users without a saved profile
          name: "",
          email: tokenProfile.email,
          // Leave avatar empty for users without a saved profile
          avatarUrl: "",
          memberships: [],
        };
        return {
          statusCode: 200,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(minimal),
        };
      }
      // For writes, surface a generic error without internal details
      return {
        statusCode: 503,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: "Service Unavailable",
          message: "Database temporarily unreachable",
        }),
      };
    }

    // Ensure profile exists or create it ONE TIME from Auth0 data
    let profileDoc;
    try {
      profileDoc = await Profile.findById(tokenProfile.id).lean();
    } catch (findErr) {
      console.error("[profile] find error", findErr?.message || findErr);
      profileDoc = null;
    }

    if (!profileDoc) {
      try {
        // Ensure default username stored in DB as email local-part
        const defaultUsername = tokenProfile.username;
        const created = await Profile.create({
          _id: tokenProfile.id,
          username: defaultUsername,
          // Keep name blank until the user sets it
          name: "",
          email: tokenProfile.email,
          // Keep avatar blank until the user sets it
          avatarUrl: "",
          memberships: [],
        });
        profileDoc = toClient(created);
      } catch (createErr) {
        console.error(
          "[profile] create error",
          createErr?.message || createErr
        );
        // If creation fails, fall back to minimal token-derived profile on GET
        if (event.httpMethod === "GET") {
          const minimal = {
            id: tokenProfile.id,
            username: tokenProfile.username,
            name: "",
            email: tokenProfile.email,
            avatarUrl: "",
            memberships: [],
          };
          return {
            statusCode: 200,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(minimal),
          };
        }
        return {
          statusCode: 503,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            error: "Service Unavailable",
            message: "Database temporarily unreachable",
          }),
        };
      }
    }
    // NOTE: we are NOT overwriting avatarUrl from token anymore
    // If you still want to keep email in sync, you could optionally:
    // profileDoc.email = tokenProfile.email || profileDoc.email;
    // await profileDoc.save();

    // ------------ GET ------------
    if (event.httpMethod === "GET") {
      const params = event.queryStringParameters || {};
      const lookup = (params.lookup || "").toString().trim();
      if (lookup) {
        // Find by exact email (preferred) or username.
        try {
          let doc = null;
          if (lookup.includes("@")) {
            // Exact email match
            doc = await Profile.findOne({ email: lookup }).lean();
          }
          if (!doc) {
            // Fallback: username exact, case-insensitive
            const re = new RegExp(
              `^${lookup.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
              "i"
            );
            doc = await Profile.findOne({ username: re }).lean();
          }
          if (!doc) {
            return {
              statusCode: 404,
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                error: "Not Found",
                message: "Profile not found",
              }),
            };
          }
          const client = toClient(doc);
          return {
            statusCode: 200,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(client),
          };
        } catch (e) {
          return {
            statusCode: 500,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ error: "Lookup failed" }),
          };
        }
      }
      const clientProfile = toClient(profileDoc);
      // Do not auto-override username/name/avatar on GET; respect saved values
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
        // Re-load doc for mutation if we used lean earlier
        const docForUpdate = await Profile.findById(tokenProfile.id);
        if (!docForUpdate) {
          return {
            statusCode: 404,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              error: "Not Found",
              message: "Profile not found",
            }),
          };
        }
        if (incomingUsername) {
          // Guard: prevent setting a username that belongs to a different email/user
          const existing = await Profile.findOne({
            username: incomingUsername,
          }).lean();
          if (existing && existing._id !== tokenProfile.id) {
            return {
              statusCode: 409,
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                error: "Conflict",
                message: "Username already belongs to another account",
              }),
            };
          }
          docForUpdate.username = incomingUsername;
        }
        if (incomingName) docForUpdate.name = incomingName;
        if (incomingAvatar !== undefined)
          docForUpdate.avatarUrl = incomingAvatar;
        await docForUpdate.save();
        profileDoc = docForUpdate;
      } catch (saveErr) {
        if (saveErr && saveErr.code === 11000) {
          return {
            statusCode: 409,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              error: "Conflict",
              message: "Username or email already taken",
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
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: "Server Error",
        message: "Unable to load profile",
      }),
    };
  }
}
