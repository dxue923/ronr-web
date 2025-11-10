// netlify/functions/motions.js
// Serverless function for managing committee motions (GET all, GET one, POST new)

import fs from "fs";
import path from "path";

export async function handler(event) {
  // Locate and interact with data.json (the pseudo-database)
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

    // ---------- GET: Retrieve all motions or one by ID ----------
    if (method === "GET") {
      const params = event.queryStringParameters || {};
      const motionId = params.id || null;
      const filterCommitteeId = params.committeeId || null;

      const data = readData();

      // make sure the top-level arrays exist
      const motions = data.motions || [];
      const activeCommitteeId = data.activeCommitteeId || null;

      // if they asked for a single motion by id
      if (motionId) {
        const motion = motions.find((m) => m.id === motionId);
        if (!motion) {
          return {
            statusCode: 404,
            body: JSON.stringify({ error: "Motion not found" }),
          };
        }
        return {
          statusCode: 200,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(motion),
        };
      }

      const committeeToUse = filterCommitteeId || activeCommitteeId; // <— unchanged
      const result = committeeToUse
        ? motions.filter((m) => m.committeeId === committeeToUse) // <— changed line
        : motions;

      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(result),
      };
    }

    // ---------- POST: Create a new motion ----------
    if (method === "POST") {
      const body = JSON.parse(event.body || "{}");
      const title = String(body.title ?? "").trim();
      const description = String(body.description ?? "").trim();

      if (!title) {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: "Motion title is required" }),
        };
      }

      const data = readData();

      // make sure arrays exist
      if (!Array.isArray(data.motions)) data.motions = [];
      if (!Array.isArray(data.committees)) data.committees = [];

      // decide which committee this motion belongs to
      const committeeId =
        body.committeeId ||
        data.activeCommitteeId ||
        (data.committees[0] && data.committees[0].id) ||
        null;

      if (!committeeId) {
        return {
          statusCode: 400,
          body: JSON.stringify({
            error: "No committeeId provided and no active committee set",
          }),
        };
      }

      // Build and append the new motion object (flat, not nested)
      const newMotion = {
        id: Date.now().toString(),
        committeeId,
        title,
        description,
        status: "open",
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

    // ---------- Fallback: Unsupported HTTP method ----------
    return {
      statusCode: 405,
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
