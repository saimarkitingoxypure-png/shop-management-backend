const express = require('express');
const router = express.Router();
const AMC = require('../models/AMC');
const Bill = require('../models/Bill');
const Settings = require('../models/Settings');

// GET all AMC contracts
router.get('/', async (req, res) => {
  try {
    const { status, search } = req.query;
    let query = {};

    if (status) query.status = status;
    if (search) {
      query.$or = [
        { customerName: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
      ];
    }

    const amcs = await AMC.find(query).populate('billId').sort({ createdAt: -1 });

    // Recalculate statuses dynamically
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const updatedAmcs = amcs.map(amc => {
      const amcObj = amc.toObject();
      const endDate = new Date(amc.endDate);
      const twoDaysBeforeEnd = new Date(endDate);
      twoDaysBeforeEnd.setDate(twoDaysBeforeEnd.getDate() - 2);
      const nextService = amc.nextServiceDate ? new Date(amc.nextServiceDate) : null;
      const twoDaysBeforeService = nextService ? new Date(nextService) : null;
      if (twoDaysBeforeService) twoDaysBeforeService.setDate(twoDaysBeforeService.getDate() - 2);

      if (today > endDate) {
        amcObj.alertStatus = 'VOID';
      } else if (today >= twoDaysBeforeEnd) {
        amcObj.alertStatus = 'ABOUT_TO_OVER';
      } else if (twoDaysBeforeService && today >= twoDaysBeforeService) {
        amcObj.alertStatus = 'SERVICE_DUE';
      } else {
        amcObj.alertStatus = 'OK';
      }

      return amcObj;
    });

    res.json({ success: true, data: updatedAmcs });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET AMC alerts for dashboard
router.get('/alerts', async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const twoDaysFromNow = new Date(today);
    twoDaysFromNow.setDate(twoDaysFromNow.getDate() + 2);

    const amcs = await AMC.find({}).sort({ endDate: 1 });

    const alerts = { void: [], aboutToOver: [], serviceDue: [] };

    amcs.forEach(amc => {
      const endDate = new Date(amc.endDate);
      const twoDaysBeforeEnd = new Date(endDate);
      twoDaysBeforeEnd.setDate(twoDaysBeforeEnd.getDate() - 2);
      const nextService = amc.nextServiceDate ? new Date(amc.nextServiceDate) : null;
      const twoDaysBeforeService = nextService ? new Date(nextService) : null;
      if (twoDaysBeforeService) twoDaysBeforeService.setDate(twoDaysBeforeService.getDate() - 2);

      if (today > endDate) {
        alerts.void.push(amc);
      } else if (today >= twoDaysBeforeEnd) {
        alerts.aboutToOver.push(amc);
      } else if (twoDaysBeforeService && today >= twoDaysBeforeService) {
        alerts.serviceDue.push(amc);
      }
    });

    res.json({ success: true, data: alerts });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET single AMC
router.get('/:id', async (req, res) => {
  try {
    const amc = await AMC.findById(req.params.id).populate('billId').populate('customer');
    if (!amc) return res.status(404).json({ success: false, message: 'AMC not found' });
    res.json({ success: true, data: amc });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// CREATE AMC + auto-create bill
router.post('/', async (req, res) => {
  try {
    const settings = await Settings.findOne();

    const data = { ...req.body };
    if (!data.customer) delete data.customer;

    // Create AMC
    const amc = new AMC(data);
    if (!amc.nextServiceDate && amc.lastServiceDate && amc.serviceIntervalDays) {
      const nextDate = new Date(amc.lastServiceDate);
      nextDate.setDate(nextDate.getDate() + amc.serviceIntervalDays);
      amc.nextServiceDate = nextDate;
    }
    await amc.save();

    // Auto-create bill for AMC
    const prefix = settings?.billPrefix || 'BILL';
    const counter = settings?.billCounter || 1;
    const billNumber = `${prefix}-AMC-${String(counter).padStart(5, '0')}`;

    if (settings) {
      settings.billCounter = counter + 1;
      await settings.save();
    }

    const bill = new Bill({
      billNumber,
      type: 'AMC',
      customerName: amc.customerName,
      customerPhone: amc.phone,
      items: [{ productName: 'AMC Contract', qty: 1, price: amc.amount, total: amc.amount }],
      subtotal: amc.amount,
      total: amc.amount,
      paid: req.body.paid || 0,
      date: amc.startDate,
      amcId: amc._id,
    });
    await bill.save();

    // Link bill to AMC
    amc.billId = bill._id;
    await amc.save();

    res.status(201).json({ success: true, data: { amc, bill } });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// UPDATE AMC
router.put('/:id', async (req, res) => {
  try {
    const amc = await AMC.findById(req.params.id);
    if (!amc) return res.status(404).json({ success: false, message: 'AMC not found' });

    const updateData = { ...req.body };
    if (!updateData.customer) delete updateData.customer;
    Object.assign(amc, updateData);
    await amc.save();

    res.json({ success: true, data: amc });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// MARK SERVICE DONE
router.post('/:id/service-done', async (req, res) => {
  try {
    const { note, technician } = req.body;
    const amc = await AMC.findById(req.params.id);
    if (!amc) return res.status(404).json({ success: false, message: 'AMC not found' });

    const today = new Date();
    amc.lastServiceDate = today;
    const nextDate = new Date(today);
    nextDate.setDate(nextDate.getDate() + amc.serviceIntervalDays);
    amc.nextServiceDate = nextDate;

    amc.serviceHistory.push({
      date: today,
      note: note || '',
      technician: technician || '',
    });

    await amc.save();
    res.json({ success: true, data: amc });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// RENEW AMC
router.post('/:id/renew', async (req, res) => {
  try {
    const { endDate, amount, startDate } = req.body;
    const amc = await AMC.findById(req.params.id);
    if (!amc) return res.status(404).json({ success: false, message: 'AMC not found' });

    amc.startDate = startDate || amc.endDate;
    amc.endDate = new Date(endDate);
    if (amount) amc.amount = amount;
    amc.paid = 0;
    amc.due = amc.amount;

    await amc.save();
    res.json({ success: true, data: amc });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// ADD PAYMENT to AMC
router.post('/:id/payment', async (req, res) => {
  try {
    const { amount, note } = req.body;
    const amc = await AMC.findById(req.params.id);
    if (!amc) return res.status(404).json({ success: false, message: 'AMC not found' });

    amc.paid += Number(amount);
    if (!amc.paymentHistory) amc.paymentHistory = [];
    amc.paymentHistory.push({ amount: Number(amount), note: note || '', date: new Date() });
    await amc.save();

    res.json({ success: true, data: amc });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// DELETE AMC
router.delete('/:id', async (req, res) => {
  try {
    await AMC.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'AMC deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
