// ============================================================
// Chat Page — Main layout with sidebar + chat area + broadcast view
// ============================================================

import { renderSidebar } from '../components/sidebar.js';
import { renderMessageList } from '../components/messageList.js';
import { renderMessageInput } from '../components/messageInput.js';
import * as state from '../services/state.js';
import * as ws from '../services/websocket.js';
import * as api from '../services/api.js';

export function renderChat(container) {
  container.innerHTML = `
    <div class="chat-layout">
      <aside class="sidebar" id="sidebar"></aside>
      <main class="chat-main">
        <header class="chat-header" id="chat-header">
          <button class="sidebar-toggle" id="sidebar-toggle" aria-label="Toggle sidebar">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
          </button>
          <div class="chat-header-info">
            <h2 id="room-name">Select a chat</h2>
            <span id="room-type" class="room-type-badge"></span>
          </div>
          <div class="chat-header-actions">
            <div id="connection-status" class="connection-dot disconnected" title="Disconnected"></div>
          </div>
        </header>
        <div class="chat-body" id="chat-body">
          <div class="chat-empty-state" id="empty-state">
            <div class="empty-icon">
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
            </div>
            <h3>Welcome to ChatZ</h3>
            <p>Join a group room or start a DM to begin chatting</p>
          </div>
          <div id="message-list" class="message-list hidden"></div>

          <!-- Broadcast View -->
          <div id="broadcast-view" class="broadcast-view hidden">
            <div class="broadcast-info-card">
              <div class="broadcast-info-header">
                <div class="broadcast-info-icon">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
                  </svg>
                </div>
                <div>
                  <h3 id="broadcast-title">Broadcast</h3>
                  <span id="broadcast-recipients-count" class="broadcast-meta"></span>
                </div>
              </div>
              <div class="broadcast-recipients-list" id="broadcast-recipients-list"></div>
            </div>

            <div class="broadcast-sent-messages" id="broadcast-sent-messages">
              <h4 class="broadcast-section-title">Sent Messages</h4>
              <div id="broadcast-messages-list" class="broadcast-messages-list">
                <p class="room-list-empty">No messages sent yet</p>
              </div>
            </div>
          </div>
        </div>

        <div id="message-input-area" class="message-input-area hidden"></div>

        <!-- Broadcast Compose -->
        <div id="broadcast-input-area" class="message-input-area hidden">
          <form class="message-form" id="broadcast-form">
            <input
              type="text"
              id="broadcast-text"
              class="message-input"
              placeholder="Type a broadcast message..."
              autocomplete="off"
            />
            <button type="submit" class="btn btn-send btn-broadcast-send" id="btn-broadcast-send" title="Send to all recipients">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
              </svg>
            </button>
          </form>
        </div>
      </main>
    </div>
  `;

  const sidebarEl = container.querySelector('#sidebar');
  const messageListEl = container.querySelector('#message-list');
  const messageInputEl = container.querySelector('#message-input-area');
  const emptyState = container.querySelector('#empty-state');
  const roomNameEl = container.querySelector('#room-name');
  const roomTypeBadge = container.querySelector('#room-type');
  const connectionDot = container.querySelector('#connection-status');
  const sidebarToggle = container.querySelector('#sidebar-toggle');

  // Broadcast elements
  const broadcastView = container.querySelector('#broadcast-view');
  const broadcastTitle = container.querySelector('#broadcast-title');
  const broadcastRecipientsCount = container.querySelector('#broadcast-recipients-count');
  const broadcastRecipientsList = container.querySelector('#broadcast-recipients-list');
  const broadcastMessagesList = container.querySelector('#broadcast-messages-list');
  const broadcastInputArea = container.querySelector('#broadcast-input-area');
  const broadcastForm = container.querySelector('#broadcast-form');
  const broadcastTextInput = container.querySelector('#broadcast-text');

  // Toggle sidebar on mobile
  sidebarToggle.addEventListener('click', () => {
    sidebarEl.classList.toggle('open');
  });

  // Render sidebar
  renderSidebar(sidebarEl);

  // Connect to WebSocket
  ws.connect();

  ws.onOpen(() => {
    connectionDot.classList.remove('disconnected');
    connectionDot.classList.add('connected');
    connectionDot.title = 'Connected';
  });

  ws.onClose(() => {
    connectionDot.classList.remove('connected');
    connectionDot.classList.add('disconnected');
    connectionDot.title = 'Disconnected';
  });

  // *** FIX: Track the last joined room to avoid re-joining on every state change ***
  let lastJoinedRoomId = null;

  // Listen for state changes
  state.subscribe((s) => {
    const room = s.activeRoom;
    const broadcast = s.activeBroadcast;

    if (room) {
      // === Chat View ===
      emptyState.classList.add('hidden');
      broadcastView.classList.add('hidden');
      broadcastInputArea.classList.add('hidden');
      messageListEl.classList.remove('hidden');
      messageInputEl.classList.remove('hidden');

      roomNameEl.textContent = room.name || room.code || `Room ${room.roomId}`;
      roomTypeBadge.textContent = room.type === 'dm' ? 'DM' : 'Group';
      roomTypeBadge.className = `room-type-badge ${room.type}`;

      sidebarEl.classList.remove('open');

      // Only join via WebSocket when the room actually changes
      if (room.roomId !== lastJoinedRoomId) {
        lastJoinedRoomId = room.roomId;
        const user = state.getCurrentUser();
        if (user) {
          ws.joinRoom(room.roomId, user.id);
        }
      }
    } else if (broadcast) {
      // === Broadcast View ===
      lastJoinedRoomId = null;
      emptyState.classList.add('hidden');
      messageListEl.classList.add('hidden');
      messageInputEl.classList.add('hidden');
      broadcastView.classList.remove('hidden');
      broadcastInputArea.classList.remove('hidden');

      roomNameEl.textContent = broadcast.name;
      roomTypeBadge.textContent = 'Broadcast';
      roomTypeBadge.className = 'room-type-badge broadcast';

      sidebarEl.classList.remove('open');

      broadcastTitle.textContent = broadcast.name;
      broadcastRecipientsCount.textContent = `${broadcast.recipientIds.length} recipient${broadcast.recipientIds.length !== 1 ? 's' : ''}`;

      broadcastRecipientsList.innerHTML = broadcast.recipientIds.map(id =>
        `<span class="broadcast-recipient-chip">User ${id}</span>`
      ).join('');

      if (broadcast.messages.length === 0) {
        broadcastMessagesList.innerHTML = '<p class="room-list-empty">No messages sent yet. Type below to broadcast.</p>';
      } else {
        broadcastMessagesList.innerHTML = broadcast.messages.map(msg =>
          `<div class="broadcast-msg-item">
            <div class="broadcast-msg-bubble">
              <p>${escapeHTML(msg.content)}</p>
            </div>
            <div class="broadcast-msg-meta">
              <span class="broadcast-msg-time">${formatTime(msg.sentAt)}</span>
              <span class="broadcast-msg-status">${msg.succeeded || 0}/${msg.total || 0} delivered</span>
            </div>
          </div>`
        ).join('');
      }
    } else {
      // === Empty State ===
      lastJoinedRoomId = null;
      emptyState.classList.remove('hidden');
      messageListEl.classList.add('hidden');
      messageInputEl.classList.add('hidden');
      broadcastView.classList.add('hidden');
      broadcastInputArea.classList.add('hidden');
      roomNameEl.textContent = 'Select a chat';
      roomTypeBadge.textContent = '';
      roomTypeBadge.className = 'room-type-badge';
    }
  });

  // Broadcast send handler
  broadcastForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const content = broadcastTextInput.value.trim();
    if (!content) return;

    const bc = state.getActiveBroadcast();
    const user = state.getCurrentUser();
    if (!bc || !user) return;

    broadcastTextInput.value = '';
    const sendBtn = container.querySelector('#btn-broadcast-send');
    sendBtn.disabled = true;

    try {
      const result = await api.sendBroadcast(user.id, bc.recipientIds, content);
      state.addBroadcastMessage(bc.id, {
        content,
        sentAt: new Date().toISOString(),
        succeeded: result.succeeded.length,
        failed: result.failed.length,
        total: bc.recipientIds.length,
      });
    } catch (err) {
      state.addBroadcastMessage(bc.id, {
        content,
        sentAt: new Date().toISOString(),
        succeeded: 0,
        failed: bc.recipientIds.length,
        total: bc.recipientIds.length,
      });
    } finally {
      sendBtn.disabled = false;
      broadcastTextInput.focus();
    }
  });

  // Setup message list and input
  renderMessageList(messageListEl);
  renderMessageInput(messageInputEl);
}

function formatTime(dateStr) {
  if (!dateStr) return '';
  try {
    return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
}

function escapeHTML(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
