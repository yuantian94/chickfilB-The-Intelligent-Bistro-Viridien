const express = require('express');
const { getDb } = require('../db/database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// Place an order
router.post('/', authenticate, (req, res) => {
  const db = getDb();
  const { paymentMethodId, promoCode, orderType, address, saveAsFavorite } = req.body;

  // Get cart
  const cartItems = db.prepare(`
    SELECT ci.*, mi.name, mi.price, mi.calories, mi.image_url
    FROM cart_items ci
    JOIN menu_items mi ON ci.menu_item_id = mi.id
    WHERE ci.user_id = ?
  `).all(req.user.id);

  if (cartItems.length === 0) {
    return res.status(400).json({ error: 'Cart is empty' });
  }

  // Calculate totals
  let subtotal = cartItems.reduce((sum, item) => {
    const mods = JSON.parse(item.modifiers || '[]');
    const modCost = mods.reduce((s, m) => s + (m.price_modifier || 0), 0);
    return sum + (item.price + modCost) * item.quantity;
  }, 0);

  // Apply promo
  let discount = 0;
  if (promoCode) {
    const promo = db.prepare(
      `SELECT * FROM promotions WHERE code = ? AND active = 1
       AND (valid_from IS NULL OR valid_from <= CURRENT_TIMESTAMP)
       AND (valid_until IS NULL OR valid_until >= CURRENT_TIMESTAMP)`
    ).get(promoCode);

    if (promo && subtotal >= promo.min_order_amount) {
      if (promo.discount_type === 'percent') {
        discount = subtotal * (promo.discount_value / 100);
      } else if (promo.discount_type === 'fixed') {
        discount = promo.discount_value;
      }
    }
  }

  // Apply tier discount
  const userRewards = db.prepare('SELECT * FROM rewards WHERE user_id = ?').get(req.user.id);
  let tierDiscount = 0;
  if (userRewards.tier === 'silver') tierDiscount = subtotal * 0.02;
  else if (userRewards.tier === 'gold') tierDiscount = subtotal * 0.03;
  else if (userRewards.tier === 'platinum') tierDiscount = subtotal * 0.05;

  discount += tierDiscount;

  subtotal = Math.max(0, subtotal - discount);
  const tax = +(subtotal * 0.0825).toFixed(2);
  const total = +(subtotal + tax).toFixed(2);

  const pointsEarned = Math.floor(total * 10);
  let pointsRedeemed = 0;
  cartItems.forEach(i => {
    const mods = JSON.parse(i.modifiers || '[]');
    const redeemMod = mods.find(m => m.points_cost);
    if (redeemMod) pointsRedeemed += (redeemMod.points_cost * i.quantity);
  });

  if (userRewards.points < pointsRedeemed) {
    return res.status(400).json({ error: 'Not enough points' });
  }

  if (saveAsFavorite) {
    db.prepare('UPDATE orders SET is_favorite = 0 WHERE user_id = ?').run(req.user.id);
  }

  // Create order
  const result = db.prepare(`
    INSERT INTO orders (user_id, order_type, address, subtotal, tax, total, payment_method_id, points_earned, points_redeemed, is_favorite)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(req.user.id, orderType || 'pickup', address || null, +subtotal.toFixed(2), tax, total, paymentMethodId || null, pointsEarned, pointsRedeemed, saveAsFavorite ? 1 : 0);
  
  const orderId = result.lastInsertRowid;

  // Copy cart items to order items
  const insertOrderItem = db.prepare(`
    INSERT INTO order_items (order_id, menu_item_id, name, price, quantity, calories, modifiers, image_url)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const item of cartItems) {
    insertOrderItem.run(orderId, item.menu_item_id, item.name, item.price, item.quantity, item.calories, item.modifiers, item.image_url);
  }

  // Update rewards
  db.prepare(`
    UPDATE rewards SET points = points + ? - ?, total_points_earned = total_points_earned + ?
    WHERE user_id = ?
  `).run(pointsEarned, pointsRedeemed, pointsEarned, req.user.id);

  // Update tier
  const rewards = db.prepare('SELECT * FROM rewards WHERE user_id = ?').get(req.user.id);
  let newTier = 'member';
  if (rewards.total_points_earned >= 5000) newTier = 'platinum';
  else if (rewards.total_points_earned >= 3000) newTier = 'gold';
  else if (rewards.total_points_earned >= 1000) newTier = 'silver';
  db.prepare('UPDATE rewards SET tier = ? WHERE user_id = ?').run(newTier, req.user.id);

  // Clear cart
  db.prepare('DELETE FROM cart_items WHERE user_id = ?').run(req.user.id);

  res.status(201).json({
    orderId,
    status: 'placed',
    subtotal: +subtotal.toFixed(2),
    tax,
    total,
    pointsEarned,
    discount: +discount.toFixed(2),
    message: 'Order placed successfully!'
  });
});

// Get order history
router.get('/', authenticate, (req, res) => {
  const db = getDb();
  const orders = db.prepare(`
    SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC
  `).all(req.user.id);

  const ordersWithItems = orders.map(order => {
    const items = db.prepare(`
      SELECT oi.*, mi.image_url, mi.redeem_points 
      FROM order_items oi
      LEFT JOIN menu_items mi ON oi.menu_item_id = mi.id
      WHERE oi.order_id = ?
    `).all(order.id);
    return { ...order, items };
  });

  res.json(ordersWithItems);
});

// Get single order
router.get('/:id', authenticate, (req, res) => {
  const db = getDb();
  const order = db.prepare('SELECT * FROM orders WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  const items = db.prepare(`
    SELECT oi.*, mi.image_url, mi.redeem_points 
    FROM order_items oi
    LEFT JOIN menu_items mi ON oi.menu_item_id = mi.id
    WHERE oi.order_id = ?
  `).all(order.id);
  res.json({ ...order, items });
});

// Toggle favorite order
router.post('/:id/favorite', authenticate, (req, res) => {
  const db = getDb();
  const { is_favorite } = req.body;
  
  const order = db.prepare('SELECT * FROM orders WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  if (is_favorite) {
    db.prepare('UPDATE orders SET is_favorite = 0 WHERE user_id = ?').run(req.user.id);
    db.prepare('UPDATE orders SET is_favorite = 1 WHERE id = ?').run(order.id);
  } else {
    db.prepare('UPDATE orders SET is_favorite = 0 WHERE id = ?').run(order.id);
  }

  res.json({ success: true, is_favorite });
});

module.exports = router;
