// ============================================================
// Auth Page — Login & Register with tabbed interface
// ============================================================

import * as api from '../services/api.js';
import * as state from '../services/state.js';

export function renderAuth(container, onLoginSuccess) {
  container.innerHTML = `
    <div class="auth-wrapper">
      <div class="auth-card">
        <div class="auth-logo">
          <div class="auth-logo-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
          </div>
          <h1 class="auth-title">ChatVerse</h1>
          <p class="auth-subtitle">Connect. Chat. Collaborate.</p>
        </div>

        <div class="auth-tabs">
          <button class="auth-tab active" id="tab-login">Login</button>
          <button class="auth-tab" id="tab-register">Register</button>
        </div>

        <form id="auth-form" class="auth-form">
          <div class="input-group">
            <label for="auth-name">Username</label>
            <input type="text" id="auth-name" placeholder="Enter your username" required autocomplete="username" />
          </div>
          <div class="input-group">
            <label for="auth-password">Password</label>
            <input type="password" id="auth-password" placeholder="Enter your password" required autocomplete="current-password" />
          </div>
          <button type="submit" class="btn btn-primary btn-full" id="auth-submit">
            <span id="auth-btn-text">Sign In</span>
            <span id="auth-btn-loader" class="btn-loader hidden"></span>
          </button>
          <p id="auth-error" class="auth-error hidden"></p>
        </form>

        <div class="auth-divider"><span>or</span></div>
        <button class="btn btn-demo btn-full" id="btn-demo">🚀 Try Demo Mode</button>
      </div>

      <div class="auth-particles">
        ${Array.from({ length: 20 }, (_, i) => `<div class="particle particle-${i}"></div>`).join('')}
      </div>
    </div>
  `;

  let mode = 'login'; // 'login' | 'register'

  const tabLogin = container.querySelector('#tab-login');
  const tabRegister = container.querySelector('#tab-register');
  const form = container.querySelector('#auth-form');
  const nameInput = container.querySelector('#auth-name');
  const passwordInput = container.querySelector('#auth-password');
  const submitBtn = container.querySelector('#auth-submit');
  const btnText = container.querySelector('#auth-btn-text');
  const btnLoader = container.querySelector('#auth-btn-loader');
  const errorEl = container.querySelector('#auth-error');

  function switchTab(newMode) {
    mode = newMode;
    tabLogin.classList.toggle('active', mode === 'login');
    tabRegister.classList.toggle('active', mode === 'register');
    btnText.textContent = mode === 'login' ? 'Sign In' : 'Create Account';
    errorEl.classList.add('hidden');
    nameInput.focus();
  }

  tabLogin.addEventListener('click', () => switchTab('login'));
  tabRegister.addEventListener('click', () => switchTab('register'));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = nameInput.value.trim();
    const password = passwordInput.value.trim();

    if (!name || !password) {
      showError('Please fill in all fields.');
      return;
    }

    setLoading(true);
    errorEl.classList.add('hidden');

    try {
      let user;
      if (mode === 'login') {
        user = await api.login(name, password);
      } else {
        user = await api.register(name, password);
      }
      state.setCurrentUser(user);
      onLoginSuccess(user);
    } catch (err) {
      showError(err.message || 'Something went wrong. Is the backend running?');
    } finally {
      setLoading(false);
    }
  });

  function setLoading(loading) {
    submitBtn.disabled = loading;
    btnText.classList.toggle('hidden', loading);
    btnLoader.classList.toggle('hidden', !loading);
  }

  function showError(msg) {
    errorEl.textContent = msg;
    errorEl.classList.remove('hidden');
    errorEl.classList.add('shake');
    setTimeout(() => errorEl.classList.remove('shake'), 500);
  }

  // Demo mode — bypass login without backend
  container.querySelector('#btn-demo').addEventListener('click', () => {
    const demoUser = { id: 99, name: 'DemoUser' };
    state.setCurrentUser(demoUser);
    onLoginSuccess(demoUser);
  });

  nameInput.focus();
}
