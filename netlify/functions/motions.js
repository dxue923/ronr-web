// netlify/functions/motions.js
// Serverless function for managing committee motions (GET all, GET one, POST new, PATCH update, DELETE)

import { connectToDatabase } from "../../db/mongoose.js";
import Motion from "../../models/Motions.js";
import Committee from "../../models/Committee.js";
import Discussion from "../../models/Discussion.js"; // for cascading deletes
import jwt from "jsonwebtoken";

// Helper to support bundler interop when importing mongoose
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

const DOMAIN = process.env.AUTH0_DOMAIN;
const AUDIENCE = process.env.AUTH0_AUDIENCE;
const IS_DEV = process.env.NETLIFY_DEV === "true";

function decodeAuth(authHeader = "") {
  // Permissive: allow missing/invalid tokens and return anonymous claims
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return { sub: "anonymous", nickname: "anon", name: "Anonymous" };
  }
  const token = authHeader.slice(7);
  try {
    const decoded = jwt.decode(token) || {};
    return decoded || { sub: "anonymous" };
  } catch {
    return { sub: "anonymous", nickname: "anon" };
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
  try {
    const db = getDb();
    let committee = null;
    if (db) {
      committee = await db
        .collection("committees")
        .findOne({ _id: committeeId });
    } else if (Committee && typeof Committee.findById === "function") {
      committee = await Committee.findById(committeeId).lean();
    }
    if (!committee) return null;
    const uLower = username.toLowerCase();
    const member = (committee.members || []).find(
      (m) => (m.username || "").toLowerCase() === uLower
    );
    return member ? member.role : null;
  } catch (e) {
    console.warn("[motions] getRoleForCommittee failed", e?.message || e);
    return null;
  }
}

