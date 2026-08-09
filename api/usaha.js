const express = require('express');
const router = express.Router();
const { query } = require('../lib/db');
const { authenticateToken } = require('./auth');
const { sanitizeObject } = require('../lib/security');

function requireOwner(req, res, next) {
  if (req.user.role !== 'OWNER') {
    return res.status(403).json({
      success: false,
      message: 'Hanya pemilik usaha yang dapat mengakses fitur ini'
    });
  }
  next();
}

router.use(authenticateToken);
router.use(requireOwner);

router.get('/', async (req, res) => {
  try {
    const result = await query(
      'SELECT id, name, address, phone, logo, timezone, created_at, updated_at FROM businesses WHERE id = $1',
      [req.user.business_id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Usaha tidak ditemukan'
      });
    }
    
    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (err) {
    console.error('Get business error:', err);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan saat mengambil data usaha'
    });
  }
});

router.put('/', async (req, res) => {
  try {
    const sanitized = sanitizeObject(req.body);
    const { name, address, phone, logo, timezone } = sanitized;
    
    if (!name) {
      return res.status(400).json({
        success: false,
        message: 'Nama usaha wajib diisi'
      });
    }
    
    const result = await query(
      'UPDATE businesses SET name = $1, address = $2, phone = $3, logo = $4, timezone = $5 WHERE id = $6 RETURNING id, name, address, phone, logo, timezone, updated_at',
      [name, address || null, phone || null, logo || null, timezone || 'Asia/Jakarta', req.user.business_id]
    );
    
    await query(
      'INSERT INTO activity_logs (business_id, user_id, action, description, ip_address, user_agent) VALUES ($1, $2, $3, $4, $5, $6)',
      [req.user.business_id, req.user.id, 'UPDATE_BUSINESS', 'Mengupdate informasi usaha', req.ip, req.get('user-agent')]
    );
    
    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (err) {
    console.error('Update business error:', err);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan saat mengupdate data usaha'
    });
  }
});

module.exports = router;
