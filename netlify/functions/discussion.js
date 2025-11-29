// netlify/functions/discussion.js
// Manage comments (GET all/one, POST new)

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
      const commentId = params.id || null;
      const motionId = params.motionId || null;

      const data = readData();
      const comments = Array.isArray(data.comments) ? data.comments : [];

      if (commentId) {
        const found = comments.find((c) => c.id === commentId);
        return found
          ? {
              statusCode: 200,
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(found),
            }
          : {
              statusCode: 404,
              body: JSON.stringify({ error: "Comment not found" }),
            };
      }

      const result = motionId
        ? comments.filter((c) => c.motionId === motionId)
        : comments;

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
      const author = String(body.author || "").trim();
      const text = String(body.text || "").trim();

      // ✨ minimal additions:
      const stance = body.stance || null;
      const avatarUrl = body.avatarUrl || null;

      if (!motionId || !author || !text) {
        return {
          statusCode: 400,
          body: JSON.stringify({
            error: "motionId, author, and text are required",
          }),
        };
      }

      const data = readData();
      if (!Array.isArray(data.comments)) data.comments = [];

      const newComment = {
        id: "msg-" + Date.now(),
        motionId,
        author,
        text,
        createdAt: new Date().toISOString(),

        stance,
        avatarUrl,
      };

      data.comments.push(newComment);
      writeData(data);

      return {
        statusCode: 201,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newComment),
      };
    }

    return {
      statusCode: 405,
      body: JSON.stringify({ error: "Method Not Allowed" }),
    };
  } catch (err) {
    console.error("Error handling discussion:", err);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Failed to process discussion" }),
    };
  }
}
