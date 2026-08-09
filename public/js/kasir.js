document.addEventListener('DOMContentLoaded', async () => {
  await App.init();

  if (!App.checkAuth()) return;

  App.setupSidebar();

  setupUserInfo();

  const cart = [];
  let products = [];
  let categories = [];
  let selectedCategory = null;
  let paymentMethod = 'CASH';

  await loadCategories();
  await loadProducts();
  setupSearch();
  setupPaymentMethods();

  function setupUserInfo() {
    if (!App.user) return;
    const userName = document.getElementById('user-name');
    const userInitials = document.getElementById('user-initials');
    const cashierName = document.getElementById('cashier-name');

    if (userName) userName.textContent = App.user.name;
    if (userInitials) userInitials.textContent = App.getInitials(App.user.name);
    if (cashierName) cashierName.textContent = App.user.name;
  }

  async function loadCategories() {
    try {
      categories = await App.api('/kategori');
      renderCategories();
    } catch (err) {
      console.error('Error loading categories:', err);
    }
  }

  function renderCategories() {
    const container = document.getElementById('pos-categories');
    if (!container) return;

    container.innerHTML = `
      <button class="pos-category ${!selectedCategory ? 'active' : ''}" data-category="">
        Semua
      </button>
      ${categories.filter(c => c.status === 'ACTIVE').map(cat => `
        <button class="pos-category ${selectedCategory === cat.id ? 'active' : ''}" data-category="${cat.id}">
          ${cat.name}
        </button>
      `).join('')}
    `;

    container.querySelectorAll('.pos-category').forEach(btn => {
      btn.addEventListener('click', () => {
        selectedCategory = btn.dataset.category || null;
        renderCategories();
        renderProducts();
      });
    });
  }

  async function loadProducts() {
    try {
      const params = new URLSearchParams({ limit: '100', status: 'ACTIVE' });
      const result = await App.api(`/produk?${params}`);
      products = result.items;
      renderProducts();
    } catch (err) {
      console.error('Error loading products:', err);
    }
  }

  function renderProducts() {
    const container = document.getElementById('pos-product-grid');
    if (!container) return;

    let filteredProducts = products;

    if (selectedCategory) {
      filteredProducts = products.filter(p => p.category_id === selectedCategory);
    }

    const searchTerm = document.getElementById('pos-search')?.value?.toLowerCase();
    if (searchTerm) {
      filteredProducts = filteredProducts.filter(p =>
        p.name.toLowerCase().includes(searchTerm) ||
        p.sku.toLowerCase().includes(searchTerm)
      );
    }

    if (filteredProducts.length === 0) {
      container.innerHTML = `
        <div class="empty-state" style="grid-column: 1 / -1;">
          <div class="empty-state-title">Produk tidak ditemukan</div>
        </div>
      `;
      return;
    }

    container.innerHTML = filteredProducts.map(product => `
      <div class="pos-product-card" onclick="addToCart('${product.id}')">
        <div class="pos-product-card-name">${product.name}</div>
        <div class="pos-product-card-price">${App.formatCurrency(product.selling_price)}</div>
        <div class="pos-product-card-stock">Stok: ${product.stock}</div>
      </div>
    `).join('');
  }

  function setupSearch() {
    const searchInput = document.getElementById('pos-search');
    if (searchInput) {
      searchInput.addEventListener('input', App.debounce(renderProducts, 300));
    }
  }

  function setupPaymentMethods() {
    const methods = document.querySelectorAll('.payment-method');
    methods.forEach(method => {
      method.addEventListener('click', () => {
        methods.forEach(m => m.classList.remove('active'));
        method.classList.add('active');
        paymentMethod = method.dataset.method;
        renderCart();
      });
    });
  }

  window.addToCart = function(productId) {
    const product = products.find(p => p.id === productId);
    if (!product) return;

    const existingItem = cart.find(item => item.product_id === productId);

    if (existingItem) {
      if (existingItem.quantity >= product.stock) {
        App.showToast('Stok tidak mencukupi', 'warning');
        return;
      }
      existingItem.quantity++;
    } else {
      if (product.stock <= 0) {
        App.showToast('Stok habis', 'warning');
        return;
      }
      cart.push({
        product_id: product.id,
        name: product.name,
        price: parseFloat(product.selling_price),
        quantity: 1
      });
    }

    renderCart();
  };

  window.updateQuantity = function(productId, change) {
    const item = cart.find(i => i.product_id === productId);
    if (!item) return;

    const product = products.find(p => p.id === productId);
    const newQuantity = item.quantity + change;

    if (newQuantity <= 0) {
      const index = cart.indexOf(item);
      cart.splice(index, 1);
    } else if (newQuantity > product.stock) {
      App.showToast('Stok tidak mencukupi', 'warning');
      return;
    } else {
      item.quantity = newQuantity;
    }

    renderCart();
  };

  window.removeFromCart = function(productId) {
    const index = cart.findIndex(i => i.product_id === productId);
    if (index > -1) {
      cart.splice(index, 1);
    }
    renderCart();
  };

  function renderCart() {
    const itemsContainer = document.getElementById('cart-items');
    const totalEl = document.getElementById('cart-total');
    const paidInput = document.getElementById('paid-amount');
    const changeEl = document.getElementById('change-amount');
    const checkoutBtn = document.getElementById('checkout-btn');
    const paidSection = document.getElementById('paid-section');

    if (!itemsContainer) return;

    if (cart.length === 0) {
      itemsContainer.innerHTML = `
        <div class="empty-state">
          <div style="font-size: 2rem; margin-bottom: 8px;">🛒</div>
          <div class="empty-state-title">Keranjang kosong</div>
          <div class="empty-state-description">Klik produk untuk menambahkan</div>
        </div>
      `;
      if (totalEl) totalEl.textContent = App.formatCurrency(0);
      if (changeEl) changeEl.textContent = App.formatCurrency(0);
      if (checkoutBtn) checkoutBtn.disabled = true;
      if (paidSection) paidSection.classList.add('hidden');
      return;
    }

    if (checkoutBtn) checkoutBtn.disabled = false;

    const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

    itemsContainer.innerHTML = cart.map(item => `
      <div class="pos-cart-item">
        <div class="pos-cart-item-info">
          <div class="pos-cart-item-name">${item.name}</div>
          <div class="pos-cart-item-price">${App.formatCurrency(item.price)}</div>
        </div>
        <div class="pos-cart-item-actions">
          <div class="pos-cart-item-qty">
            <button onclick="updateQuantity('${item.product_id}', -1)">−</button>
            <span>${item.quantity}</span>
            <button onclick="updateQuantity('${item.product_id}', 1)">+</button>
          </div>
          <div class="pos-cart-item-subtotal">${App.formatCurrency(item.price * item.quantity)}</div>
          <button onclick="removeFromCart('${item.product_id}')" style="background: none; color: var(--danger); padding: 4px;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </div>
      </div>
    `).join('');

    if (totalEl) totalEl.textContent = App.formatCurrency(total);

    if (paymentMethod === 'CASH') {
      if (paidSection) paidSection.classList.remove('hidden');
      const paid = parseFloat(paidInput?.value) || 0;
      const change = paid - total;
      if (changeEl) changeEl.textContent = change >= 0 ? App.formatCurrency(change) : App.formatCurrency(0);
    } else {
      if (paidSection) paidSection.classList.add('hidden');
      if (changeEl) changeEl.textContent = App.formatCurrency(0);
    }
  }

  const paidInput = document.getElementById('paid-amount');
  if (paidInput) {
    paidInput.addEventListener('input', renderCart);
  }

  window.processCheckout = async function() {
    if (cart.length === 0) {
      App.showToast('Keranjang kosong', 'warning');
      return;
    }

    const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const paidAmount = parseFloat(document.getElementById('paid-amount')?.value) || 0;

    if (paymentMethod === 'CASH' && paidAmount < total) {
      App.showToast('Jumlah pembayaran kurang', 'error');
      return;
    }

    const checkoutBtn = document.getElementById('checkout-btn');
    checkoutBtn.disabled = true;
    checkoutBtn.innerHTML = '<span class="spinner"></span> Memproses...';

    try {
      const result = await App.api('/transaksi', {
        method: 'POST',
        body: JSON.stringify({
          items: cart.map(item => ({
            product_id: item.product_id,
            quantity: item.quantity
          })),
          payment_method: paymentMethod,
          paid_amount: paidAmount
        })
      });

      App.showToast(`Transaksi ${result.transaction_number} berhasil`, 'success');

      cart.length = 0;
      renderCart();
      if (paidInput) paidInput.value = '';
      await loadProducts();
    } catch (err) {
      App.showToast(err.message, 'error');
    } finally {
      checkoutBtn.disabled = false;
      checkoutBtn.innerHTML = 'Bayar';
    }
  };

  const cartToggle = document.getElementById('cart-toggle');
  const posCart = document.getElementById('pos-cart');

  if (cartToggle && posCart) {
    cartToggle.addEventListener('click', () => {
      posCart.classList.toggle('open');
    });
  }
});
