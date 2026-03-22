// ============================================================
// Application State Manager
// Simple in-memory state store with change listeners.
// ============================================================

// Restore user from localStorage if available
const savedUser = localStorage.getItem('chatz_user');

const state = {
  currentUser: savedUser ? JSON.parse(savedUser) : null,
  activeRoom: null,     // { roomId, code?, type, name? }
  activeView: null,     // 'chat' | 'broadcast' — tracks which view is active
  groupRooms: [],       // [{ roomId, code, type }]
  dmList: [],           // [{ roomId, partner: { id, name } }]
  messages: [],         // [{ id, user_id, name?, content, created_at }]
  broadcasts: [],       // [{ id, name, recipientIds, messages: [{ content, sentAt }] }]
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
  notify();
}

export function setActiveBroadcast(broadcast) {
  state.activeBroadcast = broadcast;
  state.activeRoom = null;
  state.activeView = 'broadcast';
  state.messages = [];
  notify();
}

export function addBroadcastMessage(broadcastId, message) {
  const bc = state.broadcasts.find(b => b.id === broadcastId);
  if (bc) {
    bc.messages.push(message);
    if (state.activeBroadcast && state.activeBroadcast.id === broadcastId) {
      state.activeBroadcast = { ...bc };
    }
    notify();
  }
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
  notify();
}

