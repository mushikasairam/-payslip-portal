const MONTHS = [
  '', 'January','February','March','April','May','June',
  'July','August','September','October','November','December'
];

// ─── Init ─────────────────────────────────────────────────────────────────────
(async function init() {
  // Check session
  let me;
  try {
    const r = await fetch('/api/me');
    if (!r.ok) throw new Error();
    me = await r.json();
  } catch {
    window.location.href = '/';
    return;
  }

  // Set welcome text
  document.getElementById('welcomeText').textContent = `Welcome, ${me.user.name}`;

  // Populate year dropdowns
  const currentYear = new Date().getFullYear();
  populateYears('yearSelect', currentYear);
  populateYears('uploadYear', currentYear);

  // Show correct view
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

  // Employee: check payslip
  document.getElementById('checkBtn').addEventListener('click', checkPayslip);

  // Admin: upload
  document.getElementById('uploadForm').addEventListener('submit', uploadPayslip);

  // File input label update
  document.getElementById('pdfFile').addEventListener('change', (e) => {
    const file = e.target.files[0];
    document.getElementById('fileLabel').textContent = file ? file.name : 'Click to choose or drag & drop a PDF';
  });

  // Drag & drop styling
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

// ─── Populate year select ─────────────────────────────────────────────────────
function populateYears(selectId, currentYear) {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  for (let y = currentYear; y >= currentYear - 5; y--) {
    const opt = document.createElement('option');
    opt.value = y;
    opt.textContent = y;
    sel.appendChild(opt);
  }
}

// ─── Employee: check & show download ─────────────────────────────────────────
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
  btn.textContent = 'Checking...';

  try {
    const r    = await fetch(`/api/payslip/check?year=${year}&month=${month}`);
    const data = await r.json();

    if (data.exists) {
      const monthName = MONTHS[parseInt(month)];
      document.getElementById('downloadLabel').textContent = `Payslip – ${monthName} ${year}`;
      const url = `/api/payslip/download?year=${year}&month=${month}`;
      document.getElementById('downloadBtn').href = url;
      document.getElementById('viewBtn').href = `/api/payslip/view?year=${year}&month=${month}`;
      dlSec.classList.remove('hidden');
      msgEl.classList.add('hidden');
    } else {
      showMsg(msgEl, `No payslip found for ${MONTHS[parseInt(month)]} ${year}.`, 'info');
    }
  } catch {
    showMsg(msgEl, 'Error checking payslip. Please try again.', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Check';
  }
}

// ─── Admin: upload payslip ────────────────────────────────────────────────────
async function uploadPayslip(e) {
  e.preventDefault();
  const month   = document.getElementById('uploadMonth').value;
  const year    = document.getElementById('uploadYear').value;
  const fileEl  = document.getElementById('pdfFile');
  const msgEl   = document.getElementById('uploadMsg');
  const btn     = document.getElementById('uploadBtn');

  msgEl.className = 'hidden';

  if (!month || !year) {
    showMsg(msgEl, 'Please select month and year.', 'error');
    return;
  }
  if (!fileEl.files[0]) {
    showMsg(msgEl, 'Please select a PDF file.', 'error');
    return;
  }

  const formData = new FormData();
  formData.append('month', month);
  formData.append('year', year);
  formData.append('pdf', fileEl.files[0]);

  btn.disabled = true;
  btn.textContent = 'Uploading...';

  try {
    const r    = await fetch('/api/admin/upload', { method: 'POST', body: formData });
    const data = await r.json();

    if (r.ok && data.success) {
      showMsg(msgEl, data.message, 'success');
      document.getElementById('uploadForm').reset();
      document.getElementById('fileLabel').textContent = 'Click to choose or drag & drop a PDF';
      loadPayslipList();
    } else {
      showMsg(msgEl, data.error || 'Upload failed.', 'error');
    }
  } catch {
    showMsg(msgEl, 'Network error. Please try again.', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Upload Payslip';
  }
}

// ─── Admin: load payslip list ─────────────────────────────────────────────────
async function loadPayslipList() {
  const listEl = document.getElementById('payslipList');
  listEl.innerHTML = '<p class="loading-text">Loading...</p>';

  try {
    const r    = await fetch('/api/admin/list');
    const data = await r.json();

    if (!data.files || data.files.length === 0) {
      listEl.innerHTML = '<div class="empty-state">No payslips uploaded yet.</div>';
      return;
    }

    // Mobile card list
    const mobileList = document.createElement('div');
    mobileList.className = 'payslip-list-mobile';

    // Desktop table
    const table = document.createElement('table');
    table.className = 'payslip-table';
    table.innerHTML = `
      <thead>
        <tr>
          <th>Month</th>
          <th>Year</th>
          <th>File</th>
          <th>Action</th>
        </tr>
      </thead>
      <tbody id="payslipTableBody"></tbody>
    `;
    const tbody = table.querySelector('#payslipTableBody');

    data.files.forEach(f => {
      const monthName = MONTHS[parseInt(f.month)];

      // Mobile card item
      const item = document.createElement('div');
      item.className = 'payslip-item';
      item.innerHTML = `
        <div class="payslip-item-info">
          <strong>${monthName} ${f.year}</strong>
          <span>${f.filename}</span>
        </div>
        <button class="btn-delete" data-filename="${f.filename}">Delete</button>
      `;
      mobileList.appendChild(item);

      // Desktop table row
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${monthName}</td>
        <td>${f.year}</td>
        <td>${f.filename}</td>
        <td><button class="btn-delete" data-filename="${f.filename}">Delete</button></td>
      `;
      tbody.appendChild(tr);
    });

    listEl.innerHTML = '';
    listEl.appendChild(mobileList);
    listEl.appendChild(table);

    // Delete handlers (works for both mobile & desktop buttons)
    listEl.querySelectorAll('.btn-delete').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm(`Delete ${btn.dataset.filename}?`)) return;
        try {
          const r = await fetch(`/api/admin/delete/${btn.dataset.filename}`, { method: 'DELETE' });
          if (r.ok) loadPayslipList();
        } catch {
          alert('Delete failed.');
        }
      });
    });

  } catch {
    listEl.innerHTML = '<p class="loading-text">Failed to load payslips.</p>';
  }
}

// ─── Helper: show message ─────────────────────────────────────────────────────
function showMsg(el, text, type) {
  el.textContent = text;
  el.className = type === 'success' ? 'success-msg'
               : type === 'info'    ? 'info-msg'
               : 'error-msg';
}