// New canonical status list (include "voting" so it can be persisted/displayed)
const VALID_STATUSES = [
  "in-progress",
  "voting",
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
  // Treat legacy "active" as "in-progress". Preserve explicit "voting"
  if (normalized.status === "active") {
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
  // Provide `state` alias used by the frontend; mirror canonical `status`
  if (obj.status) obj.state = obj.status;
  return normalizeMotion(obj);
}

export async function handler(event) {
  try {
    await connectToDatabase();

    const method = event.httpMethod || "GET";
    const authHeader =
      event.headers?.authorization || event.headers?.Authorization || "";
    let claims = {};
    claims = decodeAuth(authHeader);
    const actorUsername = usernameFromClaims(claims).trim();

    // ---------- GET ----------
    if (method === "GET") {
      const params = event.queryStringParameters || {};
      const motionId = params.id || null;
      const filterCommitteeId = params.committeeId || null;
      const db = getDb();

      if (motionId) {
        let motionDoc = null;
        if (db) {
          motionDoc = await db.collection("motions").findOne({ _id: motionId });
        } else if (Motion && typeof Motion.findById === "function") {
          motionDoc = await Motion.findById(motionId).lean();
        }

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
      if (filterCommitteeId) query.committeeId = filterCommitteeId;

      let motions = [];
      if (db) {
        motions = await db.collection("motions").find(query).toArray();
      } else if (Motion && typeof Motion.find === "function") {
        motions = await Motion.find(query).lean();
      }

      const result = (motions || []).map(serializeMotion);
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
      const db = getDb();
      let committee = null;
      if (db) {
        committee = await db
          .collection("committees")
          .findOne({ _id: committeeId });
      } else if (Committee && typeof Committee.findById === "function") {
        committee = await Committee.findById(committeeId).lean();
      }
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
        // Auto-add actor as a member for permissive creation, except for
        // anonymous placeholder users (e.g. 'anon', 'anonymous', 'guest').
        const uname = (actorUsername || "").toString().trim().toLowerCase();
        const isAnon = !uname || ["anon", "anonymous", "guest"].includes(uname);
        if (!isAnon) {
          try {
            const db2 = getDb();
            if (db2) {
              await db2.collection("committees").updateOne(
                { _id: committeeId },
                {
                  $push: {
                    members: {
                      username: actorUsername,
                      name: actorUsername,
                      role: "member",
                      avatarUrl: "",
                    },
                  },
                }
              );
            } else if (
              Committee &&
              typeof Committee.findByIdAndUpdate === "function"
            ) {
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
            }
            role = "member";
          } catch (e) {
            // If auto-add fails, still proceed without blocking motion creation
            role = "member";
          }
        } else {
          // Do not persist anonymous placeholder accounts to committee members;
          // grant permissive role for creation without mutating committee.
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

      // If meta.referredFrom is provided, ensure it includes the originating
      // committee name so the receiving committee retains a persistent
      // human-readable origin even if the origin committee is later deleted.
      if (meta && meta.referredFrom && !meta.referredFrom.committeeName) {
        try {
          const db3 = getDb();
          if (db3) {
            const origin = await db3
              .collection("committees")
              .findOne({ _id: committeeId });
            meta.referredFrom.committeeName = origin?.name || committeeId;
          } else if (Committee && typeof Committee.findById === "function") {
            const origin = await Committee.findById(committeeId).lean();
            meta.referredFrom.committeeName = origin?.name || committeeId;
          } else {
            meta.referredFrom.committeeName = committeeId;
          }
        } catch (e) {
          meta.referredFrom.committeeName = committeeId;
        }
      }

      const db4 = getDb();
      const newMotionDoc = {
        _id: motionId,
        committeeId,
        title,
        description,
        status:
          meta && meta.referredFrom && typeof meta.referredFrom === "object"
            ? "referred"
            : "in-progress",
        votes: { yes: 0, no: 0, abstain: 0 },
        type,
        parentMotionId: type === "submotion" ? parentMotionId : null,
        meta: meta,
        createdById,
        createdByName,
        createdByUsername,
        createdByAvatarUrl,
        createdAt: new Date().toISOString(),
      };
      if (db4) {
        await db4.collection("motions").insertOne(newMotionDoc);
      } else if (Motion && typeof Motion.create === "function") {
        const created = await Motion.create(newMotionDoc);
        Object.assign(
          newMotionDoc,
          created.toObject ? created.toObject() : created
        );
      }
      const plain = newMotionDoc;
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

      const db5 = getDb();
      let motionDoc = null;
      if (db5) {
        motionDoc = await db5.collection("motions").findOne({ _id: id });
      } else if (Motion && typeof Motion.findById === "function") {
        motionDoc = await Motion.findById(id);
      }
      if (!motionDoc) {
        return {
          statusCode: 404,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ error: "Motion not found" }),
        };
      }

      // Normalize existing status/votes. Treat legacy "active" as in-progress;
      // preserve explicit "voting" so voting can be started and persisted.
      if (
        motionDoc.status === "active" ||
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

      // Update status if provided (allow updates to persist to DB)
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
        // Persist status regardless of role to ensure UI reflects latest state
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
        // Enforce backend voting window: only allow tallying when motion is in `voting` state
        if (motionDoc.status !== "voting") {
          return {
            statusCode: 403,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ error: "Voting is closed for this motion" }),
          };
        }
        // Permissive: allow any actor to vote; backend tallies aggregate
        const voterId = body.voterId ? String(body.voterId).trim() : "";
        // Maintain per-voter choices to allow changing votes until motion closes
        const meta = motionDoc.meta ? { ...motionDoc.meta } : {};
        const choices =
          meta.voterChoices && typeof meta.voterChoices === "object"
            ? { ...meta.voterChoices }
            : {};
        if (voterId) {
          const prev = choices[voterId];
          if (prev && ["yes", "no", "abstain"].includes(prev)) {
            // decrement previous aggregate
            motionDoc.votes[prev] = Math.max(
              0,
              Number(motionDoc.votes[prev] || 0) - 1
            );
          }
          // set new choice and increment aggregate
          choices[voterId] = vote;
          motionDoc.votes[vote] = Number(motionDoc.votes[vote] || 0) + 1;
          meta.voterChoices = choices;
          motionDoc.meta = meta;
        } else {
          // No voterId: treat as anonymous change; cannot decrement reliably, so increment
          motionDoc.votes[vote] = Number(motionDoc.votes[vote] || 0) + 1;
        }
      }

      // Save decision details if provided
      if (body.decisionDetails && typeof body.decisionDetails === "object") {
        // Accept and persist the fuller decision details (outcome, summary,
        // pros, cons) when the client provides them. Previously we only
        // retained the outcome which caused summaries/pros/cons to be lost
        // after saving and made the UI show "None recorded." Persisting the
        // provided fields preserves the chair's authored content.
        const outcomeVal =
          body.decisionDetails.outcome ||
          motionDoc.decisionDetails?.outcome ||
          undefined;
        const summaryVal =
          typeof body.decisionDetails.summary === "string"
            ? body.decisionDetails.summary
            : motionDoc.decisionDetails?.summary || undefined;
        const prosVal = Array.isArray(body.decisionDetails.pros)
          ? body.decisionDetails.pros
          : Array.isArray(motionDoc.decisionDetails?.pros)
          ? motionDoc.decisionDetails.pros
          : [];
        const consVal = Array.isArray(body.decisionDetails.cons)
          ? body.decisionDetails.cons
          : Array.isArray(motionDoc.decisionDetails?.cons)
          ? motionDoc.decisionDetails.cons
          : [];

        motionDoc.decisionDetails = {
          ...(outcomeVal ? { outcome: outcomeVal } : {}),
          ...(summaryVal ? { summary: summaryVal } : {}),
          pros: prosVal,
          cons: consVal,
          recordedAt:
            body.decisionDetails.recordedAt ||
            motionDoc.decisionDetails?.recordedAt ||
            new Date().toISOString(),
          recordedBy:
            body.decisionDetails.recordedBy ||
            motionDoc.decisionDetails?.recordedBy ||
            undefined,
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
        // Permissive: allow meta updates from any actor; status changes applied below
        motionDoc.meta = { ...(motionDoc.meta || {}), ...body.meta };
        // If postpone info is present, set status to postponed
        if (body.meta.postponeInfo || body.meta.postponeOption) {
          motionDoc.status = "postponed";
        }
        // If refer info provided, set status to referred
        if (body.meta.referInfo || body.meta.referDetails) {
          // When referring, mark original as closed (moved out of active list)
          motionDoc.status = "closed";
          const info = body.meta.referInfo || body.meta.referDetails;
          const destId = String(
            info.destinationCommitteeId || info.toCommitteeId || ""
          ).trim();
          if (destId) {
            try {
              const newId = Date.now().toString();
              // Avoid creating a duplicate if the destination already has
              // a motion that references this original via meta.referredFrom.originalMotionId
              const db6 = getDb();
              let existing = null;
              if (db6) {
                existing = await db6.collection("motions").findOne({
                  committeeId: destId,
                  "meta.referredFrom.originalMotionId": motionDoc._id,
                });
              } else if (Motion && typeof Motion.findOne === "function") {
                existing = await Motion.findOne({
                  committeeId: destId,
                  "meta.referredFrom.originalMotionId": motionDoc._id,
                }).lean();
              }
              if (!existing) {
                // Ensure the created referred motion records the origin's name
                let originName = motionDoc.committeeId;
                try {
                  const db7 = getDb();
                  if (db7) {
                    const origin = await db7
                      .collection("committees")
                      .findOne({ _id: motionDoc.committeeId });
                    originName = origin?.name || motionDoc.committeeId;
                  } else if (
                    Committee &&
                    typeof Committee.findById === "function"
                  ) {
                    const origin = await Committee.findById(
                      motionDoc.committeeId
                    ).lean();
                    originName = origin?.name || motionDoc.committeeId;
                  }
                } catch (e) {}
                const referredDoc = {
                  _id: newId,
                  committeeId: destId,
                  title: motionDoc.title,
                  description: motionDoc.description,
                  status: "referred",
                  votes: { yes: 0, no: 0, abstain: 0 },
                  meta: {
                    referredFrom: {
                      committeeId: motionDoc.committeeId,
                      committeeName: originName,
                      originalMotionId: motionDoc._id,
                      referredAt: new Date().toISOString(),
                      receivedAt: new Date().toISOString(),
                    },
                  },
                };
                const db8 = getDb();
                if (db8) {
                  await db8.collection("motions").insertOne(referredDoc);
                } else if (Motion && typeof Motion.create === "function") {
                  await Motion.create(referredDoc);
                }
              } else {
                // if existing found, make sure it has a receivedAt timestamp
                if (!existing.meta || !existing.meta.referredFrom?.receivedAt) {
                  const db9 = getDb();
                  if (db9) {
                    await db9
                      .collection("motions")
                      .updateOne(
                        { _id: existing._id },
                        {
                          $set: {
                            "meta.referredFrom.receivedAt":
                              new Date().toISOString(),
                          },
                        }
                      )
                      .catch(() => {});
                  } else if (Motion && typeof Motion.updateOne === "function") {
                    await Motion.updateOne(
                      { _id: existing._id },
                      {
                        $set: {
                          "meta.referredFrom.receivedAt":
                            new Date().toISOString(),
                        },
                      }
                    ).catch(() => {});
                  }
                }
              }
            } catch (e) {
              console.warn(
                "Failed to duplicate motion to destination committee:",
                e?.message || e
              );
            }
          }
        }
      }

      // Persist updated motionDoc back to the DB
      try {
        const db10 = getDb();
        const toSave = { ...motionDoc };
        delete toSave.__v;
        if (db10) {
          await db10
            .collection("motions")
            .updateOne({ _id: id }, { $set: toSave });
          motionDoc = await db10.collection("motions").findOne({ _id: id });
        } else if (Motion && typeof Motion.findByIdAndUpdate === "function") {
          motionDoc = await Motion.findByIdAndUpdate(id, toSave, { new: true });
        }
      } catch (e) {
        console.warn(
          "[motions] failed to persist updated motion",
          e?.message || e
        );
      }

      // If this motion is a referred/received motion and it just reached a
      // terminal passed state, mark the original motion as passed so the
      // originating committee records the successful outcome and the
      // parent/original moves into closed motions. (Previously this
      // reopened the original; change to reflect that a passed referral
      // should pass the originating motion as well.)
      try {
        const referredFrom = motionDoc.meta && motionDoc.meta.referredFrom;
        if (
          referredFrom &&
          (referredFrom.originalMotionId || referredFrom.motionId) &&
          motionDoc.status === "passed"
        ) {
          const originalId = String(
            referredFrom.originalMotionId || referredFrom.motionId
          ).trim();
          if (originalId) {
            const db11 = getDb();
            if (db11) {
              await db11
                .collection("motions")
                .updateOne({ _id: originalId }, { $set: { status: "passed" } });
              // create a copy of the original parent motion in the destination
              // committee with a new id and status 'in-progress'
              try {
                const originalDoc = await db11
                  .collection("motions")
                  .findOne({ _id: originalId });
                if (originalDoc) {
                  const newIdForDest = Date.now().toString();
                  const newMotionForDest = {
                    _id: newIdForDest,
                    committeeId: motionDoc.committeeId,
                    title: originalDoc.title || originalDoc.name || "",
                    description: originalDoc.description || "",
                    status: "in-progress",
                    votes: { yes: 0, no: 0, abstain: 0 },
                    type: originalDoc.type || "main",
                    parentMotionId: null,
                    meta: {
                      copiedFrom: {
                        originalMotionId: originalId,
                        originCommitteeId: originalDoc.committeeId,
                        copiedAt: new Date().toISOString(),
                      },
                    },
                    createdAt: new Date().toISOString(),
                  };
                  await db11.collection("motions").insertOne(newMotionForDest);
                }
              } catch (e) {
                console.warn(
                  "Failed to create parent-copy motion in destination:",
                  e?.message || e
                );
              }
            } else if (
              Motion &&
              typeof Motion.findOneAndUpdate === "function"
            ) {
              await Motion.findOneAndUpdate(
                { _id: originalId },
                { $set: { status: "passed" } },
                { new: true }
              ).lean();
              try {
                const originalDoc = await Motion.findOne({
                  _id: originalId,
                }).lean();
                if (originalDoc) {
                  const newIdForDest = Date.now().toString();
                  const newMotionForDest = {
                    _id: newIdForDest,
                    committeeId: motionDoc.committeeId,
                    title: originalDoc.title || originalDoc.name || "",
                    description: originalDoc.description || "",
                    status: "in-progress",
                    votes: { yes: 0, no: 0, abstain: 0 },
                    type: originalDoc.type || "main",
                    parentMotionId: null,
                    meta: {
                      copiedFrom: {
                        originalMotionId: originalId,
                        originCommitteeId: originalDoc.committeeId,
                        copiedAt: new Date().toISOString(),
                      },
                    },
                    createdAt: new Date().toISOString(),
                  };
                  await Motion.create(newMotionForDest);
                }
              } catch (e) {
                console.warn(
                  "Failed to create parent-copy motion in destination (mongoose):",
                  e?.message || e
                );
              }
            }
          }
        }
      } catch (e) {
        console.warn(
          "Failed to reopen original motion after refer result:",
          e?.message || e
        );
      }

      // If this motion is a submotion and it just passed, mark the parent
      // motion as passed as well so the parent moves to closed motions.
      try {
        if (
          motionDoc.type === "submotion" &&
          motionDoc.parentMotionId &&
          motionDoc.status === "passed"
        ) {
          const parentId = String(motionDoc.parentMotionId).trim();
          if (parentId) {
            const db_parent = getDb();
            if (db_parent) {
              await db_parent
                .collection("motions")
                .updateOne({ _id: parentId }, { $set: { status: "passed" } });
            } else if (
              Motion &&
              typeof Motion.findOneAndUpdate === "function"
            ) {
              await Motion.findOneAndUpdate(
                { _id: parentId },
                { $set: { status: "passed" } },
                { new: true }
              ).lean();
            }
          }
        }
      } catch (e) {
        console.warn(
          "Failed to update parent motion after submotion result:",
          e?.message || e
        );
      }

      const plain =
        motionDoc && typeof motionDoc.toObject === "function"
          ? motionDoc.toObject({ versionKey: false })
          : { ...motionDoc };
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
        const dbx = getDb();
        let motionDoc = null;
        if (dbx) {
          motionDoc = await dbx.collection("motions").findOne({ _id: id });
        } else if (Motion && typeof Motion.findById === "function") {
          motionDoc = await Motion.findById(id);
        }
        if (!motionDoc) {
          return {
            statusCode: 404,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ error: "Motion not found" }),
          };
        }

        // 🔻 Cascade delete discussions for this motion
        let discussionResult = { deletedCount: 0 };
        try {
          const db_disc = getDb();
          if (db_disc) {
            discussionResult = await db_disc
              .collection("discussions")
              .deleteMany({ motionId: id });
          } else if (
            Discussion &&
            typeof Discussion.deleteMany === "function"
          ) {
            discussionResult = await Discussion.deleteMany({ motionId: id });
          }
        } catch (e) {
          console.warn("[motions] discussion delete failed", e?.message || e);
          discussionResult = { deletedCount: 0 };
        }

        if (dbx) {
          await dbx.collection("motions").deleteOne({ _id: id });
        } else if (Motion && typeof Motion.findByIdAndDelete === "function") {
          await Motion.findByIdAndDelete(id);
        }

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
        const dbxx = getDb();
        // Find all motions for this committee so we know which discussions to delete
        let motionsToDelete = [];
        if (dbxx) {
          motionsToDelete = await dbxx
            .collection("motions")
            .find({ committeeId })
            .project({ _id: 1 })
            .toArray();
        } else if (Motion && typeof Motion.find === "function") {
          motionsToDelete = await Motion.find({ committeeId })
            .select("_id")
            .lean();
        }

        const motionIds = (motionsToDelete || []).map((m) => m._id);

        let deletedDiscussions = 0;
        if (motionIds.length > 0) {
          try {
            const db_disc2 = getDb();
            let discussionResult2 = { deletedCount: 0 };
            if (db_disc2) {
              discussionResult2 = await db_disc2
                .collection("discussions")
                .deleteMany({ motionId: { $in: motionIds } });
            } else if (
              Discussion &&
              typeof Discussion.deleteMany === "function"
            ) {
              discussionResult2 = await Discussion.deleteMany({
                motionId: { $in: motionIds },
              });
            }
            deletedDiscussions = discussionResult2.deletedCount || 0;
          } catch (e) {
            console.warn(
              "[motions] cascade discussion delete failed",
              e?.message || e
            );
            deletedDiscussions = 0;
          }
        }

        let result = { deletedCount: 0 };
        if (dbxx) {
          result = await dbxx.collection("motions").deleteMany({ committeeId });
        } else if (Motion && typeof Motion.deleteMany === "function") {
          result = await Motion.deleteMany({ committeeId });
        }

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
      const dball = getDb();
      let motionResult = { deletedCount: 0 };
      if (dball) {
        motionResult = await dball.collection("motions").deleteMany({});
      } else if (Motion && typeof Motion.deleteMany === "function") {
        motionResult = await Motion.deleteMany({});
      }

      // 🔻 Delete all discussions (since all motions are gone)
      let discussionResult = { deletedCount: 0 };
      try {
        const db_all = getDb();
        if (db_all) {
          discussionResult = await db_all
            .collection("discussions")
            .deleteMany({});
        } else if (Discussion && typeof Discussion.deleteMany === "function") {
          discussionResult = await Discussion.deleteMany({});
        }
      } catch (e) {
        console.warn(
          "[motions] delete all discussions failed",
          e?.message || e
        );
        discussionResult = { deletedCount: 0 };
      }

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
