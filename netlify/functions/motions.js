// Temporary in-memory motion store (resets on reload)
let motions = [
  { id: "1", name: "Motion 1: Budget Approval", discussion: [], active: true },
  { id: "2", name: "Motion 2: New Policy Proposal", discussion: [], active: false },
  { id: "3", name: "Motion 3: Event Planning", discussion: [], active: false },
];

// Helper: standard JSON response
function json(status, data) {
  return {
    statusCode: status,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  };
}

// Helper: generate unique IDs
function uid() {
  return (globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2, 9));
}

// Main Netlify function handler
export async function handler(event) {
  const { httpMethod, queryStringParameters, body } = event;

  try {
    switch (httpMethod) {
      // GET /api/motions
      // GET /api/motions?id=123
      case "GET": {
        const id = queryStringParameters?.id;
        if (id) {
          const motion = motions.find((m) => m.id === id);
          return motion ? json(200, motion) : json(404, { error: "Motion not found" });
        }
        return json(200, motions);
      }

      // POST /api/motions
      case "POST": {
        const data = JSON.parse(body || "{}");
        if (!data.name || !data.name.trim()) {
          return json(400, { error: "Missing motion name" });
        }
        const newMotion = {
          id: uid(),
          name: data.name.trim(),
          discussion: [],
          active: false,
        };
        motions.push(newMotion);
        return json(201, newMotion);
      }

      // PATCH /api/motions?id=123
      case "PATCH": {
        const id = queryStringParameters?.id;
        if (!id) return json(400, { error: "Missing motion ID" });

        const idx = motions.findIndex((m) => m.id === id);
        if (idx === -1) return json(404, { error: "Motion not found" });

        const data = JSON.parse(body || "{}");
        motions[idx] = {
          ...motions[idx],
          ...(typeof data.name === "string" ? { name: data.name.trim() } : {}),
          ...(typeof data.active === "boolean" ? { active: data.active } : {}),
        };

        return json(200, motions[idx]);
      }

      // DELETE /api/motions?id=123
      case "DELETE": {
        const id = queryStringParameters?.id;
        if (!id) return json(400, { error: "Missing motion ID" });

        motions = motions.filter((m) => m.id !== id);
        return { statusCode: 204, body: "" };
      }

      default:
        return json(405, { error: "Method not allowed" });
    }
  } catch (err) {
    return json(500, { error: err.message });
  }
}