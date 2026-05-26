const express = require('express');
const router = express.Router();
const Bill = require('../models/Bill');
const NoBill = require('../models/NoBill');
const AMC = require('../models/AMC');

// GET all udhar (due > 0) from all sources
router.get('/', async (req, res) => {
  try {
    const { sort = 'due', order = 'desc', search } = req.query;

    // Query bills with due > 0
    let billQuery = { due: { $gt: 0 }, type: 'BILL' };
    let noBillQuery = { due: { $gt: 0 } };
    let amcQuery = { due: { $gt: 0 } };

    if (search) {
      const searchRegex = { $regex: search, $options: 'i' };
      billQuery.$or = [{ customerName: searchRegex }, { customerPhone: searchRegex }];
      noBillQuery.$or = [{ name: searchRegex }, { phone: searchRegex }];
      amcQuery.$or = [{ customerName: searchRegex }, { phone: searchRegex }];
    }

    const [bills, nobills, amcs] = await Promise.all([
      Bill.find(billQuery).sort({ date: -1 }),
      NoBill.find(noBillQuery).sort({ date: -1 }),
      AMC.find(amcQuery).sort({ updatedAt: -1 }),
    ]);

    // Normalize to unified ledger format
    const udharList = [
      ...bills.map(b => ({
        _id: b._id,
        sourceId: b._id,
        type: 'BILL',
        refNumber: b.billNumber,
        name: b.customerName,
        phone: b.customerPhone,
        total: b.total,
        paid: b.paid,
        due: b.due,
        status: b.status,
        date: b.date,
        lastPaymentDate: b.paymentHistory.length > 0 ? b.paymentHistory[b.paymentHistory.length - 1].date : null,
        paymentHistory: b.paymentHistory,
      })),
      ...nobills.map(n => ({
        _id: n._id,
        sourceId: n._id,
        type: 'NO_BILL',
        refNumber: null,
        name: n.name,
        phone: n.phone,
        total: n.amount,
        paid: n.paid,
        due: n.due,
        status: n.status,
        date: n.date,
        lastPaymentDate: n.paymentHistory.length > 0 ? n.paymentHistory[n.paymentHistory.length - 1].date : null,
        paymentHistory: n.paymentHistory,
      })),
      ...amcs.map(a => ({
        _id: a._id,
        sourceId: a._id,
        type: 'AMC',
        refNumber: null,
        name: a.customerName,
        phone: a.phone,
        total: a.amount,
        paid: a.paid,
        due: a.due,
        status: a.status,
        date: a.startDate,
        lastPaymentDate: a.paymentHistory && a.paymentHistory.length > 0 ? a.paymentHistory[a.paymentHistory.length - 1].date : null,
        paymentHistory: a.paymentHistory || [],
      })),
    ];

    // Sort
    const sortField = sort || 'due';
    const sortOrder = order === 'asc' ? 1 : -1;
    udharList.sort((a, b) => {
      if (sortField === 'date') return sortOrder * (new Date(b.date) - new Date(a.date));
      return sortOrder * (b[sortField] - a[sortField]);
    });

    const totalDue = udharList.reduce((sum, item) => sum + item.due, 0);
    res.json({ success: true, data: udharList, totalDue });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Add payment to udhar item
router.post('/:type/:id/payment', async (req, res) => {
  try {
    const { amount, note } = req.body;
    const { type, id } = req.params;

    let doc;
    if (type === 'bill') {
      doc = await Bill.findById(id);
      if (doc) {
        doc.paid += Number(amount);
        doc.paymentHistory.push({ amount: Number(amount), note: note || '', date: new Date() });
        await doc.save();
      }
    } else if (type === 'nobill') {
      doc = await NoBill.findById(id);
      if (doc) {
        doc.paid += Number(amount);
        doc.paymentHistory.push({ amount: Number(amount), note: note || '', date: new Date() });
        await doc.save();
      }
    } else if (type === 'amc') {
      doc = await AMC.findById(id);
      if (doc) {
        doc.paid += Number(amount);
        if (!doc.paymentHistory) doc.paymentHistory = [];
        doc.paymentHistory.push({ amount: Number(amount), note: note || '', date: new Date() });
        await doc.save();
      }
    }

    if (!doc) return res.status(404).json({ success: false, message: 'Record not found' });

    res.json({ success: true, data: doc });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

module.exports = router;
