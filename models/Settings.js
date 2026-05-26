const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema({
  companyName: { type: String, default: 'My Shop' },
  logoUrl: { type: String, default: '' },
  address: { type: String, default: '' },
  phone: { type: String, default: '' },
  email: { type: String, default: '' },
  gstNumber: { type: String, default: '' },
  inventoryEnabled: { type: Boolean, default: true },
  billPrefix: { type: String, default: 'BILL' },
  billCounter: { type: Number, default: 1 },
}, { timestamps: true });

module.exports = mongoose.model('Settings', settingsSchema);
