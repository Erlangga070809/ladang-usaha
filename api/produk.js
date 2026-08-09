const express = require('express');
const router = express.Router();
const { query } = require('../lib/db');
const { authenticateToken } = require('./auth');
const { sanitizeObject, isValidUUID } = require('../lib/security');

router.use(authenticateToken);

router.get('/', async (req, res) => {
  try {
    const { search, category_id, status, sort_by, sort_order, page, limit } = req.query;
    
    let whereClause = 'WHERE p.business_id = $1';
    const params = [req.user.business_id];
    let paramIndex = 2;
    
    if (search) {
      whereClause += ` AND (p.name ILIKE $${paramIndex} OR p.sku ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }
    
    if (category_id && isValidUUID(category_id)) {
      whereClause += ` AND p.category_id = $${paramIndex}`;
      params.push(category_id);
      paramIndex++;
    }
    
    if (status && (status === 'ACTIVE' || status === 'INACTIVE')) {
      whereClause += ` AND p.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }
    
    let orderClause = 'ORDER BY p.created_at DESC';
    if (sort_by) {
      const allowedSort = ['name', 'sku', 'selling_price', 'stock', 'created_at'];
      const sortOrder = sort_order === 'ASC' ? 'ASC' : 'DESC';
      
      if (allowedSort.includes(sort_by)) {
        orderClause = `ORDER BY p.${sort_by} ${sortOrder}`;
      }
    }
    
    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 20;
    const offset = (pageNum - 1) * limitNum;
    
    const countResult = await query(
      `SELECT COUNT(*) FROM products p ${whereClause}`,
      params
    );
    
    const totalItems = parseInt(countResult.rows[0].count);
    const totalPages = Math.ceil(totalItems / limitNum);
    
    const result = await query(
      `SELECT p.*, c.name as category_name,
       CASE 
         WHEN p.stock = 0 THEN 'HABIS'
         WHEN p.stock <= p.minimum_stock THEN 'MENIPIS'
         ELSE 'AMAN'
       END as stock_status
       FROM products p
       LEFT JOIN categories c ON p.category_id = c.id
       ${whereClause}
       ${orderClause}
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
    console.error('Get products error:', err);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan saat mengambil data produk'
    });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!isValidUUID(id)) {
      return res.status(400).json({
        success: false,
        message: 'ID produk tidak valid'
      });
    }
    
    const result = await query(
      `SELECT p.*, c.name as category_name,
       CASE 
         WHEN p.stock = 0 THEN 'HABIS'
         WHEN p.stock <= p.minimum_stock THEN 'MENIPIS'
         ELSE 'AMAN'
       END as stock_status
       FROM products p
       LEFT JOIN categories c ON p.category_id = c.id
       WHERE p.id = $1 AND p.business_id = $2`,
      [id, req.user.business_id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Produk tidak ditemukan'
      });
    }
    
    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (err) {
    console.error('Get product error:', err);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan saat mengambil data produk'
    });
  }
});

router.post('/', async (req, res) => {
  try {
    if (req.user.role !== 'OWNER') {
      return res.status(403).json({
        success: false,
        message: 'Hanya pemilik usaha yang dapat menambah produk'
      });
    }
    
    const sanitized = sanitizeObject(req.body);
    const { name, sku, category_id, purchase_price, selling_price, stock, minimum_stock } = sanitized;
    
    if (!name || !sku) {
      return res.status(400).json({
        success: false,
        message: 'Nama dan SKU wajib diisi'
      });
    }
    
    if (selling_price === undefined || selling_price < 0) {
      return res.status(400).json({
        success: false,
        message: 'Harga jual tidak valid'
      });
    }
    
    const existingSku = await query(
      'SELECT id FROM products WHERE sku = $1 AND business_id = $2',
      [sku, req.user.business_id]
    );
    
    if (existingSku.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'SKU sudah digunakan'
      });
    }
    
    const result = await query(
      'INSERT INTO products (business_id, category_id, name, sku, purchase_price, selling_price, stock, minimum_stock) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
      [
        req.user.business_id,
        category_id && isValidUUID(category_id) ? category_id : null,
        name,
        sku,
        purchase_price || 0,
        selling_price,
        stock || 0,
        minimum_stock || 0
      ]
    );
    
    await query(
      'INSERT INTO activity_logs (business_id, user_id, action, description, ip_address, user_agent) VALUES ($1, $2, $3, $4, $5, $6)',
      [req.user.business_id, req.user.id, 'CREATE_PRODUCT', `Menambah produk: ${name}`, req.ip, req.get('user-agent')]
    );
    
    res.status(201).json({
      success: true,
      data: result.rows[0]
    });
  } catch (err) {
    console.error('Create product error:', err);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan saat menambah produk'
    });
  }
});

router.put('/:id', async (req, res) => {
  try {
    if (req.user.role !== 'OWNER') {
      return res.status(403).json({
        success: false,
        message: 'Hanya pemilik usaha yang dapat mengedit produk'
      });
    }
    
    const { id } = req.params;
    
    if (!isValidUUID(id)) {
      return res.status(400).json({
        success: false,
        message: 'ID produk tidak valid'
      });
    }
    
    const sanitized = sanitizeObject(req.body);
    const { name, sku, category_id, purchase_price, selling_price, stock, minimum_stock } = sanitized;
    
    if (!name || !sku) {
      return res.status(400).json({
        success: false,
        message: 'Nama dan SKU wajib diisi'
      });
    }
    
    if (selling_price === undefined || selling_price < 0) {
      return res.status(400).json({
        success: false,
        message: 'Harga jual tidak valid'
      });
    }
    
    const existingSku = await query(
      'SELECT id FROM products WHERE sku = $1 AND business_id = $2 AND id != $3',
      [sku, req.user.business_id, id]
    );
    
    if (existingSku.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'SKU sudah digunakan oleh produk lain'
      });
    }
    
    const result = await query(
      'UPDATE products SET name = $1, sku = $2, category_id = $3, purchase_price = $4, selling_price = $5, stock = $6, minimum_stock = $7 WHERE id = $8 AND business_id = $9 RETURNING *',
      [
        name,
        sku,
        category_id && isValidUUID(category_id) ? category_id : null,
        purchase_price || 0,
        selling_price,
        stock || 0,
        minimum_stock || 0,
        id,
        req.user.business_id
      ]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Produk tidak ditemukan'
      });
    }
    
    await query(
      'INSERT INTO activity_logs (business_id, user_id, action, description, ip_address, user_agent) VALUES ($1, $2, $3, $4, $5, $6)',
      [req.user.business_id, req.user.id, 'UPDATE_PRODUCT', `Mengupdate produk: ${name}`, req.ip, req.get('user-agent')]
    );
    
    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (err) {
    console.error('Update product error:', err);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan saat mengupdate produk'
    });
  }
});

router.patch('/:id/status', async (req, res) => {
  try {
    if (req.user.role !== 'OWNER') {
      return res.status(403).json({
        success: false,
        message: 'Hanya pemilik usaha yang dapat mengubah status produk'
      });
    }
    
    const { id } = req.params;
    const { status } = req.body;
    
    if (!isValidUUID(id)) {
      return res.status(400).json({
        success: false,
        message: 'ID produk tidak valid'
      });
    }
    
    if (!status || !['ACTIVE', 'INACTIVE'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Status tidak valid'
      });
    }
    
    const result = await query(
      'UPDATE products SET status = $1 WHERE id = $2 AND business_id = $3 RETURNING *',
      [status, id, req.user.business_id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Produk tidak ditemukan'
      });
    }
    
    await query(
      'INSERT INTO activity_logs (business_id, user_id, action, description, ip_address, user_agent) VALUES ($1, $2, $3, $4, $5, $6)',
      [req.user.business_id, req.user.id, status === 'ACTIVE' ? 'ENABLE_PRODUCT' : 'DISABLE_PRODUCT', `Mengubah status produk menjadi ${status}`, req.ip, req.get('user-agent')]
    );
    
    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (err) {
    console.error('Update product status error:', err);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan saat mengubah status produk'
    });
  }
});

module.exports = router;
