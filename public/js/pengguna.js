document.addEventListener('DOMContentLoaded', async () => {
  await App.init();

  if (!App.checkAuth()) return;
  if (!App.checkRole('OWNER')) return;

  App.setupSidebar();
  setupUserInfo();

  let currentPage = 1;
  let totalPages = 1;
  let statusFilter = '';

  await loadUsers();

  setupFilters();
  setupAddForm();
  setupEditForm();

  function setupUserInfo() {
    if (!App.user) return;
    const userName = document.getElementById('user-name');
    const userInitials = document.getElementById('user-initials');

    if (userName) userName.textContent = App.user.name;
    if (userInitials) userInitials.textContent = App.getInitials(App.user.name);
  }

  async function loadUsers() {
    const container = document.getElementById('users-table-body');
    const pagination = document.getElementById('pagination');
    const loadingEl = document.getElementById('users-loading');
    const emptyEl = document.getElementById('users-empty');

    if (!container) return;

    try {
      if (loadingEl) loadingEl.classList.remove('hidden');
      if (emptyEl) emptyEl.classList.add('hidden');
      container.innerHTML = '';

      const params = new URLSearchParams({
        page: currentPage,
        limit: 20
      });

      if (statusFilter) params.append('status', statusFilter);

      const data = await App.api(`/pengguna?${params}`);
      totalPages = data.pagination.total_pages;

      if (data.items.length === 0) {
        if (loadingEl) loadingEl.classList.add('hidden');
        if (emptyEl) emptyEl.classList.remove('hidden');
        if (pagination) pagination.innerHTML = '';
        return;
      }

      if (loadingEl) loadingEl.classList.add('hidden');

      container.innerHTML = data.items.map(user => `
        <tr>
          <td>
            <div style="font-weight: 500;">${user.name}</div>
            <div style="font-size: 0.75rem; color: var(--muted);">${user.email}</div>
          </td>
          <td><span class="badge badge-primary">${user.role}</span></td>
          <td><span class="badge ${user.status === 'ACTIVE' ? 'badge-success' : 'badge-danger'}">${user.status === 'ACTIVE' ? 'Aktif' : 'Nonaktif'}</span></td>
          <td>${App.formatDateShort(user.created_at)}</td>
          <td>
            <div class="flex gap-2">
              <button class="btn btn-ghost btn-sm" onclick="editUser('${user.id}')">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              </button>
              <button class="btn btn-ghost btn-sm" onclick="toggleUserStatus('${user.id}', '${user.status}')">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              </button>
            </div>
          </td>
        </tr>
      `).join('');

      renderPagination(pagination);
    } catch (err) {
      console.error('Error loading users:', err);
      if (loadingEl) loadingEl.classList.add('hidden');
      App.showToast('Gagal memuat data pengguna', 'error');
    }
  }

  function renderPagination(container) {
    if (!container || totalPages <= 1) {
      if (container) container.innerHTML = '';
      return;
    }

    let html = '';
    html += `<button class="btn btn-ghost btn-sm" onclick="goToPage(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''}>Sebelumnya</button>`;

    for (let i = 1; i <= totalPages; i++) {
      if (i === 1 || i === totalPages || (i >= currentPage - 1 && i <= currentPage + 1)) {
        html += `<button class="btn btn-sm ${i === currentPage ? 'btn-primary' : 'btn-ghost'}" onclick="goToPage(${i})">${i}</button>`;
      } else if (i === currentPage - 2 || i === currentPage + 2) {
        html += `<span style="color: var(--muted);">...</span>`;
      }
    }

    html += `<button class="btn btn-ghost btn-sm" onclick="goToPage(${currentPage + 1})" ${currentPage === totalPages ? 'disabled' : ''}>Selanjutnya</button>`;

    container.innerHTML = html;
  }

  window.goToPage = function(page) {
    if (page < 1 || page > totalPages) return;
    currentPage = page;
    loadUsers();
  };

  function setupFilters() {
    const statusEl = document.getElementById('filter-status');
    if (statusEl) {
      statusEl.addEventListener('change', (e) => {
        statusFilter = e.target.value;
        currentPage = 1;
        loadUsers();
      });
    }
  }

  function setupAddForm() {
    const form = document.getElementById('add-user-form');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const data = {
        name: document.getElementById('user-name-input').value,
        email: document.getElementById('user-email').value,
        password: document.getElementById('user-password').value
      };

      if (!data.name || !data.email || !data.password) {
        App.showToast('Semua field wajib diisi', 'warning');
        return;
      }

      try {
        await App.api('/pengguna', {
          method: 'POST',
          body: JSON.stringify(data)
        });

        App.hideModal('add-user-modal');
        form.reset();
        App.showToast('Kasir berhasil ditambahkan', 'success');
        await loadUsers();
      } catch (err) {
        App.showToast(err.message, 'error');
      }
    });
  }

  function setupEditForm() {
    const form = document.getElementById('edit-user-form');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const id = document.getElementById('edit-user-id').value;
      const data = {
        name: document.getElementById('edit-user-name').value,
        email: document.getElementById('edit-user-email').value
      };

      const password = document.getElementById('edit-user-password').value;
      if (password) {
        data.password = password;
      }

      try {
        await App.api(`/pengguna/${id}`, {
          method: 'PUT',
          body: JSON.stringify(data)
        });

        App.hideModal('edit-user-modal');
        App.showToast('Data kasir berhasil diupdate', 'success');
        await loadUsers();
      } catch (err) {
        App.showToast(err.message, 'error');
      }
    });
  }

  window.editUser = async function(id) {
    try {
      const users = await App.api('/pengguna?limit=100');
      const user = users.items.find(u => u.id === id);

      if (!user) {
        App.showToast('Pengguna tidak ditemukan', 'error');
        return;
      }

      document.getElementById('edit-user-id').value = user.id;
      document.getElementById('edit-user-name').value = user.name;
      document.getElementById('edit-user-email').value = user.email;
      document.getElementById('edit-user-password').value = '';

      App.showModal('edit-user-modal');
    } catch (err) {
      App.showToast('Gagal memuat data pengguna', 'error');
    }
  };

  window.toggleUserStatus = async function(id, currentStatus) {
    const newStatus = currentStatus === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    const action = newStatus === 'ACTIVE' ? 'mengaktifkan' : 'menonaktifkan';

    if (!confirm(`Apakah Anda yakin ingin ${action} kasir ini?`)) return;

    try {
      await App.api(`/pengguna/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus })
      });

      App.showToast(`Kasir berhasil di${action}`, 'success');
      await loadUsers();
    } catch (err) {
      App.showToast(err.message, 'error');
    }
  };
});
