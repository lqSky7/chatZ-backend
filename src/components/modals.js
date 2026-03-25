// ============================================================
// Modal Components
// Join Room, New DM, User Profile modals
// ============================================================

import * as api from '../services/api.js';
import * as state from '../services/state.js';

// ========================
// Modal Utilities
// ========================

function createModalOverlay(id, content) {
  // Remove existing modal if any
  const existing = document.getElementById(id);
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = id;
  overlay.innerHTML = `
    <div class="modal-card">
      <button class="modal-close" aria-label="Close modal">&times;</button>
      ${content}
    </div>
  `;

  document.body.appendChild(overlay);

  // Animate in
  requestAnimationFrame(() => overlay.classList.add('visible'));

  // Close handlers
  overlay.querySelector('.modal-close').addEventListener('click', () => closeModal(id));
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal(id);
  });

  return overlay;
}

function closeModal(id) {
  const overlay = document.getElementById(id);
  if (overlay) {
    overlay.classList.remove('visible');
    setTimeout(() => overlay.remove(), 300);
  }
}

// ========================
// Join / Create Room Modal
// ========================

export function showJoinRoomModal() {
  const overlay = createModalOverlay('modal-join-room', `
    <h2 class="modal-title">Join or Create Room</h2>
    <p class="modal-desc">Enter a room code and password. If the room doesn't exist, it will be created automatically.</p>
    <form id="join-room-form" class="modal-form">
      <div class="input-group">
        <label for="room-code">Room Code</label>
        <input type="text" id="room-code" placeholder="e.g. study-group" required />
      </div>
      <div class="input-group">
        <label for="room-password">Password</label>
        <input type="password" id="room-password" placeholder="Room password" required />
      </div>
      <p id="join-room-error" class="modal-error hidden"></p>
      <button type="submit" class="btn btn-primary btn-full">
        <span id="join-room-btn-text">Join Room</span>
        <span id="join-room-loader" class="btn-loader hidden"></span>
      </button>
    </form>
  `);

  const form = overlay.querySelector('#join-room-form');
  const errorEl = overlay.querySelector('#join-room-error');
  const btnText = overlay.querySelector('#join-room-btn-text');
  const loader = overlay.querySelector('#join-room-loader');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const code = overlay.querySelector('#room-code').value.trim();
    const password = overlay.querySelector('#room-password').value.trim();
    const user = state.getCurrentUser();

    if (!code || !password) {
      showModalError(errorEl, 'Please fill in all fields.');
      return;
    }

    setModalLoading(btnText, loader, true);

    try {
      const room = await api.joinRoom(code, password, user.id);
      if (room.pendingApproval) {
        showModalError(errorEl, room.message || 'Join request sent. Waiting for creator approval.');
      } else {
        state.addGroupRoom(room);
        state.setActiveRoom({ ...room, name: room.code });
        closeModal('modal-join-room');
      }
    } catch (err) {
      showModalError(errorEl, err.message || 'Failed to join room.');
    } finally {
      setModalLoading(btnText, loader, false);
    }
  });

  overlay.querySelector('#room-code').focus();
}

// ========================
// New DM Modal
// ========================

