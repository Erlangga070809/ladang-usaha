document.addEventListener('DOMContentLoaded', async () => {
  await App.init();

  if (!App.checkAuth()) return;
  if (!App.checkRole('OWNER')) return;

  App.setupSidebar();
  setupUserInfo();

  let currentPage = 1;
  let totalPages = 1;
  let searchTerm = '';
  let categoryFilter = '';
  let statusFilter = '';

  await loadCategories();
  await loadProducts();

  setupSearch();
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

  async function loadCategories() {
    try {
      const categories = await App.api('/kategori');
      const filterSelect = document.getElementById('filter-category');
      const formSelect = document.getElementById('product-category');

      if (filterSelect) {
        filterSelect.innerHTML = '<option value="">Semua Kategori</option>' +
          categories.filter(c => c.status === 'ACTIVE').map(c => `<option value="${c.id}">${c.name}</option>`).join('');
      }

      if (formSelect) {
        formSelect.innerHTML = '<option value="">Pilih Kategori</option>' +
          categories.filter(c => c.status === 'ACTIVE').map(c => `<option value="${c.id}">${c.name}</option>`).join('');
      }
    } catch (err) {
      console.error('Error loading categories:', err);
    }
  }

  async function loadProducts() {
    const container = document.getElementById('products-table-body');
    const pagination = document.getElementById('pagination');
    const loadingEl = document.getElementById('products-loading');
    const emptyEl = document.getElementById('products-empty');

    if (!container) return;

    try {
      if (loadingEl) loadingEl.classList.remove('hidden');
      if (emptyEl) emptyEl.classList.add('hidden');
      container.innerHTML = '';

      const params = new URLSearchParams({
        page: currentPage,
        limit: 20
      });

      if (searchTerm) params.append('search', searchTerm);
      if (categoryFilter) params.append('category_id', categoryFilter);
      if (statusFilter) params.append('status', statusFilter);

      const data = await App.api(`/produk?${params}`);
      totalPages = data.pagination.total_pages;

      if (data.items.length === 0) {
        if (loadingEl) loadingEl.classList.add('hidden');
        if (emptyEl) emptyEl.classList.remove('hidden');
        if (pagination) pagination.innerHTML = '';
        return;
      }

      if (loadingEl) loadingEl.classList.add('hidden');

      container.innerHTML = data.items.map(product => `
        <tr>
          <td>
            <div style="font-weight: 500;">${product.name}</div>
            <div style="font-size: 0.75rem; color: var(--muted);">${product.sku}</div>
          </td>
          <td>${product.category_name || '-'}</td>
          <td>${App.formatCurrency(product.purchase_price)}</td>
          <td>${App.formatCurrency(product.selling_price)}</td>
          <td>${product.stock}</td>
          <td>
            <span class="badge ${getStockBadge(product.stock_status)}">${getStockLabel(product.stock_status)}</span>
          </td>
          <td>
            <span class="badge ${product.status === 'ACTIVE' ? 'badge-success' : 'badge-muted'}">${product.status === 'ACTIVE' ? 'Aktif' : 'Nonaktif'}</span>
          </td>
          <td>
            <div class="flex gap-2">
              <button class="btn btn-ghost btn-sm" onclick="editProduct('${product.id}')">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              </button>
              <button class="btn btn-ghost btn-sm" onclick="toggleProductStatus('${product.id}', '${product.status}')">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              </button>
            </div>
          </td>
        </tr>
      `).join('');

      renderPagination(pagination);
    } catch (err) {
      console.error('Error loading products:', err);
      if (loadingEl) loadingEl.classList.add('hidden');
      App.showToast('Gagal memuat data produk', 'error');
    }
  }

  function getStockBadge(status) {
    if (status === 'HABIS') return 'badge-danger';
    if (status === 'MENIPIS') return 'badge-warning';
    return 'badge-success';
  }

  function getStockLabel(status) {
    if (status === 'HABIS') return 'Habis';
    if (status === 'MENIPIS') return 'Menipis';
    return 'Aman';
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
    loadProducts();
  };

  function setupSearch() {
    const searchInput = document.getElementById('search-product');
    if (searchInput) {
      searchInput.addEventListener('input', App.debounce((e) => {
        searchTerm = e.target.value;
        currentPage = 1;
        loadProducts();
      }, 300));
    }
  }

  function setupFilters() {
    const categoryFilterEl = document.getElementById('filter-category');
    const statusFilterEl = document.getElementById('filter-status');

    if (categoryFilterEl) {
      categoryFilterEl.addEventListener('change', (e) => {
        categoryFilter = e.target.value;
        currentPage = 1;
        loadProducts();
      });
    }

    if (statusFilterEl) {
      statusFilterEl.addEventListener('change', (e) => {
        statusFilter = e.target.value;
        currentPage = 1;
        loadProducts();
      });
    }
  }

  function setupAddForm() {
    const form = document.getElementById('add-product-form');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const data = {
        name: document.getElementById('product-name').value,
        sku: document.getElementById('product-sku').value,
        category_id: document.getElementById('product-category').value || null,
        purchase_price: parseFloat(document.getElementById('product-purchase-price').value) || 0,
        selling_price: parseFloat(document.getElementById('product-selling-price').value),
        stock: parseInt(document.getElementById('product-stock').value) || 0,
        minimum_stock: parseInt(document.getElementById('product-min-stock').value) || 0
      };

      if (!data.name || !data.sku || isNaN(data.selling_price)) {
        App.showToast('Mohon isi field yang wajib', 'warning');
        return;
      }

      try {
        await App.api('/produk', {
          method: 'POST',
          body: JSON.stringify(data)
        });

        App.hideModal('add-product-modal');
        form.reset();
        App.showToast('Produk berhasil ditambahkan', 'success');
        await loadProducts();
      } catch (err) {
        App.showToast(err.message, 'error');
      }
    });
  }

  function setupEditForm() {
    const form = document.getElementById('edit-product-form');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const id = document.getElementById('edit-product-id').value;
      const data = {
        name: document.getElementById('edit-product-name').value,
        sku: document.getElementById('edit-product-sku').value,
        category_id: document.getElementById('edit-product-category').value || null,
        purchase_price: parseFloat(document.getElementById('edit-product-purchase-price').value) || 0,
        selling_price: parseFloat(document.getElementById('edit-product-selling-price').value),
        stock: parseInt(document.getElementById('edit-product-stock').value) || 0,
        minimum_stock: parseInt(document.getElementById('edit-product-min-stock').value) || 0
      };

      try {
        await App.api(`/produk/${id}`, {
          method: 'PUT',
          body: JSON.stringify(data)
        });

        App.hideModal('edit-product-modal');
        App.showToast('Produk berhasil diupdate', 'success');
        await loadProducts();
      } catch (err) {
        App.showToast(err.message, 'error');
      }
    });
  }

  window.editProduct = async function(id) {
    try {
      const product = await App.api(`/produk/${id}`);

      document.getElementById('edit-product-id').value = product.id;
      document.getElementById('edit-product-name').value = product.name;
      document.getElementById('edit-product-sku').value = product.sku;
      document.getElementById('edit-product-category').value = product.category_id || '';
      document.getElementById('edit-product-purchase-price').value = product.purchase_price;
      document.getElementById('edit-product-selling-price').value = product.selling_price;
      document.getElementById('edit-product-stock').value = product.stock;
      document.getElementById('edit-product-min-stock').value = product.minimum_stock;

      App.showModal('edit-product-modal');
    } catch (err) {
      App.showToast('Gagal memuat data produk', 'error');
    }
  };

  window.toggleProductStatus = async function(id, currentStatus) {
    const newStatus = currentStatus === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    const action = newStatus === 'ACTIVE' ? 'mengaktifkan' : 'menonaktifkan';

    if (!confirm(`Apakah Anda yakin ingin ${action} produk ini?`)) return;

    try {
      await App.api(`/produk/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus })
      });

      App.showToast(`Produk berhasil di${action}`, 'success');
      await loadProducts();
    } catch (err) {
      App.showToast(err.message, 'error');
    }
  };
});
