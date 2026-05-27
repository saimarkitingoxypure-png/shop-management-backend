const express = require('express');
const router = express.Router();
const Bill = require('../models/Bill');
const Product = require('../models/Product');
const Settings = require('../models/Settings');

// GET all bills
router.get('/', async (req, res) => {
  try {
    const { status, type, search, startDate, endDate, page = 1, limit = 20 } = req.query;
    let query = {};

    if (status) query.status = status;
    if (type) query.type = type;
    if (search) {
      query.$or = [
        { customerName: { $regex: search, $options: 'i' } },
        { billNumber: { $regex: search, $options: 'i' } },
        { customerPhone: { $regex: search, $options: 'i' } },
      ];
    }
    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) query.date.$lte = new Date(endDate);
    }

    const skip = (Number(page) - 1) * Number(limit);
    const total = await Bill.countDocuments(query);
    const bills = await Bill.find(query)
      .populate('customer', 'name phone')
      .sort({ date: -1 })
      .skip(skip)
      .limit(Number(limit));

    res.json({ success: true, data: bills, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET single bill
router.get('/:id', async (req, res) => {
  try {
    const bill = await Bill.findById(req.params.id).populate('customer').populate('items.product');
    if (!bill) return res.status(404).json({ success: false, message: 'Bill not found' });
    res.json({ success: true, data: bill });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// CREATE bill
router.post('/', async (req, res) => {
  try {
    const settings = await Settings.findOne();

    // Generate bill number
    const prefix = settings?.billPrefix || 'BILL';
    const counter = settings?.billCounter || 1;
    const billNumber = `${prefix}-${String(counter).padStart(5, '0')}`;

    // Update counter
    if (settings) {
      settings.billCounter = counter + 1;
      await settings.save();
    }

    const billData = { ...req.body, billNumber };

    // Clean empty ObjectId fields to prevent BSONError cast failures
    if (!billData.customer) delete billData.customer;
    if (billData.items) {
      billData.items = billData.items.map(item => {
        const cleaned = { ...item };
        if (!cleaned.product) delete cleaned.product;
        return cleaned;
      });
    }

    // Calculate totals
    let subtotal = 0;
    if (billData.items && billData.items.length > 0) {
      billData.items = billData.items.map(item => {
        const total = item.qty * item.price;
        subtotal += total;
        return { ...item, total };
      });
    }
    billData.subtotal = subtotal;
    billData.total = subtotal - (billData.discount || 0);
    billData.due = billData.total - (billData.paid || 0);

    const bill = new Bill(billData);
    await bill.save();

    // Reduce stock if inventory enabled
    if (settings?.inventoryEnabled && billData.items) {
      for (const item of billData.items) {
        if (item.product) {
          await Product.findByIdAndUpdate(item.product, {
            $inc: { stock: -item.qty },
            lastUpdated: new Date()
          });
        }
      }
    }

    res.status(201).json({ success: true, data: bill });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// UPDATE bill
router.put('/:id', async (req, res) => {
  try {
    const updateData = { ...req.body };

    // Clean empty ObjectId fields to prevent BSONError cast failures
    if (!updateData.customer) delete updateData.customer;
    if (updateData.items) {
      updateData.items = updateData.items.map(item => {
        const cleaned = { ...item };
        if (!cleaned.product) delete cleaned.product;
        return cleaned;
      });
    }

    // Recalculate totals
    if (updateData.items) {
      let subtotal = 0;
      updateData.items = updateData.items.map(item => {
        const total = item.qty * item.price;
        subtotal += total;
        return { ...item, total };
      });
      updateData.subtotal = subtotal;
      updateData.total = subtotal - (updateData.discount || 0);
    }

    const bill = await Bill.findById(req.params.id);
    if (!bill) return res.status(404).json({ success: false, message: 'Bill not found' });

    Object.assign(bill, updateData);
    await bill.save();

    res.json({ success: true, data: bill });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// ADD PAYMENT to bill
router.post('/:id/payment', async (req, res) => {
  try {
    const { amount, note } = req.body;
    const bill = await Bill.findById(req.params.id);
    if (!bill) return res.status(404).json({ success: false, message: 'Bill not found' });

    bill.paid += Number(amount);
    bill.paymentHistory.push({ amount: Number(amount), note: note || '', date: new Date() });
    await bill.save(); // pre-save hook recalculates due and status

    res.json({ success: true, data: bill });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// DELETE bill
router.delete('/:id', async (req, res) => {
  try {
    await Bill.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Bill deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
