const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const bcrypt = require("bcrypt");
const cors = require("cors");
const { initDB, dbRun, dbGet, dbAll } = require("./db");

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// roomId -> Set of ws clients
const rooms = new Map();

// ─── Health Check ────────────────────────────────────────────────────────────

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    service: "ChatZ Backend",
  });
});

app.get("/", (req, res) => {
  res.json({
    status: "ok",
    service: "ChatZ Backend",
    version: "1.0.0",
    endpoints: {
      health: "/health",
      auth: ["/api/register", "/api/login"],
      rooms: [
        "/api/rooms/join",
        "/api/users/:userId/rooms",
        "/api/rooms/:roomId/users",
        "/api/rooms/remove/:UserID",
      ],
      dms: ["/api/dms", "/api/users/:userId/dms"],
      messages: "/api/rooms/:roomId/messages",
      profiles: ["/api/users/:userId/profile", "/api/users/:userId/stats"],
      websocket: "ws://...",
    },
  });
});

// ─── Auth ────────────────────────────────────────────────────────────────────

app.post("/api/register", async (req, res) => {
  const { name, password } = req.body;
  const pass_hash = await bcrypt.hash(password, 10);
  try {
    const result = await dbRun(
      "INSERT INTO users (name, pass_hash) VALUES ($1, $2) RETURNING id",
      [name, pass_hash]
    );
    const id = result.rows[0]?.id || result.lastInsertRowid;
    res.json({ id, name });
  } catch {
    res.status(400).json({ error: "User already exists" });
  }
});

app.post("/api/login", async (req, res) => {
  const { name, password } = req.body;
  try {
    const user = await dbGet("SELECT * FROM users WHERE name = $1", [name]);
    if (!user || !(await bcrypt.compare(password, user.pass_hash)))
      return res.status(401).json({ error: "Invalid credentials" });
    res.json({ id: user.id, name: user.name });
  } catch {
    res.status(500).json({ error: "Login failed" });
  }
});

// ─── Group Rooms ─────────────────────────────────────────────────────────────

app.post("/api/rooms/join", async (req, res) => {
  const { code, password, userId } = req.body;
  try {
    let room = await dbGet("SELECT * FROM chatrooms WHERE code = $1", [code]);
    if (!room) {
      const pass_hash = await bcrypt.hash(password, 10);
      const result = await dbRun(
        "INSERT INTO chatrooms (code, pass_hash, type) VALUES ($1, $2, 'group') RETURNING id",
        [code, pass_hash]
      );
      room = { id: result.rows[0]?.id || result.lastInsertRowid, code, type: "group" };
    } else {
      if (!(await bcrypt.compare(password, room.pass_hash)))
        return res.status(401).json({ error: "Invalid room password" });
    }
    try {
      await dbRun(
        "INSERT INTO room_members (room_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
        [room.id, userId]
      );
    } catch {
      // Member already exists, that's fine
    }
    res.json({ roomId: room.id, code: room.code, type: "group" });
  } catch {
    res.status(500).json({ error: "Failed to join room" });
  }
});

app.get("/api/users/:userId/rooms", async (req, res) => {
  try {
    const rooms = await dbAll(
      `SELECT r.id AS "roomId", r.code, r.type
       FROM room_members rm
       JOIN chatrooms r ON r.id = rm.room_id
       WHERE rm.user_id = $1 AND r.type = 'group'
       ORDER BY r.id DESC`,
      [req.params.userId]
    );
    res.json(rooms);
  } catch {
    res.status(500).json({ error: "Failed to fetch rooms" });
  }
});

app.get("/api/rooms/:roomId/users", async (req, res) => {
  try {
    const { roomId } = req.params;
    const room = await dbGet("SELECT id, type FROM chatrooms WHERE id = $1", [roomId]);

    if (!room) {
      return res.status(404).json({ error: "Room not found" });
    }
    if (room.type !== "group") {
      return res.status(400).json({ error: "Only group rooms have member lists" });
    }

    const users = await dbAll(
      `SELECT u.id, u.name
       FROM room_members rm
       JOIN users u ON u.id = rm.user_id
       WHERE rm.room_id = $1
       ORDER BY u.name ASC`,
      [roomId]
    );

    res.json(users);
  } catch {
    res.status(500).json({ error: "Failed to fetch room users" });
  }
});

app.post("/api/rooms/remove/:UserID", async (req, res) => {
  try {
    const targetUserId = Number(req.params.UserID);
    const { roomId } = req.body;

    if (!targetUserId || !roomId) {
      return res.status(400).json({ error: "roomId and UserID are required" });
    }

    const room = await dbGet("SELECT id, type FROM chatrooms WHERE id = $1", [roomId]);
    if (!room) {
      return res.status(404).json({ error: "Room not found" });
    }
    if (room.type !== "group") {
      return res.status(400).json({ error: "Users can only be removed from group rooms" });
    }

    const membership = await dbGet(
      "SELECT 1 AS ok FROM room_members WHERE room_id = $1 AND user_id = $2",
      [roomId, targetUserId]
    );

    if (!membership) {
      return res.status(404).json({ error: "User is not in this room" });
    }

    await dbRun("DELETE FROM room_members WHERE room_id = $1 AND user_id = $2", [
      roomId,
      targetUserId,
    ]);

    res.json({ success: true, roomId: Number(roomId), removedUserId: targetUserId });
  } catch {
    res.status(500).json({ error: "Failed to remove user from room" });
  }
});

