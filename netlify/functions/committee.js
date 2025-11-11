// netlify/functions/committee.js
// Manage committees (GET all/one, POST new, DELETE one)

import fs from "fs";
import path from "path";

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
      const committeeId = params.id || null;

      const data = readData();
      const committees = Array.isArray(data.committees) ? data.committees : [];

      // GET one
      if (committeeId) {
        const found = committees.find((c) => c.id === committeeId);
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
          body: JSON.stringify(found),
        };
      }

      // GET all
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(committees),
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

      const data = readData();
      if (!Array.isArray(data.committees)) data.committees = [];

      const newCommittee = {
        id: body.id || `committee-${Date.now()}`,
        name,
        createdAt: new Date().toISOString(),
      };

      data.committees.push(newCommittee);
      writeData(data);

      return {
        statusCode: 201,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newCommittee),
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

      const data = readData();
      const committees = Array.isArray(data.committees) ? data.committees : [];
      const exists = committees.some((c) => c.id === committeeId);

      if (!exists) {
        return {
          statusCode: 404,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ error: "Committee not found" }),
        };
      }

      data.committees = committees.filter((c) => c.id !== committeeId);
      writeData(data);

      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: `Deleted ${committeeId}` }),
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
