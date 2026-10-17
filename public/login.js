// ── Configuration ─────────────────────────────────────────────────────────────
// Replace with your actual Render API base URL when deployed.
const API_BASE = 'https://b2b-lead-dashboard-dfmf.onrender.com';

// ── DOM references ─────────────────────────────────────────────────────────────
const form      = document.getElementById('login-form');
const signinBtn = document.getElementById('signin-btn');
const alertMsg  = document.getElementById('alert-msg');

// ── Redirect if already authenticated ─────────────────────────────────────────
// Skip the login page entirely if a token is already stored.
if (localStorage.getItem('token')) {
  window.location.replace('dashboard.html');
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function showAlert(message) {
  alertMsg.textContent = message;
  alertMsg.className   = 'alert error';
}

function clearAlert() {
  alertMsg.textContent = '';
  alertMsg.className   = 'alert';
}

const BTN_DEFAULT_HTML =
  'Sign In <svg width="16" height="16" viewBox="0 0 24 24" fill="none" ' +
  'stroke="currentColor" stroke-width="2.5" stroke-linecap="round" ' +
  'stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>';

// ── Submit handler ─────────────────────────────────────────────────────────────
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearAlert();

  const email    = form.email.value.trim();
  const password = form.password.value;

  if (!email || !password) {
    showAlert('Please enter your email and password.');
    return;
  }

  signinBtn.disabled     = true;
  signinBtn.textContent  = 'Signing in…';

  try {
    const res  = await fetch(`${API_BASE}/api/auth/login`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email, password }),
    });

    const data = await res.json();

    if (!res.ok) {
      // Surface the exact message returned by the API (e.g. "Invalid email or password.")
      throw new Error(data.message || 'Login failed. Please try again.');
    }

    // Persist the token and redirect to the protected dashboard
    localStorage.setItem('token', data.token);
    window.location.href = 'dashboard.html';
  } catch (err) {
    showAlert(`❌ ${err.message}`);
  } finally {
    signinBtn.disabled   = false;
    signinBtn.innerHTML  = BTN_DEFAULT_HTML;
  }
});
