const express = require('express');
const { getDb } = require('../db/database');

const router = express.Router();

// Get all categories
router.get('/categories', (req, res) => {
  const db = getDb();
  const categories = db.prepare('SELECT * FROM categories ORDER BY display_order').all();
  res.json(categories);
});

// Get all menu items (with optional category filter)
router.get('/', (req, res) => {
  const db = getDb();
  const { category, featured, search } = req.query;

  let query = `
    SELECT mi.*, c.name as category_name, c.slug as category_slug
    FROM menu_items mi
    JOIN categories c ON mi.category_id = c.id
    WHERE mi.available = 1
  `;
  const params = [];

  if (category) {
    query += ' AND c.slug = ?';
    params.push(category);
  }
  if (featured === 'true') {
    query += ' AND mi.is_featured = 1';
  }
  if (search) {
    let searchMapped = search;
    const lowerSearch = search.toLowerCase();
    if (lowerSearch.includes('drink') || lowerSearch.includes('drinks')) {
      searchMapped = 'beverage';
    }
    
    query += ' AND (mi.name LIKE ? OR mi.description LIKE ? OR c.name LIKE ? OR c.name LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${searchMapped}%`);
  }

  query += ' ORDER BY c.display_order, mi.name';

  const items = db.prepare(query).all(...params);
  res.json(items);
});

// Get single item with modifiers
router.get('/:id', (req, res) => {
  const db = getDb();
  const item = db.prepare(`
    SELECT mi.*, c.name as category_name, c.slug as category_slug
    FROM menu_items mi
    JOIN categories c ON mi.category_id = c.id
    WHERE mi.id = ?
  `).get(req.params.id);

  if (!item) return res.status(404).json({ error: 'Item not found' });

  const modifiers = db.prepare('SELECT * FROM item_modifiers WHERE menu_item_id = ?').all(item.id);
  res.json({ ...item, modifiers });
});

module.exports = router;
