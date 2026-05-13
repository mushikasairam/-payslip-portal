const MONTHS = ['','January','February','March','April','May','June',
  'July','August','September','October','November','December'];

// ── Init ──────────────────────────────────────────────────────────────────────
(async function init() {
  let me;
  try {
    const r = await fetch('/api/me');
    if (!r.ok) throw new Error();
    me = await r.json();
  } catch {
    window.location.href = '/';
    return;
  }

  // Greeting
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const greetEl = document.getElementById('greetingText');
  if (greetEl) {
    const emoji = hour < 12 ? '☀️' : hour < 17 ? '👋' : '🌙';
    greetEl.textContent = `${greet}, ${me.user.name.split(' ')[0]} ${emoji}`;
  }

  // User avatar & welcome
  const name = me.user.name;
  document.getElementById('welcomeText').textContent = name;
  const avatarEl = document.getElementById('userAvatar');
  if (avatarEl) avatarEl.textContent = name.charAt(0).toUpperCase();

  // Profile modal on click
  const userPill = document.getElementById('userPill');
  if (userPill && !me.isAdmin) {
    userPill.style.cursor = 'pointer';
    userPill.addEventListener('click', openProfile);
  }
  document.getElementById('modalClose')?.addEventListener('click', closeProfile);
  document.getElementById('profileModal')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeProfile();
  });

  // Year dropdowns
  const currentYear = new Date().getFullYear();
  populateYears('yearSelect', currentYear);
  populateYears('uploadYear', currentYear);

  // Show view
  if (me.isAdmin) {
    document.getElementById('adminView').classList.remove('hidden');
    document.getElementById('employeeView').classList.add('hidden');
    loadPayslipList();
  } else {
    document.getElementById('employeeView').classList.remove('hidden');
    document.getElementById('adminView').classList.add('hidden');
  }

  // Logout
  document.getElementById('logoutBtn').addEventListener('click', async () => {
    await fetch('/api/logout', { method: 'POST' });
    window.location.href = '/';
  });

  // Employee check
  document.getElementById('checkBtn')?.addEventListener('click', checkPayslip);

  // Admin upload
  document.getElementById('uploadForm')?.addEventListener('submit', uploadPayslip);

  // File label
  document.getElementById('pdfFile')?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    document.getElementById('fileLabel').textContent = file ? file.name : 'Click or drag & drop a PDF here';
  });

  // Drag & drop
  const dropZone = document.getElementById('dropZone');
  if (dropZone) {
    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.classList.remove('dragover');
      const file = e.dataTransfer.files[0];
      if (file && file.type === 'application/pdf') {
        const dt = new DataTransfer();
        dt.items.add(file);
        document.getElementById('pdfFile').files = dt.files;
        document.getElementById('fileLabel').textContent = file.name;
      }
    });
  }
})();

// ── Populate years ────────────────────────────────────────────────────────────
function populateYears(id, current) {
  const sel = document.getElementById(id);
  if (!sel) return;
  for (let y = current; y >= current - 5; y--) {
    const o = document.createElement('option');
    o.value = y; o.textContent = y;
    sel.appendChild(o);
  }
}

