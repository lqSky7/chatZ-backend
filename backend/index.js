const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const bcrypt = require("bcrypt");
const cors = require("cors");
const { initDB, getDB, saveDB } = require("./db");

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// roomId -> Set of ws clients
const rooms = new Map();

// ─── Helper: run sql.js queries like better-sqlite3 ──────────────────────────

// sql.js returns BigInt for INTEGER columns — convert to plain Numbers
function normalizeRow(row) {
  if (!row) return null;
  const out = {};
  for (const [key, val] of Object.entries(row)) {
    out[key] = typeof val === 'bigint' ? Number(val) : val;
  }
  return out;
}

function dbRun(sql, params = []) {
  const db = getDB();
  db.run(sql, params);
  const result = db.exec("SELECT last_insert_rowid() AS id");
  const raw = result[0]?.values[0]?.[0];
  const lastInsertRowid = typeof raw === 'bigint' ? Number(raw) : raw;
  saveDB();
  return { lastInsertRowid };
}

function dbGet(sql, params = []) {
  const db = getDB();
  const stmt = db.prepare(sql);
  stmt.bind(params);
  if (stmt.step()) {
    const row = normalizeRow(stmt.getAsObject());
    stmt.free();
    return row;
  }
  stmt.free();
  return null;
}

function dbAll(sql, params = []) {
  const db = getDB();
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    rows.push(normalizeRow(stmt.getAsObject()));
  }
  stmt.free();
  return rows;
}

// ─── Auth ────────────────────────────────────────────────────────────────────

app.post("/api/register", async (req, res) => {
  const { name, password } = req.body;
  const pass_hash = await bcrypt.hash(password, 10);
  try {
    const { lastInsertRowid } = dbRun(
      "INSERT INTO users (name, pass_hash) VALUES (?, ?)",
      [name, pass_hash]
    );
    res.json({ id: lastInsertRowid, name });
  } catch {
    res.status(400).json({ error: "User already exists" });
  }
});

app.post("/api/login", async (req, res) => {
  const { name, password } = req.body;
  const user = dbGet("SELECT * FROM users WHERE name = ?", [name]);
  if (!user || !(await bcrypt.compare(password, user.pass_hash)))
    return res.status(401).json({ error: "Invalid credentials" });
  res.json({ id: user.id, name: user.name });
});

// ─── Group Rooms ─────────────────────────────────────────────────────────────

app.post("/api/rooms/join", async (req, res) => {
  const { code, password, userId } = req.body;
  try {
    let room = dbGet("SELECT * FROM chatrooms WHERE code = ?", [code]);
    if (!room) {
      const pass_hash = await bcrypt.hash(password, 10);
      const { lastInsertRowid } = dbRun(
        "INSERT INTO chatrooms (code, pass_hash, type) VALUES (?, ?, 'group')",
        [code, pass_hash]
      );
      room = { id: lastInsertRowid, code, type: "group" };
    } else {
      if (!(await bcrypt.compare(password, room.pass_hash)))
        return res.status(401).json({ error: "Invalid room password" });
    }
    dbRun(
      "INSERT OR IGNORE INTO room_members (room_id, user_id) VALUES (?, ?)",
      [room.id, userId]
    );
    res.json({ roomId: room.id, code: room.code, type: "group" });
  } catch {
    res.status(500).json({ error: "Failed to join room" });
  }
});

// ─── DMs ─────────────────────────────────────────────────────────────────────

app.post("/api/dms", (req, res) => {
  const { currentUserId, targetUserId } = req.body;
  try {
    const existing = dbGet(
      `SELECT r.id FROM chatrooms r
       JOIN room_members a ON a.room_id = r.id AND a.user_id = ?
       JOIN room_members b ON b.room_id = r.id AND b.user_id = ?
       WHERE r.type = 'dm'
       LIMIT 1`,
      [currentUserId, targetUserId]
    );

    if (existing) return res.json({ roomId: existing.id, type: "dm" });

    const { lastInsertRowid } = dbRun(
      "INSERT INTO chatrooms (type) VALUES ('dm')"
    );
    dbRun(
      "INSERT INTO room_members (room_id, user_id) VALUES (?, ?)",
      [lastInsertRowid, currentUserId]
    );
    dbRun(
      "INSERT INTO room_members (room_id, user_id) VALUES (?, ?)",
      [lastInsertRowid, targetUserId]
    );
    res.json({ roomId: lastInsertRowid, type: "dm" });
  } catch {
    res.status(500).json({ error: "Failed to initiate DM" });
  }
});

