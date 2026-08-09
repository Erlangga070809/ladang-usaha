document.addEventListener('DOMContentLoaded', async () => {
  await App.init();

  if (!App.checkAuth()) return;
  if (!App.checkRole('OWNER')) return;

  App.setupSidebar();
  setupUserInfo();

  let currentPeriod = 'today';

  await loadSalesReport(currentPeriod);
  await loadChart(currentPeriod);
  await loadProductReport(currentPeriod);
  await loadStockReport();

  setupPeriodTabs();

  function setupUserInfo() {
    if (!App.user) return;
    const userName = document.getElementById('user-name');
    const userInitials = document.getElementById('user-initials');

    if (userName) userName.textContent = App.user.name;
    if (userInitials) userInitials.textContent = App.getInitials(App.user.name);
  }

  function setupPeriodTabs() {
    const tabs = document.querySelectorAll('.period-tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', async () => {
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        currentPeriod = tab.dataset.period;
        await loadSalesReport(currentPeriod);
        await loadChart(currentPeriod);
        await loadProductReport(currentPeriod);
      });
    });
  }

  async function loadSalesReport(period) {
    try {
      const data = await App.api(`/laporan/sales?period=${period}`);

      const revenueEl = document.getElementById('report-revenue');
      const transactionsEl = document.getElementById('report-transactions');
      const avgEl = document.getElementById('report-average');
      const itemsEl = document.getElementById('report-items');

      if (revenueEl) revenueEl.textContent = App.formatCurrency(data.summary.total_revenue);
      if (transactionsEl) transactionsEl.textContent = data.summary.total_transactions;
      if (avgEl) avgEl.textContent = App.formatCurrency(data.summary.average_transaction);
      if (itemsEl) itemsEl.textContent = data.summary.total_items_sold;
    } catch (err) {
      console.error('Error loading sales report:', err);
    }
  }

  async function loadChart(period) {
    const container = document.getElementById('report-chart-container');
    if (!container) return;

    try {
      const data = await App.api(`/laporan/chart?period=${period}`);

      if (!data || data.length === 0) {
        container.innerHTML = `
          <div class="empty-state">
            <div class="empty-state-title">Belum ada data grafik</div>
            <div class="empty-state-description">Data akan muncul setelah ada transaksi</div>
          </div>
        `;
        return;
      }

      container.innerHTML = '<canvas id="report-chart"></canvas>';
      renderReportChart(data, period);
    } catch (err) {
      console.error('Error loading chart:', err);
    }
  }

  function renderReportChart(data, period) {
    const canvas = document.getElementById('report-chart');
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
    const maxValue = Math.max(...revenues, 1);
    const chartHeight = 250;
    const chartWidth = canvas.parentElement.clientWidth - 40;

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

    ctx.beginPath();
    ctx.strokeStyle = '#2563EB';
    ctx.lineWidth = 2;
    ctx.fillStyle = 'rgba(37, 99, 235, 0.1)';

    const points = revenues.map((value, index) => {
      const x = padding.left + (graphWidth / (revenues.length - 1 || 1)) * index;
      const y = padding.top + graphHeight - (value / maxValue) * graphHeight;
      return { x, y };
    });

    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }

    ctx.stroke();

    ctx.lineTo(points[points.length - 1].x, padding.top + graphHeight);
    ctx.lineTo(points[0].x, padding.top + graphHeight);
    ctx.closePath();
    ctx.fill();

    points.forEach(point => {
      ctx.beginPath();
      ctx.arc(point.x, point.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#2563EB';
      ctx.fill();
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 2;
      ctx.stroke();
    });

    labels.forEach((label, index) => {
      const x = padding.left + (graphWidth / (labels.length - 1 || 1)) * index;
      ctx.fillStyle = '#64748B';
      ctx.font = '10px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(label, x, chartHeight - 8);
    });
  }

  async function loadProductReport(period) {
    const container = document.getElementById('product-report-table');
    if (!container) return;

    try {
      const data = await App.api(`/laporan/products?period=${period}`);

      if (!data || data.length === 0) {
        container.innerHTML = `
          <div class="empty-state">
            <div class="empty-state-title">Belum ada data produk</div>
          </div>
        `;
        return;
      }

      container.innerHTML = data.map((product, index) => `
        <tr>
          <td>${index + 1}</td>
          <td>${product.product_name}</td>
          <td>${product.total_sold}</td>
          <td>${product.transaction_count}</td>
          <td>${App.formatCurrency(product.total_revenue)}</td>
        </tr>
      `).join('');
    } catch (err) {
      console.error('Error loading product report:', err);
    }
  }

  async function loadStockReport() {
    const container = document.getElementById('stock-report-table');
    if (!container) return;

    try {
      const data = await App.api('/laporan/stock');

      const summaryEl = document.getElementById('stock-summary');
      if (summaryEl) {
        summaryEl.innerHTML = `
          <div class="stat-card card">
            <div class="stat-label">Total Produk</div>
            <div class="stat-value">${data.summary.total_products}</div>
          </div>
          <div class="stat-card card">
            <div class="stat-label">Stok Aman</div>
            <div class="stat-value" style="color: var(--success);">${data.summary.safe_stock}</div>
          </div>
          <div class="stat-card card">
            <div class="stat-label">Stok Menipis</div>
            <div class="stat-value" style="color: var(--warning);">${data.summary.low_stock}</div>
          </div>
          <div class="stat-card card">
            <div class="stat-label">Stok Habis</div>
            <div class="stat-value" style="color: var(--danger);">${data.summary.empty_stock}</div>
          </div>
        `;
      }

      if (data.products.length === 0) {
        container.innerHTML = `
          <div class="empty-state">
            <div class="empty-state-title">Belum ada produk</div>
          </div>
        `;
        return;
      }

      container.innerHTML = data.products.map(product => `
        <tr>
          <td>${product.name}</td>
          <td>${product.sku}</td>
          <td>${product.category_name || '-'}</td>
          <td>${product.stock}</td>
          <td>${product.minimum_stock}</td>
          <td><span class="badge ${getStockBadge(product.stock_status)}">${getStockLabel(product.stock_status)}</span></td>
        </tr>
      `).join('');
    } catch (err) {
      console.error('Error loading stock report:', err);
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
});