// ─── DMs ─────────────────────────────────────────────────────────────────────

app.post("/api/dms", async (req, res) => {
  const { currentUserId, targetUserId } = req.body;
  try {
    if (!currentUserId || !targetUserId) {
      return res.status(400).json({ error: "Both user IDs are required" });
    }
    if (Number(currentUserId) === Number(targetUserId)) {
      return res.status(400).json({ error: "Cannot start a DM with yourself" });
    }

    const [currentUser, targetUser] = await Promise.all([
      dbGet("SELECT id FROM users WHERE id = $1", [currentUserId]),
      dbGet("SELECT id FROM users WHERE id = $1", [targetUserId]),
    ]);

    if (!currentUser) {
      return res.status(404).json({ error: "Current user not found" });
    }
    if (!targetUser) {
      return res.status(404).json({ error: "Target user not found" });
    }

    const existing = await dbGet(
      `SELECT r.id FROM chatrooms r
       JOIN room_members a ON a.room_id = r.id AND a.user_id = $1
       JOIN room_members b ON b.room_id = r.id AND b.user_id = $2
       WHERE r.type = 'dm'
       LIMIT 1`,
      [currentUserId, targetUserId]
    );

    if (existing) return res.json({ roomId: existing.id, type: "dm" });

    const result = await dbRun(
      "INSERT INTO chatrooms (type) VALUES ('dm') RETURNING id"
    );
    const roomId = result.rows[0]?.id || result.lastInsertRowid;
    
    await dbRun(
      "INSERT INTO room_members (room_id, user_id) VALUES ($1, $2)",
      [roomId, currentUserId]
    );
    await dbRun(
      "INSERT INTO room_members (room_id, user_id) VALUES ($1, $2)",
      [roomId, targetUserId]
    );
    res.json({ roomId, type: "dm" });
  } catch {
    res.status(500).json({ error: "Failed to initiate DM" });
  }
});

app.get("/api/users/:userId/dms", async (req, res) => {
  try {
    const dms = await dbAll(
      `SELECT r.id AS "roomId", u.id, u.name
       FROM chatrooms r
       JOIN room_members me ON me.room_id = r.id AND me.user_id = $1
       JOIN room_members other ON other.room_id = r.id AND other.user_id != $2
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

app.post("/api/rooms/:roomId/messages", async (req, res) => {
  const { roomId } = req.params;
  const { userId, content } = req.body;

  try {
    const member = await dbGet(
      "SELECT 1 AS ok FROM room_members WHERE room_id = $1 AND user_id = $2",
      [roomId, userId]
    );
    if (!member) return res.status(403).json({ error: "Not a room member" });

    const result = await dbRun(
      "INSERT INTO messages (room_id, user_id, content) VALUES ($1, $2, $3) RETURNING id",
      [roomId, userId, content]
    );
    const msgId = result.rows[0]?.id || result.lastInsertRowid;
    const msg = await dbGet("SELECT * FROM messages WHERE id = $1", [msgId]);

    // Look up sender name for the broadcast
    const sender = await dbGet("SELECT name FROM users WHERE id = $1", [userId]);
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

app.get("/api/users/:userId/profile", async (req, res) => {
  try {
    const user = await dbGet(
      "SELECT id, name, created_at FROM users WHERE id = $1",
      [req.params.userId]
    );
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json(user);
  } catch {
    res.status(500).json({ error: "Failed to fetch profile" });
  }
});

app.get("/api/users/:userId/stats", async (req, res) => {
  try {
    const { userId } = req.params;
    const msgRow = await dbGet(
      "SELECT COUNT(*) AS total_messages FROM messages WHERE user_id = $1",
      [userId]
    );
    const groupRow = await dbGet(
      `SELECT COUNT(*) AS groups_joined FROM room_members rm
       JOIN chatrooms r ON r.id = rm.room_id
       WHERE rm.user_id = $1 AND r.type = 'group'`,
      [userId]
    );
    const dmRow = await dbGet(
      `SELECT COUNT(*) AS active_dms FROM room_members rm
       JOIN chatrooms r ON r.id = rm.room_id
       WHERE rm.user_id = $1 AND r.type = 'dm'`,
      [userId]
    );
    res.json({
      total_messages: parseInt(msgRow?.total_messages || 0),
      groups_joined: parseInt(groupRow?.groups_joined || 0),
      active_dms: parseInt(dmRow?.active_dms || 0),
    });
  } catch {
    res.status(500).json({ error: "Failed to load stats" });
  }
});

// ─── WebSocket ─────────────────────────────────────────────────────────────────

wss.on("connection", (ws) => {
  let currentRoom = null;

  ws.on("message", async (raw) => {
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
      const messages = await dbAll(
        `SELECT m.id, m.user_id, u.name, m.content, m.created_at
         FROM messages m JOIN users u ON u.id = m.user_id
         WHERE m.room_id = $1 ORDER BY m.created_at ASC`,
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
  try {
    await initDB();
    const PORT = process.env.PORT || 3000;
    server.listen(PORT, () =>
      console.log(`Server running on http://localhost:${PORT}`)
    );
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

start();
