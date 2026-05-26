const express = require('express');
const router = express.Router();
const Bill = require('../models/Bill');
const NoBill = require('../models/NoBill');
const AMC = require('../models/AMC');
const Product = require('../models/Product');

// GET sales analytics / reports
router.get('/sales', async (req, res) => {
  try {
    const { startDate, endDate, period = 'all' } = req.query;

    let dateQuery = {};
    if (startDate || endDate) {
      dateQuery = {};
      if (startDate) dateQuery.$gte = new Date(startDate);
      if (endDate) dateQuery.$lte = new Date(endDate);
    }

    const billQuery = dateQuery.hasOwnProperty('$gte') || dateQuery.hasOwnProperty('$lte') ? { date: dateQuery } : {};
    const noBillQuery = { ...billQuery };

    const [bills, nobills, amcBills] = await Promise.all([
      Bill.find({ ...billQuery, type: 'BILL' }),
      NoBill.find(noBillQuery),
      Bill.find({ ...billQuery, type: 'AMC' }),
    ]);

    const totalBillSales = bills.reduce((s, b) => s + b.total, 0);
    const totalNoBillSales = nobills.reduce((s, n) => s + n.amount, 0);
    const totalAmcSales = amcBills.reduce((s, b) => s + b.total, 0);
    const totalSales = totalBillSales + totalNoBillSales + totalAmcSales;

    const totalPaid = bills.reduce((s, b) => s + b.paid, 0) +
      nobills.reduce((s, n) => s + n.paid, 0) +
      amcBills.reduce((s, b) => s + b.paid, 0);

    const totalUnpaid = totalSales - totalPaid;

    // Item-wise analytics
    const itemMap = {};
    bills.forEach(bill => {
      bill.items.forEach(item => {
        if (!itemMap[item.productName]) {
          itemMap[item.productName] = { name: item.productName, qty: 0, revenue: 0 };
        }
        itemMap[item.productName].qty += item.qty;
        itemMap[item.productName].revenue += item.total;
      });
    });

    const itemStats = Object.values(itemMap).sort((a, b) => b.revenue - a.revenue);

    // Status breakdown
    const statusBreakdown = {
      paid: bills.filter(b => b.status === 'paid').length + nobills.filter(n => n.status === 'paid').length,
      partial: bills.filter(b => b.status === 'partial').length + nobills.filter(n => n.status === 'partial').length,
      unpaid: bills.filter(b => b.status === 'unpaid').length + nobills.filter(n => n.status === 'unpaid').length,
    };

    res.json({
      success: true,
      data: {
        summary: {
          totalSales,
          totalBillSales,
          totalNoBillSales,
          totalAmcSales,
          totalPaid,
          totalUnpaid,
          totalBills: bills.length,
          totalNoBills: nobills.length,
        },
        itemStats,
        statusBreakdown,
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET unified ledger
router.get('/ledger', async (req, res) => {
  try {
    const { page = 1, limit = 50, type, status, search } = req.query;

    let billQuery = {};
    let noBillQuery = {};
    let amcBillQuery = { type: 'AMC' };

    if (status) {
      billQuery.status = status;
      noBillQuery.status = status;
    }

    const [bills, nobills, amcBills] = await Promise.all([
      Bill.find({ ...billQuery, type: 'BILL' }).sort({ date: -1 }),
      NoBill.find(noBillQuery).sort({ date: -1 }),
      Bill.find(amcBillQuery).sort({ date: -1 }),
    ]);

    let ledger = [
      ...bills.map(b => ({
        _id: b._id,
        type: 'BILL',
        refNumber: b.billNumber,
        name: b.customerName,
        phone: b.customerPhone,
        total: b.total,
        paid: b.paid,
        due: b.due,
        status: b.status,
        date: b.date,
      })),
      ...nobills.map(n => ({
        _id: n._id,
        type: 'NO_BILL',
        refNumber: null,
        name: n.name,
        phone: n.phone,
        total: n.amount,
        paid: n.paid,
        due: n.due,
        status: n.status,
        date: n.date,
      })),
      ...amcBills.map(b => ({
        _id: b._id,
        type: 'AMC',
        refNumber: b.billNumber,
        name: b.customerName,
        phone: b.customerPhone,
        total: b.total,
        paid: b.paid,
        due: b.due,
        status: b.status,
        date: b.date,
      })),
    ];

    // Filter by type
    if (type) {
      ledger = ledger.filter(l => l.type === type);
    }

    // Filter by search
    if (search) {
      const searchLower = search.toLowerCase();
      ledger = ledger.filter(l =>
        l.name?.toLowerCase().includes(searchLower) ||
        l.phone?.includes(search) ||
        l.refNumber?.toLowerCase().includes(searchLower)
      );
    }

    // Sort by date desc
    ledger.sort((a, b) => new Date(b.date) - new Date(a.date));

    const total = ledger.length;
    const skip = (Number(page) - 1) * Number(limit);
    const paginatedLedger = ledger.slice(skip, skip + Number(limit));

    res.json({
      success: true,
      data: paginatedLedger,
      total,
      page: Number(page),
      pages: Math.ceil(total / Number(limit)),
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET dashboard stats
router.get('/dashboard', async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const [
      totalBills,
      totalNoBills,
      totalPendingDue,
      todayBills,
      lowStockProducts,
      amcAlerts,
    ] = await Promise.all([
      Bill.countDocuments({ type: 'BILL' }),
      NoBill.countDocuments(),
      Bill.aggregate([{ $group: { _id: null, total: { $sum: '$due' } } }]),
      Bill.find({ date: { $gte: today, $lt: tomorrow }, type: 'BILL' }),
      Product.find({ isActive: true, $expr: { $lte: ['$stock', '$lowStockAlert'] } }),
      Promise.resolve({ void: [], aboutToOver: [], serviceDue: [] }),
    ]);

    const todaySales = todayBills.reduce((s, b) => s + b.total, 0);
    const totalDue = totalPendingDue[0]?.total || 0;

    // AMC alerts
    const amcs = await require('../models/AMC').find({});
    const amcAlertData = { void: [], aboutToOver: [], serviceDue: [] };
    const todayDate = new Date();
    todayDate.setHours(0, 0, 0, 0);

    amcs.forEach(amc => {
      const endDate = new Date(amc.endDate);
      const twoDaysBeforeEnd = new Date(endDate);
      twoDaysBeforeEnd.setDate(twoDaysBeforeEnd.getDate() - 2);
      const nextService = amc.nextServiceDate ? new Date(amc.nextServiceDate) : null;
      const twoDaysBeforeService = nextService ? new Date(nextService) : null;
      if (twoDaysBeforeService) twoDaysBeforeService.setDate(twoDaysBeforeService.getDate() - 2);

      if (todayDate > endDate) {
        amcAlertData.void.push({ _id: amc._id, customerName: amc.customerName, phone: amc.phone, endDate: amc.endDate });
      } else if (todayDate >= twoDaysBeforeEnd) {
        amcAlertData.aboutToOver.push({ _id: amc._id, customerName: amc.customerName, phone: amc.phone, endDate: amc.endDate });
      } else if (twoDaysBeforeService && todayDate >= twoDaysBeforeService) {
        amcAlertData.serviceDue.push({ _id: amc._id, customerName: amc.customerName, phone: amc.phone, nextServiceDate: amc.nextServiceDate });
      }
    });

    res.json({
      success: true,
      data: {
        totalBills,
        totalNoBills,
        totalDue,
        todaySales,
        todayBillCount: todayBills.length,
        lowStockCount: lowStockProducts.length,
        lowStockProducts: lowStockProducts.slice(0, 5),
        amcAlerts: amcAlertData,
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
