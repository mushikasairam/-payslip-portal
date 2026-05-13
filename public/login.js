// Redirect if already logged in
fetch('/api/me')
  .then(r => r.json())
  .then(data => { if (data.user) window.location.href = '/dashboard.html'; })
  .catch(() => {});

const form      = document.getElementById('loginForm');
const emailEl   = document.getElementById('email');
const passEl    = document.getElementById('password');
const errorMsg  = document.getElementById('errorMsg');
const loginBtn  = document.getElementById('loginBtn');
const btnText   = document.getElementById('loginBtnText');
const spinner   = document.getElementById('loginSpinner');
const toggleBtn = document.getElementById('togglePass');

// Password show/hide
toggleBtn.addEventListener('click', () => {
  const isPass = passEl.type === 'password';
  passEl.type = isPass ? 'text' : 'password';
  document.getElementById('eyeIcon').innerHTML = isPass
    ? '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>'
    : '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>';
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  errorMsg.classList.add('hidden');

  const email    = emailEl.value.trim();
  const password = passEl.value;

  if (!email || !password) {
    showError('Please enter your email and password.');
    return;
  }

  loginBtn.disabled = true;
  btnText.textContent = 'Signing in...';
  spinner.classList.remove('hidden');

  try {
    const res  = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();

    if (res.ok && data.success) {
      window.location.href = '/dashboard.html';
    } else {
      showError(data.error || 'Invalid email or password.');
    }
  } catch {
    showError('Network error. Please check your connection.');
  } finally {
    loginBtn.disabled = false;
    btnText.textContent = 'Sign In';
    spinner.classList.add('hidden');
  }
});

function showError(msg) {
  errorMsg.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>${msg}`;
  errorMsg.classList.remove('hidden');
}
