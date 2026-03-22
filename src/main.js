// ============================================================
// App Orchestrator
// Routes between Auth and Chat views based on login state
// ============================================================

import './style.css';
import { renderAuth } from './pages/auth.js';
import { renderChat } from './pages/chat.js';
import * as state from './services/state.js';

const app = document.getElementById('app');

function route() {
  const user = state.getCurrentUser();
  if (user) {
    renderChat(app);
  } else {
    renderAuth(app, () => {
      route(); // re-route after login
    });
  }
}

// Initial route
route();
