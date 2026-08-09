const express = require('express');
const router = express.Router();
const { query, getClient } = require('../lib/db');
const { authenticateToken } = require('./auth');
const { sanitizeObject, isValidUUID } = require('../lib/security');

router.use(authenticateToken);

router.get('/', async (req, res) => {
  try {
    const { search, date_from, date_to, payment_method, user_id, page, limit } = req.query;
    
    let whereClause = 'WHERE t.business_id = $1';
    const params = [req.user.business_id];
    let paramIndex = 2;
    
    if (req.user.role === 'KASIR') {
      whereClause += ` AND t.user_id = $${paramIndex}`;
      params.push(req.user.id);
      paramIndex++;
    }
    
    if (search) {
      whereClause += ` AND t.transaction_number ILIKE $${paramIndex}`;
      params.push(`%${search}%`);
      paramIndex++;
    }
    
    if (date_from) {
      whereClause += ` AND t.created_at >= $${paramIndex}`;
      params.push(date_from);
      paramIndex++;
    }
    
    if (date_to) {
      whereClause += ` AND t.created_at <= $${paramIndex}`;
      params.push(date_to + ' 23:59:59');
      paramIndex++;
    }
    
    if (payment_method && ['CASH', 'QRIS', 'TRANSFER'].includes(payment_method)) {
      whereClause += ` AND t.payment_method = $${paramIndex}`;
      params.push(payment_method);
      paramIndex++;
    }
    
    if (user_id && req.user.role === 'OWNER' && isValidUUID(user_id)) {
      whereClause += ` AND t.user_id = $${paramIndex}`;
      params.push(user_id);
      paramIndex++;
    }
    
    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 20;
    const offset = (pageNum - 1) * limitNum;
    
    const countResult = await query(
      `SELECT COUNT(*) FROM transactions t ${whereClause}`,
      params
    );
    
    const totalItems = parseInt(countResult.rows[0].count);
    const totalPages = Math.ceil(totalItems / limitNum);
    
    const result = await query(
      `SELECT t.*, u.name as cashier_name
       FROM transactions t
       LEFT JOIN users u ON t.user_id = u.id
       ${whereClause}
       ORDER BY t.created_at DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, limitNum, offset]
    );
    
    res.json({
      success: true,
      data: {
        items: result.rows,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total_items: totalItems,
          total_pages: totalPages
        }
      }
    });
  } catch (err) {
    console.error('Get transactions error:', err);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan saat mengambil data transaksi'
    });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!isValidUUID(id)) {
      return res.status(400).json({
        success: false,
        message: 'ID transaksi tidak valid'
      });
    }
    
    let transactionQuery = 'SELECT t.*, u.name as cashier_name FROM transactions t LEFT JOIN users u ON t.user_id = u.id WHERE t.id = $1 AND t.business_id = $2';
    const params = [id, req.user.business_id];
    
    if (req.user.role === 'KASIR') {
      transactionQuery += ' AND t.user_id = $3';
      params.push(req.user.id);
    }
    
    const transactionResult = await query(transactionQuery, params);
    
    if (transactionResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Transaksi tidak ditemukan'
      });
    }
    
    const itemsResult = await query(
      'SELECT * FROM transaction_items WHERE transaction_id = $1',
      [id]
    );
    
    res.json({
      success: true,
      data: {
        ...transactionResult.rows[0],
        items: itemsResult.rows
      }
    });
  } catch (err) {
    console.error('Get transaction error:', err);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan saat mengambil data transaksi'
    });
  }
});

router.post('/', async (req, res) => {
  const client = await getClient();
  
  try {
    if (req.user.role !== 'KASIR' && req.user.role !== 'OWNER') {
      return res.status(403).json({
        success: false,
        message: 'Role tidak diizinkan'
      });
    }
    
    const sanitized = sanitizeObject(req.body);
    const { items, payment_method, paid_amount } = sanitized;
    
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Items transaksi wajib diisi'
      });
    }
    
    if (!payment_method || !['CASH', 'QRIS', 'TRANSFER'].includes(payment_method)) {
      return res.status(400).json({
        success: false,
        message: 'Metode pembayaran tidak valid'
      });
    }
    
    for (const item of items) {
      if (!item.product_id || !isValidUUID(item.product_id)) {
        return res.status(400).json({
          success: false,
          message: 'ID produk tidak valid'
        });
      }
      
      if (!item.quantity || item.quantity <= 0 || !Number.isInteger(item.quantity)) {
        return res.status(400).json({
          success: false,
          message: 'Quantity tidak valid'
        });
      }
    }
    
    await client.query('BEGIN');
    
    await client.query('SET TRANSACTION ISOLATION LEVEL SERIALIZABLE');
    
    let subtotal = 0;
    const validatedItems = [];
    
    for (const item of items) {
      const productResult = await client.query(
        'SELECT id, name, selling_price, stock FROM products WHERE id = $1 AND business_id = $2 AND status = $3 FOR UPDATE',
        [item.product_id, req.user.business_id, 'ACTIVE']
      );
      
      if (productResult.rows.length === 0) {
        throw new Error(`Produk dengan ID ${item.product_id} tidak ditemukan atau tidak aktif`);
      }
      
      const product = productResult.rows[0];
      
      if (product.stock < item.quantity) {
        throw new Error(`Stok produk ${product.name} tidak mencukupi. Tersedia: ${product.stock}`);
      }
      
      const itemSubtotal = parseFloat(product.selling_price) * item.quantity;
      subtotal += itemSubtotal;
      
      validatedItems.push({
        product_id: product.id,
        product_name: product.name,
        product_price: product.selling_price,
        quantity: item.quantity,
        subtotal: itemSubtotal
      });
      
      await client.query(
        'UPDATE products SET stock = stock - $1 WHERE id = $2 AND business_id = $3',
        [item.quantity, product.id, req.user.business_id]
      );
    }
    
    const total = subtotal;
    let changeAmount = 0;
    
    if (payment_method === 'CASH') {
      const paid = parseFloat(paid_amount) || 0;
      
      if (paid < total) {
        throw new Error('Jumlah pembayaran kurang dari total');
      }
      
      changeAmount = paid - total;
    }
    
    const transactionNumberResult = await client.query(
      'SELECT generate_transaction_number($1) as transaction_number',
      [req.user.business_id]
    );
    
    const transactionNumber = transactionNumberResult.rows[0].transaction_number;
    
    const transactionResult = await client.query(
      'INSERT INTO transactions (business_id, user_id, transaction_number, subtotal, total, payment_method, paid_amount, change_amount) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
      [req.user.business_id, req.user.id, transactionNumber, subtotal, total, payment_method, paid_amount || total, changeAmount]
    );
    
    const transaction = transactionResult.rows[0];
    
    for (const item of validatedItems) {
      await client.query(
        'INSERT INTO transaction_items (transaction_id, product_id, product_name, product_price, quantity, subtotal) VALUES ($1, $2, $3, $4, $5, $6)',
        [transaction.id, item.product_id, item.product_name, item.product_price, item.quantity, item.subtotal]
      );
    }
    
    await client.query(
      'INSERT INTO activity_logs (business_id, user_id, action, description, ip_address, user_agent) VALUES ($1, $2, $3, $4, $5, $6)',
      [req.user.business_id, req.user.id, 'CREATE_TRANSACTION', `Transaksi: ${transactionNumber}`, req.ip, req.get('user-agent')]
    );
    
    await client.query('COMMIT');
    
    const itemsResult = await client.query(
      'SELECT * FROM transaction_items WHERE transaction_id = $1',
      [transaction.id]
    );
    
    res.status(201).json({
      success: true,
      data: {
        ...transaction,
        items: itemsResult.rows
      }
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Create transaction error:', err);
    
    const message = err.message.includes('Stok') || err.message.includes('Produk') || err.message.includes('Jumlah')
      ? err.message
      : 'Terjadi kesalahan saat membuat transaksi';
    
    res.status(400).json({
      success: false,
      message: message
    });
  } finally {
    client.release();
  }
});

module.exports = router;
