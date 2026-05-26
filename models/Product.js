const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  billPrice: { type: Number, required: true, min: 0 },
  noBillPrice: { type: Number, required: true, min: 0 },
  stock: { type: Number, default: 0, min: 0 },
  lowStockAlert: { type: Number, default: 5, min: 0 },
  unit: { type: String, default: 'pcs' },
  category: { type: String, default: 'General' },
  description: { type: String, default: '' },
  isActive: { type: Boolean, default: true },
  lastUpdated: { type: Date, default: Date.now },
}, { timestamps: true });

productSchema.pre('save', function(next) {
  this.lastUpdated = new Date();
  next();
});

module.exports = mongoose.model('Product', productSchema);
