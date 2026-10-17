// ── Configuration ─────────────────────────────────────────────────────────────
const API_BASE = 'https://b2b-lead-dashboard-dfmf.onrender.com';

// ── DOM references ─────────────────────────────────────────────────────────────
const leadsBody = document.getElementById('leads-body');
const refreshBtn = document.getElementById('refresh-btn');
const statTotal = document.getElementById('stat-total');
const statNew = document.getElementById('stat-new');
const statContacted = document.getElementById('stat-contacted');
const statQualified = document.getElementById('stat-qualified');

// ── Badge helper ───────────────────────────────────────────────────────────────
function statusBadge(status) {
  const map = {
    'New': 'badge-new',
    'Contacted': 'badge-contacted',
    'Qualified': 'badge-qualified',
    'Closed': 'badge-closed',
  };
  const cls = map[status] || 'badge-default';
  return `<span class="badge ${cls}">${escHtml(status)}</span>`;
}

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
  const d = new Date(isoString);
  return d.toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// ── Update summary cards ───────────────────────────────────────────────────────
function updateStats(leads) {
  statTotal.textContent = leads.length;
  statNew.textContent = leads.filter(l => l.status === 'New').length;
  statContacted.textContent = leads.filter(l => l.status === 'Contacted').length;
  statQualified.textContent = leads.filter(l => l.status === 'Qualified').length;
}

// ── Render leads table ─────────────────────────────────────────────────────────
function renderLeads(leads) {
  if (!leads.length) {
    leadsBody.innerHTML = `
      <tr class="empty-row">
        <td colspan="7">No leads found. Submit the capture form to get started.</td>
      </tr>`;
    return;
  }

  leadsBody.innerHTML = leads.map((lead, index) => `
    <tr>
      <td>${index + 1}</td>
      <td><strong>${escHtml(lead.full_name)}</strong></td>
      <td>${escHtml(lead.company)}</td>
      <td><a href="mailto:${escHtml(lead.email)}">${escHtml(lead.email)}</a></td>
      <td>${escHtml(lead.phone)}</td>
      <td>${statusBadge(lead.status)}</td>
      <td>${formatDate(lead.created_at)}</td>
    </tr>
  `).join('');
}

// ── Fetch all leads from the API ───────────────────────────────────────────────
async function loadLeads() {
  leadsBody.innerHTML = `
    <tr class="empty-row">
      <td colspan="7">Loading leads…</td>
    </tr>`;

  try {
    const res = await fetch(`${API_BASE}/api/leads`);
    const data = await res.json();

    if (!res.ok) throw new Error(data.error || 'Failed to fetch leads.');

    updateStats(data.leads);
    renderLeads(data.leads);
  } catch (err) {
    leadsBody.innerHTML = `
      <tr class="empty-row">
        <td colspan="7">⚠️ Could not load leads: ${escHtml(err.message)}</td>
      </tr>`;
    statTotal.textContent = statNew.textContent =
      statContacted.textContent = statQualified.textContent = '!';
  }
}

// ── Init ───────────────────────────────────────────────────────────────────────
loadLeads();
refreshBtn.addEventListener('click', loadLeads);
