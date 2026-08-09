const express = require('express');
const router = express.Router();
const { query } = require('../lib/db');
const { authenticateToken } = require('./auth');
const { hashPassword } = require('../lib/auth');
const { sanitizeObject, isValidEmail, isValidUUID } = require('../lib/security');

router.use(authenticateToken);

router.get('/', async (req, res) => {
  try {
    if (req.user.role !== 'OWNER') {
      return res.status(403).json({
        success: false,
        message: 'Hanya pemilik usaha yang dapat mengakses data pengguna'
      });
    }
    
    const { status, page, limit } = req.query;
    
    let whereClause = 'WHERE business_id = $1 AND role = $2';
    const params = [req.user.business_id, 'KASIR'];
    let paramIndex = 3;
    
    if (status && (status === 'ACTIVE' || status === 'INACTIVE')) {
      whereClause += ` AND status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }
    
    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 20;
    const offset = (pageNum - 1) * limitNum;
    
    const countResult = await query(
      `SELECT COUNT(*) FROM users ${whereClause}`,
      params
    );
    
    const totalItems = parseInt(countResult.rows[0].count);
    const totalPages = Math.ceil(totalItems / limitNum);
    
    const result = await query(
      `SELECT id, name, email, role, status, created_at
       FROM users
       ${whereClause}
       ORDER BY created_at DESC
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
    console.error('Get users error:', err);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan saat mengambil data pengguna'
    });
  }
});

router.post('/', async (req, res) => {
  try {
    if (req.user.role !== 'OWNER') {
      return res.status(403).json({
        success: false,
        message: 'Hanya pemilik usaha yang dapat menambah pengguna'
      });
    }
    
    const sanitized = sanitizeObject(req.body);
    const { name, email, password } = sanitized;
    
    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Nama, email, dan password wajib diisi'
      });
    }
    
    if (!isValidEmail(email)) {
      return res.status(400).json({
        success: false,
        message: 'Format email tidak valid'
      });
    }
    
    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'Password minimal 8 karakter'
      });
    }
    
    const existingUser = await query(
      'SELECT id FROM users WHERE email = $1 AND business_id = $2',
      [email, req.user.business_id]
    );
    
    if (existingUser.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Email sudah terdaftar di usaha ini'
      });
    }
    
    const passwordHash = await hashPassword(password);
    
    const result = await query(
      'INSERT INTO users (business_id, name, email, password_hash, role, status) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, name, email, role, status, created_at',
      [req.user.business_id, name, email, passwordHash, 'KASIR', 'ACTIVE']
    );
    
    await query(
      'INSERT INTO activity_logs (business_id, user_id, action, description, ip_address, user_agent) VALUES ($1, $2, $3, $4, $5, $6)',
      [req.user.business_id, req.user.id, 'CREATE_CASHIER', `Menambah kasir: ${name}`, req.ip, req.get('user-agent')]
    );
    
    res.status(201).json({
      success: true,
      data: result.rows[0]
    });
  } catch (err) {
    console.error('Create user error:', err);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan saat menambah pengguna'
    });
  }
});

router.put('/:id', async (req, res) => {
  try {
    if (req.user.role !== 'OWNER') {
      return res.status(403).json({
        success: false,
        message: 'Hanya pemilik usaha yang dapat mengedit pengguna'
      });
    }
    
    const { id } = req.params;
    
    if (!isValidUUID(id)) {
      return res.status(400).json({
        success: false,
        message: 'ID pengguna tidak valid'
      });
    }
    
    const sanitized = sanitizeObject(req.body);
    const { name, email, password } = sanitized;
    
    if (!name || !email) {
      return res.status(400).json({
        success: false,
        message: 'Nama dan email wajib diisi'
      });
    }
    
    if (!isValidEmail(email)) {
      return res.status(400).json({
        success: false,
        message: 'Format email tidak valid'
      });
    }
    
    const existingUser = await query(
      'SELECT id FROM users WHERE email = $1 AND business_id = $2 AND id != $3',
      [email, req.user.business_id, id]
    );
    
    if (existingUser.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Email sudah digunakan oleh pengguna lain'
      });
    }
    
    let updateQuery = 'UPDATE users SET name = $1, email = $2 WHERE id = $3 AND business_id = $4 AND role = $5 RETURNING id, name, email, role, status, created_at';
    let params = [name, email, id, req.user.business_id, 'KASIR'];
    
    if (password) {
      if (password.length < 8) {
        return res.status(400).json({
          success: false,
          message: 'Password minimal 8 karakter'
        });
      }
      
      const passwordHash = await hashPassword(password);
      updateQuery = 'UPDATE users SET name = $1, email = $2, password_hash = $3 WHERE id = $4 AND business_id = $5 AND role = $6 RETURNING id, name, email, role, status, created_at';
      params = [name, email, passwordHash, id, req.user.business_id, 'KASIR'];
    }
    
    const result = await query(updateQuery, params);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Pengguna tidak ditemukan'
      });
    }
    
    await query(
      'INSERT INTO activity_logs (business_id, user_id, action, description, ip_address, user_agent) VALUES ($1, $2, $3, $4, $5, $6)',
      [req.user.business_id, req.user.id, 'UPDATE_CASHIER', `Mengupdate kasir: ${name}`, req.ip, req.get('user-agent')]
    );
    
    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (err) {
    console.error('Update user error:', err);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan saat mengupdate pengguna'
    });
  }
});

router.patch('/:id/status', async (req, res) => {
  try {
    if (req.user.role !== 'OWNER') {
      return res.status(403).json({
        success: false,
        message: 'Hanya pemilik usaha yang dapat mengubah status pengguna'
      });
    }
    
    const { id } = req.params;
    const { status } = req.body;
    
    if (!isValidUUID(id)) {
      return res.status(400).json({
        success: false,
        message: 'ID pengguna tidak valid'
      });
    }
    
    if (!status || !['ACTIVE', 'INACTIVE'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Status tidak valid'
      });
    }
    
    const result = await query(
      'UPDATE users SET status = $1 WHERE id = $2 AND business_id = $3 AND role = $4 RETURNING id, name, email, role, status, created_at',
      [status, id, req.user.business_id, 'KASIR']
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Pengguna tidak ditemukan'
      });
    }
    
    await query(
      'INSERT INTO activity_logs (business_id, user_id, action, description, ip_address, user_agent) VALUES ($1, $2, $3, $4, $5, $6)',
      [req.user.business_id, req.user.id, status === 'ACTIVE' ? 'ENABLE_CASHIER' : 'DISABLE_CASHIER', `Mengubah status kasir ${result.rows[0].name} menjadi ${status}`, req.ip, req.get('user-agent')]
    );
    
    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (err) {
    console.error('Update user status error:', err);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan saat mengubah status pengguna'
    });
  }
});

module.exports = router;
