const API_BASE = '/api';

const App = {
  token: localStorage.getItem('token'),
  user: null,
  business: null,

  async init() {
    if (this.token) {
      try {
        const result = await this.api('/auth/me');
        this.user = result.user;
        this.business = result.business;
      } catch (err) {
        this.logout();
      }
    }
  },

  async api(endpoint, options = {}) {
    const url = `${API_BASE}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const response = await fetch(url, {
      ...options,
      headers
    });

    if (response.status === 401) {
      this.logout();
      window.location.href = '/login.html';
      throw new Error('Unauthorized');
    }

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Terjadi kesalahan');
    }

    return data.data;
  },

  logout() {
    localStorage.removeItem('token');
    this.token = null;
    this.user = null;
    this.business = null;
  },

  formatCurrency(amount) {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  },

  formatDate(dateString) {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  },

  formatDateShort(dateString) {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    }).format(date);
  },

  getInitials(name) {
    return name
      .split(' ')
      .map(word => word[0])
      .join('')
      .toUpperCase()
      .substring(0, 2);
  },

  showToast(message, type = 'success') {
    const container = document.querySelector('.toast-container');
    if (!container) return;

    const icons = {
      success: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
      error: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
      warning: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--warning)" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`
    };

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
      <span class="toast-icon">${icons[type]}</span>
      <span class="toast-message">${message}</span>
      <button class="toast-close" onclick="this.parentElement.remove()">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    `;

    container.appendChild(toast);

    requestAnimationFrame(() => {
      toast.classList.add('active');
    });

    setTimeout(() => {
      toast.classList.remove('active');
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  },

  showModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.add('active');
      document.body.style.overflow = 'hidden';
    }
  },

  hideModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.remove('active');
      document.body.style.overflow = '';
    }
  },

  showLoading() {
    const overlay = document.createElement('div');
    overlay.className = 'loading-overlay';
    overlay.id = 'loading-overlay';
    overlay.innerHTML = '<div class="spinner spinner-lg"></div>';
    document.body.appendChild(overlay);
  },

  hideLoading() {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) {
      overlay.remove();
    }
  },

  debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  },

  setupSidebar() {
    const menuToggle = document.querySelector('.menu-toggle');
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.querySelector('.sidebar-overlay');

    if (menuToggle) {
      menuToggle.addEventListener('click', () => {
        sidebar.classList.toggle('open');
        overlay.classList.toggle('active');
      });
    }

    if (overlay) {
      overlay.addEventListener('click', () => {
        sidebar.classList.remove('open');
        overlay.classList.remove('active');
      });
    }
  },

  setupModals() {
    document.addEventListener('click', (e) => {
      if (e.target.classList.contains('modal-overlay')) {
        e.target.classList.remove('active');
        document.body.style.overflow = '';
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const activeModal = document.querySelector('.modal-overlay.active');
        if (activeModal) {
          activeModal.classList.remove('active');
          document.body.style.overflow = '';
        }
      }
    });
  },

  checkAuth() {
    if (!this.token || !this.user) {
      window.location.href = '/login.html';
      return false;
    }
    return true;
  },

  checkRole(requiredRole) {
    if (!this.user) return false;
    if (requiredRole === 'OWNER' && this.user.role !== 'OWNER') {
      window.location.href = '/kasir.html';
      return false;
    }
    if (requiredRole === 'KASIR' && this.user.role === 'OWNER') {
      return true;
    }
    return true;
  }
};

document.addEventListener('DOMContentLoaded', () => {
  App.init();
  App.setupModals();

  const toastContainer = document.createElement('div');
  toastContainer.className = 'toast-container';
  document.body.appendChild(toastContainer);
});
