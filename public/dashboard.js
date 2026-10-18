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
let currentPage = 1;
const LEADS_PER_PAGE = 10;
let currentTab = 'analytics';

// ── DOM references ─────────────────────────────────────────────────────────────
const leadsBody          = document.getElementById('leads-body');
const contactsBody       = document.getElementById('contacts-body');
const paginationControls = document.getElementById('pagination-controls');
const refreshBtn         = document.getElementById('refresh-btn');
const exportBtn          = document.getElementById('export-btn');
const logoutBtn          = document.getElementById('logout-btn');
const hamburgerBtn       = document.getElementById('hamburger-btn');
const sidebar            = document.getElementById('sidebar');
const sidebarOverlay     = document.getElementById('sidebar-overlay');

const tabAnalytics       = document.getElementById('tab-analytics');
const tabContacts        = document.getElementById('tab-contacts');
const analyticsView      = document.getElementById('analytics-view');
const contactsView       = document.getElementById('contacts-view');

// Summary stat elements
const statTotal          = document.getElementById('stat-total');
const statNew            = document.getElementById('stat-new');
const statContacted      = document.getElementById('stat-contacted');
const statQualified      = document.getElementById('stat-qualified');
const statInProgress     = document.getElementById('stat-inprogress');
const statLost           = document.getElementById('stat-lost');
const statAttended       = document.getElementById('stat-attended');

// ── Status Options (including "Attended") ──────────────────────────────────────
const STATUS_OPTIONS = [
  'New',
  'Contacted',
  'Qualified',
  'In Progress',
  'Lost',
  'Attended'
];

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

// ── Update Summary Metric Cards ────────────────────────────────────────────────
function updateStats(leads) {
  if (statTotal)      statTotal.textContent      = leads.length;
  if (statNew)        statNew.textContent        = leads.filter(l => l.status === 'New').length;
  if (statContacted)  statContacted.textContent  = leads.filter(l => l.status === 'Contacted').length;
  if (statQualified)  statQualified.textContent  = leads.filter(l => l.status === 'Qualified').length;
  if (statInProgress) statInProgress.textContent = leads.filter(l => l.status === 'In Progress').length;
  if (statLost)       statLost.textContent       = leads.filter(l => l.status === 'Lost').length;
  if (statAttended)   statAttended.textContent   = leads.filter(l => l.status === 'Attended').length;
}

