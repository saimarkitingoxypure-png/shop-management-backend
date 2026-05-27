const express = require('express');
const router = express.Router();
const ServiceRequest = require('../models/ServiceRequest');
const Customer = require('../models/Customer');

// GET all service requests
router.get('/', async (req, res) => {
  try {
    const { status, search, phone } = req.query;
    let query = {};

    if (status) query.status = status;
    if (phone) query.phone = { $regex: phone, $options: 'i' };
    if (search) {
      query.$or = [
        { customerName: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
      ];
    }

    const services = await ServiceRequest.find(query).sort({ date: -1 });
    res.json({ success: true, data: services });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET service history by phone
router.get('/phone/:phone', async (req, res) => {
  try {
    const services = await ServiceRequest.find({ phone: req.params.phone }).sort({ date: -1 });
    const customer = await Customer.findOne({ phone: req.params.phone });
    res.json({ success: true, data: { services, customer } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET single service request
router.get('/:id', async (req, res) => {
  try {
    const service = await ServiceRequest.findById(req.params.id).populate('customer');
    if (!service) return res.status(404).json({ success: false, message: 'Service request not found' });
    res.json({ success: true, data: service });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// CREATE service request
router.post('/', async (req, res) => {
  try {
    const data = { ...req.body };
    if (!data.customer) delete data.customer;
    const service = new ServiceRequest(data);
    await service.save();

    // Auto-create or update customer record
    if (req.body.phone) {
      await Customer.findOneAndUpdate(
        { phone: req.body.phone },
        {
          name: req.body.customerName,
          phone: req.body.phone,
          address: req.body.address || '',
        },
        { upsert: true, new: true }
      );
    }

    res.status(201).json({ success: true, data: service });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// UPDATE service request
router.put('/:id', async (req, res) => {
  try {
    const service = await ServiceRequest.findById(req.params.id);
    if (!service) return res.status(404).json({ success: false, message: 'Service request not found' });

    const updateData = { ...req.body };
    if (!updateData.customer) delete updateData.customer;
    Object.assign(service, updateData);
    if (req.body.status === 'completed' && !service.completedDate) {
      service.completedDate = new Date();
    }
    await service.save();

    res.json({ success: true, data: service });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// DELETE service request
router.delete('/:id', async (req, res) => {
  try {
    await ServiceRequest.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Service request deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
