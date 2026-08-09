document.addEventListener('DOMContentLoaded', async () => {
  await App.init();

  if (!App.checkAuth()) return;

  App.setupSidebar();
  setupUserInfo();

  let currentPage = 1;
  let totalPages = 1;
  let dateFrom = '';
  let dateTo = '';
  let paymentFilter = '';
  let cashierFilter = '';
  let searchTerm = '';

  await loadTransactions();

  setupFilters();
  setupSearch();

  const urlParams = new URLSearchParams(window.location.search);
  const transactionId = urlParams.get('id');
  if (transactionId) {
    await showTransactionDetail(transactionId);
  }

  function setupUserInfo() {
    if (!App.user) return;
    const userName = document.getElementById('user-name');
    const userInitials = document.getElementById('user-initials');

    if (userName) userName.textContent = App.user.name;
    if (userInitials) userInitials.textContent = App.getInitials(App.user.name);
  }

  async function loadTransactions() {
    const container = document.getElementById('transactions-table-body');
    const pagination = document.getElementById('pagination');
    const loadingEl = document.getElementById('transactions-loading');
    const emptyEl = document.getElementById('transactions-empty');

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
      if (dateFrom) params.append('date_from', dateFrom);
      if (dateTo) params.append('date_to', dateTo);
      if (paymentFilter) params.append('payment_method', paymentFilter);

      if (App.user.role === 'OWNER' && cashierFilter) {
        params.append('user_id', cashierFilter);
      }

      const data = await App.api(`/transaksi?${params}`);
      totalPages = data.pagination.total_pages;

      if (data.items.length === 0) {
        if (loadingEl) loadingEl.classList.add('hidden');
        if (emptyEl) emptyEl.classList.remove('hidden');
        if (pagination) pagination.innerHTML = '';
        return;
      }

      if (loadingEl) loadingEl.classList.add('hidden');

      container.innerHTML = data.items.map(trx => `
        <tr style="cursor: pointer;" onclick="window.location.href='/transaksi.html?id=${trx.id}'">
          <td>
            <div style="font-weight: 500;">${trx.transaction_number}</div>
            <div style="font-size: 0.75rem; color: var(--muted);">${App.formatDate(trx.created_at)}</div>
          </td>
          <td>${trx.cashier_name}</td>
          <td>${App.formatCurrency(trx.total)}</td>
          <td><span class="badge ${trx.payment_method === 'CASH' ? 'badge-success' : 'badge-primary'}">${trx.payment_method}</span></td>
          <td><span class="badge badge-success">${trx.status}</span></td>
          <td>
            <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation(); viewDetail('${trx.id}')">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              Detail
            </button>
          </td>
        </tr>
      `).join('');

      renderPagination(pagination);
    } catch (err) {
      console.error('Error loading transactions:', err);
      if (loadingEl) loadingEl.classList.add('hidden');
      App.showToast('Gagal memuat data transaksi', 'error');
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
    loadTransactions();
  };

  function setupSearch() {
    const searchInput = document.getElementById('search-transaction');
    if (searchInput) {
      searchInput.addEventListener('input', App.debounce((e) => {
        searchTerm = e.target.value;
        currentPage = 1;
        loadTransactions();
      }, 300));
    }
  }

  function setupFilters() {
    const dateFromEl = document.getElementById('filter-date-from');
    const dateToEl = document.getElementById('filter-date-to');
    const paymentEl = document.getElementById('filter-payment');
    const cashierEl = document.getElementById('filter-cashier');

    if (dateFromEl) {
      dateFromEl.addEventListener('change', (e) => {
        dateFrom = e.target.value;
        currentPage = 1;
        loadTransactions();
      });
    }

    if (dateToEl) {
      dateToEl.addEventListener('change', (e) => {
        dateTo = e.target.value;
        currentPage = 1;
        loadTransactions();
      });
    }

    if (paymentEl) {
      paymentEl.addEventListener('change', (e) => {
        paymentFilter = e.target.value;
        currentPage = 1;
        loadTransactions();
      });
    }

    if (cashierEl && App.user.role === 'OWNER') {
      loadCashiers(cashierEl);
      cashierEl.addEventListener('change', (e) => {
        cashierFilter = e.target.value;
        currentPage = 1;
        loadTransactions();
      });
    }
  }

  async function loadCashiers(selectEl) {
    try {
      const data = await App.api('/pengguna?limit=100');
      selectEl.innerHTML = '<option value="">Semua Kasir</option>' +
        data.items.map(u => `<option value="${u.id}">${u.name}</option>`).join('');
    } catch (err) {
      console.error('Error loading cashiers:', err);
    }
  }

  async function showTransactionDetail(id) {
    try {
      const transaction = await App.api(`/transaksi/${id}`);
      const modal = document.getElementById('transaction-detail-modal');
      const content = document.getElementById('transaction-detail-content');

      if (modal && content) {
        content.innerHTML = `
          <div style="margin-bottom: 20px;">
            <div style="font-size: 0.8125rem; color: var(--muted);">Nomor Transaksi</div>
            <div style="font-weight: 600;">${transaction.transaction_number}</div>
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 20px;">
            <div>
              <div style="font-size: 0.8125rem; color: var(--muted);">Kasir</div>
              <div style="font-weight: 500;">${transaction.cashier_name}</div>
            </div>
            <div>
              <div style="font-size: 0.8125rem; color: var(--muted);">Tanggal</div>
              <div style="font-weight: 500;">${App.formatDate(transaction.created_at)}</div>
            </div>
            <div>
              <div style="font-size: 0.8125rem; color: var(--muted);">Metode Pembayaran</div>
              <span class="badge ${transaction.payment_method === 'CASH' ? 'badge-success' : 'badge-primary'}">${transaction.payment_method}</span>
            </div>
            <div>
              <div style="font-size: 0.8125rem; color: var(--muted);">Status</div>
              <span class="badge badge-success">${transaction.status}</span>
            </div>
          </div>
          <div style="margin-bottom: 20px;">
            <div style="font-size: 0.875rem; font-weight: 600; margin-bottom: 12px;">Items</div>
            <div style="border: 1px solid var(--border-light); border-radius: var(--radius);">
              <table>
                <thead>
                  <tr>
                    <th>Produk</th>
                    <th>Harga</th>
                    <th>Qty</th>
                    <th>Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  ${transaction.items.map(item => `
                    <tr>
                      <td>${item.product_name}</td>
                      <td>${App.formatCurrency(item.product_price)}</td>
                      <td>${item.quantity}</td>
                      <td>${App.formatCurrency(item.subtotal)}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
          <div style="border-top: 1px solid var(--border); padding-top: 16px;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
              <span style="color: var(--muted);">Subtotal</span>
              <span style="font-weight: 500;">${App.formatCurrency(transaction.subtotal)}</span>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
              <span style="color: var(--muted);">Total</span>
              <span style="font-weight: 700; font-size: 1.125rem;">${App.formatCurrency(transaction.total)}</span>
            </div>
            ${transaction.payment_method === 'CASH' ? `
              <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                <span style="color: var(--muted);">Dibayar</span>
                <span>${App.formatCurrency(transaction.paid_amount)}</span>
              </div>
              <div style="display: flex; justify-content: space-between;">
                <span style="color: var(--muted);">Kembalian</span>
                <span style="font-weight: 500; color: var(--success);">${App.formatCurrency(transaction.change_amount)}</span>
              </div>
            ` : ''}
          </div>
        `;

        App.showModal('transaction-detail-modal');
      }
    } catch (err) {
      App.showToast('Gagal memuat detail transaksi', 'error');
    }
  }

  window.viewDetail = function(id) {
    window.location.href = `/transaksi.html?id=${id}`;
  };
});
