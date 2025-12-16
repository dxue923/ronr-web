// netlify/functions/profile.js
// Profile API — GET (sync) + POST (edit fields) using MongoDB

import jwt from "jsonwebtoken";
import jwksClient from "jwks-rsa";

import { connectToDatabase } from "../../db/mongoose.js";
import Profile from "../../models/Profile.js";

const DOMAIN = process.env.AUTH0_DOMAIN;
const AUDIENCE = process.env.AUTH0_AUDIENCE;
const CLIENT_ID = process.env.AUTH0_CLIENT_ID;
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
  // Normalize header and accept either "Bearer <token>" (case-insensitive)
  // or a bare token value. In local/dev, allow missing auth and generate a dev user.
  const raw = (authHeader || "").toString().trim();
  if (!raw) {
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

  // Support both "Bearer <token>" and a bare token string
  const token = raw.toLowerCase().startsWith("bearer ")
    ? raw.slice(7).trim()
    : raw;

  // Basic format guard: tokens that are not at least dot-separated likely aren't JWTs
  try {
    const parts = (token || "").split(".");
    if (parts.length < 2) {
      // Log masked token info for debugging without printing full secret
      console.error("[profile] invalid token format", {
        receivedLength: token ? token.length : 0,
        partsLength: parts.length,
        containsEllipsis: token ? token.includes("…") : false,
        sample: token ? `${token.slice(0, 8)}...${token.slice(-8)}` : "",
      });
      if (IS_NETLIFY_DEV || !DOMAIN || !AUDIENCE || !client) {
        return Promise.resolve({
          sub: "dev-user",
          email: "",
          name: "Dev User",
          nickname: "dev",
          picture: "",
        });
      }
      throw new Error("Invalid token format");
    }
  } catch (e) {
    // Fall through to existing behavior; errors will be handled by caller
  }

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
    // First attempt: verify requiring the API audience (preferred)
    jwt.verify(
      token,
      getKey,
      {
        algorithms: ["RS256"],
        audience: AUDIENCE,
        issuer: `https://${DOMAIN}/`,
      },
      (err, decoded) => {
        if (!err) return resolve(decoded);
        // If the error is an audience mismatch, attempt a second verification
        // that accepts the Auth0 client ID (ID token) or skips audience check.
        const isAudienceErr = err && /audience/i.test(err.message);
        if (!isAudienceErr) return reject(err);

        // Retry verify accepting either the Auth0 client ID or no audience.
        const retryOptions = {
          algorithms: ["RS256"],
          issuer: `https://${DOMAIN}/`,
        };
        // If we have a client id configured, allow it as an accepted audience
        if (CLIENT_ID) retryOptions.audience = CLIENT_ID;

        jwt.verify(token, getKey, retryOptions, (err2, decoded2) => {
          if (err2) return reject(err2);
          return resolve(decoded2);
        });
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
    let claims;
    try {
      claims = await getClaims(authHeader);
    } catch (authErr) {
      console.error("[profile] auth error", authErr?.message || authErr);
      const clientMessage =
        authErr && authErr.message
          ? authErr.message
          : "Invalid or missing Authorization token";
      return {
        statusCode: 401,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Unauthorized", message: clientMessage }),
      };
    }
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

    // Ensure profile exists or create/update/merge by email
    let profileDoc;
    try {
      // Debug: log the imported Profile shape to help diagnose missing methods
      try {
        console.log("[profile] Profile export type:", typeof Profile, "modelName:", Profile && Profile.modelName, "keys:", Object.keys(Profile || {}));
      } catch (dbg) {
        console.error("[profile] failed to inspect Profile export", dbg && dbg.message ? dbg.message : dbg);
      }
      // Try to find by email first
      profileDoc = await Profile.findOne({ email: tokenProfile.email }).lean();
      // If not found by email, fallback to Auth0 ID
      if (!profileDoc) {
        profileDoc = await Profile.findById(tokenProfile.id).lean();
      }
      // If still not found, create new
      if (!profileDoc) {
        const defaultUsername = tokenProfile.username;
        const created = await Profile.create({
          _id: tokenProfile.id,
          username: defaultUsername,
          name: "",
          email: tokenProfile.email,
          avatarUrl: "",
        });
        profileDoc = toClient(created);
      } else {
        // If found by email but _id is different, merge and remove duplicate
        if (profileDoc._id !== tokenProfile.id) {
          // Update the found profile to use the current Auth0 ID
          await Profile.deleteOne({ _id: tokenProfile.id }); // Remove any old profile with this Auth0 ID
          await Profile.updateOne(
            { email: tokenProfile.email },
            { $set: { _id: tokenProfile.id } }
          );
          profileDoc._id = tokenProfile.id;
        }
        // Remove any other duplicate profiles with the same email but different _id
        await Profile.deleteMany({
          email: tokenProfile.email,
          _id: { $ne: tokenProfile.id },
        });
      }
    } catch (findErr) {
      console.error("[profile] find/merge error", findErr?.message || findErr);
      profileDoc = null;
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

      // Always update by email (enforced unique)
      try {
        let docForUpdate = await Profile.findOne({ email: tokenProfile.email });
        if (!docForUpdate) {
          // Fallback: try by Auth0 ID
          docForUpdate = await Profile.findById(tokenProfile.id);
        }
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
          if (existing && String(existing._id) !== String(docForUpdate._id)) {
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
        // Remove any other duplicate profiles with the same email but different _id
        await Profile.deleteMany({
          email: tokenProfile.email,
          _id: { $ne: docForUpdate._id },
        });
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
