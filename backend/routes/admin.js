const express = require('express');
const router  = express.Router();
const { protect, adminOnly } = require('../middleware/auth');

// Lazy-load User model to avoid circular deps
function User() { return require('../models/User'); }

// All routes require admin auth
router.use(protect, adminOnly);

// ── GET /api/admin/users ──────────────────────────────────────
router.get('/users', async (req, res) => {
  try {
    const users = await User().find().select('-password').sort({ createdAt: -1 });
    res.json({ users });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── POST /api/admin/users — create new user ───────────────────
router.post('/users', async (req, res) => {
  try {
    const { name, email, password, role, isActive } = req.body;

    if (!name || !name.trim())         return res.status(400).json({ message: 'Name is required' });
    if (!email || !email.trim())       return res.status(400).json({ message: 'Email is required' });
    if (!password || password.length < 6) return res.status(400).json({ message: 'Password must be at least 6 characters' });

    const exists = await User().findOne({ email: email.toLowerCase().trim() });
    if (exists) return res.status(400).json({ message: 'A user with this email already exists' });

    const safeRole = (role === 'admin' || role === 'recruiter') ? role : 'recruiter';

    // User model has pre-save hook that hashes password
    const user = await User().create({
      name:     name.trim(),
      email:    email.toLowerCase().trim(),
      password: password,
      role:     safeRole,
      isActive: isActive !== false,
    });

    const obj = user.toObject();
    delete obj.password;
    res.status(201).json({ user: obj, message: name.trim() + ' created successfully as ' + safeRole });
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ message: 'Email already in use' });
    res.status(500).json({ message: err.message });
  }
});

// ── PUT /api/admin/users/:id — update user ────────────────────
router.put('/users/:id', async (req, res) => {
  try {
    const { name, email, role, isActive, password } = req.body;
    const update = {};

    if (name     !== undefined) update.name     = name.trim();
    if (email    !== undefined) update.email    = email.toLowerCase().trim();
    if (role     !== undefined) update.role     = (role === 'admin' || role === 'recruiter') ? role : 'recruiter';
    if (isActive !== undefined) update.isActive = !!isActive;

    if (password) {
      if (password.length < 6) return res.status(400).json({ message: 'Password must be at least 6 characters' });
      // Hash password using bcryptjs — fallback to model if not available
      try {
        const bcrypt = require('bcryptjs');
        update.password = await bcrypt.hash(password, 10);
      } catch (e) {
        // If bcryptjs not available, set raw and let model handle it
        // Create temp user to trigger pre-save hook
        const tempUser = await User().findById(req.params.id);
        if (tempUser) {
          tempUser.password = password;
          await tempUser.save();
          const saved = await User().findById(req.params.id).select('-password');
          return res.json({ user: saved, message: 'Password updated' });
        }
      }
    }

    const user = await User().findByIdAndUpdate(
      req.params.id,
      { $set: update },
      { new: true }
    ).select('-password');

    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ user, message: user.name + ' updated' });
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ message: 'Email already in use' });
    res.status(500).json({ message: err.message });
  }
});

// ── DELETE /api/admin/users/:id ───────────────────────────────
router.delete('/users/:id', async (req, res) => {
  try {
    if (req.params.id === req.user._id.toString()) {
      return res.status(400).json({ message: 'You cannot delete your own account' });
    }
    const user = await User().findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ message: user.name + ' deleted successfully' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── GET /api/admin/stats ──────────────────────────────────────
router.get('/stats', async (req, res) => {
  try {
    const Candidate = require('../models/Candidate');
    const Job       = require('../models/Job');
    const [userCount, candidateCount, jobCount] = await Promise.all([
      User().countDocuments(),
      Candidate.countDocuments(),
      Job.countDocuments(),
    ]);
    res.json({ users: userCount, candidates: candidateCount, jobs: jobCount });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
