document.addEventListener('DOMContentLoaded', async () => {
  await App.init();

  if (!App.checkAuth()) return;
  if (!App.checkRole('OWNER')) return;

  App.setupSidebar();
  setupUserInfo();

  await loadBusinessInfo();
  await loadActivityLog();

  setupBusinessForm();

  function setupUserInfo() {
    if (!App.user) return;
    const userName = document.getElementById('user-name');
    const userInitials = document.getElementById('user-initials');

    if (userName) userName.textContent = App.user.name;
    if (userInitials) userInitials.textContent = App.getInitials(App.user.name);
  }

  async function loadBusinessInfo() {
    try {
      const business = await App.api('/usaha');

      document.getElementById('business-name').value = business.name || '';
      document.getElementById('business-address').value = business.address || '';
      document.getElementById('business-phone').value = business.phone || '';
      document.getElementById('business-timezone').value = business.timezone || 'Asia/Jakarta';
    } catch (err) {
      console.error('Error loading business info:', err);
      App.showToast('Gagal memuat data usaha', 'error');
    }
  }

  function setupBusinessForm() {
    const form = document.getElementById('business-form');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const data = {
        name: document.getElementById('business-name').value,
        address: document.getElementById('business-address').value,
        phone: document.getElementById('business-phone').value,
        timezone: document.getElementById('business-timezone').value
      };

      if (!data.name) {
        App.showToast('Nama usaha wajib diisi', 'warning');
        return;
      }

      const submitBtn = document.getElementById('save-business-btn');

      try {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="spinner"></span> Menyimpan...';

        await App.api('/usaha', {
          method: 'PUT',
          body: JSON.stringify(data)
        });

        App.showToast('Informasi usaha berhasil disimpan', 'success');
      } catch (err) {
        App.showToast(err.message, 'error');
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = 'Simpan Perubahan';
      }
    });
  }

  async function loadActivityLog() {
    const container = document.getElementById('activity-log');
    if (!container) return;

    try {
      const response = await fetch('/api/activity-log', {
        headers: {
          'Authorization': `Bearer ${App.token}`
        }
      });

      if (!response.ok) {
        container.innerHTML = `
          <div class="empty-state">
            <div class="empty-state-title">Belum ada aktivitas</div>
          </div>
        `;
        return;
      }

      const data = await response.json();
      const logs = data.data || [];

      if (logs.length === 0) {
        container.innerHTML = `
          <div class="empty-state">
            <div class="empty-state-title">Belum ada aktivitas</div>
            <div class="empty-state-description">Aktivitas akan tercatat di sini</div>
          </div>
        `;
        return;
      }

      container.innerHTML = logs.map(log => `
        <div class="activity-item">
          <div class="activity-icon" style="background-color: ${getActivityColor(log.action)};">
            ${getActivityIcon(log.action)}
          </div>
          <div class="activity-content">
            <div class="activity-description">${log.description}</div>
            <div class="activity-time">${App.formatDate(log.created_at)}</div>
          </div>
        </div>
      `).join('');
    } catch (err) {
      console.error('Error loading activity log:', err);
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-title">Gagal memuat log aktivitas</div>
        </div>
      `;
    }
  }

  function getActivityColor(action) {
    if (action.includes('LOGIN') || action.includes('LOGOUT')) return 'var(--primary-bg)';
    if (action.includes('CREATE')) return 'var(--success-bg)';
    if (action.includes('UPDATE')) return 'var(--warning-bg)';
    if (action.includes('DISABLE') || action.includes('ENABLE')) return 'var(--danger-bg)';
    if (action.includes('TRANSACTION')) return 'var(--success-bg)';
    return 'var(--border-light)';
  }

  function getActivityIcon(action) {
    const color = getActivityColor(action).replace('-bg', '');
    if (action.includes('LOGIN')) return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>`;
    if (action.includes('CREATE')) return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>`;
    if (action.includes('UPDATE')) return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
    if (action.includes('TRANSACTION')) return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>`;
    return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`;
  }
});
