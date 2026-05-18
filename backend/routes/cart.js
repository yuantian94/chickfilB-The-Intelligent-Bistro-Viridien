const express = require('express');
const { getDb } = require('../db/database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// Get cart items
router.get('/', authenticate, (req, res) => {
  const db = getDb();
  const items = db.prepare(`
    SELECT ci.*, mi.name, mi.price, mi.calories, mi.image_url, mi.description,
    (SELECT COUNT(*) FROM item_modifiers WHERE menu_item_id = mi.id) as mod_count
    FROM cart_items ci
    JOIN menu_items mi ON ci.menu_item_id = mi.id
    WHERE ci.user_id = ?
    ORDER BY ci.created_at DESC
  `).all(req.user.id);

  const subtotal = items.reduce((sum, item) => {
    const modifiers = JSON.parse(item.modifiers || '[]');
    const modifierCost = modifiers.reduce((s, m) => s + (m.price_modifier || 0), 0);
    return sum + (item.price + modifierCost) * item.quantity;
  }, 0);

  // Apply tier discount
  const userRewards = db.prepare('SELECT * FROM rewards WHERE user_id = ?').get(req.user.id);
  let discount = 0;
  if (userRewards && userRewards.tier === 'silver') discount = subtotal * 0.02;
  else if (userRewards && userRewards.tier === 'gold') discount = subtotal * 0.03;
  else if (userRewards && userRewards.tier === 'platinum') discount = subtotal * 0.05;
  
  const discountedSubtotal = Math.max(0, subtotal - discount);
  const tax = +(discountedSubtotal * 0.0825).toFixed(2);
  const total = +(discountedSubtotal + tax).toFixed(2);

  res.json({ 
    items, 
    subtotal: +subtotal.toFixed(2), 
    discount: +discount.toFixed(2),
    tier: userRewards ? userRewards.tier : 'member',
    tax, 
    total,
    itemCount: items.reduce((s, i) => s + i.quantity, 0),
    points: userRewards ? userRewards.points : 0
  });
});

// Add to cart
router.post('/', authenticate, (req, res) => {
  const { menuItemId, quantity = 1, modifiers = [], specialInstructions = '' } = req.body;
  if (!menuItemId) return res.status(400).json({ error: 'menuItemId is required' });

  const db = getDb();
  const menuItem = db.prepare('SELECT * FROM menu_items WHERE id = ? AND available = 1').get(menuItemId);
  if (!menuItem) return res.status(404).json({ error: 'Menu item not found or unavailable' });

  const modsStr = JSON.stringify(modifiers);
  
  const existingItem = db.prepare(
    `SELECT * FROM cart_items WHERE user_id = ? AND menu_item_id = ? AND modifiers = ? AND special_instructions = ?`
  ).get(req.user.id, menuItemId, modsStr, specialInstructions);

  if (existingItem) {
    const newQuantity = existingItem.quantity + quantity;
    db.prepare(`UPDATE cart_items SET quantity = ? WHERE id = ?`).run(newQuantity, existingItem.id);
    return res.status(200).json({ id: existingItem.id, message: 'Added to cart', totalQuantity: newQuantity });
  }

  const result = db.prepare(
    `INSERT INTO cart_items (user_id, menu_item_id, quantity, modifiers, special_instructions) VALUES (?, ?, ?, ?, ?)`
  ).run(req.user.id, menuItemId, quantity, modsStr, specialInstructions);

  res.status(201).json({ id: result.lastInsertRowid, message: 'Added to cart', totalQuantity: quantity });
});

// Update cart item quantity
router.put('/:id', authenticate, (req, res) => {
  const { quantity } = req.body;
  const db = getDb();

  if (quantity <= 0) {
    db.prepare('DELETE FROM cart_items WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
    return res.json({ message: 'Item removed from cart' });
  }

  db.prepare('UPDATE cart_items SET quantity = ? WHERE id = ? AND user_id = ?').run(quantity, req.params.id, req.user.id);
  res.json({ message: 'Cart updated' });
});

// Update cart item modifiers
router.put('/:id/modifiers', authenticate, (req, res) => {
  try {
    const { modifiers, quantityToUpdate } = req.body;
    const db = getDb();
    
    const item = db.prepare('SELECT * FROM cart_items WHERE id = ? AND user_id = ?').get(Number(req.params.id), req.user.id);
    if (!item) return res.status(404).json({ error: 'Cart item not found' });
    
    const qty = Math.min(quantityToUpdate || item.quantity, item.quantity);
    if (qty <= 0) return res.status(400).json({ error: 'Invalid quantity' });

    const modsStr = JSON.stringify(modifiers);

    if (qty === item.quantity) {
      const existing = db.prepare('SELECT * FROM cart_items WHERE user_id = ? AND menu_item_id = ? AND modifiers = ? AND id != ? AND special_instructions = ?').get(req.user.id, item.menu_item_id, modsStr, item.id, item.special_instructions);
      if (existing) {
        db.prepare('UPDATE cart_items SET quantity = quantity + ? WHERE id = ?').run(qty, existing.id);
        db.prepare('DELETE FROM cart_items WHERE id = ?').run(item.id);
      } else {
        db.prepare('UPDATE cart_items SET modifiers = ? WHERE id = ?').run(modsStr, item.id);
      }
    } else {
      let remainderModsStr = item.modifiers;
      if (modsStr === item.modifiers) {
        try {
          const parsed = JSON.parse(item.modifiers || '[]');
          const rewardMod = parsed.find(m => m.points_cost);
          remainderModsStr = rewardMod ? JSON.stringify([rewardMod]) : '[]';
        } catch(e) {
          remainderModsStr = '[]';
        }
      }

      const remainderQty = item.quantity - qty;
      db.prepare('DELETE FROM cart_items WHERE id = ?').run(item.id);

      const existing1 = db.prepare('SELECT * FROM cart_items WHERE user_id = ? AND menu_item_id = ? AND modifiers = ? AND special_instructions = ?').get(req.user.id, item.menu_item_id, modsStr, item.special_instructions);
      if (existing1) {
        db.prepare('UPDATE cart_items SET quantity = quantity + ? WHERE id = ?').run(qty, existing1.id);
      } else {
        db.prepare(
          `INSERT INTO cart_items (user_id, menu_item_id, quantity, modifiers, special_instructions) VALUES (?, ?, ?, ?, ?)`
        ).run(req.user.id, item.menu_item_id, qty, modsStr, item.special_instructions);
      }

      if (remainderQty > 0) {
        const existing2 = db.prepare('SELECT * FROM cart_items WHERE user_id = ? AND menu_item_id = ? AND modifiers = ? AND special_instructions = ?').get(req.user.id, item.menu_item_id, remainderModsStr, item.special_instructions);
        if (existing2) {
          db.prepare('UPDATE cart_items SET quantity = quantity + ? WHERE id = ?').run(remainderQty, existing2.id);
        } else {
          db.prepare(
            `INSERT INTO cart_items (user_id, menu_item_id, quantity, modifiers, special_instructions) VALUES (?, ?, ?, ?, ?)`
          ).run(req.user.id, item.menu_item_id, remainderQty, remainderModsStr, item.special_instructions);
        }
      }
    }
    
    res.json({ message: 'Modifiers updated' });
  } catch (err) {
    console.error('Cart modifier update error:', err);
    res.status(500).json({ error: err.message || 'Failed to update modifiers' });
  }
});

// Remove item from cart
router.delete('/:id', authenticate, (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM cart_items WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  res.json({ message: 'Item removed' });
});

// Clear entire cart
router.delete('/', authenticate, (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM cart_items WHERE user_id = ?').run(req.user.id);
  res.json({ message: 'Cart cleared' });
});

module.exports = router;