export function showNewDMModal() {
  const overlay = createModalOverlay('modal-new-dm', `
    <h2 class="modal-title">Start a Conversation</h2>
    <p class="modal-desc">Enter the user ID of the person you'd like to message.</p>
    <form id="new-dm-form" class="modal-form">
      <div class="input-group">
        <label for="dm-target-id">User ID</label>
        <input type="number" id="dm-target-id" placeholder="e.g. 2" min="1" required />
      </div>
      <p id="new-dm-error" class="modal-error hidden"></p>
      <button type="submit" class="btn btn-primary btn-full">
        <span id="new-dm-btn-text">Start Chat</span>
        <span id="new-dm-loader" class="btn-loader hidden"></span>
      </button>
    </form>
  `);

  const form = overlay.querySelector('#new-dm-form');
  const errorEl = overlay.querySelector('#new-dm-error');
  const btnText = overlay.querySelector('#new-dm-btn-text');
  const loader = overlay.querySelector('#new-dm-loader');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const targetId = parseInt(overlay.querySelector('#dm-target-id').value);
    const user = state.getCurrentUser();

    if (!targetId || targetId === user.id) {
      showModalError(errorEl, 'Please enter a valid user ID.');
      return;
    }

    setModalLoading(btnText, loader, true);

    try {
      const dm = await api.createDM(user.id, targetId);
      // Refresh DMs list
      const dms = await api.getUserDMs(user.id);
      state.setDMList(dms);
      state.setActiveRoom({ roomId: dm.roomId, type: 'dm', name: `User ${targetId}` });
      closeModal('modal-new-dm');
    } catch (err) {
      showModalError(errorEl, err.message || 'Failed to start conversation.');
    } finally {
      setModalLoading(btnText, loader, false);
    }
  });

  overlay.querySelector('#dm-target-id').focus();
}

// ========================
// User Profile Modal
// ========================

export function showProfileModal(userId) {
  const overlay = createModalOverlay('modal-profile', `
    <div class="profile-modal">
      <div class="profile-header">
        <div class="profile-avatar-large" id="profile-avatar">?</div>
        <h2 class="profile-name" id="profile-name">Loading...</h2>
        <span class="profile-id" id="profile-id">ID: —</span>
        <span class="profile-joined" id="profile-joined"></span>
      </div>
      <div class="profile-stats" id="profile-stats">
        <div class="stat-card">
          <span class="stat-value" id="stat-messages">—</span>
          <span class="stat-label">Messages</span>
        </div>
        <div class="stat-card">
          <span class="stat-value" id="stat-groups">—</span>
          <span class="stat-label">Groups</span>
        </div>
        <div class="stat-card">
          <span class="stat-value" id="stat-dms">—</span>
          <span class="stat-label">DMs</span>
        </div>
      </div>
    </div>
  `);

  // Load profile
  loadProfile(overlay, userId);
}

async function loadProfile(overlay, userId) {
  const nameEl = overlay.querySelector('#profile-name');
  const avatarEl = overlay.querySelector('#profile-avatar');
  const idEl = overlay.querySelector('#profile-id');
  const joinedEl = overlay.querySelector('#profile-joined');
  const msgEl = overlay.querySelector('#stat-messages');
  const groupsEl = overlay.querySelector('#stat-groups');
  const dmsEl = overlay.querySelector('#stat-dms');

  try {
    const profile = await api.getUserProfile(userId);
    nameEl.textContent = profile.name;
    avatarEl.textContent = profile.name.charAt(0).toUpperCase();
    idEl.textContent = `ID: ${profile.id}`;
    if (profile.created_at) {
      joinedEl.textContent = `Joined ${new Date(profile.created_at).toLocaleDateString()}`;
    }
  } catch {
    const fallbackUser = state.getCurrentUser();
    nameEl.textContent = fallbackUser?.name || 'Unknown';
    avatarEl.textContent = (fallbackUser?.name || '?').charAt(0).toUpperCase();
    idEl.textContent = `ID: ${fallbackUser?.id ?? '—'}`;
    joinedEl.textContent = 'Profile unavailable (backend not connected)';
  }

  try {
    const stats = await api.getUserStats(userId);
    msgEl.textContent = stats.total_messages ?? '—';
    groupsEl.textContent = stats.groups_joined ?? '—';
    dmsEl.textContent = stats.active_dms ?? '—';
  } catch {
    msgEl.textContent = '—';
    groupsEl.textContent = '—';
    dmsEl.textContent = '—';
  }
}

// ========================
// Helpers
// ========================

function showModalError(el, msg) {
  el.textContent = msg;
  el.classList.remove('hidden');
  el.classList.add('shake');
  setTimeout(() => el.classList.remove('shake'), 500);
}

