// ============================================================
// Message Input Component
// Text input bar for sending messages via the REST API
// ============================================================

import * as api from '../services/api.js';
import * as state from '../services/state.js';

export function renderMessageInput(container) {
  container.innerHTML = `
    <form class="message-form" id="message-form">
      <input
        type="text"
        id="message-text"
        class="message-input"
        placeholder="Type a message..."
        autocomplete="off"
      />
      <button type="submit" class="btn btn-send" id="btn-send" title="Send message">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
        </svg>
      </button>
    </form>
  `;

  const form = container.querySelector('#message-form');
  const input = container.querySelector('#message-text');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const content = input.value.trim();
    if (!content) return;

    const room = state.getActiveRoom();
    const user = state.getCurrentUser();
    if (!room || !user) return;

    input.value = '';
    input.focus();

    try {
      await api.sendMessage(room.roomId, user.id, content);
    } catch (err) {
      console.error('[MessageInput] Send failed:', err.message);
    }
  });
}