app.get("/api/users/:userId/dms", (req, res) => {
  try {
    const dms = dbAll(
      `SELECT r.id AS roomId, u.id, u.name
       FROM chatrooms r
       JOIN room_members me ON me.room_id = r.id AND me.user_id = ?
       JOIN room_members other ON other.room_id = r.id AND other.user_id != ?
       JOIN users u ON u.id = other.user_id
       WHERE r.type = 'dm'`,
      [req.params.userId, req.params.userId]
    );
    res.json(
      dms.map((r) => ({
        roomId: r.roomId,
        partner: { id: r.id, name: r.name },
      }))
    );
  } catch {
    res.status(500).json({ error: "Failed to fetch DMs" });
  }
});

// ─── Messages ─────────────────────────────────────────────────────────────────

app.post("/api/rooms/:roomId/messages", (req, res) => {
  const { roomId } = req.params;
  const { userId, content } = req.body;

  const member = dbGet(
    "SELECT 1 AS ok FROM room_members WHERE room_id = ? AND user_id = ?",
    [roomId, userId]
  );
  if (!member) return res.status(403).json({ error: "Not a room member" });

  try {
    const { lastInsertRowid } = dbRun(
      "INSERT INTO messages (room_id, user_id, content) VALUES (?, ?, ?)",
      [roomId, userId, content]
    );
    const msg = dbGet("SELECT * FROM messages WHERE id = ?", [lastInsertRowid]);

    // Look up sender name for the broadcast
    const sender = dbGet("SELECT name FROM users WHERE id = ?", [userId]);
    const fullMsg = { ...msg, name: sender?.name || 'Unknown' };

    // Broadcast to WebSocket subscribers
    const payload = JSON.stringify({ action: "newMessage", message: fullMsg });
    rooms.get(Number(roomId))?.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) client.send(payload);
    });

    res.json(fullMsg);
  } catch {
    res.status(500).json({ error: "Failed to send message" });
  }
});

// ─── Profiles & Stats ─────────────────────────────────────────────────────────

app.get("/api/users/:userId/profile", (req, res) => {
  const user = dbGet(
    "SELECT id, name, created_at FROM users WHERE id = ?",
    [req.params.userId]
  );
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json(user);
});

app.get("/api/users/:userId/stats", (req, res) => {
  try {
    const { userId } = req.params;
    const msgRow = dbGet(
      "SELECT COUNT(*) AS total_messages FROM messages WHERE user_id = ?",
      [userId]
    );
    const groupRow = dbGet(
      `SELECT COUNT(*) AS groups_joined FROM room_members rm
       JOIN chatrooms r ON r.id = rm.room_id
       WHERE rm.user_id = ? AND r.type = 'group'`,
      [userId]
    );
    const dmRow = dbGet(
      `SELECT COUNT(*) AS active_dms FROM room_members rm
       JOIN chatrooms r ON r.id = rm.room_id
       WHERE rm.user_id = ? AND r.type = 'dm'`,
      [userId]
    );
    res.json({
      total_messages: msgRow?.total_messages || 0,
      groups_joined: groupRow?.groups_joined || 0,
      active_dms: dmRow?.active_dms || 0,
    });
  } catch {
    res.status(500).json({ error: "Failed to load stats" });
  }
});

// ─── WebSocket ─────────────────────────────────────────────────────────────────

wss.on("connection", (ws) => {
  let currentRoom = null;

  ws.on("message", (raw) => {
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      return;
    }

    if (data.action === "join") {
      const roomId = Number(data.roomId);

      // Leave previous room
      if (currentRoom !== null) rooms.get(currentRoom)?.delete(ws);

      // Join new room
      if (!rooms.has(roomId)) rooms.set(roomId, new Set());
      rooms.get(roomId).add(ws);
      currentRoom = roomId;

      // Send history
      const messages = dbAll(
        `SELECT m.id, m.user_id, u.name, m.content, m.created_at
         FROM messages m JOIN users u ON u.id = m.user_id
         WHERE m.room_id = ? ORDER BY m.created_at ASC`,
        [roomId]
      );
      ws.send(JSON.stringify({ action: "history", messages }));
    }
  });

  ws.on("close", () => {
    if (currentRoom !== null) rooms.get(currentRoom)?.delete(ws);
  });
});

// ─── Start ─────────────────────────────────────────────────────────────────────

async function start() {
  await initDB();
  server.listen(3000, () =>
    console.log("Server running on http://localhost:3000")
  );
}

start();
