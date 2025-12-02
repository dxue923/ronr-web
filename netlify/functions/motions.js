// netlify/functions/motions.js
// Serverless function for managing committee motions (GET all, GET one, POST new, PATCH update, DELETE)

import { connectToDatabase } from "../../db/mongoose.js";
import Motion from "../../models/Motions.js";
import Committee from "../../models/Committee.js";
import Discussion from "../../models/Discussion.js"; // for cascading deletes
import jwt from "jsonwebtoken";

const DOMAIN = process.env.AUTH0_DOMAIN;
const AUDIENCE = process.env.AUTH0_AUDIENCE;
const IS_DEV = process.env.NETLIFY_DEV === "true";

function decodeAuth(authHeader = "") {
  if (!authHeader.startsWith("Bearer ")) {
    if (IS_DEV) {
      return { sub: "dev-user", nickname: "dev", name: "Dev User" };
    }
    throw new Error("Missing Bearer token");
  }
  const token = authHeader.slice(7);
  try {
    const decoded = jwt.decode(token) || {};
    return decoded || {};
  } catch {
    if (IS_DEV) return { sub: "dev-user", nickname: "dev" };
    throw new Error("Invalid token");
  }
}

function usernameFromClaims(c = {}) {
  return (
    c.nickname ||
    c.preferred_username ||
    c.name ||
    c.email ||
    c.sub ||
    "user"
  ).toString();
}

async function getRoleForCommittee(committeeId, username) {
  if (!committeeId || !username) return null;
  const committee = await Committee.findById(committeeId).lean();
  if (!committee) return null;
  const uLower = username.toLowerCase();
  const member = (committee.members || []).find(
    (m) => (m.username || "").toLowerCase() === uLower
  );
  return member ? member.role : null;
}

// New canonical status list
const VALID_STATUSES = [
  "in-progress",
  "paused",
  "unfinished",
  "postponed",
  "referred",
  "passed",
  "failed",
  "closed",
];

// Use shared DB connector that loads .env.local and reuses connections

function normalizeMotion(motion) {
  if (!motion) return motion;
  const normalized = { ...motion };

  // ---- normalize status ----
  if (normalized.status === "active" || normalized.status === "voting") {
    normalized.status = "in-progress";
  }

  if (!VALID_STATUSES.includes(normalized.status)) {
    normalized.status = "in-progress";
  }

  // ---- normalize votes ----
  if (typeof normalized.votes !== "object" || normalized.votes === null) {
    normalized.votes = { yes: 0, no: 0, abstain: 0 };
  } else {
    normalized.votes = {
      yes: Number(normalized.votes.yes) || 0,
      no: Number(normalized.votes.no) || 0,
      abstain: Number(normalized.votes.abstain) || 0,
    };
  }

  return normalized;
}

function serializeMotion(doc) {
  if (!doc) return null;
  const obj = { ...doc }; // doc is plain object from .lean() or toObject
  obj.id = obj._id;
  delete obj._id;
  // Provide `name` alias for clients expecting that field
  if (obj.title && !obj.name) obj.name = obj.title;
  return normalizeMotion(obj);
}

