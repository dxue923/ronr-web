// netlify/functions/motions.js
// Serverless function for managing committee motions (GET all, GET one, POST new, PATCH update, DELETE)

import mongoose from "mongoose";
import Motion from "../../models/Motions.js";
import Committee from "../../models/Committee.js";
import Discussion from "../../models/Discussion.js"; // <-- NEW: for cascading deletes

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

let isConnected = false;

async function connectToDatabase() {
  if (isConnected) return;

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI is not set in environment variables");
  }

  await mongoose.connect(uri, {
    dbName: process.env.MONGODB_DB || undefined,
  });

  isConnected = true;
}

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
  return normalizeMotion(obj);
}

export async function handler(event) {
  try {
    await connectToDatabase();

    const method = event.httpMethod || "GET";

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
      const title = String(body.title ?? "").trim();
      const description = String(body.description ?? "").trim();
      const committeeId = String(body.committeeId || "").trim();

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

      const motionId = Date.now().toString();

      const newMotionDoc = await Motion.create({
        _id: motionId,
        committeeId,
        title,
        description,
        status: "in-progress",
        votes: { yes: 0, no: 0, abstain: 0 },
      });

      const plain = newMotionDoc.toObject({ versionKey: false });
      const serialized = serializeMotion(plain);

      return {
        statusCode: 201,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(serialized),
      };
    }

    // ---------- PATCH: update status and/or vote ----------
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

      // Update status if provided
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
        motionDoc.status = newStatus;
      }

      // Apply a vote if provided
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
        motionDoc.votes[vote] = Number(motionDoc.votes[vote] || 0) + 1;
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
