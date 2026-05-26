const express = require('express');
const router = express.Router();
const NoBill = require('../models/NoBill');
const Product = require('../models/Product');
const Settings = require('../models/Settings');

// GET all no-bills
router.get('/', async (req, res) => {
  try {
    const { status, search, startDate, endDate, page = 1, limit = 20 } = req.query;
    let query = {};

    if (status) query.status = status;
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
      ];
    }
    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) query.date.$lte = new Date(endDate);
    }

    const skip = (Number(page) - 1) * Number(limit);
    const total = await NoBill.countDocuments(query);
    const nobills = await NoBill.find(query)
      .sort({ date: -1 })
      .skip(skip)
      .limit(Number(limit));

    res.json({ success: true, data: nobills, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET single no-bill
router.get('/:id', async (req, res) => {
  try {
    const nobill = await NoBill.findById(req.params.id).populate('product');
    if (!nobill) return res.status(404).json({ success: false, message: 'No-Bill not found' });
    res.json({ success: true, data: nobill });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// CREATE no-bill
router.post('/', async (req, res) => {
  try {
    const nobill = new NoBill(req.body);
    await nobill.save();

    // Reduce stock if inventory enabled and product selected
    const settings = await Settings.findOne();
    if (settings?.inventoryEnabled && req.body.product) {
      const qty = req.body.qty || 1;
      await Product.findByIdAndUpdate(req.body.product, {
        $inc: { stock: -qty },
        lastUpdated: new Date()
      });
    }

    res.status(201).json({ success: true, data: nobill });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// UPDATE no-bill
router.put('/:id', async (req, res) => {
  try {
    const nobill = await NoBill.findById(req.params.id);
    if (!nobill) return res.status(404).json({ success: false, message: 'No-Bill not found' });

    Object.assign(nobill, req.body);
    await nobill.save();

    res.json({ success: true, data: nobill });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// ADD PAYMENT to no-bill
router.post('/:id/payment', async (req, res) => {
  try {
    const { amount, note } = req.body;
    const nobill = await NoBill.findById(req.params.id);
    if (!nobill) return res.status(404).json({ success: false, message: 'No-Bill not found' });

    nobill.paid += Number(amount);
    nobill.paymentHistory.push({ amount: Number(amount), note: note || '', date: new Date() });
    await nobill.save();

    res.json({ success: true, data: nobill });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// DELETE no-bill
router.delete('/:id', async (req, res) => {
  try {
    await NoBill.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'No-Bill deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
