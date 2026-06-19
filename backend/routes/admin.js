const express = require('express');
const router  = express.Router();
const bcrypt  = require('bcryptjs');
const { protect, adminOnly } = require('../middleware/auth');

// All routes require admin
router.use(protect, adminOnly);

const getUser = () => require('../models/User');

// ── GET all users ─────────────────────────────────────────────
router.get('/users', async (req, res) => {
  try {
    const User  = getUser();
    const users = await User.find().select('-password').sort({ createdAt: -1 });
    res.json({ users });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── POST create user ──────────────────────────────────────────
router.post('/users', async (req, res) => {
  try {
    const User = getUser();
    const { name, email, password, role = 'recruiter', isActive = true } = req.body;

    if (!name?.trim())     return res.status(400).json({ message: 'Name is required' });
    if (!email?.trim())    return res.status(400).json({ message: 'Email is required' });
    if (!password?.trim()) return res.status(400).json({ message: 'Password is required' });
    if (password.length < 6) return res.status(400).json({ message: 'Password must be at least 6 characters' });

    const exists = await User.findOne({ email: email.toLowerCase().trim() });
    if (exists) return res.status(400).json({ message: `User with email ${email} already exists` });

    const user = await User.create({
      name:     name.trim(),
      email:    email.toLowerCase().trim(),
      password, // model should hash via pre-save hook
      role:     ['admin','recruiter'].includes(role) ? role : 'recruiter',
      isActive: !!isActive,
    });

    const obj = user.toObject();
    delete obj.password;
    res.status(201).json({ user: obj, message: `${name} created successfully as ${role}` });
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ message: 'Email already in use' });
    res.status(500).json({ message: err.message });
  }
});

// ── PUT update user ───────────────────────────────────────────
router.put('/users/:id', async (req, res) => {
  try {
    const User = getUser();
    const { name, email, role, isActive, password } = req.body;
    const update: any = {};

    if (name     !== undefined) update.name     = name.trim();
    if (email    !== undefined) update.email    = email.toLowerCase().trim();
    if (role     !== undefined) update.role     = ['admin','recruiter'].includes(role) ? role : 'recruiter';
    if (isActive !== undefined) update.isActive = !!isActive;

    // Password reset
    if (password) {
      if (password.length < 6) return res.status(400).json({ message: 'Password must be at least 6 characters' });
      update.password = await bcrypt.hash(password, 10);
    }

    const user = await User.findByIdAndUpdate(req.params.id, update, { new: true }).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found' });

    res.json({ user, message: `${user.name} updated` });
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ message: 'Email already in use' });
    res.status(500).json({ message: err.message });
  }
});

// ── DELETE user ───────────────────────────────────────────────
router.delete('/users/:id', async (req, res) => {
  try {
    const User = getUser();
    // Prevent deleting yourself
    if (req.params.id === req.user._id.toString()) {
      return res.status(400).json({ message: 'You cannot delete your own account' });
    }
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ message: `${user.name} deleted` });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── GET stats ─────────────────────────────────────────────────
router.get('/stats', async (req, res) => {
  try {
    const User      = getUser();
    const Candidate = require('../models/Candidate');
    const Job       = require('../models/Job');
    const [users, candidates, jobs] = await Promise.all([
      User.countDocuments(),
      Candidate.countDocuments(),
      Job.countDocuments(),
    ]);
    res.json({ users, candidates, jobs });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
