// netlify/functions/committee.js
// Manage committees (GET all/one, POST new, DELETE one) using MongoDB

import { connectToDatabase } from "../../db/mongoose.js";
import Committee from "../../models/Committee.js";
import Motion from "../../models/Motions.js"; // motions to cascade delete
import Discussion from "../../models/Discussion.js"; // related discussions
import jwt from "jsonwebtoken";
import Profile from "../../models/Profile.js";

const IS_DEV = process.env.NETLIFY_DEV === "true";

function decodeAuth(authHeader = "") {
  if (!authHeader.startsWith("Bearer ")) {
    if (IS_DEV) return { sub: "dev-user", nickname: "dev" };
    throw new Error("Missing Bearer token");
  }
  const token = authHeader.slice(7);
  try {
    return jwt.decode(token) || {};
  } catch {
    if (IS_DEV) return { sub: "dev-user", nickname: "dev" };
    throw new Error("Invalid token");
  }
}

function usernameFromClaims(c = {}) {
  const email = (c.email || "").toString();
  const localPart = email ? email.split("@")[0] : "";
  const base =
    localPart ||
    c.nickname ||
    c.preferred_username ||
    c.name ||
    c.sub ||
    "user";
  return base.toString();
}

function getRole(committeeDoc, username) {
  if (!committeeDoc || !username) return null;
  const uLower = username.toLowerCase();
  const member = (committeeDoc.members || []).find(
    (m) => (m.username || "").toLowerCase() === uLower
  );
  return member ? member.role : null;
}

// Convert Mongo document to client shape (id instead of _id)
function toClient(doc) {
  if (!doc) return null;
  const obj = doc.toObject ? doc.toObject() : { ...doc };
  obj.id = obj._id;
  delete obj._id;
  delete obj.__v;
  return obj;
}

