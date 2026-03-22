// ============================================================
// Message List Component
// Renders chat history and appends real-time messages
// ============================================================

import * as state from '../services/state.js';
import * as ws from '../services/websocket.js';

export function renderMessageList(container) {
  container.innerHTML = '<div class="messages-scroll" id="messages-scroll"></div>';
  const scrollEl = container.querySelector('#messages-scroll');

  function renderMessages(messages) {
    const currentUser = state.getCurrentUser();
    scrollEl.innerHTML = messages.map(msg => createMessageHTML(msg, currentUser)).join('');
    scrollToBottom();
  }

  function appendMessage(msg) {
    const currentUser = state.getCurrentUser();
    scrollEl.insertAdjacentHTML('beforeend', createMessageHTML(msg, currentUser));
    scrollToBottom();
  }

  function scrollToBottom() {
    requestAnimationFrame(() => {
      scrollEl.scrollTop = scrollEl.scrollHeight;
    });
  }

  ws.onHistory((messages) => {
    state.setMessages(messages);
    renderMessages(messages);
  });

  ws.onNewMessage((msg) => {
    state.addMessage(msg);
    appendMessage(msg);
  });

  state.subscribe((s) => {
    if (s.messages.length === 0 && scrollEl.children.length > 0) {
      scrollEl.innerHTML = '';
    }
  });
}

function createMessageHTML(msg, currentUser) {
  if (!msg) return '';
  const msgUserId = Number(msg.user_id);
  const myId = currentUser ? Number(currentUser.id) : null;
  const isOwn = myId !== null && msgUserId === myId;
  const time = formatTime(msg.created_at);
  const senderName = msg.name || (isOwn ? 'You' : `User ${msgUserId}`);
  const initial = senderName.charAt(0).toUpperCase();

  return `
    <div class="message ${isOwn ? 'message-own' : 'message-other'}" data-msg-id="${msg.id}">
      ${!isOwn ? `<div class="message-avatar">${initial}</div>` : ''}
      <div class="message-content">
        ${!isOwn ? `<span class="message-sender">${senderName}</span>` : ''}
        <div class="message-bubble">
          <p>${escapeHTML(msg.content)}</p>
        </div>
        <span class="message-time">${time}</span>
      </div>
    </div>
  `;
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
