// ── Configuration ─────────────────────────────────────────────────────────────
const API_BASE = 'https://b2b-lead-dashboard-dfmf.onrender.com';

// ── DOM references ─────────────────────────────────────────────────────────────
const form = document.getElementById('lead-form');
const submitBtn = document.getElementById('submit-btn');
const alertMsg = document.getElementById('alert-msg');

// ── Helpers ────────────────────────────────────────────────────────────────────
function showAlert(message, type /* 'success' | 'error' */) {
  alertMsg.textContent = message;
  alertMsg.className = `alert ${type}`;
}

function resetAlert() {
  alertMsg.textContent = '';
  alertMsg.className = 'alert';
}

// ── Form submit handler ────────────────────────────────────────────────────────
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  resetAlert();

  const payload = {
    full_name: form.full_name.value.trim(),
    company: form.company.value.trim(),
    email: form.email.value.trim(),
    phone: form.phone.value.trim(),
  };

  // Basic client-side validation
  if (!payload.full_name || !payload.email) {
    showAlert('Please provide your name and email.', 'error');
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = 'Submitting…';

  try {
    const res = await fetch(`${API_BASE}/api/leads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Something went wrong.');
    }

    showAlert('✅ Thank you! We\'ll be in touch soon.', 'success');
    form.reset();
  } catch (err) {
    showAlert(`❌ Error: ${err.message}`, 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Submit →';
  }
});
