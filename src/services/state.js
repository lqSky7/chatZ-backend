// ============================================================
// Application State Manager
// Simple in-memory state store with change listeners.
// ============================================================

// Restore user from localStorage if available
const savedUser = localStorage.getItem('chatz_user');
const savedActiveRoom = localStorage.getItem('chatz_active_room');
const savedBroadcasts = localStorage.getItem('chatz_broadcasts');

const state = {
  currentUser: savedUser ? JSON.parse(savedUser) : null,
  activeRoom: savedActiveRoom ? JSON.parse(savedActiveRoom) : null, // Restore on reload
  activeView: null,     // 'chat' | 'broadcast' — tracks which view is active
  groupRooms: [],       // [{ roomId, code, type }]
  dmList: [],           // [{ roomId, partner: { id, name } }]
  messages: [],         // [{ id, user_id, name?, content, created_at }]
  broadcasts: savedBroadcasts ? JSON.parse(savedBroadcasts) : [], // Restore on reload
  activeBroadcast: null, // currently selected broadcast
};

const changeListeners = new Set();

/**
 * Subscribe to state changes
 */
export function subscribe(callback) {
  changeListeners.add(callback);
  return () => changeListeners.delete(callback);
}

function notify() {
  changeListeners.forEach(cb => cb({ ...state }));
}

// ========================
// Getters
// ========================

export function getState() {
  return { ...state };
}

export function getCurrentUser() {
  return state.currentUser;
}

export function getActiveRoom() {
  return state.activeRoom;
}

export function getMessages() {
  return [...state.messages];
}

export function getGroupRooms() {
  return [...state.groupRooms];
}

export function getDMList() {
  return [...state.dmList];
}

export function getBroadcasts() {
  return [...state.broadcasts];
}

export function getActiveBroadcast() {
  return state.activeBroadcast;
}

// ========================
// Setters
// ========================

export function setCurrentUser(user) {
  state.currentUser = user;
  if (user) {
    localStorage.setItem('chatz_user', JSON.stringify(user));
  }
  notify();
}

export function setActiveRoom(room) {
  state.activeRoom = room;
  state.activeBroadcast = null;
  state.activeView = 'chat';
  state.messages = [];
  if (room) {
    localStorage.setItem('chatz_active_room', JSON.stringify(room));
  } else {
    localStorage.removeItem('chatz_active_room');
  }
  notify();
}

export function setGroupRooms(rooms) {
  state.groupRooms = rooms;
  notify();
}

export function setDMList(dms) {
  state.dmList = dms;
  notify();
}

export function addGroupRoom(room) {
  const exists = state.groupRooms.find(r => r.roomId === room.roomId);
  if (!exists) {
    state.groupRooms.push(room);
    notify();
  }
}

export function setMessages(messages) {
  state.messages = messages;
  notify();
}

export function addMessage(message) {
  state.messages.push(message);
  notify();
}

// ========================
// Broadcast
// ========================

export function addBroadcast(broadcast) {
  state.broadcasts.push(broadcast);
  localStorage.setItem('chatz_broadcasts', JSON.stringify(state.broadcasts));
  notify();
}

export function setActiveBroadcast(broadcast) {
  state.activeBroadcast = broadcast;
  state.activeRoom = null;
  state.activeView = 'broadcast';
  state.messages = [];
  if (broadcast) {
    localStorage.removeItem('chatz_active_room');
  }
  notify();
}

export function addBroadcastMessage(broadcastId, message) {
  const bc = state.broadcasts.find(b => b.id === broadcastId);
  if (bc) {
    bc.messages.push(message);
    if (state.activeBroadcast && state.activeBroadcast.id === broadcastId) {
      state.activeBroadcast = { ...bc };
    }
    localStorage.setItem('chatz_broadcasts', JSON.stringify(state.broadcasts));
    notify();
  }
}

export function tryRestoreActiveRoom() {
  // After room lists are loaded, try to restore the saved active room
  if (!state.activeRoom) return; // Only restore if we have something saved
  
  const roomId = state.activeRoom.roomId;
  
  // Look for the room in group rooms
  const groupRoom = state.groupRooms.find(r => r.roomId === roomId);
  if (groupRoom) {
    // Room exists in group rooms, keep it
    state.activeRoom = { ...groupRoom, name: groupRoom.code || `Room ${groupRoom.roomId}` };
    notify();
    return;
  }
  
  // Look for the room in DMs
  const dm = state.dmList.find(d => d.roomId === roomId);
  if (dm) {
    // Room exists in DMs, keep it
    state.activeRoom = { roomId: dm.roomId, type: 'dm', name: dm.partner?.name || `User ${dm.partner?.id || ''}` };
    notify();
    return;
  }
  
  // Room doesn't exist anymore, clear it
  state.activeRoom = null;
  localStorage.removeItem('chatz_active_room');
  notify();
}

export function logout() {
  state.currentUser = null;
  state.activeRoom = null;
  state.activeView = null;
  state.activeBroadcast = null;
  state.groupRooms = [];
  state.dmList = [];
  state.messages = [];
  state.broadcasts = [];
  localStorage.removeItem('chatz_user');
  localStorage.removeItem('chatz_active_room');
  localStorage.removeItem('chatz_broadcasts');
  notify();
}

