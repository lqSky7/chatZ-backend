// ============================================================
// Sidebar Component
// Room list, DM list, Broadcasts, user info, and action buttons
// ============================================================

import * as state from '../services/state.js';
import * as api from '../services/api.js';
import { showJoinRoomModal, showNewDMModal, showProfileModal, showCreateBroadcastModal } from './modals.js';

export function renderSidebar(container) {
  container.innerHTML = `
    <div class="sidebar-inner">
      <div class="sidebar-header">
        <div class="sidebar-brand">
          <div class="brand-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
          </div>
          <span class="brand-name">ChatVerse</span>
        </div>
      </div>

      <div class="sidebar-section">
        <div class="sidebar-section-header">
          <h3>Group Rooms</h3>
          <button class="icon-btn" id="btn-join-room" title="Join or Create Room">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
          </button>
        </div>
        <ul id="group-rooms-list" class="room-list">
          <li class="room-list-empty">No rooms yet</li>
        </ul>
      </div>

      <div class="sidebar-section">
        <div class="sidebar-section-header">
          <h3>Direct Messages</h3>
          <button class="icon-btn" id="btn-new-dm" title="New Direct Message">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
          </button>
        </div>
        <ul id="dm-list" class="room-list">
          <li class="room-list-empty">No conversations yet</li>
        </ul>
      </div>

      <div class="sidebar-section">
        <div class="sidebar-section-header">
          <h3>Broadcasts</h3>
          <button class="icon-btn" id="btn-new-broadcast" title="New Broadcast">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
          </button>
        </div>
        <ul id="broadcast-list" class="room-list">
          <li class="room-list-empty">No broadcasts yet</li>
        </ul>
      </div>

      <div class="sidebar-footer">
        <div class="user-info" id="user-info-btn">
          <div class="user-avatar" id="user-avatar">?</div>
          <div class="user-details">
            <span class="user-name" id="sidebar-user-name">Loading...</span>
            <span class="user-status">Online</span>
          </div>
        </div>
        <button class="icon-btn" id="btn-logout" title="Logout">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
        </button>
      </div>
    </div>
  `;

  const groupRoomsList = container.querySelector('#group-rooms-list');
  const dmList = container.querySelector('#dm-list');
  const broadcastList = container.querySelector('#broadcast-list');
  const userName = container.querySelector('#sidebar-user-name');
  const userAvatar = container.querySelector('#user-avatar');

  // Set user info
  const user = state.getCurrentUser();
  if (user) {
    userName.textContent = user.name;
    userAvatar.textContent = user.name.charAt(0).toUpperCase();
  }

  // Join Room button
  container.querySelector('#btn-join-room').addEventListener('click', () => {
    showJoinRoomModal();
  });

  // New DM button
  container.querySelector('#btn-new-dm').addEventListener('click', () => {
    showNewDMModal();
  });

  // New Broadcast button
  container.querySelector('#btn-new-broadcast').addEventListener('click', () => {
    showCreateBroadcastModal();
  });

  // Logout
  container.querySelector('#btn-logout').addEventListener('click', () => {
    state.logout();
    window.location.reload();
  });

  // User profile  
  container.querySelector('#user-info-btn').addEventListener('click', () => {
    const u = state.getCurrentUser();
    if (u) showProfileModal(u.id);
  });

  // Load DMs
  loadDMs();

  // Subscribe to state changes
  state.subscribe((s) => {
    renderGroupRooms(groupRoomsList, s.groupRooms, s.activeRoom);
    renderDMList(dmList, s.dmList, s.activeRoom);
    renderBroadcastList(broadcastList, s.broadcasts, s.activeBroadcast);
  });

  // Initial render
  const s = state.getState();
  renderGroupRooms(groupRoomsList, s.groupRooms, s.activeRoom);
  renderDMList(dmList, s.dmList, s.activeRoom);
  renderBroadcastList(broadcastList, s.broadcasts, s.activeBroadcast);
}

async function loadDMs() {
  const user = state.getCurrentUser();
  if (!user) return;
  try {
    const dms = await api.getUserDMs(user.id);
    state.setDMList(dms);
  } catch (err) {
    console.log('[Sidebar] Could not load DMs (backend not connected?):', err.message);
  }
}

function renderGroupRooms(listEl, rooms, activeRoom) {
  if (!rooms.length) {
    listEl.innerHTML = '<li class="room-list-empty">No rooms yet</li>';
    return;
  }
  listEl.innerHTML = rooms.map(room => `
    <li class="room-item ${activeRoom && activeRoom.roomId === room.roomId ? 'active' : ''}" data-room-id="${room.roomId}">
      <div class="room-icon group-icon">#</div>
      <span class="room-name">${room.code || 'Room ' + room.roomId}</span>
    </li>
  `).join('');

  listEl.querySelectorAll('.room-item').forEach(li => {
    li.addEventListener('click', () => {
      const roomId = parseInt(li.dataset.roomId);
      const room = rooms.find(r => r.roomId === roomId);
      if (room) {
        state.setActiveRoom({ ...room, name: room.code || `Room ${room.roomId}` });
      }
    });
  });
}

function renderDMList(listEl, dms, activeRoom) {
  if (!dms.length) {
    listEl.innerHTML = '<li class="room-list-empty">No conversations yet</li>';
    return;
  }
  listEl.innerHTML = dms.map(dm => `
    <li class="room-item ${activeRoom && activeRoom.roomId === dm.roomId ? 'active' : ''}" data-room-id="${dm.roomId}">
      <div class="room-icon dm-icon">${dm.partner.name.charAt(0).toUpperCase()}</div>
      <span class="room-name">${dm.partner.name}</span>
    </li>
  `).join('');

  listEl.querySelectorAll('.room-item').forEach(li => {
    li.addEventListener('click', () => {
      const roomId = parseInt(li.dataset.roomId);
      const dm = dms.find(d => d.roomId === roomId);
      if (dm) {
        state.setActiveRoom({ roomId: dm.roomId, type: 'dm', name: dm.partner.name });
      }
    });
  });
}

function renderBroadcastList(listEl, broadcasts, activeBroadcast) {
  if (!broadcasts.length) {
    listEl.innerHTML = '<li class="room-list-empty">No broadcasts yet</li>';
    return;
  }
  listEl.innerHTML = broadcasts.map(bc => `
    <li class="room-item ${activeBroadcast && activeBroadcast.id === bc.id ? 'active' : ''}" data-bc-id="${bc.id}">
      <div class="room-icon broadcast-icon">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
        </svg>
      </div>
      <div class="room-name-group">
        <span class="room-name">${bc.name}</span>
        <span class="room-meta">${bc.recipientIds.length} recipients · ${bc.messages.length} sent</span>
      </div>
    </li>
  `).join('');

  listEl.querySelectorAll('.room-item').forEach(li => {
    li.addEventListener('click', () => {
      const bcId = li.dataset.bcId;
      const bc = broadcasts.find(b => b.id === bcId);
      if (bc) {
        state.setActiveBroadcast(bc);
      }
    });
  });
}
