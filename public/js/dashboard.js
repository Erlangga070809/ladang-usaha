document.addEventListener('DOMContentLoaded', async () => {
  await App.init();

  if (!App.checkAuth()) return;
  if (!App.checkRole('OWNER')) return;

  App.setupSidebar();

  setupUserInfo();
  await loadDashboardData();
  await loadChart('today');
  await loadTopProducts('today');
  await loadLowStock();
  await loadRecentTransactions();

  setupChartTabs();
});

function setupUserInfo() {
  if (!App.user) return;

  const userName = document.getElementById('user-name');
  const userInitials = document.getElementById('user-initials');
  const welcomeName = document.getElementById('welcome-name');
  const businessName = document.getElementById('business-name-display');

  if (userName) userName.textContent = App.user.name;
  if (userInitials) userInitials.textContent = App.getInitials(App.user.name);
  if (welcomeName) welcomeName.textContent = App.user.name;
  if (businessName && App.business) businessName.textContent = App.business.name;
}

async function loadDashboardData() {
  try {
    const data = await App.api('/laporan/sales?period=today');

    const revenueEl = document.getElementById('revenue-today');
    const transactionsEl = document.getElementById('transactions-today');
    const itemsEl = document.getElementById('items-sold-today');

    if (revenueEl) revenueEl.textContent = App.formatCurrency(data.summary.total_revenue);
    if (transactionsEl) transactionsEl.textContent = data.summary.total_transactions;
    if (itemsEl) itemsEl.textContent = data.summary.total_items_sold;
  } catch (err) {
    console.error('Error loading dashboard:', err);
  }
}

async function loadChart(period) {
  const container = document.getElementById('chart-container');
  if (!container) return;

  try {
    const data = await App.api(`/laporan/chart?period=${period}`);

    if (!data || data.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📊</div>
          <div class="empty-state-title">Belum ada data</div>
          <div class="empty-state-description">Data penjualan akan muncul setelah ada transaksi</div>
        </div>
      `;
      return;
    }

    container.innerHTML = '<canvas id="sales-chart"></canvas>';
    renderSalesChart(data, period);
  } catch (err) {
    console.error('Error loading chart:', err);
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-title">Gagal memuat grafik</div>
      </div>
    `;
  }
}

function renderSalesChart(data, period) {
  const canvas = document.getElementById('sales-chart');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const labels = data.map(item => {
    const date = new Date(item.date);
    if (period === 'today') {
      return date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
  });

  const revenues = data.map(item => parseFloat(item.revenue));
  const transactions = data.map(item => parseInt(item.transactions));

  const maxValue = Math.max(...revenues, 1);
  const chartHeight = 250;
  const chartWidth = canvas.parentElement.clientWidth - 40;
  const barWidth = Math.min(40, (chartWidth / labels.length) - 8);

  canvas.width = chartWidth;
  canvas.height = chartHeight;

  const padding = { top: 20, right: 20, bottom: 40, left: 60 };
  const graphWidth = chartWidth - padding.left - padding.right;
  const graphHeight = chartHeight - padding.top - padding.bottom;

  ctx.clearRect(0, 0, chartWidth, chartHeight);

  ctx.strokeStyle = '#E2E8F0';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = padding.top + (graphHeight / 4) * i;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(chartWidth - padding.right, y);
    ctx.stroke();

    const value = maxValue - (maxValue / 4) * i;
    ctx.fillStyle = '#64748B';
    ctx.font = '11px Inter, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(App.formatCurrency(value), padding.left - 8, y + 4);
  }

  labels.forEach((label, index) => {
    const x = padding.left + (graphWidth / labels.length) * index + (graphWidth / labels.length - barWidth) / 2;
    const barHeight = (revenues[index] / maxValue) * graphHeight;
    const y = padding.top + graphHeight - barHeight;

    const gradient = ctx.createLinearGradient(x, y, x, padding.top + graphHeight);
    gradient.addColorStop(0, '#2563EB');
    gradient.addColorStop(1, '#3B82F6');
    ctx.fillStyle = gradient;

    ctx.beginPath();
    ctx.roundRect(x, y, barWidth, barHeight, [4, 4, 0, 0]);
    ctx.fill();

    ctx.fillStyle = '#64748B';
    ctx.font = '10px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(label, x + barWidth / 2, chartHeight - 8);
  });
}

function setupChartTabs() {
  const tabs = document.querySelectorAll('.chart-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', async () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const period = tab.dataset.period;
      await loadChart(period);
    });
  });
}

