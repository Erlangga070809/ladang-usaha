const express = require('express');
const router = express.Router();
const { query } = require('../lib/db');
const { authenticateToken } = require('./auth');

router.use(authenticateToken);

router.get('/sales', async (req, res) => {
  try {
    if (req.user.role !== 'OWNER') {
      return res.status(403).json({
        success: false,
        message: 'Hanya pemilik usaha yang dapat mengakses laporan'
      });
    }
    
    const { period, date_from, date_to } = req.query;
    
    let dateFilter;
    const now = new Date();
    
    if (period === 'today') {
      dateFilter = `DATE(t.created_at) = CURRENT_DATE`;
    } else if (period === '7days') {
      dateFilter = `t.created_at >= CURRENT_DATE - INTERVAL '7 days'`;
    } else if (period === '30days') {
      dateFilter = `t.created_at >= CURRENT_DATE - INTERVAL '30 days'`;
    } else if (period === '90days') {
      dateFilter = `t.created_at >= CURRENT_DATE - INTERVAL '90 days'`;
    } else if (period === 'this_month') {
      dateFilter = `DATE_TRUNC('month', t.created_at) = DATE_TRUNC('month', CURRENT_DATE)`;
    } else if (period === 'custom' && date_from && date_to) {
      dateFilter = `t.created_at >= $2 AND t.created_at <= $3`;
    } else {
      dateFilter = `DATE(t.created_at) = CURRENT_DATE`;
    }
    
    let queryText = `
      SELECT 
        COALESCE(SUM(t.total), 0) as total_revenue,
        COUNT(t.id) as total_transactions,
        COALESCE(AVG(t.total), 0) as average_transaction
      FROM transactions t
      WHERE t.business_id = $1 AND ${dateFilter} AND t.status = 'COMPLETED'
    `;
    
    const params = [req.user.business_id];
    
    if (period === 'custom' && date_from && date_to) {
      params.push(date_from);
      params.push(date_to + ' 23:59:59');
    }
    
    const result = await query(queryText, params);
    
    const itemsQuery = await query(
      `SELECT COALESCE(SUM(ti.quantity), 0) as total_items_sold
       FROM transaction_items ti
       JOIN transactions t ON ti.transaction_id = t.id
       WHERE t.business_id = $1 AND ${dateFilter} AND t.status = 'COMPLETED'`,
      params
    );
    
    const topProductsQuery = await query(
      `SELECT ti.product_name, SUM(ti.quantity) as total_quantity, SUM(ti.subtotal) as total_revenue
       FROM transaction_items ti
       JOIN transactions t ON ti.transaction_id = t.id
       WHERE t.business_id = $1 AND ${dateFilter} AND t.status = 'COMPLETED'
       GROUP BY ti.product_name
       ORDER BY total_quantity DESC
       LIMIT 10`,
      params
    );
    
    res.json({
      success: true,
      data: {
        summary: {
          total_revenue: parseFloat(result.rows[0].total_revenue),
          total_transactions: parseInt(result.rows[0].total_transactions),
          average_transaction: parseFloat(result.rows[0].average_transaction),
          total_items_sold: parseInt(itemsQuery.rows[0].total_items_sold)
        },
        top_products: topProductsQuery.rows
      }
    });
  } catch (err) {
    console.error('Sales report error:', err);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan saat membuat laporan penjualan'
    });
  }
});

