document.addEventListener('DOMContentLoaded', async () => {
  await App.init();

  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');

  if (loginForm) {
    setupLoginForm();
  }

  if (registerForm) {
    setupRegisterForm();
  }

  if (App.token && App.user) {
    const currentPage = window.location.pathname;
    if (currentPage.includes('login.html') || currentPage.includes('register.html') || currentPage === '/' || currentPage.endsWith('index.html')) {
      if (App.user.role === 'OWNER') {
        window.location.href = '/dashboard.html';
      } else {
        window.location.href = '/kasir.html';
      }
    }
  }
});

function setupLoginForm() {
  const form = document.getElementById('login-form');
  const emailInput = document.getElementById('email');
  const passwordInput = document.getElementById('password');
  const togglePassword = document.getElementById('toggle-password');
  const submitBtn = document.getElementById('submit-btn');
  const errorMsg = document.getElementById('error-message');

  if (togglePassword) {
    togglePassword.addEventListener('click', () => {
      const type = passwordInput.type === 'password' ? 'text' : 'password';
      passwordInput.type = type;
      togglePassword.innerHTML = type === 'password' 
        ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>'
        : '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
    });
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (!email || !password) {
      showError('Email dan password wajib diisi');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner"></span> Masuk...';
    errorMsg.classList.add('hidden');

    try {
      const result = await App.api('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password })
      });

      localStorage.setItem('token', result.token);
      App.token = result.token;
      App.user = result.user;
      App.business = result.business;

      if (result.user.role === 'OWNER') {
        window.location.href = '/dashboard.html';
      } else {
        window.location.href = '/kasir.html';
      }
    } catch (err) {
      showError(err.message);
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = 'Masuk';
    }
  });

  function showError(message) {
    errorMsg.textContent = message;
    errorMsg.classList.remove('hidden');
  }
}

function setupRegisterForm() {
  const form = document.getElementById('register-form');
  const nameInput = document.getElementById('name');
  const emailInput = document.getElementById('email');
  const passwordInput = document.getElementById('password');
  const confirmInput = document.getElementById('confirm-password');
  const businessInput = document.getElementById('business-name');
  const submitBtn = document.getElementById('submit-btn');
  const errorMsg = document.getElementById('error-message');

  const toggleButtons = document.querySelectorAll('.toggle-password');
  toggleButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const input = btn.parentElement.querySelector('input');
      const type = input.type === 'password' ? 'text' : 'password';
      input.type = type;
      btn.innerHTML = type === 'password'
        ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>'
        : '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
    });
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const name = nameInput.value.trim();
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    const confirm = confirmInput.value;
    const businessName = businessInput.value.trim();

    if (!name || !email || !password || !confirm || !businessName) {
      showError('Semua field wajib diisi');
      return;
    }

    if (password.length < 8) {
      showError('Password minimal 8 karakter');
      return;
    }

    if (password !== confirm) {
      showError('Password tidak cocok');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner"></span> Mendaftar...';
    errorMsg.classList.add('hidden');

    try {
      const result = await App.api('/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          name,
          email,
          password,
          business_name: businessName
        })
      });

      localStorage.setItem('token', result.token);
      App.token = result.token;
      App.user = result.user;
      App.business = result.business;

      window.location.href = '/dashboard.html';
    } catch (err) {
      showError(err.message);
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = 'Daftar';
    }
  });

  function showError(message) {
    errorMsg.textContent = message;
    errorMsg.classList.remove('hidden');
  }
        }