async function loadTopProducts(period) {
  const container = document.getElementById('top-products');
  if (!container) return;

  try {
    const data = await App.api(`/laporan/products?period=${period}`);

    if (!data || data.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-title">Belum ada produk terjual</div>
          <div class="empty-state-description">Produk terlaris akan muncul setelah ada transaksi</div>
        </div>
      `;
      return;
    }

    container.innerHTML = data.slice(0, 5).map((product, index) => `
      <div class="flex items-center justify-between" style="padding: 12px 0; border-bottom: 1px solid var(--border-light)">
        <div class="flex items-center gap-3">
          <span style="font-weight: 600; color: var(--muted); min-width: 20px;">${index + 1}</span>
          <div>
            <div style="font-size: 0.875rem; font-weight: 500;">${product.product_name}</div>
            <div style="font-size: 0.75rem; color: var(--muted);">${product.total_sold} terjual</div>
          </div>
        </div>
        <span style="font-weight: 600; font-size: 0.875rem;">${App.formatCurrency(product.total_revenue)}</span>
      </div>
    `).join('');
  } catch (err) {
    console.error('Error loading top products:', err);
  }
}

async function loadLowStock() {
  const container = document.getElementById('low-stock');
  if (!container) return;

  try {
    const data = await App.api('/laporan/stock');

    const lowStock = data.products.filter(p => p.stock_status === 'MENIPIS' || p.stock_status === 'HABIS');

    if (lowStock.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div style="font-size: 2rem; margin-bottom: 8px;">✅</div>
          <div class="empty-state-title">Stok aman</div>
          <div class="empty-state-description">Semua produk memiliki stok yang cukup</div>
        </div>
      `;
      return;
    }

    container.innerHTML = lowStock.slice(0, 5).map(product => `
      <div class="flex items-center justify-between" style="padding: 12px 0; border-bottom: 1px solid var(--border-light)">
        <div>
          <div style="font-size: 0.875rem; font-weight: 500;">${product.name}</div>
          <div style="font-size: 0.75rem; color: var(--muted);">SKU: ${product.sku}</div>
        </div>
        <span class="badge ${product.stock_status === 'HABIS' ? 'badge-danger' : 'badge-warning'}">
          ${product.stock_status === 'HABIS' ? 'Habis' : `Menipis (${product.stock})`}
        </span>
      </div>
    `).join('');
  } catch (err) {
    console.error('Error loading low stock:', err);
  }
}

async function loadRecentTransactions() {
  const container = document.getElementById('recent-transactions');
  if (!container) return;

  try {
    const data = await App.api('/transaksi?limit=5');

    if (!data.items || data.items.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-title">Belum ada transaksi</div>
          <div class="empty-state-description">Transaksi terbaru akan muncul di sini</div>
        </div>
      `;
      return;
    }

    container.innerHTML = data.items.map(trx => `
      <div class="flex items-center justify-between" style="padding: 12px 0; border-bottom: 1px solid var(--border-light); cursor: pointer;" onclick="window.location.href='/transaksi.html?id=${trx.id}'">
        <div>
          <div style="font-size: 0.875rem; font-weight: 500;">${trx.transaction_number}</div>
          <div style="font-size: 0.75rem; color: var(--muted);">${trx.cashier_name} · ${App.formatDate(trx.created_at)}</div>
        </div>
        <div style="text-align: right;">
          <div style="font-weight: 600; font-size: 0.875rem;">${App.formatCurrency(trx.total)}</div>
          <span class="badge ${trx.payment_method === 'CASH' ? 'badge-success' : 'badge-primary'}">${trx.payment_method}</span>
        </div>
      </div>
    `).join('');
  } catch (err) {
    console.error('Error loading recent transactions:', err);
  }
}
