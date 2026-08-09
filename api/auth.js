const express = require('express');
const router = express.Router();
const { query, getClient } = require('../lib/db');
const { generateToken, verifyToken, hashPassword, comparePassword, extractTokenFromHeader } = require('../lib/auth');
const { sanitizeObject, isValidEmail } = require('../lib/security');

function authenticateToken(req, res, next) {
  const token = extractTokenFromHeader(req);
  
  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Token tidak ditemukan'
    });
  }
  
  try {
    const decoded = verifyToken(token);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({
      success: false,
      message: 'Token tidak valid atau kadaluarsa'
    });
  }
}

router.post('/register', async (req, res) => {
  const client = await getClient();
  
  try {
    const sanitized = sanitizeObject(req.body);
    const { name, email, password, business_name } = sanitized;
    
    if (!name || !email || !password || !business_name) {
      return res.status(400).json({
        success: false,
        message: 'Nama, email, password, dan nama usaha wajib diisi'
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
    
    await client.query('BEGIN');
    
    const existingUser = await client.query(
      'SELECT id FROM users WHERE email = $1 LIMIT 1',
      [email]
    );
    
    if (existingUser.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'Email sudah terdaftar'
      });
    }
    
    const businessResult = await client.query(
      'INSERT INTO businesses (name) VALUES ($1) RETURNING id',
      [business_name]
    );
    
    const businessId = businessResult.rows[0].id;
    
    const passwordHash = await hashPassword(password);
    
    const userResult = await client.query(
      'INSERT INTO users (business_id, name, email, password_hash, role) VALUES ($1, $2, $3, $4, $5) RETURNING id, business_id, name, email, role, status',
      [businessId, name, email, passwordHash, 'OWNER']
    );
    
    const user = userResult.rows[0];
    
    await client.query(
      'INSERT INTO activity_logs (business_id, user_id, action, description, ip_address, user_agent) VALUES ($1, $2, $3, $4, $5, $6)',
      [businessId, user.id, 'REGISTER', 'Pendaftaran akun baru', req.ip, req.get('user-agent')]
    );
    
    await client.query('COMMIT');
    
    const token = generateToken({
      id: user.id,
      business_id: user.business_id,
      email: user.email,
      role: user.role
    });
    
    res.status(201).json({
      success: true,
      data: {
        token,
        user: {
          id: user.id,
          business_id: user.business_id,
          name: user.name,
          email: user.email,
          role: user.role,
          status: user.status
        }
      }
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Register error:', err);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan saat pendaftaran'
    });
  } finally {
    client.release();
  }
});

router.post('/login', async (req, res) => {
  try {
    const sanitized = sanitizeObject(req.body);
    const { email, password } = sanitized;
    
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email dan password wajib diisi'
      });
    }
    
    const result = await query(
      'SELECT id, business_id, name, email, password_hash, role, status FROM users WHERE email = $1 LIMIT 1',
      [email]
    );
    
    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Email atau password salah'
      });
    }
    
    const user = result.rows[0];
    
    if (user.status === 'INACTIVE') {
      return res.status(403).json({
        success: false,
        message: 'Akun dinonaktifkan. Hubungi pemilik usaha.'
      });
    }
    
    const isValidPassword = await comparePassword(password, user.password_hash);
    
    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        message: 'Email atau password salah'
      });
    }
    
    const token = generateToken({
      id: user.id,
      business_id: user.business_id,
      email: user.email,
      role: user.role
    });
    
    await query(
      'INSERT INTO activity_logs (business_id, user_id, action, description, ip_address, user_agent) VALUES ($1, $2, $3, $4, $5, $6)',
      [user.business_id, user.id, 'LOGIN', 'Login ke sistem', req.ip, req.get('user-agent')]
    );
    
    res.json({
      success: true,
      data: {
        token,
        user: {
          id: user.id,
          business_id: user.business_id,
          name: user.name,
          email: user.email,
          role: user.role,
          status: user.status
        }
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan saat login'
    });
  }
});

router.post('/logout', authenticateToken, async (req, res) => {
  try {
    await query(
      'INSERT INTO activity_logs (business_id, user_id, action, description, ip_address, user_agent) VALUES ($1, $2, $3, $4, $5, $6)',
      [req.user.business_id, req.user.id, 'LOGOUT', 'Logout dari sistem', req.ip, req.get('user-agent')]
    );
    
    res.json({
      success: true,
      message: 'Logout berhasil'
    });
  } catch (err) {
    console.error('Logout error:', err);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan saat logout'
    });
  }
});

router.get('/me', authenticateToken, async (req, res) => {
  try {
    const result = await query(
      'SELECT id, business_id, name, email, role, status FROM users WHERE id = $1 AND business_id = $2',
      [req.user.id, req.user.business_id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User tidak ditemukan'
      });
    }
    
    const user = result.rows[0];
    
    const business = await query(
      'SELECT id, name, address, phone, logo, timezone FROM businesses WHERE id = $1',
      [user.business_id]
    );
    
    res.json({
      success: true,
      data: {
        user,
        business: business.rows[0]
      }
    });
  } catch (err) {
    console.error('Get user error:', err);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan saat mengambil data user'
    });
  }
});

module.exports = router;
module.exports.authenticateToken = authenticateToken;
