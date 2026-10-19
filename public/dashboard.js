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
let currentTab = 'leads';

// Filter & Sort State
let currentFilterStatus = 'All';
let currentSortBy = 'newest';

// Bulk selection state (Set of lead ID numbers)
const selectedLeadIds = new Set();

// Filtered contacts state (null = all contacts, Array of IDs = filtered subset)
let contactsFilterIds = null;

// Context menu target state
let activeContextLeadId = null;

// ── DOM references ─────────────────────────────────────────────────────────────
const leadsBody            = document.getElementById('leads-body');
const contactsBody         = document.getElementById('contacts-body');
const paginationControls   = document.getElementById('pagination-controls');
const refreshBtn           = document.getElementById('refresh-btn');
const exportBtn            = document.getElementById('export-btn');
const logoutBtn            = document.getElementById('logout-btn');
const hamburgerBtn         = document.getElementById('hamburger-btn');
const sidebar              = document.getElementById('sidebar');
const sidebarOverlay       = document.getElementById('sidebar-overlay');

const tabLeads             = document.getElementById('tab-leads');
const tabOverview          = document.getElementById('tab-overview');
const tabContacts          = document.getElementById('tab-contacts');
const leadsView            = document.getElementById('leads-view');
const overviewView         = document.getElementById('overview-view');
const contactsView         = document.getElementById('contacts-view');

// Filter & Sort dropdowns
const filterStatusSelect   = document.getElementById('filter-status');
const sortBySelect         = document.getElementById('sort-by');

// Bulk selection elements
const selectAllCheckbox    = document.getElementById('select-all-checkbox');
const bulkActionsContainer = document.getElementById('bulk-actions');
const bulkDeleteBtn        = document.getElementById('bulk-delete-btn');
const bulkContactBtn       = document.getElementById('bulk-contact-btn');
const bulkCountSpan        = document.getElementById('bulk-count');

// Contacts view filter elements
const contactsFilterBadge  = document.getElementById('contacts-filter-badge');
const contactsFilterText   = document.getElementById('contacts-filter-text');
const btnShowAllContacts   = document.getElementById('btn-show-all-contacts');

// Context menu elements
const contextMenu          = document.getElementById('context-menu');
const contextContactBtn    = document.getElementById('context-contact-btn');
const contextDeleteBtn     = document.getElementById('context-delete-btn');

// Summary stat elements
const statTotal            = document.getElementById('stat-total');
const statNew              = document.getElementById('stat-new');
const statContacted        = document.getElementById('stat-contacted');
const statQualified        = document.getElementById('stat-qualified');
const statInProgress       = document.getElementById('stat-inprogress');
const statLost             = document.getElementById('stat-lost');
const statAttended         = document.getElementById('stat-attended');

// ── Status Options ─────────────────────────────────────────────────────────────
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

  // Real-time chart synchronization
  renderCharts();
}

// ── Data Pipeline: Filter & Sort Leads ─────────────────────────────────────────
function getFilteredAndSortedLeads() {
  let result = [...currentLeads];

  // 1. Filter by Status
  if (currentFilterStatus && currentFilterStatus !== 'All') {
    result = result.filter(lead => lead.status === currentFilterStatus);
  }

  // 2. Sort
  if (currentSortBy === 'newest') {
    result.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  } else if (currentSortBy === 'oldest') {
    result.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  } else if (currentSortBy === 'status') {
    const statusPriority = {
      'New': 1,
      'Contacted': 2,
      'Qualified': 3,
      'In Progress': 4,
      'Attended': 5,
      'Lost': 6
    };
    result.sort((a, b) => {
      const orderA = statusPriority[a.status] || 99;
      const orderB = statusPriority[b.status] || 99;
      if (orderA !== orderB) return orderA - orderB;
      return new Date(b.created_at) - new Date(a.created_at);
    });
  }

  return result;
}

