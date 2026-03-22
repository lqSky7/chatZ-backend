// ============================================================
// API Service Layer
// All backend REST API calls are centralized here.
// To connect the backend, just ensure BASE_URL points to your server.
// ============================================================

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

/**
 * Generic fetch wrapper with JSON handling
 */
async function request(endpoint, options = {}) {
  const url = `${BASE_URL}${endpoint}`;
  const config = {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  };

  try {
    const res = await fetch(url, config);
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || `Request failed with status ${res.status}`);
    }
    return data;
  } catch (err) {
    console.error(`[API] ${options.method || 'GET'} ${endpoint} failed:`, err.message);
    throw err;
  }
}

// ========================
// Authentication
// ========================

export async function register(name, password) {
  return request('/register', {
    method: 'POST',
    body: JSON.stringify({ name, password }),
  });
}

export async function login(name, password) {
  return request('/login', {
    method: 'POST',
    body: JSON.stringify({ name, password }),
  });
}

// ========================
// Group Chatrooms
// ========================

export async function joinRoom(code, password, userId) {
  return request('/rooms/join', {
    method: 'POST',
    body: JSON.stringify({ code, password, userId }),
  });
}

// ========================
// Direct Messaging
// ========================

export async function createDM(currentUserId, targetUserId) {
  return request('/dms', {
    method: 'POST',
    body: JSON.stringify({ currentUserId, targetUserId }),
  });
}

export async function getUserDMs(userId) {
  return request(`/users/${userId}/dms`);
}

// ========================
// Messages
// ========================

export async function sendMessage(roomId, userId, content) {
  return request(`/rooms/${roomId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ userId, content }),
  });
}

// ========================
// User Profiles & Stats
// ========================

export async function getUserProfile(userId) {
  return request(`/users/${userId}/profile`);
}

export async function getUserStats(userId) {
  return request(`/users/${userId}/stats`);
}

// ========================
// Broadcast Messaging
// ========================

/**
 * Send a broadcast message to multiple users.
 * Under the hood, this creates/finds a DM with each recipient
 * and sends the message to each DM room.
 * Replies will arrive in the individual DM inboxes.
 *
 * @param {number} senderId - The current user's ID
 * @param {number[]} recipientIds - Array of user IDs to send to
 * @param {string} content - The message content
 * @returns {Promise<{ succeeded: number[], failed: number[] }>}
 */
export async function sendBroadcast(senderId, recipientIds, content) {
  const succeeded = [];
  const failed = [];

  for (const recipientId of recipientIds) {
    try {
      // 1. Create or find the DM room with this recipient
      const dm = await createDM(senderId, recipientId);
      // 2. Send the message in that DM room
      await sendMessage(dm.roomId, senderId, content);
      succeeded.push(recipientId);
    } catch (err) {
      console.error(`[Broadcast] Failed to send to user ${recipientId}:`, err.message);
      failed.push(recipientId);
    }
  }

  return { succeeded, failed };
}

