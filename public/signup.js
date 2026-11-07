// ── Configuration ─────────────────────────────────────────────────────────────
const API_BASE = 'https://b2b-lead-dashboard-dfmf.onrender.com';

// Supabase client initialization (fallback to window or configured credentials)
const SUPABASE_URL = window.SUPABASE_URL || 'https://qvljwdbucufkaxkbmgra.supabase.co';
const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.placeholder';

let supabaseClient = null;
if (typeof supabase !== 'undefined' && supabase.createClient) {
  try {
    supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  } catch (err) {
    console.warn('Supabase client initialization warning:', err.message);
  }
}

// ── DOM references ─────────────────────────────────────────────────────────────
const signupForm = document.getElementById('signup-form');
const signupBtn  = document.getElementById('signup-btn');
const alertMsg   = document.getElementById('alert-msg');

function showAlert(message, type = 'error') {
  alertMsg.textContent = message;
  alertMsg.className = `alert ${type}`;
}

function clearAlert() {
  alertMsg.textContent = '';
  alertMsg.className = 'alert';
}

const BTN_DEFAULT_HTML =
  'Request Access <svg width="16" height="16" viewBox="0 0 24 24" fill="none" ' +
  'stroke="currentColor" stroke-width="2.5" stroke-linecap="round" ' +
  'stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>';

signupForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearAlert();

  const email = signupForm.email.value.trim();
  const password = signupForm.password.value;

  if (!email || !password) {
    showAlert('Please enter both email and password.');
    return;
  }

  if (password.length < 6) {
    showAlert('Password must be at least 6 characters long.');
    return;
  }

  signupBtn.disabled = true;
  signupBtn.textContent = 'Submitting request…';

  try {
    let supabaseUserId = null;

    // 1. Attempt Supabase Auth Sign Up if client is available
    if (supabaseClient && supabaseClient.auth) {
      try {
        const { data, error } = await supabaseClient.auth.signUp({
          email,
          password
        });

        if (error) {
          // If error is not just invalid api key
          console.warn('Supabase auth.signUp note:', error.message);
        } else if (data && data.user) {
          supabaseUserId = data.user.id;
        }
      } catch (sbErr) {
        console.warn('Supabase direct signup error:', sbErr.message);
      }
    }

    // 2. Notify backend register endpoint to insert into profiles table
    const registerRes = await fetch(`${API_BASE}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, id: supabaseUserId })
    });

    const registerData = await registerRes.json();
    if (!registerRes.ok && !registerData.success) {
      throw new Error(registerData.message || 'Registration failed. Please try again.');
    }

    // 3. On success, DO NOT redirect to the dashboard. Show the exact required message.
    signupForm.reset();
    showAlert('Account created successfully. Please wait for an Administrator to approve your access.', 'success');
  } catch (err) {
    console.error('Sign up error:', err);
    showAlert(`❌ ${err.message || 'Error creating account.'}`);
  } finally {
    signupBtn.disabled = false;
    signupBtn.innerHTML = BTN_DEFAULT_HTML;
  }
});
