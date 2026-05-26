const mongoose = require('mongoose');

const billItemSchema = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
  productName: { type: String, required: true },
  qty: { type: Number, required: true, min: 1 },
  price: { type: Number, required: true, min: 0 }, // final stored price
  total: { type: Number, required: true, min: 0 },
});

const paymentHistorySchema = new mongoose.Schema({
  amount: { type: Number, required: true },
  date: { type: Date, default: Date.now },
  note: { type: String, default: '' },
});

const billSchema = new mongoose.Schema({
  billNumber: { type: String, required: true, unique: true },
  type: { type: String, enum: ['BILL', 'AMC'], default: 'BILL' },
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
  customerName: { type: String, required: true },
  customerPhone: { type: String, default: '' },
  items: [billItemSchema],
  subtotal: { type: Number, default: 0 },
  discount: { type: Number, default: 0 },
  total: { type: Number, required: true },
  paid: { type: Number, default: 0 },
  due: { type: Number, default: 0 },
  status: {
    type: String,
    enum: ['paid', 'partial', 'unpaid'],
    default: 'unpaid'
  },
  paymentHistory: [paymentHistorySchema],
  note: { type: String, default: '' },
  date: { type: Date, default: Date.now },
  amcId: { type: mongoose.Schema.Types.ObjectId, ref: 'AMC' },
}, { timestamps: true });

// Auto-calculate status before save
billSchema.pre('save', function(next) {
  this.due = this.total - this.paid;
  if (this.paid >= this.total) {
    this.status = 'paid';
    this.due = 0;
  } else if (this.paid > 0) {
    this.status = 'partial';
  } else {
    this.status = 'unpaid';
  }
  next();
});

billSchema.index({ billNumber: 1 });
billSchema.index({ status: 1 });
billSchema.index({ date: -1 });

module.exports = mongoose.model('Bill', billSchema);
