// netlify/functions/discussion.js
// Handles discussion comments (list/create/delete). Uses shared mongoose connection helper.

import Discussion from "../../models/Discussion.js";
import Motion from "../../models/Motions.js";
import { connectToDatabase } from "../../db/mongoose.js";
import mongoose from "../../db/mongoose.js";

function getMongooseInstance() {
  try {
    if (typeof mongoose === "object" && mongoose && mongoose.default) {
      return mongoose.default;
    }
  } catch (e) {}
  return mongoose;
}

function getDb() {
  const m = getMongooseInstance();
  return m && m.connection ? m.connection.db : null;
}

const VALID_POSITIONS = ["pro", "con", "neutral"];

function serializeComment(doc) {
  if (!doc) return null;
  const obj = doc.toObject ? doc.toObject({ versionKey: false }) : { ...doc };
  obj.id = obj._id;
  delete obj._id;
  return obj;
}

export async function handler(event) {
  try {
    try {
      await connectToDatabase();
    } catch (e) {
      console.error("Discussion: DB connection failed", e);
      return {
        statusCode: 503,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: "Database unavailable",
          details: e.message || String(e),
        }),
      };
    }

    const method = (event.httpMethod || "GET").toUpperCase();

    // ---------- GET ----------
    if (method === "GET") {
      const params = event.queryStringParameters || {};
      const commentId = params.id || null;
      const motionId = params.motionId || null;

      // single comment
      if (commentId) {
        let comment = null;
        try {
          const db = getDb();
          if (db) {
            try {
              comment = await db.collection("discussions").findOne({ _id: commentId });
            } catch (e) {
              console.warn("[discussion] collection.findOne failed", e?.message || e);
            }
          }
        } catch (e) {}
        if (!comment) {
          try {
            if (Discussion && typeof Discussion.findById === "function") {
              comment = await Discussion.findById(commentId).lean();
            }
          } catch (e) {
            console.warn("[discussion] model.findById failed", e?.message || e);
          }
        }
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

      // all comments (optionally filtered by motion)
      const query = {};
      if (motionId) query.motionId = motionId;

      let comments = [];
      try {
        const db = getDb();
        if (db) {
          comments = await db.collection("discussions").find(query).sort({ createdAt: 1 }).toArray();
        } else if (Discussion && typeof Discussion.find === "function") {
          comments = await Discussion.find(query).sort({ createdAt: 1 }).lean();
        }
      } catch (e) {
        console.warn("[discussion] find failed", e?.message || e);
        comments = [];
      }
      const result = comments.map(serializeComment);

      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(result),
      };
    }

    // ---------- POST ----------
    if (method === "POST") {
      let body = {};
      try {
        body = JSON.parse(event.body || "{}");
      } catch {
        return {
          statusCode: 400,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ error: "Invalid JSON body" }),
        };
      }

      const motionId = String(body.motionId || "").trim();
      const authorId = String(body.authorId || body.author || "").trim();
      const text = String(body.text || "").trim();
      let position = String(body.position || "")
        .trim()
        .toLowerCase();

      if (!motionId || !authorId || !text) {
        return {
          statusCode: 400,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            error: "motionId, authorId, and text are required",
          }),
        };
      }

      // Strictly enforce that the motion exists
      let motionExists = null;
      try {
        const db2 = getDb();
        if (db2) {
          motionExists = await db2.collection("motions").findOne({ _id: motionId });
        } else if (Motion && typeof Motion.findById === "function") {
          motionExists = await Motion.findById(motionId).lean();
        }
      } catch (e) {
        console.warn("[discussion] motion lookup failed", e?.message || e);
      }
      if (!motionExists) {
        return {
          statusCode: 404,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            error: `Motion ${motionId} does not exist`,
          }),
        };
      }

      if (!VALID_POSITIONS.includes(position)) {
        position = "neutral";
      }

      const commentId = "msg-" + Date.now().toString();

      let newCommentDoc = {
        _id: commentId,
        motionId,
        authorId,
        text,
        position,
        createdAt: new Date().toISOString(),
      };
      try {
        const db3 = getDb();
        if (db3) {
          await db3.collection("discussions").insertOne(newCommentDoc);
        } else if (Discussion && typeof Discussion.create === "function") {
          const created = await Discussion.create(newCommentDoc);
          newCommentDoc = created.toObject ? created.toObject() : created;
        }
      } catch (e) {
        console.error("[discussion] create failed:", e);
        return {
          statusCode: 500,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ error: "Failed to create comment", details: String(e?.message || e) }),
        };
      }

      const serialized = serializeComment(newCommentDoc);

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
        let comment = null;
        try {
          const db4 = getDb();
          if (db4) {
            comment = await db4.collection("discussions").findOne({ _id: commentId });
          }
        } catch (e) {}
        if (!comment) {
          try {
            if (Discussion && typeof Discussion.findById === "function") {
              comment = await Discussion.findById(commentId);
            }
          } catch (e) {
            console.warn("[discussion] findById (delete) failed", e?.message || e);
          }
        }
        if (!comment) {
          return {
            statusCode: 404,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ error: "Comment not found" }),
          };
        }

        try {
          const db5 = getDb();
          if (db5) {
            await db5.collection("discussions").deleteOne({ _id: commentId });
          } else if (Discussion && typeof Discussion.findByIdAndDelete === "function") {
            await Discussion.findByIdAndDelete(commentId);
          }
        } catch (e) {
          console.warn("[discussion] delete failed", e?.message || e);
        }

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
        let motionExists2 = null;
        try {
          const db6 = getDb();
          if (db6) {
            motionExists2 = await db6.collection("motions").findOne({ _id: motionId });
          } else if (Motion && typeof Motion.findById === "function") {
            motionExists2 = await Motion.findById(motionId).lean();
          }
        } catch (e) {
          console.warn("[discussion] motion lookup (delete) failed", e?.message || e);
        }
        if (!motionExists2) {
          return {
            statusCode: 404,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              error: `Motion ${motionId} does not exist`,
            }),
          };
        }

        let result = { deletedCount: 0 };
        try {
          const db7 = getDb();
          if (db7) {
            result = await db7.collection("discussions").deleteMany({ motionId });
          } else if (Discussion && typeof Discussion.deleteMany === "function") {
            result = await Discussion.deleteMany({ motionId });
          }
        } catch (e) {
          console.warn("[discussion] deleteMany failed", e?.message || e);
          result = { deletedCount: 0 };
        }

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

      // No id or motionId -> treat as bad request (instead of nuking ALL)
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: "id or motionId is required to delete comments",
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
        details: err.message || String(err),
      }),
    };
  }
}
