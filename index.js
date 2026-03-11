
const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const bcrypt = require("bcrypt");
const db = require("./db");

const app = express();
app.use(express.json());

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// roomId -> Set of ws clients
const rooms = new Map();

// ─── Auth ────────────────────────────────────────────────────────────────────

app.post("/api/register", async (req, res) => {
  const { name, password } = req.body;
  const pass_hash = await bcrypt.hash(password, 10);
  try {
    const stmt = db.prepare("INSERT INTO users (name, pass_hash) VALUES (?, ?)");
    const { lastInsertRowid } = stmt.run(name, pass_hash);
    res.json({ id: lastInsertRowid, name });
  } catch {
    res.status(400).json({ error: "User already exists" });
  }
});

app.post("/api/login", async (req, res) => {
  const { name, password } = req.body;
  const user = db.prepare("SELECT * FROM users WHERE name = ?").get(name);
  if (!user || !(await bcrypt.compare(password, user.pass_hash)))
    return res.status(401).json({ error: "Invalid credentials" });
  res.json({ id: user.id, name: user.name });
});

// ─── Group Rooms ─────────────────────────────────────────────────────────────

app.post("/api/rooms/join", async (req, res) => {
  const { code, password, userId } = req.body;
  try {
    let room = db.prepare("SELECT * FROM chatrooms WHERE code = ?").get(code);
    if (!room) {
      const pass_hash = await bcrypt.hash(password, 10);
      const { lastInsertRowid } = db
        .prepare("INSERT INTO chatrooms (code, pass_hash, type) VALUES (?, ?, 'group')")
        .run(code, pass_hash);
      room = { id: lastInsertRowid, code, type: "group" };
    } else {
      if (!(await bcrypt.compare(password, room.pass_hash)))
        return res.status(401).json({ error: "Invalid room password" });
    }
    db.prepare("INSERT OR IGNORE INTO room_members (room_id, user_id) VALUES (?, ?)").run(room.id, userId);
    res.json({ roomId: room.id, code: room.code, type: "group" });
  } catch {
    res.status(500).json({ error: "Failed to join room" });
  }
});

// ─── DMs ─────────────────────────────────────────────────────────────────────

app.post("/api/dms", (req, res) => {
  const { currentUserId, targetUserId } = req.body;
  try {
    const existing = db.prepare(`
      SELECT r.id FROM chatrooms r
      JOIN room_members a ON a.room_id = r.id AND a.user_id = ?
      JOIN room_members b ON b.room_id = r.id AND b.user_id = ?
      WHERE r.type = 'dm'
      LIMIT 1
    `).get(currentUserId, targetUserId);

    if (existing) return res.json({ roomId: existing.id, type: "dm" });

    const { lastInsertRowid } = db
      .prepare("INSERT INTO chatrooms (type) VALUES ('dm')")
      .run();
    db.prepare("INSERT INTO room_members (room_id, user_id) VALUES (?, ?)").run(lastInsertRowid, currentUserId);
    db.prepare("INSERT INTO room_members (room_id, user_id) VALUES (?, ?)").run(lastInsertRowid, targetUserId);
    res.json({ roomId: lastInsertRowid, type: "dm" });
  } catch {
    res.status(500).json({ error: "Failed to initiate DM" });
  }
});

app.get("/api/users/:userId/dms", (req, res) => {
  try {
    const dms = db.prepare(`
      SELECT r.id AS roomId, u.id, u.name
      FROM chatrooms r
      JOIN room_members me ON me.room_id = r.id AND me.user_id = ?
      JOIN room_members other ON other.room_id = r.id AND other.user_id != ?
      JOIN users u ON u.id = other.user_id
      WHERE r.type = 'dm'
    `).all(req.params.userId, req.params.userId);
    res.json(dms.map(r => ({ roomId: r.roomId, partner: { id: r.id, name: r.name } })));
  } catch {
    res.status(500).json({ error: "Failed to fetch DMs" });
  }
});

// ─── Messages ─────────────────────────────────────────────────────────────────

app.post("/api/rooms/:roomId/messages", (req, res) => {
  const { roomId } = req.params;
  const { userId, content } = req.body;

  const member = db
    .prepare("SELECT 1 FROM room_members WHERE room_id = ? AND user_id = ?")
    .get(roomId, userId);
  if (!member) return res.status(403).json({ error: "Not a room member" });

  try {
    const { lastInsertRowid } = db
      .prepare("INSERT INTO messages (room_id, user_id, content) VALUES (?, ?, ?)")
      .run(roomId, userId, content);
    const msg = db.prepare("SELECT * FROM messages WHERE id = ?").get(lastInsertRowid);

    // Broadcast to WebSocket subscribers
    const payload = JSON.stringify({ action: "newMessage", message: msg });
    rooms.get(Number(roomId))?.forEach(client => {
      if (client.readyState === WebSocket.OPEN) client.send(payload);
    });

    res.json(msg);
  } catch {
    res.status(500).json({ error: "Failed to send message" });
  }
});

// ─── Profiles & Stats ─────────────────────────────────────────────────────────

app.get("/api/users/:userId/profile", (req, res) => {
  const user = db
    .prepare("SELECT id, name, created_at FROM users WHERE id = ?")
    .get(req.params.userId);
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json(user);
});

app.get("/api/users/:userId/stats", (req, res) => {
  try {
    const { userId } = req.params;
    const { total_messages } = db
      .prepare("SELECT COUNT(*) AS total_messages FROM messages WHERE user_id = ?")
      .get(userId);
    const { groups_joined } = db
      .prepare(`SELECT COUNT(*) AS groups_joined FROM room_members rm
                JOIN chatrooms r ON r.id = rm.room_id
                WHERE rm.user_id = ? AND r.type = 'group'`)
      .get(userId);
    const { active_dms } = db
      .prepare(`SELECT COUNT(*) AS active_dms FROM room_members rm
                JOIN chatrooms r ON r.id = rm.room_id
                WHERE rm.user_id = ? AND r.type = 'dm'`)
      .get(userId);
    res.json({ total_messages, groups_joined, active_dms });
  } catch {
    res.status(500).json({ error: "Failed to load stats" });
  }
});

// ─── WebSocket ─────────────────────────────────────────────────────────────────

wss.on("connection", ws => {
  let currentRoom = null;

  ws.on("message", raw => {
    let data;
    try { data = JSON.parse(raw); } catch { return; }

    if (data.action === "join") {
      const roomId = Number(data.roomId);

      // Leave previous room
      if (currentRoom !== null) rooms.get(currentRoom)?.delete(ws);

      // Join new room
      if (!rooms.has(roomId)) rooms.set(roomId, new Set());
      rooms.get(roomId).add(ws);
      currentRoom = roomId;

      // Send history
      const messages = db.prepare(`
        SELECT m.id, m.user_id, u.name, m.content, m.created_at
        FROM messages m JOIN users u ON u.id = m.user_id
        WHERE m.room_id = ? ORDER BY m.created_at ASC
      `).all(roomId);
      ws.send(JSON.stringify({ action: "history", messages }));
    }
  });

  ws.on("close", () => {
    if (currentRoom !== null) rooms.get(currentRoom)?.delete(ws);
  });
});

// ─── Start ─────────────────────────────────────────────────────────────────────

server.listen(3000, () => console.log("Server running on http://localhost:3000"));
