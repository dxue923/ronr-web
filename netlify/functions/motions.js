// netlify/functions/motions.js
// Serverless function for managing committee motions (GET all, GET one, POST new, PATCH update)

import fs from "fs";
import path from "path";

const VALID_STATUSES = ["active", "paused", "voting", "closed"];

function normalizeMotion(motion) {
  if (!motion) return motion;
  const normalized = { ...motion };

  // normalize status
  if (!VALID_STATUSES.includes(normalized.status)) {
    normalized.status = "active";
  }

  // normalize votes
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

export async function handler(event) {
  const filePath = path.join(
    process.cwd(),
    "netlify",
    "functions",
    "data.json"
  );

  const readData = () => JSON.parse(fs.readFileSync(filePath, "utf-8"));
  const writeData = (data) =>
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");

  try {
    const method = event.httpMethod || "GET";

    // ---------- GET ----------
    if (method === "GET") {
      const params = event.queryStringParameters || {};
      const motionId = params.id || null;
      const filterCommitteeId = params.committeeId || null;

      const data = readData();
      const motions = Array.isArray(data.motions) ? data.motions : [];
      const activeCommitteeId = data.activeCommitteeId || null;

      if (motionId) {
        const motion = motions.find((m) => m.id === motionId);
        if (!motion) {
          return {
            statusCode: 404,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ error: "Motion not found" }),
          };
        }
        return {
          statusCode: 200,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(normalizeMotion(motion)),
        };
      }

      const committeeToUse = filterCommitteeId || activeCommitteeId;
      const filtered = committeeToUse
        ? motions.filter((m) => m.committeeId === committeeToUse)
        : motions;

      const result = filtered.map(normalizeMotion);

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

      if (!title) {
        return {
          statusCode: 400,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ error: "Motion title is required" }),
        };
      }

      const data = readData();
      if (!Array.isArray(data.motions)) data.motions = [];
      if (!Array.isArray(data.committees)) data.committees = [];

      const committeeId =
        body.committeeId ||
        data.activeCommitteeId ||
        (data.committees[0] && data.committees[0].id) ||
        null;

      if (!committeeId) {
        return {
          statusCode: 400,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            error: "No committeeId provided and no active committee set",
          }),
        };
      }

      const newMotion = {
        id: Date.now().toString(),
        committeeId,
        title,
        description,
        status: "active",
        votes: {
          yes: 0,
          no: 0,
          abstain: 0,
        },
        createdAt: new Date().toISOString(),
      };

      data.motions.push(newMotion);
      writeData(data);

      return {
        statusCode: 201,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newMotion),
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

      const data = readData();
      const motions = Array.isArray(data.motions) ? data.motions : [];
      const index = motions.findIndex((m) => m.id === id);

      if (index === -1) {
        return {
          statusCode: 404,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ error: "Motion not found" }),
        };
      }

      const motion = normalizeMotion(motions[index]);

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
        motion.status = newStatus;
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
        motion.votes = motion.votes || { yes: 0, no: 0, abstain: 0 };
        motion.votes[vote] = Number(motion.votes[vote] || 0) + 1;
      }

      // Save updated motion back into array
      motions[index] = motion;
      data.motions = motions;
      writeData(data);

      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(motion),
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
