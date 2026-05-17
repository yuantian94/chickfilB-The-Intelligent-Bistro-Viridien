const express = require('express');
const { getDb } = require('../db/database');

const router = express.Router();

// Middleware: extract guest_token from header
function requireGuestToken(req, res, next) {
  const token = req.headers['x-guest-token'];
  if (!token) return res.status(400).json({ error: 'Guest token required' });
  req.guestToken = token;
  next();
}

// Evict guest orders older than 1 day
function evictOldGuestOrders(db) {
  db.prepare("DELETE FROM guest_order_items WHERE guest_order_id IN (SELECT id FROM guest_orders WHERE created_at < datetime('now', '-1 day'))").run();
  db.prepare("DELETE FROM guest_orders WHERE created_at < datetime('now', '-1 day')").run();
  db.prepare("DELETE FROM guest_cart_items WHERE created_at < datetime('now', '-1 day')").run();
}

// --- Guest Cart ---

// Get guest cart
router.get('/cart', requireGuestToken, (req, res) => {
  const db = getDb();
  evictOldGuestOrders(db);
  
  const items = db.prepare(`
    SELECT gc.*, mi.name, mi.price, mi.calories, mi.image_url, mi.description,
    (SELECT COUNT(*) FROM item_modifiers WHERE menu_item_id = mi.id) as mod_count
    FROM guest_cart_items gc
    JOIN menu_items mi ON gc.menu_item_id = mi.id
    WHERE gc.guest_token = ?
    ORDER BY gc.created_at DESC
  `).all(req.guestToken);

  const subtotal = items.reduce((sum, item) => {
    const modifiers = JSON.parse(item.modifiers || '[]');
    const modifierCost = modifiers.reduce((s, m) => s + (m.price_modifier || 0), 0);
    return sum + (item.price + modifierCost) * item.quantity;
  }, 0);

  const tax = +(subtotal * 0.0825).toFixed(2);
  const total = +(subtotal + tax).toFixed(2);

  res.json({
    items,
    subtotal: +subtotal.toFixed(2),
    discount: 0,
    tier: 'guest',
    tax,
    total,
    itemCount: items.reduce((s, i) => s + i.quantity, 0),
    points: 0
  });
});

// Add to guest cart
router.post('/cart', requireGuestToken, (req, res) => {
  const { menuItemId, quantity = 1, modifiers = [] } = req.body;
  if (!menuItemId) return res.status(400).json({ error: 'menuItemId is required' });

  const db = getDb();
  const menuItem = db.prepare('SELECT * FROM menu_items WHERE id = ? AND available = 1').get(menuItemId);
  if (!menuItem) return res.status(404).json({ error: 'Menu item not found or unavailable' });

  // No reward redemption for guests — strip any points_cost modifiers
  const cleanMods = modifiers.filter(m => !m.points_cost);
  const modsStr = JSON.stringify(cleanMods);

  const existing = db.prepare(
    'SELECT * FROM guest_cart_items WHERE guest_token = ? AND menu_item_id = ? AND modifiers = ?'
  ).get(req.guestToken, menuItemId, modsStr);

  if (existing) {
    const newQty = existing.quantity + quantity;
    db.prepare('UPDATE guest_cart_items SET quantity = ? WHERE id = ?').run(newQty, existing.id);
    return res.json({ id: existing.id, message: 'Added to cart', totalQuantity: newQty });
  }

  const result = db.prepare(
    'INSERT INTO guest_cart_items (guest_token, menu_item_id, quantity, modifiers) VALUES (?, ?, ?, ?)'
  ).run(req.guestToken, menuItemId, quantity, modsStr);

  res.status(201).json({ id: result.lastInsertRowid, message: 'Added to cart', totalQuantity: quantity });
});

// Update guest cart item quantity
router.put('/cart/:id', requireGuestToken, (req, res) => {
  const { quantity } = req.body;
  const db = getDb();

  if (quantity <= 0) {
    db.prepare('DELETE FROM guest_cart_items WHERE id = ? AND guest_token = ?').run(req.params.id, req.guestToken);
    return res.json({ message: 'Item removed' });
  }

  db.prepare('UPDATE guest_cart_items SET quantity = ? WHERE id = ? AND guest_token = ?').run(quantity, req.params.id, req.guestToken);
  res.json({ message: 'Cart updated' });
});

// Clear guest cart
router.delete('/cart', requireGuestToken, (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM guest_cart_items WHERE guest_token = ?').run(req.guestToken);
  res.json({ message: 'Cart cleared' });
});

// --- Guest Checkout ---
router.post('/checkout', requireGuestToken, (req, res) => {
  const { email, orderType, address, cardName, cardNumber, cardExp, cardCvc } = req.body;
  
  if (!email) return res.status(400).json({ error: 'Email is required for receipt' });
  if (!cardNumber || !cardExp || !cardCvc) return res.status(400).json({ error: 'Card details are required' });

  const db = getDb();
  evictOldGuestOrders(db);

  const cartItems = db.prepare(`
    SELECT gc.*, mi.name, mi.price, mi.calories, mi.image_url
    FROM guest_cart_items gc
    JOIN menu_items mi ON gc.menu_item_id = mi.id
    WHERE gc.guest_token = ?
  `).all(req.guestToken);

  if (cartItems.length === 0) return res.status(400).json({ error: 'Cart is empty' });

  let subtotal = cartItems.reduce((sum, item) => {
    const mods = JSON.parse(item.modifiers || '[]');
    const modCost = mods.reduce((s, m) => s + (m.price_modifier || 0), 0);
    return sum + (item.price + modCost) * item.quantity;
  }, 0);

  const tax = +(subtotal * 0.0825).toFixed(2);
  const total = +(subtotal + tax).toFixed(2);

  // Create guest order
  const result = db.prepare(`
    INSERT INTO guest_orders (guest_email, guest_token, order_type, address, subtotal, tax, total)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(email, req.guestToken, orderType || 'pickup', address || '', +subtotal.toFixed(2), tax, total);

  const orderId = result.lastInsertRowid;

  // Copy items to order
  const insertItem = db.prepare(
    'INSERT INTO guest_order_items (guest_order_id, menu_item_id, name, price, quantity, calories, modifiers, image_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  );
  for (const item of cartItems) {
    insertItem.run(orderId, item.menu_item_id, item.name, item.price, item.quantity, item.calories, item.modifiers, item.image_url);
  }

  // Clear cart
  db.prepare('DELETE FROM guest_cart_items WHERE guest_token = ?').run(req.guestToken);

  res.status(201).json({
    orderId,
    status: 'placed',
    subtotal: +subtotal.toFixed(2),
    tax,
    total,
    pointsEarned: 0,
    message: `Order placed! Receipt will be sent to ${email}`
  });
});

module.exports = router;
