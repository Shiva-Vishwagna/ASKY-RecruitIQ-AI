const express = require('express');
const router = express.Router();
const Level = require('../models/Level');
const { protect, adminOnly } = require('../middleware/auth');

router.get('/', protect, async (req, res) => {
  try {
    const levels = await Level.find().sort({ minYears: 1 });
    res.json({ levels });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.post('/', protect, adminOnly, async (req, res) => {
  try {
    const level = await Level.create(req.body);
    res.status(201).json({ level });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.put('/:id', protect, adminOnly, async (req, res) => {
  try {
    const level = await Level.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json({ level });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.delete('/:id', protect, adminOnly, async (req, res) => {
  try {
    await Level.findByIdAndDelete(req.params.id);
    res.json({ message: 'Level deleted' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
