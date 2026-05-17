const express = require('express');
const { getDb } = require('../db/database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// Get rewards info
router.get('/', authenticate, (req, res) => {
  const db = getDb();
  const rewards = db.prepare('SELECT * FROM rewards WHERE user_id = ?').get(req.user.id);
  if (!rewards) return res.status(404).json({ error: 'Rewards not found' });

  // Tier thresholds
  const tiers = {
    member: { min: 0, next: 'silver', nextAt: 1000, perks: ['10 pts per $1 spent'] },
    silver: { min: 1000, next: 'gold', nextAt: 3000, perks: ['10 pts per $1', '2% off all orders'] },
    gold: { min: 3000, next: 'platinum', nextAt: 5000, perks: ['10 pts per $1', '3% off all orders'] },
    platinum: { min: 5000, next: null, nextAt: null, perks: ['10 pts per $1', '5% off all orders'] }
  };

  const tierInfo = tiers[rewards.tier] || tiers.member;
  const pointsToNext = tierInfo.nextAt ? tierInfo.nextAt - rewards.total_points_earned : 0;

  res.json({
    ...rewards,
    tierInfo,
    pointsToNext: Math.max(0, pointsToNext)
  });
});

// Get available rewards to redeem
router.get('/redeemable', authenticate, (req, res) => {
  const db = getDb();
  const rewards = db.prepare('SELECT * FROM rewards WHERE user_id = ?').get(req.user.id);
  if (!rewards) return res.status(404).json({ error: 'Rewards not found' });

  const items = db.prepare(
    'SELECT id, name, price, redeem_points, image_url FROM menu_items WHERE redeem_points > 0 AND available = 1 ORDER BY redeem_points'
  ).all();

  res.json({ availablePoints: rewards.points, redeemableItems: items });
});

// Get promotions
router.get('/promotions', (req, res) => {
  const db = getDb();
  const promos = db.prepare(`
    SELECT * FROM promotions WHERE active = 1
    AND (valid_from IS NULL OR valid_from <= CURRENT_TIMESTAMP)
    AND (valid_until IS NULL OR valid_until >= CURRENT_TIMESTAMP)
  `).all();
  res.json(promos);
});

module.exports = router;
