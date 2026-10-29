// ── Configuration ─────────────────────────────────────────────────────────────
const API_BASE = 'https://b2b-lead-dashboard-dfmf.onrender.com';

// ── DOM references ─────────────────────────────────────────────────────────────
const form = document.getElementById('lead-form');
const submitBtn = document.getElementById('submit-btn');
const alertMsg = document.getElementById('alert-msg');
const purposeSelect = document.getElementById('purpose');
const customPurposeInput = document.getElementById('custom_purpose');

// ── Purpose dropdown toggle ────────────────────────────────────────────────────
if (purposeSelect && customPurposeInput) {
  purposeSelect.addEventListener('change', () => {
    if (purposeSelect.value === 'Other') {
      customPurposeInput.style.display = 'block';
      customPurposeInput.required = true;
      customPurposeInput.focus();
    } else {
      customPurposeInput.style.display = 'none';
      customPurposeInput.required = false;
      customPurposeInput.value = '';
    }
  });
}

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

  // Extract utm_source dynamically on submission using the active window location
  const currentParams = new URLSearchParams(window.location.search);
  const source = currentParams.get('utm_source')?.trim() || 'Direct';

  let finalPurpose = purposeSelect ? purposeSelect.value : '';
  if (finalPurpose === 'Other' && customPurposeInput) {
    finalPurpose = customPurposeInput.value.trim();
  }

  const payload = {
    full_name: form.full_name.value.trim(),
    company: form.company.value.trim(),
    purpose: finalPurpose || null,
    source: source,
    email: form.email.value.trim(),
    phone: form.phone.value.trim(),
  };

  // Basic client-side validation
  if (!payload.full_name || !payload.email) {
    showAlert('Please provide your name and email.', 'error');
    return;
  }

  if (purposeSelect && purposeSelect.value === 'Other' && !finalPurpose) {
    showAlert('Please specify your custom purpose.', 'error');
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
    if (customPurposeInput) {
      customPurposeInput.style.display = 'none';
      customPurposeInput.required = false;
    }
  } catch (err) {
    showAlert(`❌ Error: ${err.message}`, 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Submit →';
  }
});

// ── "Return to login" — clear auth session before navigating ──────────────────
// Uses event.preventDefault() so storage is guaranteed to be wiped before the
// browser navigates, preventing the dashboard.js auth guard from seeing a
// stale token and incorrectly redirecting the visitor back to dashboard.html.
document.querySelectorAll('[data-clear-auth]').forEach((el) => {
  el.addEventListener('click', (e) => {
    e.preventDefault();
    localStorage.clear();
    sessionStorage.clear();
    window.location.href = el.getAttribute('href') || 'index.html';
  });
});