// ── Render Leads Table (Pipeline -> Pagination -> DOM) ────────────────────────
function renderLeads() {
  const processedLeads = getFilteredAndSortedLeads();

  if (!processedLeads || !processedLeads.length) {
    leadsBody.innerHTML = `
      <tr class="empty-row">
        <td colspan="11">No leads match the selected criteria.</td>
      </tr>`;
    if (paginationControls) paginationControls.innerHTML = '';
    if (selectAllCheckbox) {
      selectAllCheckbox.checked = false;
      selectAllCheckbox.indeterminate = false;
    }
    updateBulkActionBar();
    return;
  }

  const totalPages = Math.ceil(processedLeads.length / LEADS_PER_PAGE) || 1;
  if (currentPage > totalPages) currentPage = totalPages;
  if (currentPage < 1) currentPage = 1;

  const startIndex = (currentPage - 1) * LEADS_PER_PAGE;
  const pageLeads = processedLeads.slice(startIndex, startIndex + LEADS_PER_PAGE);

  // Render rows
  leadsBody.innerHTML = pageLeads.map((lead, index) => {
    const leadId = Number(lead.id);
    const isSelected = selectedLeadIds.has(leadId);
    const currentStatus = lead.status || 'New';

    const optionsHtml = STATUS_OPTIONS.map(opt =>
      `<option value="${opt}" ${currentStatus === opt ? 'selected' : ''}>${opt}</option>`
    ).join('');

    const purposeHtml = lead.purpose
      ? `<span class="purpose-tag" title="${escHtml(lead.purpose)}">${escHtml(lead.purpose)}</span>`
      : '—';

    return `
      <tr class="${isSelected ? 'row-selected' : ''}" data-lead-id="${leadId}">
        <td>${startIndex + index + 1}</td>
        <td style="text-align: center;">
          <input
            type="checkbox"
            class="row-checkbox"
            data-id="${leadId}"
            ${isSelected ? 'checked' : ''}
            aria-label="Select ${escHtml(lead.full_name)}"
          />
        </td>
        <td>
          <span
            class="lead-name-cell"
            data-lead-id="${leadId}"
            title="Right-click or press and hold for actions"
          >
            ${escHtml(lead.full_name)}
          </span>
        </td>
        <td>${escHtml(lead.company)}</td>
        <td><a href="mailto:${escHtml(lead.email)}">${escHtml(lead.email)}</a></td>
        <td>${escHtml(lead.phone)}</td>
        <td>${purposeHtml}</td>
        <td>${escHtml(lead.source) || 'Direct'}</td>
        <td><span class="score-badge ${lead.score >= 50 ? 'high' : 'low'}">${lead.score ?? '-'}</span></td>
        <td>
          <select class="status-select" data-id="${leadId}" data-current="${escHtml(currentStatus)}" onchange="updateLeadStatus(${leadId}, this)">
            ${optionsHtml}
          </select>
        </td>
        <td>${formatDate(lead.created_at)}</td>
      </tr>
    `;
  }).join('');

  // Attach event listeners for checkboxes and context menu on newly rendered rows
  attachRowListeners(pageLeads);

  // Synchronize Select All checkbox state for this page
  syncSelectAllState(pageLeads);

  // Render Pagination Controls
  renderPagination(totalPages, processedLeads.length, startIndex, pageLeads.length);

  // Update Bulk Actions Toolbar visibility
  updateBulkActionBar();
}

