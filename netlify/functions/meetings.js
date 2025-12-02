import mongoose from "mongoose";
import Meeting from "../../models/Meeting.js";
import Motion from "../../models/Motions.js";
import Committee from "../../models/Committee.js";
import jwt from "jsonwebtoken";

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
  return (
    c.nickname ||
    c.preferred_username ||
    c.name ||
    c.email ||
    c.sub ||
    "user"
  ).toString();
}

async function getRole(committeeId, username) {
  if (!committeeId) return null;
  const committee = await Committee.findById(committeeId).lean();
  if (!committee) return null;
  const uLower = username.toLowerCase();
  const member = (committee.members || []).find(
    (m) => (m.username || "").toLowerCase() === uLower
  );
  return member ? member.role : null;
}

let isConnected = false;
async function connectToDatabase() {
  if (isConnected) return;
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI not set");
  await mongoose.connect(uri, { dbName: process.env.MONGODB_DB || undefined });
  isConnected = true;
}

function serialize(doc) {
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
    const authHeader =
      event.headers?.authorization || event.headers?.Authorization || "";
    let claims = {};
    try {
      claims = decodeAuth(authHeader);
    } catch (e) {
      if (method !== "GET") {
        return {
          statusCode: 401,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ error: "Unauthorized", message: e.message }),
        };
      }
    }
    const actorUsername = usernameFromClaims(claims).trim();
    const params = event.queryStringParameters || {};

    if (method === "GET") {
      const committeeId = String(params.committeeId || "").trim();
      if (!committeeId) {
        return {
          statusCode: 400,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ error: "committeeId required" }),
        };
      }
      const current = await Meeting.findOne({
        committeeId,
        active: true,
      }).lean();
      if (current) {
        return {
          statusCode: 200,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(serialize(current)),
        };
      }
      const last = await Meeting.find({ committeeId })
        .sort({ seq: -1 })
        .limit(1)
        .lean();
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(serialize(last[0]) || null),
      };
    }

    if (method === "POST") {
      const body = JSON.parse(event.body || "{}");
      const committeeId = String(body.committeeId || "").trim();
      if (!committeeId) {
        return {
          statusCode: 400,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ error: "committeeId required" }),
        };
      }
      const role = await getRole(committeeId, actorUsername);
      if (!role || (role !== "chair" && role !== "owner")) {
        return {
          statusCode: 403,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            error: "Forbidden",
            message: "Only chair or owner can start meetings",
          }),
        };
      }
      const last = await Meeting.find({ committeeId })
        .sort({ seq: -1 })
        .limit(1)
        .lean();
      const nextSeq = (last[0]?.seq || 0) + 1;
      const id = Date.now().toString();
      const doc = await Meeting.create({
        _id: id,
        committeeId,
        seq: nextSeq,
        active: true,
        recessed: false,
      });

      // Opportunistic lifting: motions postponed to next_meeting
      await Motion.updateMany(
        {
          committeeId,
          status: "postponed",
          "meta.postponeInfo.type": "meeting",
          "meta.postponeInfo.targetMeetingSeq": nextSeq,
        },
        { $set: { status: "in-progress" }, $unset: { "meta.postponeInfo": "" } }
      );

      return {
        statusCode: 201,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(serialize(doc.toObject())),
      };
    }

    if (method === "PATCH") {
      const body = JSON.parse(event.body || "{}");
      const id = String(body.id || "").trim();
      if (!id) {
        return {
          statusCode: 400,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ error: "id required" }),
        };
      }
      const doc = await Meeting.findById(id);
      if (!doc) {
        return {
          statusCode: 404,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ error: "Meeting not found" }),
        };
      }
      const role = await getRole(doc.committeeId, actorUsername);
      if (!role || (role !== "chair" && role !== "owner")) {
        return {
          statusCode: 403,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            error: "Forbidden",
            message: "Only chair or owner can modify meetings",
          }),
        };
      }
      if (typeof body.recessed === "boolean") doc.recessed = body.recessed;
      if (typeof body.active === "boolean") doc.active = body.active;
      await doc.save();

      // When resuming from recess, no motion changes. When adjourning (active=false), mark ongoing motions carry-over is handled client-side today.
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(serialize(doc.toObject())),
      };
    }

    return {
      statusCode: 405,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Method Not Allowed" }),
    };
  } catch (err) {
    console.error("meetings handler error", err);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Failed to process meetings" }),
    };
  }
}
