const fs = require('fs');
const path = require('path');

// Utility: JSON response
function json(status, data) {
  return {
    statusCode: status,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  };
}

function uid() {
  return (globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2, 9));
}

const DATA_DIR = path.join(__dirname, '..', 'data');
const FILE_PATH = path.join(DATA_DIR, 'committees.json');

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(FILE_PATH)) {
    fs.writeFileSync(FILE_PATH, JSON.stringify([]), 'utf8');
  }
}

function readCommittees() {
  ensureDataFile();
  const raw = fs.readFileSync(FILE_PATH, 'utf8');
  try {
    return JSON.parse(raw || '[]');
  } catch (err) {
    return [];
  }
}

function writeCommittees(list) {
  ensureDataFile();
  fs.writeFileSync(FILE_PATH, JSON.stringify(list, null, 2), 'utf8');
}

exports.handler = async function (event) {
  try {
    if (event.httpMethod !== 'POST') return json(405, { error: 'Only POST allowed' });

    const body = event.body ? JSON.parse(event.body) : {};
    const { name, members } = body.payload || body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return json(400, { error: 'Missing committee name' });
    }

    if (!Array.isArray(members) || members.length === 0) {
      return json(400, { error: 'At least one member required' });
    }

    const committees = readCommittees();
    const id = uid();
    const newCommittee = {
      id,
      name: name.trim(),
      members: members.map((m) => ({ name: m.name || '', username: m.username || '' })),
      createdAt: new Date().toISOString(),
      discussion: [],
    };
    committees.push(newCommittee);
    writeCommittees(committees);

    return json(201, { id });
  } catch (err) {
    return json(500, { error: err.message });
  }
};
