function resolveCommitteeId(input) {
  return (input || "").toString().trim();
}
export async function getMeeting(committeeId) {
  const cid = (committeeId || "").toString().trim();
  const res = await fetch(
    `/.netlify/functions/meetings?committeeId=${encodeURIComponent(cid)}`,
    {
      cache: "no-store",
      headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
    }
  );
  if (!res.ok) throw new Error(`Meetings GET failed: ${res.status}`);
  return res.json();
}

export async function startMeeting(committeeId) {
  const cid = (committeeId || "").toString().trim();
  const res = await fetch(`/.netlify/functions/meetings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ committeeId: cid }),
  });
  if (!res.ok) throw new Error(`Meetings POST failed: ${res.status}`);
  return res.json();
}

export async function updateMeeting(id, patch) {
  const res = await fetch(`/.netlify/functions/meetings`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, ...patch }),
  });
  if (!res.ok) throw new Error(`Meetings PATCH failed: ${res.status}`);
  return res.json();
}
