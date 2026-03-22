// ============================================================
// WebSocket Service Layer
// Manages real-time connection for chat messaging.
// To connect the backend, ensure WS_URL points to your server.
// ============================================================

const getWsUrl = () => {
  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
  const baseUrl = apiUrl.replace(/\/api$/, ''); // Remove /api suffix
  return baseUrl.replace(/^http/, 'ws'); // Convert http/https to ws/wss
};

const WS_URL = getWsUrl();

let socket = null;
let listeners = {
  history: [],
  newMessage: [],
  open: [],
  close: [],
  error: [],
};

/**
 * Open a WebSocket connection
 */
export function connect() {
  if (socket && socket.readyState === WebSocket.OPEN) {
    console.warn('[WS] Already connected.');
    return;
  }

  socket = new WebSocket(WS_URL);

  socket.addEventListener('open', () => {
    console.log('[WS] Connected');
    listeners.open.forEach(cb => cb());
  });

  socket.addEventListener('close', () => {
    console.log('[WS] Disconnected');
    listeners.close.forEach(cb => cb());
  });

  socket.addEventListener('error', (e) => {
    console.error('[WS] Error:', e);
    listeners.error.forEach(cb => cb(e));
  });

  socket.addEventListener('message', (event) => {
    try {
      const data = JSON.parse(event.data);

      if (data.action === 'history') {
        listeners.history.forEach(cb => cb(data.messages));
      } else if (data.action === 'newMessage') {
        listeners.newMessage.forEach(cb => cb(data.message));
      }
    } catch (err) {
      console.error('[WS] Failed to parse message:', err);
    }
  });
}

/**
 * Subscribe to a room (send join action)
 */
export function joinRoom(roomId, userId) {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    console.error('[WS] Cannot join room — not connected.');
    return;
  }
  socket.send(JSON.stringify({ action: 'join', roomId, userId }));
}

/**
 * Register a listener for chat history
 */
export function onHistory(callback) {
  listeners.history.push(callback);
  return () => {
    listeners.history = listeners.history.filter(cb => cb !== callback);
  };
}

/**
 * Register a listener for new messages
 */
export function onNewMessage(callback) {
  listeners.newMessage.push(callback);
  return () => {
    listeners.newMessage = listeners.newMessage.filter(cb => cb !== callback);
  };
}

/**
 * Register a listener for connection open
 */
export function onOpen(callback) {
  listeners.open.push(callback);
  return () => {
    listeners.open = listeners.open.filter(cb => cb !== callback);
  };
}

/**
 * Register a listener for connection close
 */
export function onClose(callback) {
  listeners.close.push(callback);
  return () => {
    listeners.close = listeners.close.filter(cb => cb !== callback);
  };
}

/**
 * Disconnect from the WebSocket
 */
export function disconnect() {
  if (socket) {
    socket.close();
    socket = null;
  }
  // Clear all listeners
  listeners = { history: [], newMessage: [], open: [], close: [], error: [] };
}

/**
 * Check if currently connected
 */
export function isConnected() {
  return socket && socket.readyState === WebSocket.OPEN;
}
