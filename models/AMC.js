const mongoose = require('mongoose');

const paymentHistorySchema = new mongoose.Schema({
  amount: { type: Number, required: true },
  date: { type: Date, default: Date.now },
  note: { type: String, default: '' },
});

const amcSchema = new mongoose.Schema({
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
  customerName: { type: String, required: true },
  phone: { type: String, default: '' },
  address: { type: String, default: '' },
  serviceIntervalDays: { type: Number, default: 30, min: 1 },
  lastServiceDate: { type: Date, required: true },
  nextServiceDate: { type: Date },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  amount: { type: Number, required: true, min: 0 },
  paid: { type: Number, default: 0 },
  due: { type: Number, default: 0 },
  status: {
    type: String,
    enum: ['active', 'void', 'about_to_over', 'service_due', 'expired'],
    default: 'active'
  },
  billId: { type: mongoose.Schema.Types.ObjectId, ref: 'Bill' },
  paymentHistory: [paymentHistorySchema],
  serviceHistory: [{
    date: { type: Date, default: Date.now },
    note: { type: String, default: '' },
    technician: { type: String, default: '' },
  }],
  note: { type: String, default: '' },
}, { timestamps: true });

amcSchema.pre('save', function(next) {
  // Calculate nextServiceDate if not set or lastServiceDate changed
  if (this.lastServiceDate && this.serviceIntervalDays) {
    const next_date = new Date(this.lastServiceDate);
    next_date.setDate(next_date.getDate() + this.serviceIntervalDays);
    if (!this.nextServiceDate) {
      this.nextServiceDate = next_date;
    }
  }

  // Calculate due
  this.due = this.amount - this.paid;

  // Calculate status based on dates
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (today > new Date(this.endDate)) {
    this.status = 'void';
  } else {
    const twoDaysBeforeEnd = new Date(this.endDate);
    twoDaysBeforeEnd.setDate(twoDaysBeforeEnd.getDate() - 2);

    const twoDaysBeforeService = new Date(this.nextServiceDate || this.endDate);
    twoDaysBeforeService.setDate(twoDaysBeforeService.getDate() - 2);

    if (today >= twoDaysBeforeEnd) {
      this.status = 'about_to_over';
    } else if (today >= twoDaysBeforeService) {
      this.status = 'service_due';
    } else {
      this.status = 'active';
    }
  }

  next();
});

amcSchema.index({ status: 1 });
amcSchema.index({ endDate: 1 });
amcSchema.index({ nextServiceDate: 1 });

module.exports = mongoose.model('AMC', amcSchema);