// ── Check payslip ─────────────────────────────────────────────────────────────
async function checkPayslip() {
  const month = document.getElementById('monthSelect').value;
  const year  = document.getElementById('yearSelect').value;
  const msgEl = document.getElementById('checkMsg');
  const dlSec = document.getElementById('downloadSection');

  msgEl.className = 'hidden';
  dlSec.classList.add('hidden');

  if (!month || !year) {
    showMsg(msgEl, 'Please select both month and year.', 'error');
    return;
  }

  const btn = document.getElementById('checkBtn');
  btn.disabled = true;
  btn.innerHTML = `<span class="spinner"></span> Checking...`;

  try {
    const r    = await fetch(`/api/payslip/check?year=${year}&month=${month}`);
    const data = await r.json();

    if (data.exists) {
      const monthName = MONTHS[parseInt(month)];
      document.getElementById('downloadLabel').textContent = `Payslip – ${monthName} ${year}`;
      document.getElementById('downloadBtn').href = `/api/payslip/download?year=${year}&month=${month}`;
      document.getElementById('viewBtn').href     = `/api/payslip/view?year=${year}&month=${month}`;
      dlSec.classList.remove('hidden');
    } else {
      showMsg(msgEl, `No payslip found for ${MONTHS[parseInt(month)]} ${year}.`, 'info');
    }
  } catch {
    showMsg(msgEl, 'Error checking payslip. Please try again.', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg> Check`;
  }
}

// ── Upload payslip ────────────────────────────────────────────────────────────
async function uploadPayslip(e) {
  e.preventDefault();
  const month  = document.getElementById('uploadMonth').value;
  const year   = document.getElementById('uploadYear').value;
  const fileEl = document.getElementById('pdfFile');
  const msgEl  = document.getElementById('uploadMsg');
  const btn    = document.getElementById('uploadBtn');

  msgEl.className = 'hidden';

  if (!month || !year) { showMsg(msgEl, 'Please select month and year.', 'error'); return; }
  if (!fileEl.files[0]) { showMsg(msgEl, 'Please select a PDF file.', 'error'); return; }

  const fd = new FormData();
  fd.append('month', month);
  fd.append('year', year);
  fd.append('pdf', fileEl.files[0]);

  btn.disabled = true;
  btn.innerHTML = `<span class="spinner"></span> Uploading...`;

  try {
    const r    = await fetch('/api/admin/upload', { method: 'POST', body: fd });
    const data = await r.json();

    if (r.ok && data.success) {
      showMsg(msgEl, `✅ ${data.message}`, 'success');
      document.getElementById('uploadForm').reset();
      document.getElementById('fileLabel').textContent = 'Click or drag & drop a PDF here';
      loadPayslipList();
    } else {
      showMsg(msgEl, data.error || 'Upload failed.', 'error');
    }
  } catch {
    showMsg(msgEl, 'Network error. Please try again.', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg> Upload Payslip`;
  }
}

// ── Load payslip list ─────────────────────────────────────────────────────────
async function loadPayslipList() {
  const listEl = document.getElementById('payslipList');
  listEl.innerHTML = `<div class="skeleton-list"><div class="skeleton"></div><div class="skeleton"></div></div>`;

  try {
    const r    = await fetch('/api/admin/list');
    const data = await r.json();

    if (!data.files || data.files.length === 0) {
      listEl.innerHTML = `<div class="empty-state"><div class="empty-state-icon">📂</div><p>No payslips uploaded yet.</p></div>`;
      return;
    }

    // Mobile cards
    const mobileList = document.createElement('div');
    mobileList.className = 'payslip-list-mobile';

    // Desktop table
    const table = document.createElement('table');
    table.className = 'payslip-table';
    table.innerHTML = `<thead><tr><th>Month</th><th>Year</th><th>File</th><th>Action</th></tr></thead><tbody id="ptbody"></tbody>`;
    const tbody = table.querySelector('#ptbody');

    data.files.forEach(f => {
      const mn = MONTHS[parseInt(f.month)];
      const shortMon = mn.slice(0,3).toUpperCase();

      // Mobile
      const item = document.createElement('div');
      item.className = 'payslip-item';
      item.innerHTML = `
        <div class="payslip-item-left">
          <div class="payslip-month-badge">${shortMon}<br>${f.year}</div>
          <div class="payslip-item-info">
            <strong>${mn} ${f.year}</strong>
            <span>${f.filename}</span>
          </div>
        </div>
        <button class="btn-delete" data-filename="${f.filename}">Delete</button>`;
      mobileList.appendChild(item);

      // Desktop
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${mn}</td><td>${f.year}</td><td>${f.filename}</td>
        <td><button class="btn-delete" data-filename="${f.filename}">Delete</button></td>`;
      tbody.appendChild(tr);
    });

    listEl.innerHTML = '';
    listEl.appendChild(mobileList);
    listEl.appendChild(table);

    listEl.querySelectorAll('.btn-delete').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm(`Delete ${btn.dataset.filename}?`)) return;
        try {
          const r = await fetch(`/api/admin/delete/${btn.dataset.filename}`, { method: 'DELETE' });
          if (r.ok) loadPayslipList();
        } catch { alert('Delete failed.'); }
      });
    });

  } catch {
    listEl.innerHTML = `<div class="empty-state"><p>Failed to load payslips.</p></div>`;
  }
}

// ── Show message ──────────────────────────────────────────────────────────────
function showMsg(el, text, type) {
  el.textContent = text;
  el.className = type === 'success' ? 'success-msg' : type === 'info' ? 'info-msg' : 'error-msg';
}

// ── Profile modal ─────────────────────────────────────────────────────────────
async function openProfile() {
  const modal = document.getElementById('profileModal');
  modal.classList.remove('hidden');
  try {
    const r    = await fetch('/api/profile');
    const data = await r.json();
    if (data.profile) {
      const p = data.profile;
      document.getElementById('modalName').textContent    = p.name || '—';
      document.getElementById('modalEmail').textContent   = p.email || '—';
      document.getElementById('modalAvatar').textContent  = (p.name || 'M').charAt(0).toUpperCase();
      document.getElementById('pEmpCode').textContent     = p.employeeCode  || '—';
      document.getElementById('pName').textContent        = p.name          || '—';
      document.getElementById('pDesignation').textContent = p.designation   || '—';
      document.getElementById('pDepartment').textContent  = p.department    || '—';
      document.getElementById('pDoj').textContent         = p.dateOfJoining || '—';
    }
  } catch { /* ignore */ }
}

function closeProfile() {
  document.getElementById('profileModal').classList.add('hidden');
}
