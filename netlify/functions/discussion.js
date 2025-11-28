// netlify/functions/discussion.js

import mongoose from "mongoose";
import Discussion from "../../models/Discussion.js";
import Motion from "../../models/Motions.js";

const VALID_POSITIONS = ["pro", "con", "neutral"];

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

function serializeComment(doc) {
  if (!doc) return null;
  const obj = { ...doc };
  obj.id = obj._id;
  delete obj._id;
  return obj;
}

export async function handler(event) {
  try {
    await connectToDatabase();

    const method = event.httpMethod || "GET";

    // ---------- GET ----------
    if (method === "GET") {
      const params = event.queryStringParameters || {};
      const commentId = params.id || null;
      const motionId = params.motionId || null;

      if (commentId) {
        const comment = await Discussion.findById(commentId).lean();
        if (!comment) {
          return {
            statusCode: 404,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ error: "Comment not found" }),
          };
        }
        return {
          statusCode: 200,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(serializeComment(comment)),
        };
      }

      const query = {};
      if (motionId) query.motionId = motionId;

      const comments = await Discussion.find(query)
        .sort({ createdAt: 1 })
        .lean();
      const result = comments.map(serializeComment);

      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(result),
      };
    }

    // ---------- POST ----------
    if (method === "POST") {
      const body = JSON.parse(event.body || "{}");

      const motionId = String(body.motionId || "").trim();
      const authorId = String(body.authorId || body.author || "").trim();
      const text = String(body.text || "").trim();
      let position = String(body.position || "").trim().toLowerCase();

      if (!motionId || !authorId || !text) {
        return {
          statusCode: 400,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            error: "motionId, authorId, and text are required",
          }),
        };
      }

      // Ensure the motion exists
      const motionExists = await Motion.findById(motionId).lean();
      if (!motionExists) {
        return {
          statusCode: 404,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ error: `Motion ${motionId} does not exist` }),
        };
      }

      if (!VALID_POSITIONS.includes(position)) {
        position = "neutral";
      }

      const commentId = "msg-" + Date.now().toString();

      const newCommentDoc = await Discussion.create({
        _id: commentId,
        motionId,
        authorId,
        text,
        position,
      });

      const plain = newCommentDoc.toObject({ versionKey: false });
      const serialized = serializeComment(plain);

      return {
        statusCode: 201,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(serialized),
      };
    }

    // ---------- DELETE ----------
    if (method === "DELETE") {
      const params = event.queryStringParameters || {};
      const commentId = params.id ? String(params.id).trim() : "";
      const motionId = params.motionId ? String(params.motionId).trim() : "";

      // Case 1: delete a single comment by id
      if (commentId) {
        const comment = await Discussion.findById(commentId);
        if (!comment) {
          return {
            statusCode: 404,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ error: "Comment not found" }),
          };
        }

        await Discussion.findByIdAndDelete(commentId);

        return {
          statusCode: 200,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            success: true,
            scope: "single",
            deletedId: commentId,
            deletedCount: 1,
          }),
        };
      }

      // Case 2: delete all comments for a motion
      if (motionId) {
        // Optional: ensure the motion exists first
        const motionExists = await Motion.findById(motionId).lean();
        if (!motionExists) {
          return {
            statusCode: 404,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ error: `Motion ${motionId} does not exist` }),
          };
        }

        const result = await Discussion.deleteMany({ motionId });

        return {
          statusCode: 200,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            success: true,
            scope: "motion",
            motionId,
            deletedCount: result.deletedCount || 0,
          }),
        };
      }

      // Case 3: delete ALL comments
      const result = await Discussion.deleteMany({});
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          success: true,
          scope: "all",
          deletedCount: result.deletedCount || 0,
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
    console.error("Error handling discussion:", err);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: "Failed to process discussion",
        details: err.message,
      }),
    };
  }
}
