require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const { corsOptions, helmetConfig } = require('../lib/security');
const authRoutes = require('./auth');
const usahaRoutes = require('./usaha');
const produkRoutes = require('./produk');
const transaksiRoutes = require('./transaksi');
const laporanRoutes = require('./laporan');
const penggunaRoutes = require('./pengguna');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet(helmetConfig));
app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use(express.static(path.join(__dirname, '..', 'public')));

app.use('/api/auth', authRoutes);
app.use('/api/usaha', usahaRoutes);
app.use('/api/produk', produkRoutes);
app.use('/api/transaksi', transaksiRoutes);
app.use('/api/laporan', laporanRoutes);
app.use('/api/pengguna', penggunaRoutes);

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.message);
  
  if (process.env.NODE_ENV === 'production') {
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan internal server'
    });
  } else {
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
});

app.use((req, res) => {
  if (req.path.startsWith('/api')) {
    res.status(404).json({
      success: false,
      message: 'Endpoint tidak ditemukan'
    });
  } else {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
  }
});

if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`Ladang Usaha server running on port ${PORT}`);
  });
}

module.exports = app;