function escapeRegex(str = "") {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function handler(event) {
  try {
    const rawMethod = event.httpMethod || "GET";
    let method = rawMethod.toUpperCase();

    // Support method override via header or body for environments that don't allow PATCH/DELETE
    const overrideHeader = (
      event.headers?.["x-http-method-override"] ||
      event.headers?.["X-HTTP-Method-Override"] ||
      ""
    ).toUpperCase();

    let bodyObj = {};
    try {
      bodyObj = JSON.parse(event.body || "{}");
    } catch {
      bodyObj = {};
    }
    const overrideBody = (bodyObj?._method || "").toUpperCase();

    if (overrideHeader === "PATCH" || overrideBody === "PATCH")
      method = "PATCH";
    if (overrideHeader === "DELETE" || overrideBody === "DELETE")
      method = "DELETE";

    try {
      await connectToDatabase();
    } catch (connErr) {
      // For GET requests, fail gracefully with empty list to avoid 500s in UI
      if ((event.httpMethod || "GET").toUpperCase() === "GET") {
        console.warn(
          "[committee] DB connect failed, returning empty list",
          connErr?.message || connErr
        );
        return {
          statusCode: 200,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify([]),
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

    const authHeader =
      event.headers?.authorization || event.headers?.Authorization || "";
    let claims = {};
    try {
      claims = decodeAuth(authHeader);
    } catch (e) {
      // Allow unauthenticated GET list/single; require auth for mutations
      if (method !== "GET") {
        return {
          statusCode: 401,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ error: "Unauthorized", message: e.message }),
        };
      }
    }
    const actorUsername = usernameFromClaims(claims).trim();

    // ---------- GET (list or single) ----------
    if (method === "GET") {
      const params = event.queryStringParameters || {};
      const committeeId = params.id || null;
      let member = (params.member || "").toString().trim();
      if (!member && actorUsername) member = actorUsername;

      if (committeeId) {
        let found = null;
        try {
          found = await Committee.findById(committeeId);
        } catch (e) {
          console.warn("[committee] findById error", e?.message || e);
        }
        if (!found) {
          return {
            statusCode: 404,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ error: "Committee not found" }),
          };
        }
        return {
          statusCode: 200,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(toClient(found)),
        };
      }

      // If a member filter is provided, return only committees where that username appears in members
      if (member) {
        const usernameRegex = new RegExp(`^${escapeRegex(member)}$`, "i");
        let docs = [];
        try {
          docs = await Committee.find({
            "members.username": usernameRegex,
          }).sort({ createdAt: 1 });
        } catch (e) {
          console.warn("[committee] member filter find error", e?.message || e);
          docs = [];
        }

        // Refresh member display names from Profile for the returned committees
        try {
          const usernames = Array.from(
            new Set(
              docs.flatMap((d) =>
                (d.members || []).map((m) => (m.username || "").trim())
              )
            )
          ).filter(Boolean);
          let profiles = [];
          if (usernames.length) {
            profiles = await Profile.find({ username: { $in: usernames } })
              .select("username name avatarUrl email")
              .lean();
          }
          const byUsername = new Map(
            profiles.map((p) => [String(p.username || "").toLowerCase(), p])
          );
          docs.forEach((doc) => {
            doc.members = (doc.members || []).map((m) => {
              const key = String(m.username || "").toLowerCase();
              const prof = byUsername.get(key);
              if (prof) {
                return {
                  ...m,
                  name: prof.name || m.name || m.username,
                  avatarUrl: prof.avatarUrl || m.avatarUrl || "",
                };
              }
              return m;
            });
          });
        } catch (e) {
          console.warn("[committee] name refresh failed", e?.message || e);
        }

        return {
          statusCode: 200,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(docs.map(toClient)),
        };
      }

      let docs = [];
      try {
        docs = await Committee.find().sort({ createdAt: 1 });
      } catch (e) {
        console.warn("[committee] list find error", e?.message || e);
        docs = [];
      }
      // Also refresh names for full list to keep display consistent
      try {
        const usernames = Array.from(
          new Set(
            docs.flatMap((d) =>
              (d.members || []).map((m) => (m.username || "").trim())
            )
          )
        ).filter(Boolean);
        let profiles = [];
        if (usernames.length) {
          profiles = await Profile.find({ username: { $in: usernames } })
            .select("username name avatarUrl email")
            .lean();
        }
        const byUsername = new Map(
          profiles.map((p) => [String(p.username || "").toLowerCase(), p])
        );
        docs.forEach((doc) => {
          doc.members = (doc.members || []).map((m) => {
            const key = String(m.username || "").toLowerCase();
            const prof = byUsername.get(key);
            if (prof) {
              return {
                ...m,
                name: prof.name || m.name || m.username,
                avatarUrl: prof.avatarUrl || m.avatarUrl || "",
              };
            }
            return m;
          });
        });
      } catch (e) {
        console.warn("[committee] list name refresh failed", e?.message || e);
      }
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(docs.map(toClient)),
      };
    }

    // ---------- POST (create full committee) ----------
    if (method === "POST") {
      const body = bodyObj;
      const name = String(body.name || "").trim();
      const ownerId = String(body.ownerId || "").trim();
      const members = Array.isArray(body.members) ? body.members : [];
      const settings =
        body.settings && typeof body.settings === "object" ? body.settings : {};
      const createdAt =
        body.createdAt && typeof body.createdAt === "string"
          ? body.createdAt
          : new Date().toISOString();

      if (!name) {
        return {
          statusCode: 400,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ error: "name is required" }),
        };
      }
      if (!ownerId) {
        return {
          statusCode: 400,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ error: "ownerId is required" }),
        };
      }

      // Normalize and sanitize members
      const ownerKey = ownerId.toLowerCase();
      const baseMembers = Array.isArray(members) ? members : [];
      const cleaned = baseMembers
        .map((m) => {
          const username = String(m?.username || "").trim();
          const nameVal = String(m?.name || username || ownerId).trim();
          let role = String(m?.role || "member").toLowerCase();
          if (!username) return null; // drop invalid rows
          if (username.toLowerCase() === ownerKey) role = "owner";
          if (!["owner", "chair", "member", "observer"].includes(role)) {
            role = "member";
          }
          return {
            username,
            name: nameVal,
            role,
            avatarUrl: String(m?.avatarUrl || ""),
          };
        })
        .filter(Boolean);

      // Ensure owner present exactly once
      const haveOwner = cleaned.some(
        (m) =>
          (m.username || "").toLowerCase() === ownerKey || m.role === "owner"
      );
      let withOwner = cleaned;
      if (!haveOwner) {
        let ownerProfile = null;
        try {
          ownerProfile = await Profile.findOne({ username: ownerId })
            .select("username name avatarUrl")
            .lean();
        } catch {}
        withOwner = [
          {
            username: ownerId,
            name: (ownerProfile?.name || ownerId).trim(),
            role: "owner",
            avatarUrl: ownerProfile?.avatarUrl || "",
          },
          ...cleaned,
        ];
      }

      // Enforce single chair
      let chairSeen = false;
      const finalMembers = withOwner.map((m) => {
        if (m.role === "chair") {
          if (chairSeen) return { ...m, role: "member" };
          chairSeen = true;
          return { ...m, role: "chair" };
        }
        return m;
      });

      const doc = await Committee.create({
        _id: body.id || `committee-${Date.now()}`,
        name,
        ownerId,
        members: finalMembers,
        settings,
        createdAt,
        updatedAt: createdAt,
      });

      return {
        statusCode: 201,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toClient(doc)),
      };
    }

    // ---------- PATCH (update committee: name, members, settings) ----------
    if (method === "PATCH") {
      const body = bodyObj;
      const params = event.queryStringParameters || {};
      const committeeId = params.id || body.id;
      if (!committeeId) {
        return {
          statusCode: 400,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ error: "id is required" }),
        };
      }

      let doc = await Committee.findById(committeeId);
      if (!doc) {
        // Upsert: create if not found (legacy/local-only committee IDs)
        const name =
          typeof body.name === "string" ? body.name.trim() : committeeId;
        const ownerId =
          typeof body.ownerId === "string" ? body.ownerId.trim() : "";
        const createdAt = new Date().toISOString();

        const baseMembers = Array.isArray(body.members) ? body.members : [];
        const ownerKey = ownerId.toLowerCase();
        let chairSeen = false;
        const finalMembers = baseMembers
          .map((m) => {
            const uname = (m?.username || "").trim();
            if (!uname) return null;
            let role = String(m?.role || "member").toLowerCase();
            if (uname.toLowerCase() === ownerKey) role = "owner";
            if (role === "chair") {
              if (chairSeen) role = "member";
              else chairSeen = true;
            }
            if (!["owner", "chair", "member", "observer"].includes(role))
              role = "member";
            return {
              username: uname,
              name: (m?.name || uname).trim(),
              role,
              avatarUrl: m?.avatarUrl || "",
            };
          })
          .filter(Boolean);

        const haveOwner = finalMembers.some(
          (m) =>
            (m.username || "").toLowerCase() === ownerKey || m.role === "owner"
        );
        const withOwner = haveOwner
          ? finalMembers
          : ownerId
          ? [
              {
                username: ownerId,
                name: ownerId,
                role: "owner",
                avatarUrl: "",
              },
              ...finalMembers,
            ]
          : finalMembers;

        try {
          doc = await Committee.create({
            _id: committeeId,
            name,
            ownerId: ownerId || withOwner[0]?.username || "",
            members: withOwner,
            settings:
              body.settings && typeof body.settings === "object"
                ? body.settings
                : {},
            createdAt,
            updatedAt: createdAt,
          });
        } catch (e) {
          console.error("PATCH upsert create failed:", e);
          return {
            statusCode: 400,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              error: "Failed to upsert committee",
              details: String(e?.message || e),
            }),
          };
        }

        return {
          statusCode: 200,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(toClient(doc)),
        };
      }

      try {
        // NOTE: Permissions relaxed per request — allow anyone to modify
        const role = getRole(doc, actorUsername);

        // Restrict owner-only changes: members array modifications & ownerId transfer
        const modifyingMembers = Array.isArray(body.members);
        const transferringOwner =
          typeof body.ownerId === "string" &&
          body.ownerId.trim() &&
          body.ownerId.trim() !== doc.ownerId;
        // Allow anyone to modify members or transfer ownership

        // Settings/name can be updated by chair or owner
        if (typeof body.name === "string") {
          doc.name = body.name.trim() || doc.name;
        }

        if (
          typeof body.ownerId === "string" &&
          body.ownerId.trim() &&
          body.ownerId.trim() !== doc.ownerId
        ) {
          doc.ownerId = body.ownerId.trim();
        }

        if (Array.isArray(body.members)) {
          // Normalize roles (single chair & owner)
          let chairSeen = false;
          const ownerKey = (doc.ownerId || "").toLowerCase();
          doc.members = body.members
            .map((m) => {
              const uname = String(m?.username || "").trim();
              if (!uname) return null;
              let role = String(m?.role || "member").toLowerCase();
              if (uname.toLowerCase() === ownerKey) role = "owner";
              if (role === "chair") {
                if (chairSeen) role = "member";
                else chairSeen = true;
              }
              if (!["owner", "chair", "member", "observer"].includes(role))
                role = "member";
              return {
                username: uname,
                name: String(m?.name || uname).trim(),
                role,
                avatarUrl: String(m?.avatarUrl || ""),
              };
            })
            .filter(Boolean);
        }

        if (body.settings && typeof body.settings === "object") {
          doc.settings = body.settings;
        }

        await doc.save();
      } catch (e) {
        console.error("PATCH update failed:", e);
        return {
          statusCode: 400,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            error: "Failed to update committee",
            details: String(e?.message || e),
          }),
        };
      }

      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toClient(doc)),
      };
    }

    // ---------- DELETE ----------
    if (method === "DELETE") {
      const params = event.queryStringParameters || {};
      const committeeId = params.id || null;

      if (!committeeId) {
        return {
          statusCode: 400,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ error: "id is required to delete" }),
        };
      }

      const deletedCommittee = await Committee.findByIdAndDelete(committeeId);

      if (!deletedCommittee) {
        return {
          statusCode: 404,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ error: "Committee not found" }),
        };
      }

      // Cascade deletes should never block committee deletion; wrap in try/catch
      let deletedDiscussions = 0;
      let deletedMotions = 0;
      try {
        const motionsToDelete = await Motion.find({ committeeId })
          .select("_id")
          .lean();
        const motionIds = (motionsToDelete || []).map((m) => m._id);
        if (motionIds.length > 0) {
          try {
            const discussionResult = await Discussion.deleteMany({
              motionId: { $in: motionIds },
            });
            deletedDiscussions = discussionResult.deletedCount || 0;
          } catch (e) {
            console.warn("Failed to cascade delete discussions:", e);
          }
        }
        try {
          const motionResult = await Motion.deleteMany({ committeeId });
          deletedMotions = motionResult.deletedCount || 0;
        } catch (e) {
          console.warn("Failed to delete motions:", e);
        }
      } catch (e) {
        console.warn("Cascade fetch failed:", e);
      }

      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: `Deleted committee ${committeeId} and its associated motions & discussions`,
          deletedMotions,
          deletedDiscussions,
        }),
      };
    }

    // ---------- Fallback ----------
    return {
      statusCode: 405,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Method Not Allowed" }),
    };
  } catch (err) {
    console.error("Error handling committee:", err);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Failed to process committee" }),
    };
  }
}