// ── Render Leads Table with Pagination ─────────────────────────────────────────
function renderLeads(leads) {
  if (!leads || !leads.length) {
    leadsBody.innerHTML = `
      <tr class="empty-row">
        <td colspan="9">No leads found. Submit the capture form to get started.</td>
      </tr>`;
    if (paginationControls) paginationControls.innerHTML = '';
    return;
  }

  const totalPages = Math.ceil(leads.length / LEADS_PER_PAGE) || 1;
  if (currentPage > totalPages) currentPage = totalPages;
  if (currentPage < 1) currentPage = 1;

  const startIndex = (currentPage - 1) * LEADS_PER_PAGE;
  const pageLeads = leads.slice(startIndex, startIndex + LEADS_PER_PAGE);

  leadsBody.innerHTML = pageLeads.map((lead, index) => {
    const currentStatus = lead.status || 'New';
    const optionsHtml = STATUS_OPTIONS.map(opt =>
      `<option value="${opt}" ${currentStatus === opt ? 'selected' : ''}>${opt}</option>`
    ).join('');

    const purposeHtml = lead.purpose
      ? `<span class="purpose-tag" title="${escHtml(lead.purpose)}">${escHtml(lead.purpose)}</span>`
      : '—';

    return `
      <tr>
        <td>${startIndex + index + 1}</td>
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

  renderPagination(totalPages, leads.length, startIndex, pageLeads.length);
}

// ── Render Pagination Controls ─────────────────────────────────────────────────
function renderPagination(totalPages, totalLeads, startIndex, countOnPage) {
  if (!paginationControls) return;

  if (totalLeads <= LEADS_PER_PAGE) {
    paginationControls.innerHTML = `
      <div class="pagination-info">Showing ${totalLeads} lead${totalLeads === 1 ? '' : 's'}</div>
    `;
    return;
  }

  const fromIndex = startIndex + 1;
  const toIndex = startIndex + countOnPage;

  let pageButtonsHtml = '';

  // Generate page numbers
  for (let p = 1; p <= totalPages; p++) {
    // Show first, last, current, and surrounding pages
    if (
      p === 1 ||
      p === totalPages ||
      (p >= currentPage - 1 && p <= currentPage + 1)
    ) {
      pageButtonsHtml += `
        <button class="page-btn ${p === currentPage ? 'active' : ''}" onclick="goToPage(${p})">
          ${p}
        </button>
      `;
    } else if (
      (p === currentPage - 2 && p > 1) ||
      (p === currentPage + 2 && p < totalPages)
    ) {
      pageButtonsHtml += `<span style="padding: 0 0.25rem; color: #94a3b8;">…</span>`;
    }
  }

  paginationControls.innerHTML = `
    <div class="pagination-info">Showing ${fromIndex}–${toIndex} of ${totalLeads} leads</div>
    <div class="pagination-buttons">
      <button class="page-btn" onclick="goToPage(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''}>
        ‹ Previous
      </button>
      ${pageButtonsHtml}
      <button class="page-btn" onclick="goToPage(${currentPage + 1})" ${currentPage === totalPages ? 'disabled' : ''}>
        Next ›
      </button>
    </div>
  `;
}

// ── Jump to Page ───────────────────────────────────────────────────────────────
function goToPage(page) {
  const totalPages = Math.ceil(currentLeads.length / LEADS_PER_PAGE) || 1;
  if (page < 1 || page > totalPages) return;
  currentPage = page;
  renderLeads(currentLeads);
}

// ── Render Contacts View Table ─────────────────────────────────────────────────
function renderContacts(leads) {
  if (!contactsBody) return;

  if (!leads || !leads.length) {
    contactsBody.innerHTML = `
      <tr class="empty-row">
        <td colspan="3">No contacts found.</td>
      </tr>`;
    return;
  }

  contactsBody.innerHTML = leads.map(lead => `
    <tr>
      <td><strong>${escHtml(lead.full_name)}</strong></td>
      <td><a href="mailto:${escHtml(lead.email)}">${escHtml(lead.email)}</a></td>
      <td>${lead.phone ? `<a href="tel:${escHtml(lead.phone)}">${escHtml(lead.phone)}</a>` : '—'}</td>
    </tr>
  `).join('');
}

// ── SPA Tab Navigation ─────────────────────────────────────────────────────────
function switchTab(tab) {
  currentTab = tab;

  if (tab === 'contacts') {
    if (analyticsView) analyticsView.style.display = 'none';
    if (contactsView)  contactsView.style.display  = 'block';
    if (tabAnalytics)  tabAnalytics.classList.remove('active');
    if (tabContacts)   tabContacts.classList.add('active');
    renderContacts(currentLeads);
  } else {
    if (analyticsView) analyticsView.style.display = 'block';
    if (contactsView)  contactsView.style.display  = 'none';
    if (tabAnalytics)  tabAnalytics.classList.add('active');
    if (tabContacts)   tabContacts.classList.remove('active');
    renderLeads(currentLeads);
  }

  closeSidebar();
}

// ── Mobile Sidebar Controls ────────────────────────────────────────────────────
function toggleSidebar() {
  if (!sidebar) return;
  const isOpen = sidebar.classList.toggle('sidebar-open');
  if (sidebarOverlay) {
    sidebarOverlay.classList.toggle('active', isOpen);
  }
}

function closeSidebar() {
  if (sidebar) sidebar.classList.remove('sidebar-open');
  if (sidebarOverlay) sidebarOverlay.classList.remove('active');
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

    // Update in-memory state and refresh all 7 summary statistics in real time
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
  localStorage.removeItem('token');
  window.location.replace('index.html');
}

// ── Fetch all leads from the API (authenticated) ───────────────────────────────
async function loadLeads() {
  if (leadsBody) {
    leadsBody.innerHTML = `
      <tr class="empty-row">
        <td colspan="9">Loading leads…</td>
      </tr>`;
  }
  if (contactsBody) {
    contactsBody.innerHTML = `
      <tr class="empty-row">
        <td colspan="3">Loading contacts…</td>
      </tr>`;
  }

  try {
    const res = await fetch(`${API_BASE}/api/leads`, {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
      },
    });

    if (res.status === 401 || res.status === 403) {
      handleAuthError();
      return;
    }

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to fetch leads.');

    currentLeads = data.leads || [];
    updateStats(currentLeads);
    renderLeads(currentLeads);
    renderContacts(currentLeads);
  } catch (err) {
    if (leadsBody) {
      leadsBody.innerHTML = `
        <tr class="empty-row">
          <td colspan="9">⚠️ Could not load leads: ${escHtml(err.message)}</td>
        </tr>`;
    }
    if (contactsBody) {
      contactsBody.innerHTML = `
        <tr class="empty-row">
          <td colspan="3">⚠️ Could not load contacts: ${escHtml(err.message)}</td>
        </tr>`;
    }
    if (statTotal) statTotal.textContent = '!';
    if (statNew) statNew.textContent = '!';
    if (statContacted) statContacted.textContent = '!';
    if (statQualified) statQualified.textContent = '!';
    if (statInProgress) statInProgress.textContent = '!';
    if (statLost) statLost.textContent = '!';
    if (statAttended) statAttended.textContent = '!';
  }
}

// ── Logout ─────────────────────────────────────────────────────────────────────
function logout() {
  localStorage.clear();
  sessionStorage.clear();
  window.location.replace('index.html');
}

// ── Expose functions globally for inline HTML handlers ─────────────────────────
window.updateLeadStatus = updateLeadStatus;
window.deleteLead       = deleteLead;
window.exportToCSV      = exportToCSV;
window.goToPage         = goToPage;

// ── Event Listeners ────────────────────────────────────────────────────────────
if (refreshBtn) refreshBtn.addEventListener('click', loadLeads);
if (exportBtn)  exportBtn.addEventListener('click', exportToCSV);
if (logoutBtn)  logoutBtn.addEventListener('click', logout);

if (tabAnalytics) tabAnalytics.addEventListener('click', () => switchTab('analytics'));
if (tabContacts)  tabContacts.addEventListener('click', () => switchTab('contacts'));

if (hamburgerBtn)    hamburgerBtn.addEventListener('click', toggleSidebar);
if (sidebarOverlay)  sidebarOverlay.addEventListener('click', closeSidebar);

// ── Init ───────────────────────────────────────────────────────────────────────
loadLeads();
