const mongoose = require('mongoose');

const paymentHistorySchema = new mongoose.Schema({
  amount: { type: Number, required: true },
  date: { type: Date, default: Date.now },
  note: { type: String, default: '' },
});

const noBillSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  phone: { type: String, default: '', trim: true },
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
  productName: { type: String, default: '' },
  price: { type: Number, default: 0 },
  amount: { type: Number, required: true, default: 0 },
  note: { type: String, default: '' },
  paid: { type: Number, default: 0 },
  due: { type: Number, default: 0 },
  status: {
    type: String,
    enum: ['paid', 'partial', 'unpaid'],
    default: 'unpaid'
  },
  paymentHistory: [paymentHistorySchema],
  date: { type: Date, default: Date.now },
}, { timestamps: true });

noBillSchema.pre('save', function(next) {
  this.due = this.amount - this.paid;
  if (this.paid >= this.amount) {
    this.status = 'paid';
    this.due = 0;
  } else if (this.paid > 0) {
    this.status = 'partial';
  } else {
    this.status = 'unpaid';
  }
  next();
});

noBillSchema.index({ status: 1 });
noBillSchema.index({ phone: 1 });

module.exports = mongoose.model('NoBill', noBillSchema);