function setModalLoading(btnText, loader, loading) {
  btnText.classList.toggle('hidden', loading);
  loader.classList.toggle('hidden', !loading);
}

// ========================
// Create Broadcast Modal
// ========================

export function showCreateBroadcastModal() {
  let recipientIds = [];

  const overlay = createModalOverlay('modal-create-broadcast', `
    <h2 class="modal-title">New Broadcast</h2>
    <p class="modal-desc">Create a broadcast list to send a message to multiple people. Replies will arrive in your individual DM inboxes.</p>
    <form id="broadcast-form" class="modal-form">
      <div class="input-group">
        <label for="broadcast-name">Broadcast Name</label>
        <input type="text" id="broadcast-name" placeholder="e.g. Team Announcement" required />
      </div>
      <div class="input-group">
        <label>Recipients</label>
        <div class="chip-input-wrapper">
          <div class="chip-container" id="chip-container">
            <input type="number" id="recipient-input" class="chip-input" placeholder="Enter user ID & press Enter" min="1" />
          </div>
        </div>
        <span class="input-hint" id="recipient-count">0 recipients added</span>
      </div>
      <p id="broadcast-error" class="modal-error hidden"></p>
      <button type="submit" class="btn btn-primary btn-full">
        <span id="broadcast-btn-text">Create Broadcast</span>
        <span id="broadcast-loader" class="btn-loader hidden"></span>
      </button>
    </form>
  `);

  const form = overlay.querySelector('#broadcast-form');
  const nameInput = overlay.querySelector('#broadcast-name');
  const recipientInput = overlay.querySelector('#recipient-input');
  const chipContainer = overlay.querySelector('#chip-container');
  const countEl = overlay.querySelector('#recipient-count');
  const errorEl = overlay.querySelector('#broadcast-error');

  function addChip(id) {
    if (recipientIds.includes(id)) return;
    const user = state.getCurrentUser();
    if (user && id === user.id) return;

    recipientIds.push(id);
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.innerHTML = `User ${id} <button type="button" class="chip-remove" data-id="${id}">&times;</button>`;
    chipContainer.insertBefore(chip, recipientInput);
    updateCount();
  }

  function removeChip(id) {
    recipientIds = recipientIds.filter(r => r !== id);
    const chips = chipContainer.querySelectorAll('.chip');
    chips.forEach(chip => {
      const btn = chip.querySelector('.chip-remove');
      if (btn && parseInt(btn.dataset.id) === id) chip.remove();
    });
    updateCount();
  }

  function updateCount() {
    countEl.textContent = `${recipientIds.length} recipient${recipientIds.length !== 1 ? 's' : ''} added`;
  }

  recipientInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const val = parseInt(recipientInput.value);
      if (val && val > 0) {
        addChip(val);
        recipientInput.value = '';
      }
    }
  });

  chipContainer.addEventListener('click', (e) => {
    if (e.target.classList.contains('chip-remove')) {
      removeChip(parseInt(e.target.dataset.id));
    }
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = nameInput.value.trim();

    if (!name) {
      showModalError(errorEl, 'Please enter a broadcast name.');
      return;
    }
    if (recipientIds.length === 0) {
      showModalError(errorEl, 'Please add at least one recipient.');
      return;
    }

    const broadcast = {
      id: 'bc_' + Date.now(),
      name,
      recipientIds: [...recipientIds],
      messages: [],
    };

    state.addBroadcast(broadcast);
    state.setActiveBroadcast(broadcast);
    closeModal('modal-create-broadcast');
  });

  nameInput.focus();
}

// ========================
// Room Members Modal
// ========================

