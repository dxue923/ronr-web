// netlify/functions/activeCommittee.js
// Manage the global activeCommitteeId in data.json
//   GET  -> return current activeCommitteeId (and its committee, if any)
//   POST -> update activeCommitteeId

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

    // ---------- GET: return activeCommitteeId ----------
    if (method === "GET") {
      const data = readData();
      const activeCommitteeId = data.activeCommitteeId || null;

      let committee = null;
      if (activeCommitteeId && Array.isArray(data.committees)) {
        committee =
          data.committees.find((c) => c.id === activeCommitteeId) || null;
      }

      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activeCommitteeId, committee }),
      };
    }

    // ---------- POST: update activeCommitteeId ----------
    if (method === "POST") {
      const body = JSON.parse(event.body || "{}");
      const committeeId = (body.id || body.committeeId || "").trim();

      if (!committeeId) {
        return {
          statusCode: 400,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ error: "committeeId (or id) is required" }),
        };
      }

      const data = readData();
      const committees = Array.isArray(data.committees) ? data.committees : [];

      const exists = committees.some((c) => c.id === committeeId);
      if (!exists) {
        return {
          statusCode: 400,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            error: `No committee found with id "${committeeId}"`,
          }),
        };
      }

      data.activeCommitteeId = committeeId;
      writeData(data);

      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activeCommitteeId: committeeId }),
      };
    }

    // ---------- Fallback ----------
    return {
      statusCode: 405,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Method Not Allowed" }),
    };
  } catch (err) {
    console.error("Error in activeCommittee:", err);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Failed to handle activeCommittee" }),
    };
  }
}
