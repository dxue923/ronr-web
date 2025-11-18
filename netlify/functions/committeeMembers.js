// netlify/functions/committeeMembers.js
// Manage committee members (GET all/one, POST new, DELETE one)

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
      const memberId = params.id || null;
      const filterCommitteeId = params.committeeId || null;
      const filterUserId = params.userId || null;

      const data = readData();
      const members = Array.isArray(data.committeeMembers)
        ? data.committeeMembers
        : [];

      // GET one by id
      if (memberId) {
        const found = members.find((m) => m.id === memberId);
        if (!found) {
          return {
            statusCode: 404,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ error: "Committee member not found" }),
          };
        }
        return {
          statusCode: 200,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(found),
        };
      }

      // Filter by committeeId and/or userId
      let result = members;
      if (filterCommitteeId) {
        result = result.filter((m) => m.committeeId === filterCommitteeId);
      }
      if (filterUserId) {
        result = result.filter((m) => m.userId === filterUserId);
      }

      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(result),
      };
    }

    // ---------- POST ----------
    if (method === "POST") {
      const body = JSON.parse(event.body || "{}");

      const userId = String(body.userId || "").trim();
      const name = String(body.name || "").trim();
      const role = String(body.role || "").trim();
      const committeeId = String(body.committeeId || "").trim();

      if (!userId || !committeeId || !role) {
        return {
          statusCode: 400,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            error: "userId, committeeId, and role are required",
          }),
        };
      }

      const data = readData();
      if (!Array.isArray(data.committeeMembers)) data.committeeMembers = [];
      if (!Array.isArray(data.committees)) data.committees = [];

      // Check committee exists
      const exists = data.committees.some((c) => c.id === committeeId);
      if (!exists) {
        return {
          statusCode: 400,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            error: `No committee found with id "${committeeId}"`,
          }),
        };
      }

      // Optional: prevent duplicate membership
      const alreadyMember = data.committeeMembers.some(
        (m) => m.userId === userId && m.committeeId === committeeId
      );
      if (alreadyMember) {
        return {
          statusCode: 409,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            error: "User is already a member of this committee",
          }),
        };
      }

      const newMember = {
        id: "cm-" + Date.now().toString(),
        userId,
        name,
        role,
        committeeId,
      };

      data.committeeMembers.push(newMember);
      writeData(data);

      return {
        statusCode: 201,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newMember),
      };
    }

    // ---------- DELETE ----------
    if (method === "DELETE") {
      const params = event.queryStringParameters || {};
      const memberId = params.id || null;

      if (!memberId) {
        return {
          statusCode: 400,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ error: "Member id (id) is required" }),
        };
      }

      const data = readData();
      if (!Array.isArray(data.committeeMembers)) data.committeeMembers = [];

      const before = data.committeeMembers.length;
      data.committeeMembers = data.committeeMembers.filter(
        (m) => m.id !== memberId
      );
      const after = data.committeeMembers.length;

      if (before === after) {
        return {
          statusCode: 404,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ error: "Committee member not found" }),
        };
      }

      writeData(data);

      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deletedId: memberId }),
      };
    }

    // ---------- Method not allowed ----------
    return {
      statusCode: 405,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Method Not Allowed" }),
    };
  } catch (error) {
    console.error("Error handling committeeMembers:", error);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Failed to process committeeMembers" }),
    };
  }
}
