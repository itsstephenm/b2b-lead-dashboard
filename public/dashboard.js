// ── Configuration ─────────────────────────────────────────────────────────────
const API_BASE = 'https://b2b-lead-dashboard-dfmf.onrender.com';

// ── Auth guard ─────────────────────────────────────────────────────────────────
// Redirect unauthenticated visitors back to the login page immediately.
const token = localStorage.getItem('token');
if (!token) {
  window.location.replace('index.html');
}

// ── State ──────────────────────────────────────────────────────────────────────
let currentLeads = [];

// ── DOM references ─────────────────────────────────────────────────────────────
const leadsBody     = document.getElementById('leads-body');
const refreshBtn    = document.getElementById('refresh-btn');
const exportBtn     = document.getElementById('export-btn');
const statTotal     = document.getElementById('stat-total');
const statNew       = document.getElementById('stat-new');
const statContacted = document.getElementById('stat-contacted');
const statQualified = document.getElementById('stat-qualified');

// ── Escape HTML to prevent XSS ─────────────────────────────────────────────────
function escHtml(str) {
  if (!str) return '—';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Format timestamp ───────────────────────────────────────────────────────────
function formatDate(isoString) {
  if (!isoString) return '—';
  const d = new Date(isoString);
  return d.toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// ── Update summary cards ───────────────────────────────────────────────────────
function updateStats(leads) {
  statTotal.textContent     = leads.length;
  statNew.textContent       = leads.filter(l => l.status === 'New').length;
  statContacted.textContent = leads.filter(l => l.status === 'Contacted').length;
  statQualified.textContent = leads.filter(l => l.status === 'Qualified').length;
}

// ── Render leads table ─────────────────────────────────────────────────────────
function renderLeads(leads) {
  if (!leads.length) {
    leadsBody.innerHTML = `
      <tr class="empty-row">
        <td colspan="9">No leads found. Submit the capture form to get started.</td>
      </tr>`;
    return;
  }

  const statusOptions = ['New', 'Contacted', 'Qualified', 'In Progress', 'Lost'];

  leadsBody.innerHTML = leads.map((lead, index) => {
    const currentStatus = lead.status || 'New';
    const optionsHtml = statusOptions.map(opt =>
      `<option value="${opt}" ${currentStatus === opt ? 'selected' : ''}>${opt}</option>`
    ).join('');

    const purposeHtml = lead.purpose
      ? `<span class="purpose-tag" title="${escHtml(lead.purpose)}">${escHtml(lead.purpose)}</span>`
      : '—';

    return `
      <tr>
        <td>${index + 1}</td>
        <td><strong>${escHtml(lead.full_name)}</strong></td>
        <td>${escHtml(lead.company)}</td>
        <td><a href="mailto:${escHtml(lead.email)}">${escHtml(lead.email)}</a></td>
        <td>${escHtml(lead.phone)}</td>
        <td>${purposeHtml}</td>
        <td>
          <select class="status-select" data-id="${lead.id}" data-current="${escHtml(currentStatus)}" onchange="updateLeadStatus(${lead.id}, this)">
            ${optionsHtml}
          </select>
        </td>
        <td>${formatDate(lead.created_at)}</td>
        <td>
          <button class="btn-delete" onclick="deleteLead(${lead.id})" title="Delete lead">
            🗑️ Delete
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

// ── Update lead status (PATCH /api/leads/:id/status) ───────────────────────────
async function updateLeadStatus(id, selectEl) {
  const newStatus = selectEl.value;
  const originalStatus = selectEl.getAttribute('data-current') || 'New';

  selectEl.disabled = true;

  try {
    const res = await fetch(`${API_BASE}/api/leads/${id}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
      },
      body: JSON.stringify({ status: newStatus }),
    });

    if (res.status === 401 || res.status === 403) {
      handleAuthError();
      return;
    }

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.message || data.error || 'Failed to update status.');
    }

    // Update current attribute and show brief success indicator
    selectEl.setAttribute('data-current', newStatus);
    selectEl.classList.add('status-saved');
    setTimeout(() => {
      selectEl.classList.remove('status-saved');
    }, 1500);

    // Update in-memory state and summary statistics
    const lead = currentLeads.find(l => l.id == id);
    if (lead) {
      lead.status = newStatus;
      updateStats(currentLeads);
    }
  } catch (err) {
    alert(`Error updating status: ${err.message}`);
    selectEl.value = originalStatus;
  } finally {
    selectEl.disabled = false;
  }
}

