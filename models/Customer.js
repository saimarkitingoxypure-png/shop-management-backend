const mongoose = require('mongoose');

const customerSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  phone: { type: String, trim: true, default: '' },
  email: { type: String, trim: true, default: '' },
  address: { type: String, default: '' },
  totalDue: { type: Number, default: 0 },
  lastPaymentDate: { type: Date },
}, { timestamps: true });

customerSchema.index({ phone: 1 });

module.exports = mongoose.model('Customer', customerSchema);