export async function showRoomUsersModal(room) {
  const overlay = createModalOverlay('modal-room-users', `
    <h2 class="modal-title">Room Members</h2>
    <p class="modal-desc">Manage users in <strong>${escapeHTML(room.code || `Room ${room.roomId}`)}</strong>.</p>
    <div id="room-users-list" class="room-users-list">
      <p class="room-list-empty">Loading users...</p>
    </div>
    <div id="room-requests-block" class="room-requests-block hidden">
      <h3 class="broadcast-section-title">Pending Join Requests</h3>
      <div id="room-requests-list" class="room-users-list"></div>
    </div>
    <p id="room-users-error" class="modal-error hidden"></p>
  `);

  const listEl = overlay.querySelector('#room-users-list');
  const requestsBlockEl = overlay.querySelector('#room-requests-block');
  const requestsListEl = overlay.querySelector('#room-requests-list');
  const errorEl = overlay.querySelector('#room-users-error');
  const currentUser = state.getCurrentUser();
  const isCreator = currentUser && Number(room.creatorId) === Number(currentUser.id);

  async function loadUsers() {
    try {
      const users = await api.getRoomUsers(room.roomId);
      if (!users.length) {
        listEl.innerHTML = '<p class="room-list-empty">No users in this room</p>';
        return;
      }

      listEl.innerHTML = users.map((u) => `
        <div class="room-user-row" data-user-id="${u.id}">
          <div class="room-user-meta">
            <span class="room-user-name">${escapeHTML(u.name)}</span>
            <span class="room-user-id">ID: ${u.id}${currentUser && currentUser.id === u.id ? ' (you)' : ''}</span>
          </div>
          <button class="btn btn-demo room-user-remove-btn" data-user-id="${u.id}" ${currentUser && currentUser.id === u.id ? 'disabled' : ''}>
            Remove
          </button>
        </div>
      `).join('');

      listEl.querySelectorAll('.room-user-remove-btn').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const targetUserId = Number(btn.dataset.userId);
          btn.disabled = true;

          try {
            await api.removeUserFromGroupRoom(targetUserId, room.roomId);
            await loadUsers();
          } catch (err) {
            showModalError(errorEl, err.message || 'Failed to remove user.');
            btn.disabled = false;
          }
        });
      });
    } catch (err) {
      showModalError(errorEl, err.message || 'Failed to load room users.');
      listEl.innerHTML = '<p class="room-list-empty">Could not load users</p>';
    }
  }

  async function loadJoinRequests() {
    if (!isCreator) {
      requestsBlockEl.classList.add('hidden');
      return;
    }

    requestsBlockEl.classList.remove('hidden');
    try {
      const requests = await api.getRoomJoinRequests(room.roomId, currentUser.id);
      if (!requests.length) {
        requestsListEl.innerHTML = '<p class="room-list-empty">No pending requests</p>';
        return;
      }

      requestsListEl.innerHTML = requests.map((req) => `
        <div class="room-user-row">
          <div class="room-user-meta">
            <span class="room-user-name">${escapeHTML(req.name)}</span>
            <span class="room-user-id">ID: ${req.userId}</span>
          </div>
          <div class="room-request-actions">
            <button class="btn btn-demo room-request-btn" data-request-id="${req.id}" data-approve="true">Approve</button>
            <button class="btn btn-demo room-request-btn" data-request-id="${req.id}" data-approve="false">Reject</button>
          </div>
        </div>
      `).join('');

      requestsListEl.querySelectorAll('.room-request-btn').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const requestId = Number(btn.dataset.requestId);
          const approve = btn.dataset.approve === 'true';
          btn.disabled = true;
          try {
            await api.reviewRoomJoinRequest(requestId, currentUser.id, approve);
            await Promise.all([loadUsers(), loadJoinRequests()]);
          } catch (err) {
            showModalError(errorEl, err.message || 'Failed to review request.');
            btn.disabled = false;
          }
        });
      });
    } catch (err) {
      showModalError(errorEl, err.message || 'Failed to load join requests.');
      requestsListEl.innerHTML = '<p class="room-list-empty">Could not load requests</p>';
    }
  }

  await Promise.all([loadUsers(), loadJoinRequests()]);
}

function escapeHTML(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