router.get('/products', async (req, res) => {
  try {
    if (req.user.role !== 'OWNER') {
      return res.status(403).json({
        success: false,
        message: 'Hanya pemilik usaha yang dapat mengakses laporan'
      });
    }
    
    const { period, date_from, date_to } = req.query;
    
    let dateFilter;
    
    if (period === 'today') {
      dateFilter = `AND DATE(t.created_at) = CURRENT_DATE`;
    } else if (period === '7days') {
      dateFilter = `AND t.created_at >= CURRENT_DATE - INTERVAL '7 days'`;
    } else if (period === '30days') {
      dateFilter = `AND t.created_at >= CURRENT_DATE - INTERVAL '30 days'`;
    } else if (period === '90days') {
      dateFilter = `AND t.created_at >= CURRENT_DATE - INTERVAL '90 days'`;
    } else if (period === 'this_month') {
      dateFilter = `AND DATE_TRUNC('month', t.created_at) = DATE_TRUNC('month', CURRENT_DATE)`;
    } else if (period === 'custom' && date_from && date_to) {
      dateFilter = `AND t.created_at >= $2 AND t.created_at <= $3`;
    } else {
      dateFilter = `AND DATE(t.created_at) = CURRENT_DATE`;
    }
    
    const params = [req.user.business_id];
    
    if (period === 'custom' && date_from && date_to) {
      params.push(date_from);
      params.push(date_to + ' 23:59:59');
    }
    
    const result = await query(
      `SELECT ti.product_name, 
              SUM(ti.quantity) as total_sold, 
              SUM(ti.subtotal) as total_revenue,
              COUNT(DISTINCT t.id) as transaction_count
       FROM transaction_items ti
       JOIN transactions t ON ti.transaction_id = t.id
       WHERE t.business_id = $1 ${dateFilter} AND t.status = 'COMPLETED'
       GROUP BY ti.product_name
       ORDER BY total_sold DESC`,
      params
    );
    
    res.json({
      success: true,
      data: result.rows
    });
  } catch (err) {
    console.error('Product report error:', err);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan saat membuat laporan produk'
    });
  }
});

router.get('/stock', async (req, res) => {
  try {
    if (req.user.role !== 'OWNER') {
      return res.status(403).json({
        success: false,
        message: 'Hanya pemilik usaha yang dapat mengakses laporan'
      });
    }
    
    const result = await query(
      `SELECT p.id, p.name, p.sku, p.stock, p.minimum_stock, p.status,
              CASE 
                WHEN p.stock = 0 THEN 'HABIS'
                WHEN p.stock <= p.minimum_stock THEN 'MENIPIS'
                ELSE 'AMAN'
              END as stock_status,
              c.name as category_name
       FROM products p
       LEFT JOIN categories c ON p.category_id = c.id
       WHERE p.business_id = $1 AND p.status = 'ACTIVE'
       ORDER BY 
         CASE 
           WHEN p.stock = 0 THEN 1
           WHEN p.stock <= p.minimum_stock THEN 2
           ELSE 3
         END,
         p.stock ASC`,
      [req.user.business_id]
    );
    
    const summary = {
      total_products: result.rows.length,
      empty_stock: result.rows.filter(p => p.stock_status === 'HABIS').length,
      low_stock: result.rows.filter(p => p.stock_status === 'MENIPIS').length,
      safe_stock: result.rows.filter(p => p.stock_status === 'AMAN').length
    };
    
    res.json({
      success: true,
      data: {
        summary,
        products: result.rows
      }
    });
  } catch (err) {
    console.error('Stock report error:', err);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan saat membuat laporan stok'
    });
  }
});

router.get('/chart', async (req, res) => {
  try {
    if (req.user.role !== 'OWNER') {
      return res.status(403).json({
        success: false,
        message: 'Hanya pemilik usaha yang dapat mengakses laporan'
      });
    }
    
    const { period } = req.query;
    
    let groupBy;
    let dateFilter;
    
    if (period === '7days') {
      groupBy = `DATE(t.created_at)`;
      dateFilter = `t.created_at >= CURRENT_DATE - INTERVAL '7 days'`;
    } else if (period === '30days') {
      groupBy = `DATE(t.created_at)`;
      dateFilter = `t.created_at >= CURRENT_DATE - INTERVAL '30 days'`;
    } else if (period === '90days') {
      groupBy = `DATE(t.created_at)`;
      dateFilter = `t.created_at >= CURRENT_DATE - INTERVAL '90 days'`;
    } else {
      groupBy = `DATE_TRUNC('hour', t.created_at)`;
      dateFilter = `DATE(t.created_at) = CURRENT_DATE`;
    }
    
    const result = await query(
      `SELECT ${groupBy} as date,
              COALESCE(SUM(t.total), 0) as revenue,
              COUNT(t.id) as transactions
       FROM transactions t
       WHERE t.business_id = $1 AND ${dateFilter} AND t.status = 'COMPLETED'
       GROUP BY date
       ORDER BY date ASC`,
      [req.user.business_id]
    );
    
    res.json({
      success: true,
      data: result.rows
    });
  } catch (err) {
    console.error('Chart report error:', err);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan saat membuat data grafik'
    });
  }
});

module.exports = router;
