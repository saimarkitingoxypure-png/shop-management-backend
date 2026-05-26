require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const app = express();

// Trust proxy for secure cookies/headers when deployed (e.g. Railway, Render, Heroku)
app.set('trust proxy', 1);

// Middleware
app.use(helmet());

// Configure CORS dynamic origins
const corsOrigins = process.env.CLIENT_URL 
  ? process.env.CLIENT_URL.split(',').map(url => url.trim()) 
  : ['http://localhost:3000'];

app.use(cors({
  origin: corsOrigins,
  credentials: true
}));
app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/settings', require('./routes/settings'));
app.use('/api/products', require('./routes/products'));
app.use('/api/customers', require('./routes/customers'));
app.use('/api/bills', require('./routes/bills'));
app.use('/api/nobills', require('./routes/nobills'));
app.use('/api/udhar', require('./routes/udhar'));
app.use('/api/amc', require('./routes/amc'));
app.use('/api/services', require('./routes/services'));
app.use('/api/reports', require('./routes/reports'));

// Welcome/Status check
app.get('/', (req, res) => {
  res.json({
    message: 'Welcome to the Shop Management System API',
    status: 'online',
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development'
  });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

// Connect DB and start server
const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/shopmanagement';

mongoose.connect(MONGODB_URI)
  .then(() => {
    console.log('✅ MongoDB connected');
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('❌ MongoDB connection error:', err);
    process.exit(1);
  });

module.exports = app;