// ── Attach Listeners for Row Checkboxes and Context Menu ───────────────────────
function attachRowListeners(pageLeads) {
  // 1. Checkbox change listeners
  const checkboxes = leadsBody.querySelectorAll('.row-checkbox');
  checkboxes.forEach(cb => {
    cb.addEventListener('change', (e) => {
      const id = Number(e.target.dataset.id);
      const row = e.target.closest('tr');
      if (e.target.checked) {
        selectedLeadIds.add(id);
        if (row) row.classList.add('row-selected');
      } else {
        selectedLeadIds.delete(id);
        if (row) row.classList.remove('row-selected');
      }
      syncSelectAllState(pageLeads);
      updateBulkActionBar();
    });
  });

  // 2. Custom Context Menu listeners on Name Cells
  const nameCells = leadsBody.querySelectorAll('.lead-name-cell');
  nameCells.forEach(cell => {
    const id = Number(cell.dataset.leadId);

    // Desktop: Right-Click (contextmenu)
    cell.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      showContextMenu(e.clientX, e.clientY, id);
    });

    // Mobile: Long-Press (~600ms hold)
    let touchTimer = null;
    let touchStartPos = { x: 0, y: 0 };

    cell.addEventListener('touchstart', (e) => {
      if (!e.touches || !e.touches[0]) return;
      touchStartPos = { x: e.touches[0].clientX, y: e.touches[0].clientY };

      touchTimer = setTimeout(() => {
        showContextMenu(touchStartPos.x, touchStartPos.y, id);
      }, 600);
    }, { passive: true });

    cell.addEventListener('touchmove', (e) => {
      if (!touchTimer || !e.touches || !e.touches[0]) return;
      const dx = e.touches[0].clientX - touchStartPos.x;
      const dy = e.touches[0].clientY - touchStartPos.y;
      if (Math.hypot(dx, dy) > 10) {
        clearTimeout(touchTimer);
        touchTimer = null;
      }
    }, { passive: true });

    cell.addEventListener('touchend', () => {
      if (touchTimer) {
        clearTimeout(touchTimer);
        touchTimer = null;
      }
    });

    cell.addEventListener('touchcancel', () => {
      if (touchTimer) {
        clearTimeout(touchTimer);
        touchTimer = null;
      }
    });
  });
}

// ── Synchronize Select All Checkbox State ───────────────────────────────────────
function syncSelectAllState(pageLeads) {
  if (!selectAllCheckbox || !pageLeads || !pageLeads.length) return;

  const pageIds = pageLeads.map(l => Number(l.id));
  const selectedOnPageCount = pageIds.filter(id => selectedLeadIds.has(id)).length;

  if (selectedOnPageCount === 0) {
    selectAllCheckbox.checked = false;
    selectAllCheckbox.indeterminate = false;
  } else if (selectedOnPageCount === pageIds.length) {
    selectAllCheckbox.checked = true;
    selectAllCheckbox.indeterminate = false;
  } else {
    selectAllCheckbox.checked = false;
    selectAllCheckbox.indeterminate = true;
  }
}

// ── Bulk Actions Bar Visibility and Counter ────────────────────────────────────
function updateBulkActionBar() {
  if (!bulkActionsContainer || !bulkCountSpan) return;

  if (selectedLeadIds.size > 0) {
    bulkActionsContainer.style.display = 'inline-flex';
    bulkCountSpan.textContent = selectedLeadIds.size;
  } else {
    bulkActionsContainer.style.display = 'none';
    bulkCountSpan.textContent = '0';
  }
}

// ── Select All Checkbox Handler ────────────────────────────────────────────────
if (selectAllCheckbox) {
  selectAllCheckbox.addEventListener('change', () => {
    const processedLeads = getFilteredAndSortedLeads();
    const startIndex = (currentPage - 1) * LEADS_PER_PAGE;
    const pageLeads = processedLeads.slice(startIndex, startIndex + LEADS_PER_PAGE);

    if (selectAllCheckbox.checked) {
      pageLeads.forEach(lead => selectedLeadIds.add(Number(lead.id)));
    } else {
      pageLeads.forEach(lead => selectedLeadIds.delete(Number(lead.id)));
    }

    renderLeads();
  });
}

