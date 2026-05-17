const { getDb } = require('./database');
const db = getDb();

const sandwiches = db.prepare("SELECT id, name FROM menu_items WHERE name LIKE '%Sandwich%'").all();

const modifiers = [
  { name: 'No Pickle', type: 'preference', price: 0 },
  { name: 'No Lettuce', type: 'preference', price: 0 },
  { name: 'No Tomato', type: 'preference', price: 0 },
  { name: 'Extra Pickle', type: 'preference', price: 0 },
  { name: 'Extra Lettuce', type: 'preference', price: 0 },
  { name: 'Extra Tomato', type: 'preference', price: 0 },
  { name: 'Extra Spicy', type: 'preference', price: 0 }
];

const insertMod = db.prepare("INSERT INTO item_modifiers (menu_item_id, name, modifier_type, price_modifier) VALUES (?, ?, ?, ?)");

let count = 0;
for (const s of sandwiches) {
  for (const m of modifiers) {
    insertMod.run(s.id, m.name, m.type, m.price);
    count++;
  }
}

console.log(`Added ${count} modifiers to ${sandwiches.length} sandwiches.`);
