const express = require('express');
const router = express.Router();
const Candidate = require('../models/Candidate');
const Job = require('../models/Job');
const { protect } = require('../middleware/auth');

// GET /api/analytics
router.get('/', protect, async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [totalJobs, totalCandidates, candidates, jobs] = await Promise.all([
      Job.countDocuments(),
      Candidate.countDocuments(),
      Candidate.find({ createdAt: { $gte: since } }),
      Job.find({ createdAt: { $gte: since } }),
    ]);

    const avgScore = candidates.length
      ? Math.round(candidates.reduce((s, c) => s + (c.aiScore || c.score || 0), 0) / candidates.length)
      : 0;

    const hired = candidates.filter(c => c.recommendation === 'Strong Hire' || c.recommendation === 'Hire' || c.status === 'hm_ready').length;
    const hireRate = candidates.length ? Math.round((hired / candidates.length) * 100) : 0;

    // Tier distribution
    const tiers = { A: 0, B: 0, C: 0 };
    candidates.forEach(c => { tiers[c.tier] = (tiers[c.tier] || 0) + 1; });
    const tierDistribution = [
      { name: 'A-Tier', value: tiers.A, color: '#10b981' },
      { name: 'B-Tier', value: tiers.B, color: '#3b82f6' },
      { name: 'C-Tier', value: tiers.C, color: '#f59e0b' },
    ];

    // Hiring funnel
    const statuses = ['new', 'screened', 'shortlisted', 'interviewed', 'offered', 'hired'];
    const allCandidates = await Candidate.find();
    const hiringFunnel = [
      { stage: 'Applied', count: allCandidates.length },
      { stage: 'Screened', count: allCandidates.filter(c => c.status !== 'new').length },
      { stage: 'Shortlisted', count: allCandidates.filter(c => ['shortlisted', 'interviewed', 'hired'].includes(c.status)).length },
      { stage: 'Interviewed', count: allCandidates.filter(c => ['interviewed', 'hired'].includes(c.status)).length },
      { stage: 'Hired', count: allCandidates.filter(c => c.status === 'hired').length },
    ];

    // Monthly trend (last 5 months)
    const monthlyTrend = [];
    for (let i = 4; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const month = d.toLocaleString('default', { month: 'short' });
      const start = new Date(d.getFullYear(), d.getMonth(), 1);
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      const monthCandidates = await Candidate.countDocuments({ createdAt: { $gte: start, $lte: end } });
      const monthHired = await Candidate.countDocuments({ createdAt: { $gte: start, $lte: end }, recommendation: 'hire' });
      monthlyTrend.push({ month, candidates: monthCandidates, hired: monthHired });
    }

    res.json({
      summary: { totalJobs, totalCandidates, avgScore, hireRate },
      tierDistribution,
      hiringFunnel,
      monthlyTrend,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
