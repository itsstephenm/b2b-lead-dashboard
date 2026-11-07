// ── Configuration ─────────────────────────────────────────────────────────────
const SUPABASE_URL = 'https://qvljwdbucufkaxkbmgra.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF2bGp3ZGJ1Y3Vma2F4a2JtZ3JhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIyMjIxOTMsImV4cCI6MjEwNzc5ODE5M30.vNh0sTYsQzDDegdw3y1bE57eaoD0604i3izvhdtLk50'; // <-- Replace this!

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── DOM references ─────────────────────────────────────────────────────────────
const signupForm = document.getElementById('signup-form');
const signupBtn = document.getElementById('signup-btn');
const alertMsg = document.getElementById('alert-msg');

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
    // 1. Send the signup request directly to Supabase
    const { data, error } = await supabaseClient.auth.signUp({
      email,
      password
    });

    if (error) throw error;

    // 2. Success! The SQL database trigger automatically handles the rest.
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