export async function handler(event) {
  try {
    await connectToDatabase();

    const method = event.httpMethod || "GET";
    const authHeader =
      event.headers?.authorization || event.headers?.Authorization || "";
    let claims = {};
    try {
      claims = decodeAuth(authHeader);
    } catch (e) {
      // For GET allow unauthenticated listing; for mutating ops deny.
      if (method !== "GET") {
        return {
          statusCode: 401,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ error: "Unauthorized", message: e.message }),
        };
      }
    }
    const actorUsername = usernameFromClaims(claims).trim();

    // ---------- GET ----------
    if (method === "GET") {
      const params = event.queryStringParameters || {};
      const motionId = params.id || null;
      const filterCommitteeId = params.committeeId || null;

      if (motionId) {
        const motionDoc = await Motion.findById(motionId).lean();
        if (!motionDoc) {
          return {
            statusCode: 404,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ error: "Motion not found" }),
          };
        }

        return {
          statusCode: 200,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(serializeMotion(motionDoc)),
        };
      }

      const query = {};
      if (filterCommitteeId) {
        query.committeeId = filterCommitteeId;
      }

      const motions = await Motion.find(query).lean();
      const result = motions.map(serializeMotion);

      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(result),
      };
    }

    // ---------- POST: create new motion ----------
    if (method === "POST") {
      const body = JSON.parse(event.body || "{}");
      // allow clients to send either `title` or `name`
      const title = String(body.title ?? body.name ?? "").trim();
      const description = String(body.description ?? "").trim();
      const committeeId = String(body.committeeId || "").trim();
      // optional submotion fields
      const type = body.type === "submotion" ? "submotion" : "main";
      const parentMotionId = body.parentMotionId
        ? String(body.parentMotionId).trim()
        : null;
      // optional meta (allow passing structured info for postpone/refer/revision/overturn etc.)
      const meta =
        body.meta && typeof body.meta === "object"
          ? { ...body.meta }
          : undefined;

      if (!title) {
        return {
          statusCode: 400,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ error: "Motion title is required" }),
        };
      }

      if (!committeeId) {
        return {
          statusCode: 400,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            error: "committeeId is required",
          }),
        };
      }

      // Validate submotion requirements when creating a submotion
      if (type === "submotion" && !parentMotionId) {
        return {
          statusCode: 400,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            error: "parentMotionId is required when type is submotion",
          }),
        };
      }

      // verify the committee actually exists
      const committee = await Committee.findById(committeeId).lean();
      if (!committee) {
        return {
          statusCode: 404,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            error: `Committee ${committeeId} does not exist`,
          }),
        };
      }

      // Authorization: allow members/chair/owner; auto-add unknown actor as member (skip observers check)
      let role = await getRoleForCommittee(committeeId, actorUsername);
      if (!role) {
        // Auto-add actor as a member for permissive creation
        try {
          await Committee.findByIdAndUpdate(committeeId, {
            $push: {
              members: {
                username: actorUsername,
                name: actorUsername,
                role: "member",
                avatarUrl: "",
              },
            },
          });
          role = "member";
        } catch (e) {
          // If auto-add fails, still proceed without blocking motion creation
          role = "member";
        }
      }
      // If role explicitly observer, upgrade to member for creation permissiveness
      if (role === "observer") {
        role = "member";
      }

      const motionId = Date.now().toString();

      // Optional creator information from client
      const createdBy =
        (body.createdBy && typeof body.createdBy === "object"
          ? body.createdBy
          : null) || {};
      const createdById = String(
        body.createdById || createdBy.id || createdBy.sub || ""
      ).trim();
      const createdByName = String(
        body.createdByName || createdBy.name || createdBy.username || ""
      ).trim();
      const createdByUsername = String(
        body.createdByUsername || createdBy.username || createdBy.nickname || ""
      ).trim();
      const createdByAvatarUrl = String(
        body.createdByAvatarUrl ||
          createdBy.avatarUrl ||
          createdBy.picture ||
          ""
      ).trim();

      const newMotionDoc = await Motion.create({
        _id: motionId,
        committeeId,
        title,
        description,
        status: "in-progress",
        votes: { yes: 0, no: 0, abstain: 0 },
        type,
        parentMotionId: type === "submotion" ? parentMotionId : null,
        meta: meta,
        createdById,
        createdByName,
        createdByUsername,
        createdByAvatarUrl,
        createdAt: new Date().toISOString(),
      });

      const plain = newMotionDoc.toObject({ versionKey: false });
      const serialized = serializeMotion(plain);

      return {
        statusCode: 201,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(serialized),
      };
    }

    // ---------- PATCH: update status and/or vote, decision details, meta ----------
    if (method === "PATCH") {
      const body = JSON.parse(event.body || "{}");
      const id = String(body.id || "").trim();

      if (!id) {
        return {
          statusCode: 400,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ error: "Motion id is required" }),
        };
      }

      const motionDoc = await Motion.findById(id);
      if (!motionDoc) {
        return {
          statusCode: 404,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ error: "Motion not found" }),
        };
      }

      // Normalize existing status/votes
      if (
        motionDoc.status === "active" ||
        motionDoc.status === "voting" ||
        !VALID_STATUSES.includes(motionDoc.status)
      ) {
        motionDoc.status = "in-progress";
      }

      if (!motionDoc.votes) {
        motionDoc.votes = { yes: 0, no: 0, abstain: 0 };
      }

      // Authorization: determine committee of motion first for role checks
      const motionCommitteeId = motionDoc.committeeId;
      const role = await getRoleForCommittee(motionCommitteeId, actorUsername);
      const isOwner = role === "owner";
      const isChair = role === "chair";
      const isMember = role === "member";

      // Update status if provided (chair/owner only)
      if (body.status) {
        const newStatus = String(body.status).trim();
        if (!VALID_STATUSES.includes(newStatus)) {
          return {
            statusCode: 400,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              error: `Invalid status "${newStatus}". Must be one of: ${VALID_STATUSES.join(
                ", "
              )}`,
            }),
          };
        }
        if (!(isOwner || isChair)) {
          return {
            statusCode: 403,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              error: "Forbidden",
              message: "Only chair or owner can change status",
            }),
          };
        }
        motionDoc.status = newStatus;
      }

      // Apply a vote if provided (with optional voterId enforcement)
      if (body.vote) {
        const vote = String(body.vote).toLowerCase();
        if (!["yes", "no", "abstain"].includes(vote)) {
          return {
            statusCode: 400,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              error: 'Invalid vote. Must be "yes", "no", or "abstain".',
            }),
          };
        }
        // Allow members/chair/owner to vote; observers denied
        if (!role || role === "observer") {
          return {
            statusCode: 403,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              error: "Forbidden",
              message: "Role cannot vote",
            }),
          };
        }
        const voterId = body.voterId ? String(body.voterId).trim() : "";
        if (voterId) {
          const voters = Array.isArray(motionDoc.meta?.voters)
            ? motionDoc.meta.voters
            : [];
          const already = voters.includes(voterId);
          if (!already) {
            voters.push(voterId);
            motionDoc.meta = { ...(motionDoc.meta || {}), voters };
            motionDoc.votes[vote] = Number(motionDoc.votes[vote] || 0) + 1;
          }
        } else {
          // No voterId provided: increment aggregate as best effort
          motionDoc.votes[vote] = Number(motionDoc.votes[vote] || 0) + 1;
        }
      }

      // Save decision details if provided
      if (body.decisionDetails && typeof body.decisionDetails === "object") {
        if (!(isOwner || isChair)) {
          return {
            statusCode: 403,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              error: "Forbidden",
              message: "Only chair or owner can record decision details",
            }),
          };
        }
        // compute supermajority lock from current votes (yes/no)
        const votes = motionDoc.votes || { yes: 0, no: 0, abstain: 0 };
        const yes = Number(votes.yes || 0);
        const no = Number(votes.no || 0);
        const totalYN = yes + no;
        const yesRatio = totalYN ? yes / totalYN : 0;
        const noRatio = totalYN ? no / totalYN : 0;
        let lockedOutcome;
        if (yesRatio >= 2 / 3) lockedOutcome = "Passed";
        else if (noRatio >= 2 / 3) lockedOutcome = "Failed";

        // allow minimal validation, but override with lockedOutcome when present
        motionDoc.decisionDetails = {
          outcome:
            lockedOutcome ||
            body.decisionDetails.outcome ||
            motionDoc.decisionDetails?.outcome ||
            undefined,
          summary:
            body.decisionDetails.summary ||
            motionDoc.decisionDetails?.summary ||
            "",
          pros: Array.isArray(body.decisionDetails.pros)
            ? body.decisionDetails.pros
            : motionDoc.decisionDetails?.pros || [],
          cons: Array.isArray(body.decisionDetails.cons)
            ? body.decisionDetails.cons
            : motionDoc.decisionDetails?.cons || [],
          recordedAt:
            body.decisionDetails.recordedAt || new Date().toISOString(),
          recordedBy: body.decisionDetails.recordedBy || undefined,
        };
        // when decision recorded, ensure status reflects closed states when applicable
        if (
          motionDoc.status !== "postponed" &&
          motionDoc.status !== "referred"
        ) {
          if (motionDoc.decisionDetails.outcome) {
            const o = String(motionDoc.decisionDetails.outcome).toLowerCase();
            if (o.includes("pass") || o.includes("adopt"))
              motionDoc.status = "passed";
            else if (
              o.includes("fail") ||
              o.includes("reject") ||
              o.includes("tie")
            )
              motionDoc.status = "failed";
            else motionDoc.status = "closed";
          } else {
            motionDoc.status = "closed";
          }
        }
      }

      // Update meta if provided (postpone/refer info)
      if (body.meta && typeof body.meta === "object") {
        // meta modifications that affect status (postpone/refer) restricted to chair/owner
        if (
          (body.meta.postponeInfo ||
            body.meta.postponeOption ||
            body.meta.referInfo ||
            body.meta.referDetails) &&
          !(isOwner || isChair)
        ) {
          return {
            statusCode: 403,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              error: "Forbidden",
              message: "Only chair or owner can postpone or refer motions",
            }),
          };
        }
        motionDoc.meta = { ...(motionDoc.meta || {}), ...body.meta };
        // If postpone info is present, set status to postponed
        if (body.meta.postponeInfo || body.meta.postponeOption) {
          motionDoc.status = "postponed";
        }
        // If refer info provided, set status to referred
        if (body.meta.referInfo || body.meta.referDetails) {
          motionDoc.status = "referred";
          const info = body.meta.referInfo || body.meta.referDetails;
          const destId = String(
            info.destinationCommitteeId || info.toCommitteeId || ""
          ).trim();
          if (destId) {
            try {
              const newId = Date.now().toString();
              await Motion.create({
                _id: newId,
                committeeId: destId,
                title: motionDoc.title,
                description: motionDoc.description,
                status: "in-progress",
                votes: { yes: 0, no: 0, abstain: 0 },
                meta: {
                  referredFrom: {
                    committeeId: motionDoc.committeeId,
                    referredAt: new Date().toISOString(),
                  },
                },
              });
            } catch (e) {
              console.warn(
                "Failed to duplicate motion to destination committee:",
                e?.message || e
              );
            }
          }
        }
      }

      await motionDoc.save();

      const plain = motionDoc.toObject({ versionKey: false });
      const serialized = serializeMotion(plain);

      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(serialized),
      };
    }

    // ---------- DELETE: delete one or many ----------
    if (method === "DELETE") {
      const params = event.queryStringParameters || {};
      const id = params.id ? String(params.id).trim() : "";
      const committeeId = params.committeeId
        ? String(params.committeeId).trim()
        : "";

      // Case 1: delete a single motion by id
      if (id) {
        const motionDoc = await Motion.findById(id);
        if (!motionDoc) {
          return {
            statusCode: 404,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ error: "Motion not found" }),
          };
        }

        // 🔻 Cascade delete discussions for this motion
        const discussionResult = await Discussion.deleteMany({ motionId: id });

        await Motion.findByIdAndDelete(id);

        return {
          statusCode: 200,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            success: true,
            deletedId: id,
            deletedCount: 1,
            deletedDiscussions: discussionResult.deletedCount || 0,
          }),
        };
      }

      // Case 2: delete all motions for a specific committee
      if (committeeId) {
        // Find all motions for this committee so we know which discussions to delete
        const motionsToDelete = await Motion.find({ committeeId })
          .select("_id")
          .lean();

        const motionIds = motionsToDelete.map((m) => m._id);

        let deletedDiscussions = 0;
        if (motionIds.length > 0) {
          const discussionResult = await Discussion.deleteMany({
            motionId: { $in: motionIds },
          });
          deletedDiscussions = discussionResult.deletedCount || 0;
        }

        const result = await Motion.deleteMany({ committeeId });

        return {
          statusCode: 200,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            success: true,
            scope: "committee",
            committeeId,
            deletedCount: result.deletedCount || 0,
            deletedDiscussions,
          }),
        };
      }

      // Case 3: delete ALL motions in the collection
      const motionResult = await Motion.deleteMany({});

      // 🔻 Delete all discussions (since all motions are gone)
      const discussionResult = await Discussion.deleteMany({});

      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          success: true,
          scope: "all",
          deletedCount: motionResult.deletedCount || 0,
          deletedDiscussions: discussionResult.deletedCount || 0,
        }),
      };
    }

    // ---------- Method not allowed ----------
    return {
      statusCode: 405,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Method Not Allowed" }),
    };
  } catch (error) {
    console.error("Error handling motions:", error);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Failed to process motions" }),
    };
  }
}