// ── Bulk Action: Delete Selected Leads ─────────────────────────────────────────
if (bulkDeleteBtn) {
  bulkDeleteBtn.addEventListener('click', async () => {
    const count = selectedLeadIds.size;
    if (count === 0) return;

    if (!window.confirm(`Are you sure you want to delete ${count} selected lead(s)? This action cannot be undone.`)) {
      return;
    }

    bulkDeleteBtn.disabled = true;
    bulkDeleteBtn.textContent = 'Deleting…';

    try {
      const idsToDelete = Array.from(selectedLeadIds);
      const deletePromises = idsToDelete.map(id =>
        fetch(`${API_BASE}/api/leads/${id}`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`,
          },
        })
      );

      const responses = await Promise.all(deletePromises);
      const anyFailed = responses.some(r => !r.ok);

      if (anyFailed) {
        alert('Some leads could not be deleted. Refreshing list…');
      }

      selectedLeadIds.clear();
      await loadLeads();
    } catch (err) {
      alert(`Error during bulk delete: ${err.message}`);
    } finally {
      if (bulkDeleteBtn) {
        bulkDeleteBtn.disabled = false;
        bulkDeleteBtn.innerHTML = `🗑️ Delete Selected (<span id="bulk-count">0</span>)`;
      }
    }
  });
}

// ── Bulk Action: Contact Selected Leads ───────────────────────────────────────
if (bulkContactBtn) {
  bulkContactBtn.addEventListener('click', () => {
    if (selectedLeadIds.size === 0) return;
    switchTab('contacts', Array.from(selectedLeadIds));
  });
}

// ── Custom Context Menu Management ─────────────────────────────────────────────
function showContextMenu(clientX, clientY, leadId) {
  if (!contextMenu) return;

  activeContextLeadId = leadId;

  // Make visible to measure dimensions
  contextMenu.style.display = 'flex';

  const menuWidth = contextMenu.offsetWidth || 160;
  const menuHeight = contextMenu.offsetHeight || 90;

  // Clamp within viewport bounds
  let posX = clientX;
  let posY = clientY;

  if (posX + menuWidth > window.innerWidth - 10) {
    posX = window.innerWidth - menuWidth - 10;
  }
  if (posY + menuHeight > window.innerHeight - 10) {
    posY = window.innerHeight - menuHeight - 10;
  }

  contextMenu.style.left = `${Math.max(10, posX)}px`;
  contextMenu.style.top = `${Math.max(10, posY)}px`;
}

function hideContextMenu() {
  if (contextMenu) {
    contextMenu.style.display = 'none';
  }
  activeContextLeadId = null;
}

// Context Menu: "Contact"
if (contextContactBtn) {
  contextContactBtn.addEventListener('click', () => {
    if (activeContextLeadId) {
      const targetId = activeContextLeadId;
      hideContextMenu();
      switchTab('contacts', [targetId]);
    }
  });
}

// Context Menu: "Delete"
if (contextDeleteBtn) {
  contextDeleteBtn.addEventListener('click', async () => {
    if (activeContextLeadId) {
      const targetId = activeContextLeadId;
      hideContextMenu();
      await deleteLead(targetId);
    }
  });
}

// Global dismiss listeners for Context Menu
document.addEventListener('click', (e) => {
  if (contextMenu && !contextMenu.contains(e.target)) {
    hideContextMenu();
  }
});

window.addEventListener('scroll', hideContextMenu, { passive: true });

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    hideContextMenu();
  }
});

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

  for (let p = 1; p <= totalPages; p++) {
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
  const processedLeads = getFilteredAndSortedLeads();
  const totalPages = Math.ceil(processedLeads.length / LEADS_PER_PAGE) || 1;
  if (page < 1 || page > totalPages) return;
  currentPage = page;
  renderLeads();
}

// ── Render Contacts View Table ─────────────────────────────────────────────────
function renderContacts() {
  if (!contactsBody) return;

  let leadsToDisplay = currentLeads;

  if (contactsFilterIds && Array.isArray(contactsFilterIds)) {
    const filterSet = new Set(contactsFilterIds.map(Number));
    leadsToDisplay = currentLeads.filter(l => filterSet.has(Number(l.id)));

    if (contactsFilterBadge) {
      contactsFilterBadge.style.display = 'inline-flex';
      if (contactsFilterText) {
        contactsFilterText.textContent = `Filtered: ${leadsToDisplay.length} Contact${leadsToDisplay.length === 1 ? '' : 's'}`;
      }
    }
  } else {
    if (contactsFilterBadge) {
      contactsFilterBadge.style.display = 'none';
    }
  }

  if (!leadsToDisplay || !leadsToDisplay.length) {
    contactsBody.innerHTML = `
      <tr class="empty-row">
        <td colspan="3">No contacts found.</td>
      </tr>`;
    return;
  }

  contactsBody.innerHTML = leadsToDisplay.map(lead => `
    <tr>
      <td><strong>${escHtml(lead.full_name)}</strong></td>
      <td><a href="mailto:${escHtml(lead.email)}">${escHtml(lead.email)}</a></td>
      <td>${lead.phone ? `<a href="tel:${escHtml(lead.phone)}">${escHtml(lead.phone)}</a>` : '—'}</td>
    </tr>
  `).join('');
}

// Clear Contacts Filter handler
if (btnShowAllContacts) {
  btnShowAllContacts.addEventListener('click', () => {
    contactsFilterIds = null;
    renderContacts();
  });
}

// ── Chart.js Data Processing & Rendering ──────────────────────────────────────
function renderCharts() {
  if (typeof Chart === 'undefined') return;

  const statusCanvas = document.getElementById('statusChart');
  const timelineCanvas = document.getElementById('timelineChart');

  if (!statusCanvas || !timelineCanvas) return;

  // 1. Status Distribution (Doughnut Chart)
  const statusLabels = ['New', 'Contacted', 'Qualified', 'In Progress', 'Lost', 'Attended'];
  const statusCounts = statusLabels.map(status =>
    currentLeads.filter(l => (l.status || 'New') === status).length
  );

  const statusColors = [
    '#2563eb', // New (Blue)
    '#f59e0b', // Contacted (Amber/Yellow)
    '#10b981', // Qualified (Green)
    '#8b5cf6', // In Progress (Purple)
    '#ef4444', // Lost (Red)
    '#06b6d4'  // Attended (Cyan)
  ];

  // Lifecycle: destroy previous instance if exists to avoid hover glitch
  if (window.myStatusChart) {
    window.myStatusChart.destroy();
  }

  window.myStatusChart = new Chart(statusCanvas, {
    type: 'doughnut',
    data: {
      labels: statusLabels,
      datasets: [{
        data: statusCounts,
        backgroundColor: statusColors,
        borderColor: '#ffffff',
        borderWidth: 2,
        hoverOffset: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            padding: 14,
            boxWidth: 12,
            font: {
              family: "'Segoe UI', system-ui, sans-serif",
              size: 12,
              weight: '600'
            },
            color: '#334155'
          }
        },
        tooltip: {
          backgroundColor: '#0f172a',
          titleFont: { family: "'Segoe UI', system-ui, sans-serif", size: 13, weight: '700' },
          bodyFont: { family: "'Segoe UI', system-ui, sans-serif", size: 12 },
          padding: 10,
          cornerRadius: 6
        }
      },
      cutout: '65%'
    }
  });

  // 2. Leads Over Time (Line Chart)
  const dateCounts = {};
  const chronologicalLeads = [...currentLeads].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  chronologicalLeads.forEach(lead => {
    if (!lead.created_at) return;
    const d = new Date(lead.created_at);
    const dateLabel = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    dateCounts[dateLabel] = (dateCounts[dateLabel] || 0) + 1;
  });

  let timelineLabels = Object.keys(dateCounts);
  let timelineValues = Object.values(dateCounts);

  if (timelineLabels.length === 0) {
    timelineLabels = ['No Data'];
    timelineValues = [0];
  }

  // Lifecycle: destroy previous instance if exists to avoid hover glitch
  if (window.myTimelineChart) {
    window.myTimelineChart.destroy();
  }

  window.myTimelineChart = new Chart(timelineCanvas, {
    type: 'line',
    data: {
      labels: timelineLabels,
      datasets: [{
        label: 'Leads Captured',
        data: timelineValues,
        borderColor: '#2563eb',
        backgroundColor: 'rgba(37, 99, 235, 0.12)',
        borderWidth: 2.5,
        fill: true,
        tension: 0.35,
        pointBackgroundColor: '#2563eb',
        pointBorderColor: '#ffffff',
        pointBorderWidth: 2,
        pointRadius: 4,
        pointHoverRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          backgroundColor: '#0f172a',
          titleFont: { family: "'Segoe UI', system-ui, sans-serif", size: 13, weight: '700' },
          bodyFont: { family: "'Segoe UI', system-ui, sans-serif", size: 12 },
          padding: 10,
          cornerRadius: 6
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            precision: 0,
            font: { family: "'Segoe UI', system-ui, sans-serif", size: 11 },
            color: '#64748b'
          },
          grid: {
            color: '#f1f5f9'
          }
        },
        x: {
          ticks: {
            font: { family: "'Segoe UI', system-ui, sans-serif", size: 11 },
            color: '#64748b'
          },
          grid: {
            display: false
          }
        }
      }
    }
  });
}

// ── SPA Tab Navigation ─────────────────────────────────────────────────────────
function switchTab(tab, filterIds = null) {
  currentTab = tab;

  // Reset tab active styling
  if (tabLeads)    tabLeads.classList.remove('active');
  if (tabOverview) tabOverview.classList.remove('active');
  if (tabContacts) tabContacts.classList.remove('active');

  // Hide all views
  if (leadsView)    leadsView.style.display    = 'none';
  if (overviewView) overviewView.style.display = 'none';
  if (contactsView) contactsView.style.display = 'none';

  if (tab === 'overview') {
    if (overviewView) overviewView.style.display = 'block';
    if (tabOverview)  tabOverview.classList.add('active');
    renderCharts();
  } else if (tab === 'contacts') {
    contactsFilterIds = filterIds;
    if (contactsView) contactsView.style.display = 'block';
    if (tabContacts)  tabContacts.classList.add('active');
    renderContacts();
  } else {
    // Default 'leads' view
    contactsFilterIds = null;
    if (leadsView) leadsView.style.display = 'block';
    if (tabLeads)  tabLeads.classList.add('active');
    renderLeads();
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

    selectEl.setAttribute('data-current', newStatus);
    selectEl.classList.add('status-saved');
    setTimeout(() => {
      selectEl.classList.remove('status-saved');
    }, 1500);

    // Update in-memory state and refresh all 7 summary statistics
    const lead = currentLeads.find(l => Number(l.id) === Number(id));
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

    selectedLeadIds.delete(Number(id));
    await loadLeads();
  } catch (err) {
    alert(`Error deleting lead: ${err.message}`);
  }
}

// ── Export to CSV ──────────────────────────────────────────────────────────────
function exportToCSV() {
  const leadsToExport = getFilteredAndSortedLeads();
  if (!leadsToExport || leadsToExport.length === 0) {
    alert('No leads available to export.');
    return;
  }

  const headers = ['Name', 'Company', 'Email', 'Phone', 'Purpose', 'Status', 'Date'];

  const escapeCSV = (val) => {
    if (val === null || val === undefined) return '""';
    const str = String(val).replace(/"/g, '""');
    return `"${str}"`;
  };

  const rows = leadsToExport.map(lead => [
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
    renderLeads();
    renderContacts();
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
window.renderCharts     = renderCharts;

// ── Event Listeners ────────────────────────────────────────────────────────────
if (refreshBtn) refreshBtn.addEventListener('click', loadLeads);
if (exportBtn)  exportBtn.addEventListener('click', exportToCSV);
if (logoutBtn)  logoutBtn.addEventListener('click', logout);

if (filterStatusSelect) {
  filterStatusSelect.addEventListener('change', (e) => {
    currentFilterStatus = e.target.value;
    currentPage = 1;
    renderLeads();
  });
}

if (sortBySelect) {
  sortBySelect.addEventListener('change', (e) => {
    currentSortBy = e.target.value;
    currentPage = 1;
    renderLeads();
  });
}

if (tabLeads)    tabLeads.addEventListener('click', () => switchTab('leads'));
if (tabOverview) tabOverview.addEventListener('click', () => switchTab('overview'));
if (tabContacts) tabContacts.addEventListener('click', () => switchTab('contacts'));

if (hamburgerBtn)   hamburgerBtn.addEventListener('click', toggleSidebar);
if (sidebarOverlay) sidebarOverlay.addEventListener('click', closeSidebar);

// ── Init ───────────────────────────────────────────────────────────────────────
loadLeads();