// ── Delete lead (DELETE /api/leads/:id) ─────────────────────────────────────────
async function deleteLead(id) {
  if (!window.confirm('Are you sure you want to delete this lead? This action cannot be undone.')) {
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/api/leads/${id}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
      },
    });

    if (res.status === 401 || res.status === 403) {
      handleAuthError();
      return;
    }

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.message || data.error || 'Failed to delete lead.');
    }

    // Refresh table and stats
    await loadLeads();
  } catch (err) {
    alert(`Error deleting lead: ${err.message}`);
  }
}

// ── Export to CSV ──────────────────────────────────────────────────────────────
function exportToCSV() {
  if (!currentLeads || currentLeads.length === 0) {
    alert('No leads available to export.');
    return;
  }

  const headers = ['Name', 'Company', 'Email', 'Phone', 'Purpose', 'Status', 'Date'];

  const escapeCSV = (val) => {
    if (val === null || val === undefined) return '""';
    const str = String(val).replace(/"/g, '""');
    return `"${str}"`;
  };

  const rows = currentLeads.map(lead => [
    escapeCSV(lead.full_name),
    escapeCSV(lead.company || ''),
    escapeCSV(lead.email),
    escapeCSV(lead.phone || ''),
    escapeCSV(lead.purpose || ''),
    escapeCSV(lead.status || 'New'),
    escapeCSV(formatDate(lead.created_at))
  ].join(','));

  const csvContent = [headers.join(','), ...rows].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'leads-export.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── Handle auth errors from the API ───────────────────────────────────────────
function handleAuthError() {
  // Token is invalid or expired — clear storage and force re-login
  localStorage.removeItem('token');
  window.location.replace('index.html');
}

// ── Fetch all leads from the API (authenticated) ───────────────────────────────
async function loadLeads() {
  leadsBody.innerHTML = `
    <tr class="empty-row">
      <td colspan="9">Loading leads…</td>
    </tr>`;

  try {
    const res  = await fetch(`${API_BASE}/api/leads`, {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
      },
    });

    // Token rejected by the server — redirect to login
    if (res.status === 401 || res.status === 403) {
      handleAuthError();
      return;
    }

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to fetch leads.');

    currentLeads = data.leads || [];
    updateStats(currentLeads);
    renderLeads(currentLeads);
  } catch (err) {
    leadsBody.innerHTML = `
      <tr class="empty-row">
        <td colspan="9">⚠️ Could not load leads: ${escHtml(err.message)}</td>
      </tr>`;
    statTotal.textContent = statNew.textContent =
      statContacted.textContent = statQualified.textContent = '!';
  }
}

// ── Logout ─────────────────────────────────────────────────────────────────────
function logout() {
  localStorage.clear();
  sessionStorage.clear();
  window.location.replace('index.html');
}

// ── Expose functions globally for inline handlers ─────────────────────────────
window.updateLeadStatus = updateLeadStatus;
window.deleteLead       = deleteLead;
window.exportToCSV      = exportToCSV;

// ── Init ───────────────────────────────────────────────────────────────────────
loadLeads();
refreshBtn.addEventListener('click', loadLeads);
if (exportBtn) exportBtn.addEventListener('click', exportToCSV);
document.getElementById('logout-btn').addEventListener('click', logout);
