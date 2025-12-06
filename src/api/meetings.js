// Meetings API is disabled in this build. These stubs avoid calling the
// serverless meetings function and return safe defaults for the client.
export async function getMeeting(committeeId) {
  // Return null so callers keep their existing local state when meetings
  // are not available.
  return null;
}

export async function startMeeting(committeeId) {
  throw new Error("Meetings API disabled");
}

export async function updateMeeting(id, patch) {
  throw new Error("Meetings API disabled");
}
