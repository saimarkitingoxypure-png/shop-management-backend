const mongoose = require('mongoose');

const serviceRequestSchema = new mongoose.Schema({
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
  customerName: { type: String, required: true },
  phone: { type: String, default: '' },
  address: { type: String, default: '' },
  description: { type: String, required: true },
  serviceType: { type: String, default: 'General' },
  price: { type: Number, default: 0 },
  paid: { type: Number, default: 0 },
  due: { type: Number, default: 0 },
  status: {
    type: String,
    enum: ['pending', 'in_progress', 'completed', 'cancelled'],
    default: 'pending'
  },
  technician: { type: String, default: '' },
  note: { type: String, default: '' },
  date: { type: Date, default: Date.now },
  completedDate: { type: Date },
  billId: { type: mongoose.Schema.Types.ObjectId, ref: 'Bill' },
}, { timestamps: true });

serviceRequestSchema.pre('save', function(next) {
  this.due = this.price - this.paid;
  next();
});

serviceRequestSchema.index({ phone: 1 });
serviceRequestSchema.index({ status: 1 });

module.exports = mongoose.model('ServiceRequest', serviceRequestSchema);
