const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getDb } = require('../db/database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// Register
router.post('/register', (req, res) => {
  const { email, password, name } = req.body;
  if (!email || !password || !name) {
    return res.status(400).json({ error: 'Email, password, and name are required' });
  }

  const db = getDb();
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) {
    return res.status(409).json({ error: 'Email already registered' });
  }

  const passwordHash = bcrypt.hashSync(password, 10);
  const result = db.prepare(
    'INSERT INTO users (email, password_hash, name) VALUES (?, ?, ?)'
  ).run(email, passwordHash, name);

  const userId = result.lastInsertRowid;

  // Initialize rewards
  db.prepare('INSERT INTO rewards (user_id, points, tier) VALUES (?, 0, ?)').run(userId, 'member');

  // Migrate guest orders matching this email
  let migratedCount = 0;
  let totalPointsEarned = 0;
  const guestOrders = db.prepare(
    "SELECT * FROM guest_orders WHERE guest_email = ? AND created_at >= datetime('now', '-1 day')"
  ).all(email);

  for (const go of guestOrders) {
    const pointsEarned = Math.floor(go.total * 10);
    totalPointsEarned += pointsEarned;

    const orderResult = db.prepare(
      'INSERT INTO orders (user_id, order_type, address, subtotal, tax, total, points_earned, points_redeemed) VALUES (?, ?, ?, ?, ?, ?, ?, 0)'
    ).run(userId, go.order_type, go.address, go.subtotal, go.tax, go.total, pointsEarned);

    const newOrderId = orderResult.lastInsertRowid;

    // Copy items
    const guestItems = db.prepare('SELECT * FROM guest_order_items WHERE guest_order_id = ?').all(go.id);
    const insertItem = db.prepare(
      'INSERT INTO order_items (order_id, menu_item_id, name, price, quantity, calories, modifiers, image_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    );
    for (const item of guestItems) {
      insertItem.run(newOrderId, item.menu_item_id, item.name, item.price, item.quantity, item.calories, item.modifiers, item.image_url);
    }
    migratedCount++;
  }

  // Award points from migrated orders
  if (totalPointsEarned > 0) {
    db.prepare('UPDATE rewards SET points = points + ?, total_points_earned = total_points_earned + ? WHERE user_id = ?')
      .run(totalPointsEarned, totalPointsEarned, userId);
  }

  // Clean up migrated guest data
  if (guestOrders.length > 0) {
    const guestOrderIds = guestOrders.map(go => go.id);
    for (const gid of guestOrderIds) {
      db.prepare('DELETE FROM guest_order_items WHERE guest_order_id = ?').run(gid);
      db.prepare('DELETE FROM guest_orders WHERE id = ?').run(gid);
    }
  }

  const token = jwt.sign(
    { id: userId, email, name },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );

  res.status(201).json({
    token,
    user: { id: userId, email, name },
    migratedOrders: migratedCount,
    pointsEarned: totalPointsEarned
  });
});

// Login
router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  // Update last active
  db.prepare('UPDATE users SET last_active_at = CURRENT_TIMESTAMP WHERE id = ?').run(user.id);

  const token = jwt.sign(
    { id: user.id, email: user.email, name: user.name },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );

  res.json({
    token,
    user: { id: user.id, email: user.email, name: user.name, avatar_url: user.avatar_url }
  });
});

// Get current user profile
router.get('/me', authenticate, (req, res) => {
  const db = getDb();
  const user = db.prepare('SELECT id, email, name, avatar_url, default_address, created_at FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const rewards = db.prepare('SELECT * FROM rewards WHERE user_id = ?').get(req.user.id);
  const paymentMethods = db.prepare('SELECT * FROM payment_methods WHERE user_id = ? ORDER BY is_default DESC').all(req.user.id);

  res.json({ ...user, rewards, paymentMethods });
});

// Update profile
router.put('/me', authenticate, (req, res) => {
  const db = getDb();
  const { defaultAddress, paymentMethod } = req.body;
  
  try {
    db.prepare('BEGIN').run();
    
    if (defaultAddress !== undefined) {
      db.prepare('UPDATE users SET default_address = ? WHERE id = ?').run(defaultAddress, req.user.id);
    }
    
    if (paymentMethod) {
      db.prepare('DELETE FROM payment_methods WHERE user_id = ?').run(req.user.id);
      db.prepare(`
        INSERT INTO payment_methods (user_id, card_type, last_four, card_holder, expiry_month, expiry_year, is_default)
        VALUES (?, ?, ?, ?, ?, ?, 1)
      `).run(
        req.user.id,
        paymentMethod.cardType || 'visa',
        paymentMethod.lastFour || '1234',
        paymentMethod.cardHolder || 'Card Holder',
        paymentMethod.expiryMonth || 12,
        paymentMethod.expiryYear || 2030
      );
    }
    
    db.prepare('COMMIT').run();
    res.json({ success: true });
  } catch (err) {
    db.prepare('ROLLBACK').run();
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

module.exports = router;
