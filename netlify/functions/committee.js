// netlify/functions/committee.js
// Manage committees (GET all/one, POST new, DELETE one) using MongoDB

import { connectToDatabase } from "../../db/mongoose.js";
import Committee from "../../models/Committee.js";
import Motion from "../../models/Motions.js"; // motions to cascade delete
import Discussion from "../../models/Discussion.js"; // NEW: to delete related discussions

console.log("Committee typeof:", typeof Committee);
console.log("Committee keys:", Committee && Object.keys(Committee));

// Convert Mongo document to client shape (id instead of _id)
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
    const method = event.httpMethod || "GET";
    await connectToDatabase();

    // ---------- GET ----------
    if (method === "GET") {
      const params = event.queryStringParameters || {};
      const committeeId = params.id || null;

      // GET one
      if (committeeId) {
        const found = await Committee.findById(committeeId);
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

      // GET all
      const docs = await Committee.find().sort({ createdAt: 1 });
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(docs.map(toClient)),
      };
    }

    // ---------- POST ----------
    if (method === "POST") {
      const body = JSON.parse(event.body || "{}");
      const name = String(body.name || "").trim();

      if (!name) {
        return {
          statusCode: 400,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ error: "name is required" }),
        };
      }

      const doc = await Committee.create({
        _id: body.id || `committee-${Date.now()}`,
        name,
        createdAt: new Date().toISOString(),
      });

      return {
        statusCode: 201,
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

      // First delete the committee itself
      const deletedCommittee = await Committee.findByIdAndDelete(committeeId);

      if (!deletedCommittee) {
        return {
          statusCode: 404,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ error: "Committee not found" }),
        };
      }

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

      // Cascade delete: remove all motions associated with this committee
      const motionResult = await Motion.deleteMany({ committeeId });

      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: `Deleted committee ${committeeId} and its associated motions & discussions`,
          deletedMotions: motionResult.deletedCount || 0,
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
