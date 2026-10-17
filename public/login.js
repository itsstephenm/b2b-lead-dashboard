// ── Configuration ─────────────────────────────────────────────────────────────
// Replace with your actual Render API base URL when deployed.
const API_BASE = 'http://localhost:3000';

// ── DOM references ─────────────────────────────────────────────────────────────
const form      = document.getElementById('login-form');
const signinBtn = document.getElementById('signin-btn');
const alertMsg  = document.getElementById('alert-msg');

// ── Helpers ────────────────────────────────────────────────────────────────────
function showAlert(message) {
  alertMsg.textContent = message;
  alertMsg.className   = 'alert error';
}

function clearAlert() {
  alertMsg.textContent = '';
  alertMsg.className   = 'alert';
}

// ── Submit handler ─────────────────────────────────────────────────────────────
// NOTE: Wire this up to your authentication endpoint (e.g. POST /api/auth/login)
// once backend auth is implemented. For now it validates inputs client-side only.
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearAlert();

  const email    = form.email.value.trim();
  const password = form.password.value;

  if (!email || !password) {
    showAlert('Please enter your email and password.');
    return;
  }

  signinBtn.disabled   = true;
  signinBtn.textContent = 'Signing in…';

  try {
    // TODO: Replace this block with a real POST /api/auth/login call.
    // const res  = await fetch(`${API_BASE}/api/auth/login`, {
    //   method:  'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body:    JSON.stringify({ email, password }),
    // });
    // const data = await res.json();
    // if (!res.ok) throw new Error(data.error || 'Invalid credentials.');
    // localStorage.setItem('token', data.token);
    // window.location.href = 'dashboard.html';

    // Placeholder — remove once auth endpoint is ready:
    showAlert('Auth endpoint not yet configured. Connect POST /api/auth/login to proceed.');
  } catch (err) {
    showAlert(`❌ ${err.message}`);
  } finally {
    signinBtn.disabled   = false;
    signinBtn.innerHTML  = 'Sign In <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>';
  }
});
