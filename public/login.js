// Redirect if already logged in
fetch('/api/me')
  .then(r => r.json())
  .then(data => {
    if (data.user) window.location.href = '/dashboard.html';
  })
  .catch(() => {});

const form       = document.getElementById('loginForm');
const emailInput = document.getElementById('email');
const passInput  = document.getElementById('password');
const errorMsg   = document.getElementById('errorMsg');
const loginBtn   = document.getElementById('loginBtn');
const btnText    = document.getElementById('loginBtnText');
const spinner    = document.getElementById('loginSpinner');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  errorMsg.classList.add('hidden');

  const email    = emailInput.value.trim();
  const password = passInput.value;

  if (!email || !password) {
    showError('Please enter your email and password.');
    return;
  }

  // Show loading state
  loginBtn.disabled = true;
  btnText.textContent = 'Logging in...';
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
      showError(data.error || 'Login failed. Please try again.');
    }
  } catch {
    showError('Network error. Please check your connection.');
  } finally {
    loginBtn.disabled = false;
    btnText.textContent = 'Login';
    spinner.classList.add('hidden');
  }
});

function showError(msg) {
  errorMsg.textContent = msg;
  errorMsg.classList.remove('hidden');
}
