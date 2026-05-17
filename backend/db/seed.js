const { initializeDb, getDb, closeDb } = require('./database');
const bcrypt = require('bcryptjs');

function seed() {
  const db = initializeDb();

  // Clear existing data
  db.exec(`
    DELETE FROM chat_messages;
    DELETE FROM chat_sessions;
    DELETE FROM promotions;
    DELETE FROM rewards;
    DELETE FROM order_items;
    DELETE FROM orders;
    DELETE FROM cart_items;
    DELETE FROM item_modifiers;
    DELETE FROM menu_items;
    DELETE FROM categories;
    DELETE FROM payment_methods;
    DELETE FROM users;
  `);

  // --- Demo user ---
  const passwordHash = bcrypt.hashSync('password123', 10);
  const insertUser = db.prepare(
    `INSERT INTO users (email, password_hash, name, avatar_url, default_address) VALUES (?, ?, ?, ?, ?)`
  );
  const userResult = insertUser.run('demo@chickfilb.com', passwordHash, 'Jordan Smith', null, '123 Chick-fil-B Way, Atlanta, GA 30303');
  const userId = userResult.lastInsertRowid;

  // --- Payment method ---
  db.prepare(
    `INSERT INTO payment_methods (user_id, card_type, last_four, card_holder, expiry_month, expiry_year, is_default)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(userId, 'visa', '4242', 'Jordan Smith', 12, 2028, 1);

  // --- Rewards ---
  db.prepare(
    `INSERT INTO rewards (user_id, points, tier, total_points_earned) VALUES (?, ?, ?, ?)`
  ).run(userId, 1250, 'silver', 1250);

  // --- New User (No defaults) ---
  const newUserResult = insertUser.run('newuser@chickfilb.com', passwordHash, 'Alex New', null, null);
  db.prepare(
    `INSERT INTO rewards (user_id, points, tier, total_points_earned) VALUES (?, ?, ?, ?)`
  ).run(newUserResult.lastInsertRowid, 0, 'member', 0);

  // --- Categories ---
  const insertCategory = db.prepare(
    `INSERT INTO categories (name, slug, image_url, display_order) VALUES (?, ?, ?, ?)`
  );

  const categories = [
    { name: 'Chicken Entrees', slug: 'chicken-entrees', order: 1 },
    { name: 'Meals', slug: 'meals', order: 2 },
    { name: 'Sides', slug: 'sides', order: 3 },
    { name: 'Salads', slug: 'salads', order: 4 },
    { name: 'Kid\'s Meals', slug: 'kids-meals', order: 5 },
    { name: 'Treats', slug: 'treats', order: 6 },
    { name: 'Beverages', slug: 'beverages', order: 7 },
    { name: 'Breakfast', slug: 'breakfast', order: 8 },
    { name: 'Sauces', slug: 'sauces', order: 9 },
  ];

  const categoryIds = {};
  for (const cat of categories) {
    const r = insertCategory.run(cat.name, cat.slug, null, cat.order);
    categoryIds[cat.slug] = r.lastInsertRowid;
  }

  // --- Menu items ---
  const insertItem = db.prepare(`
    INSERT INTO menu_items
      (category_id, name, description, price, calories, image_url, is_featured, is_seasonal, is_new, is_healthier, tags, redeem_points)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const items = [
    // Chicken Entrees
    { cat: 'chicken-entrees', name: 'Chicken Sandwich', desc: 'A boneless breast of chicken seasoned to perfection, hand-breaded, pressure cooked in 100% refined peanut oil and served on a toasted, buttered bun with dill pickle chips.', price: 5.49, cal: 440, featured: 1, points: 350 , img: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBrH5cTm9fm6tMkZo1wDjH6V5BAXTDIj3o7tiHzDJjGD1a_JDFT9FkBZND0-k05Vv9VlL3-8TUncG06T-69Q82WQpO73XingwNJdpvUA7J31vpxLc5-w1EVpLA4PVj4a2Beyd0WRdUOIZlQrgcu_Arh8f1qLN8UUWwa5gCC0GvSgrfn1OyGqin7QK3RnIfoSCFgATwAwdag7X0sEr5SEmC2IA5BSvsb2Q9ztfUZyLBN_eksjUoF0NiDSE4anJY6tacBZHWRVe_aNXU' },
    { cat: 'chicken-entrees', name: 'Deluxe Chicken Sandwich', desc: 'A boneless breast of chicken with Green Leaf lettuce, tomato, and American cheese on a toasted, buttered bun.', price: 6.29, cal: 500, featured: 1, points: 450, img: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBrH5cTm9fm6tMkZo1wDjH6V5BAXTDIj3o7tiHzDJjGD1a_JDFT9FkBZND0-k05Vv9VlL3-8TUncG06T-69Q82WQpO73XingwNJdpvUA7J31vpxLc5-w1EVpLA4PVj4a2Beyd0WRdUOIZlQrgcu_Arh8f1qLN8UUWwa5gCC0GvSgrfn1OyGqin7QK3RnIfoSCFgATwAwdag7X0sEr5SEmC2IA5BSvsb2Q9ztfUZyLBN_eksjUoF0NiDSE4anJY6tacBZHWRVe_aNXU' },
    { cat: 'chicken-entrees', name: 'Spicy Chicken Sandwich', desc: 'A boneless breast of chicken seasoned with a spicy blend of peppers, hand-breaded, pressure cooked and served on a toasted, buttered bun with dill pickle chips.', price: 5.89, cal: 460, featured: 1, points: 400 , img: 'https://lh3.googleusercontent.com/aida-public/AB6AXuC25IKBb-jf40pQclPcZyB4aS9vs2gkr47KhKOUhy0vT8YR8GuaOZuk1iIR9yLOFji0s3mFD-YdxarIXcT7YjjzfRRbk-cv3DWmxXjjzTEZKxBjw6RHJNjGLFRB6Bkp862sgPgNR9JhTHZgiVdlLPRGTiVe1dZ9v4rGTBEXnbRuzvhCnwKL0iH3cxt3LT2aupjomo0nVJjMvZCMiqXCzDeooKT0PgG13BhCwzSyTbXOH5GYgsZm3NWS-kF4GsxcvnkHn3Ku1rTUyVw' },
    { cat: 'chicken-entrees', name: 'Spicy Deluxe Sandwich', desc: 'A boneless breast of chicken seasoned with a spicy blend of peppers, hand-breaded, with lettuce, tomato, pepper jack cheese on a toasted, buttered bun.', price: 6.69, cal: 540, featured: 0, points: 450, img: 'https://lh3.googleusercontent.com/aida-public/AB6AXuC25IKBb-jf40pQclPcZyB4aS9vs2gkr47KhKOUhy0vT8YR8GuaOZuk1iIR9yLOFji0s3mFD-YdxarIXcT7YjjzfRRbk-cv3DWmxXjjzTEZKxBjw6RHJNjGLFRB6Bkp862sgPgNR9JhTHZgiVdlLPRGTiVe1dZ9v4rGTBEXnbRuzvhCnwKL0iH3cxt3LT2aupjomo0nVJjMvZCMiqXCzDeooKT0PgG13BhCwzSyTbXOH5GYgsZm3NWS-kF4GsxcvnkHn3Ku1rTUyVw' },
    { cat: 'chicken-entrees', name: 'Grilled Chicken Sandwich', desc: 'A lemon-herb marinated boneless breast of chicken, grilled for a pointed, juicy flavor, served on a toasted multigrain brioche bun.', price: 6.89, cal: 390, healthier: 1, points: 450 , img: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDUJI6wigUdiGUIg1-PjVBG-8RzCaYiNtqlt1hMPO6uncacunjZFzsO7EFOMRq9oEDTqg_oHFNC0qZR4GgHCNq5qCnE04BTyGARxe7GXoQL1-46PYwemqoIxDQoa9fOEsffFCHSpRbXfNpI_3ihUNkx_gaP4XTjjR00fZuwq_98kc4BAaiIbqypTisC9PkBgbTauuDqpt2vOMoInnQG4Sq7Kwp2OsNjVA5HUbM-nYp_d8u6-DXpOM4pXFRw0x9zOMf3xmOoI9flCwg' },
    { cat: 'chicken-entrees', name: 'Chicken Nuggets (8-ct)', desc: 'Bite-sized pieces of tender all breast meat chicken, seasoned to perfection, freshly breaded and pressure cooked.', price: 4.65, cal: 250, featured: 1, points: 300, img: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBhzsFaph9lM15W5t38wNs0PxmXT13nXVslCtEJ5oHtwcY_2WAqaJH4E5wndE1tHLBYb02MQB05H3xLNWd9U44CiJtRZzlboFsEXtAW9rfds5D2_XLpIjkT1KXm96mfnNAX5x_R-qv1v-B8xlKBzISytm0xE4Osc78-0ZtVIQJvbOHsJBgY5ocZwLAAggO9pg9wzt28XVPgfBFih1mZSzEORgup211m-LR0GG6CuzvYrKXtwdc4eu6BnCQmzOPxi1Vp61Iveqtvk6U' },
    { cat: 'chicken-entrees', name: 'Chicken Nuggets (12-ct)', desc: 'Bite-sized pieces of tender all breast meat chicken, seasoned to perfection, freshly breaded and pressure cooked.', price: 6.39, cal: 380, points: 450, img: '/images/chicken_nuggets_12ct_1778966154345.png' },
    { cat: 'chicken-entrees', name: 'Grilled Nuggets (8-ct)', desc: 'Bite-sized pieces of boneless chicken breast, marinated in a special blend of seasonings and grilled.', price: 5.25, cal: 130, healthier: 1, points: 350, img: '/images/grilled_nuggets_1778965252700.png' },
    { cat: 'chicken-entrees', name: 'Chicken Strips (3-ct)', desc: 'Freshly prepared hand-breaded chicken tenders.', price: 5.29, cal: 310, points: 350, img: '/images/chicken_strips_1778965264518.png' },
    { cat: 'chicken-entrees', name: 'Chicken Wrap', desc: 'Sliced grilled or breaded chicken nuggets with Green Leaf lettuce rolled in a warm flaxseed flour flat bread.', price: 7.19, cal: 350, isNew: 1, points: 450, img: '/images/chicken_wrap_1778965274370.png' },

    // Meals
    { cat: 'meals', name: 'Chicken Sandwich Meal', desc: 'Chicken Sandwich with a medium Waffle Fry and a medium drink.', price: 9.19, cal: 1000, points: 900 , img: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBrH5cTm9fm6tMkZo1wDjH6V5BAXTDIj3o7tiHzDJjGD1a_JDFT9FkBZND0-k05Vv9VlL3-8TUncG06T-69Q82WQpO73XingwNJdpvUA7J31vpxLc5-w1EVpLA4PVj4a2Beyd0WRdUOIZlQrgcu_Arh8f1qLN8UUWwa5gCC0GvSgrfn1OyGqin7QK3RnIfoSCFgATwAwdag7X0sEr5SEmC2IA5BSvsb2Q9ztfUZyLBN_eksjUoF0NiDSE4anJY6tacBZHWRVe_aNXU' },
    { cat: 'meals', name: 'Spicy Sandwich Meal', desc: 'Spicy Chicken Sandwich with a medium Waffle Fry and a medium drink.', price: 9.59, cal: 1020, points: 1000 , img: 'https://lh3.googleusercontent.com/aida-public/AB6AXuA3njj7irXriVIeS0k5wro_te6sRf1ZycSwO3_BzC61dlOlVHVDXRjSvEMPszzWkVhdCUMX4OOgBSdMV9TR-9qACy-5p4kc-9huFgm4miS9lFzSKTkxNV4US_U3OYK3yBM72dzW6fps41enKthcb9BE23u1TyE9OEKhZN44utXGXP6jbikajz94QdGI9jSza3dBDnttOOL3eBJ-c7pXbfFhftt_icSdRhWBrHVH32uOn8ne-amPDD5C191IfLUlVj9aIND7MdayvI4' },
    { cat: 'meals', name: 'Nuggets Meal (8-ct)', desc: 'Chicken Nuggets (8-ct) with a medium Waffle Fry and a medium drink.', price: 8.35, cal: 810, points: 1500 },
    { cat: 'meals', name: 'Grilled Sandwich Meal', desc: 'Grilled Chicken Sandwich with a medium side and a medium drink.', price: 10.59, cal: 870, healthier: 1, points: 2000 , img: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDUJI6wigUdiGUIg1-PjVBG-8RzCaYiNtqlt1hMPO6uncacunjZFzsO7EFOMRq9oEDTqg_oHFNC0qZR4GgHCNq5qCnE04BTyGARxe7GXoQL1-46PYwemqoIxDQoa9fOEsffFCHSpRbXfNpI_3ihUNkx_gaP4XTjjR00fZuwq_98kc4BAaiIbqypTisC9PkBgbTauuDqpt2vOMoInnQG4Sq7Kwp2OsNjVA5HUbM-nYp_d8u6-DXpOM4pXFRw0x9zOMf3xmOoI9flCwg' },
    { cat: 'meals', name: 'Strips Meal (3-ct)', desc: 'Chicken Strips with a medium Waffle Fry and a medium drink.', price: 8.99, cal: 870, points: 1200 },

    // Sides
    { cat: 'sides', name: 'Waffle Potato Fries (Medium)', desc: 'Waffle-shaped potatoes cooked in canola oil until crispy outside and tender inside.', price: 2.35, cal: 420, featured: 1, points: 150 },
    { cat: 'sides', name: 'Waffle Potato Fries (Large)', desc: 'Waffle-shaped potatoes cooked in canola oil until crispy outside and tender inside.', price: 2.89, cal: 560, points: 200 },
    { cat: 'sides', name: 'Mac & Cheese', desc: 'A classic creamy mac and cheese recipe made with real cheddar, parmesan, and romano cheeses.', price: 3.65, cal: 450, featured: 1, points: 250 , img: '/images/mac_and_cheese_1778964749629.png' },
    { cat: 'sides', name: 'Chicken Noodle Soup', desc: 'Shredded chicken breast with egg noodles and veggies in a hearty broth.', price: 3.95, cal: 170, seasonal: 1, points: 250 },
    { cat: 'sides', name: 'Fruit Cup', desc: 'A nutritious fruit mix made with mandarin orange segments, strawberries, and blueberries.', price: 3.25, cal: 60, healthier: 1, points: 200 },
    { cat: 'sides', name: 'Side Salad', desc: 'Fresh mixed greens topped with a blend of red cabbage and carrots.', price: 3.89, cal: 160, healthier: 1, points: 200 },
    { cat: 'sides', name: 'Kale Crunch Side', desc: 'Curly kale and green cabbage tossed with an apple cider and dijon mustard vinaigrette.', price: 2.65, cal: 120, healthier: 1, isNew: 1, points: 150 },
    { cat: 'sides', name: 'Greek Yogurt Parfait', desc: 'Vanilla bean Greek yogurt with fresh berries and granola.', price: 4.29, cal: 270, healthier: 1, points: 250 },

    // Salads
    { cat: 'salads', name: 'Cobb Salad', desc: 'Chick-fil-B nuggets or grilled filet on mixed greens with roasted corn, bacon, cheese, tomatoes, and hard-boiled egg.', price: 9.49, cal: 530, healthier: 1, points: 600 },
    { cat: 'salads', name: 'Market Salad', desc: 'Sliced grilled chicken on mixed greens with blue cheese, strawberries, apples, and blueberries topped with harvest nut granola.', price: 9.49, cal: 340, healthier: 1, points: 600 , img: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDnXg9jbp830MBERilEbqftnyUmUg-Xz9B5ijJIN5yZ4TVBZ98TbQNN7IYyrUL2QfMYaNYW1-lqXsHTdv8oqtg4iEwyHWUlfATIOYf8ZdO69BqwVl_Qs8gvPRNMbPgHpZ6KShIZAq3g47Ghr0XdVVyB-Yb8dBjNYlwI2T0CVdTgiIrPT4gpjqtfOM_cUCaJcOUJZRU-YwWlDh-4dgJnuUzFL8IuH-0FgOo_gqj4p_C4Tf5VS6CFiwYDG7x4jw_h-raji9DwVAC_JFA' },
    { cat: 'salads', name: 'Spicy Southwest Salad', desc: 'Sliced spicy chicken breast on mixed greens with roasted corn, black beans, peppers, tomatoes, and tortilla strips.', price: 9.49, cal: 450, featured: 1, points: 600 },

    // Kids Meals
    { cat: 'kids-meals', name: "Kid's Nuggets Meal (5-ct)", desc: '5 Chicken Nuggets with a kid-sized side, drink, and a prize.', price: 5.39, cal: 220, img: '/images/kids_nuggets_5ct_1778966166270.png' },
    { cat: 'kids-meals', name: "Kid's Strips Meal (1-ct)", desc: '1 Chicken Strip with a kid-sized side, drink, and a prize.', price: 5.39, cal: 130, img: '/images/kids_strips_1ct_1778966177751.png' },
    { cat: 'kids-meals', name: "Kid's Grilled Nuggets Meal", desc: 'Grilled Nuggets with a kid-sized side, drink, and a prize.', price: 5.39, cal: 100, healthier: 1 },

    // Treats
    { cat: 'treats', name: 'Chocolate Milkshake', desc: 'Hand-spun the old-fashioned way with our signature Icedream dessert and chocolate syrup.', price: 4.49, cal: 580, featured: 1, points: 300 , img: '/images/chocolate_milkshake_1778964790087.png' },
    { cat: 'treats', name: 'Vanilla Milkshake', desc: 'Hand-spun the old-fashioned way with our signature Icedream dessert.', price: 4.49, cal: 580, points: 300 },
    { cat: 'treats', name: 'Strawberry Milkshake', desc: 'Hand-spun with our signature Icedream dessert and real strawberries.', price: 4.49, cal: 580, points: 300 },
    { cat: 'treats', name: 'Cookies & Cream Milkshake', desc: 'Hand-spun with our signature Icedream dessert and chunks of cookies.', price: 4.89, cal: 630, isNew: 1, points: 350 },
    { cat: 'treats', name: 'Frosted Lemonade', desc: 'Our classic Chick-fil-B Lemonade blended with our signature Icedream dessert.', price: 4.29, cal: 340, featured: 1, points: 250 },
    { cat: 'treats', name: 'Chocolate Chunk Cookie', desc: 'Cookies have both semi-sweet dark and milk chocolate chunks, along with wholesome oats.', price: 1.89, cal: 370, points: 100 },
    { cat: 'treats', name: 'Icedream Cone', desc: 'Delicious soft serve with an old-fashioned taste.', price: 1.65, cal: 180, points: 100 },

    // Beverages
    { cat: 'beverages', name: 'Chick-fil-B Lemonade (Medium)', desc: 'Freshly prepared each day from a simple recipe: real lemon juice, sugar, and water.', price: 2.39, cal: 220, featured: 1, points: 150 },
    { cat: 'beverages', name: 'Diet Lemonade (Medium)', desc: 'Freshly prepared each day with a mix of real lemon juice, water, and Splenda.', price: 2.39, cal: 30, healthier: 1, points: 150 },
    { cat: 'beverages', name: 'Iced Coffee', desc: 'Cold-brewed and served with your choice of a vanilla or original coffee flavor sweetened with pure cane sugar.', price: 3.29, cal: 200, points: 200 , img: '/images/iced_coffee_1778964761370.png' },
    { cat: 'beverages', name: 'Sweet Tea (Medium)', desc: 'Freshly brewed each day from a blend of tea leaves.', price: 1.85, cal: 120, points: 100 },
    { cat: 'beverages', name: 'Unsweetened Tea (Medium)', desc: 'Freshly brewed each day from a blend of tea leaves.', price: 1.85, cal: 0, healthier: 1, points: 100 },
    { cat: 'beverages', name: 'Soft Drink (Medium)', desc: 'Coca-Cola, Diet Coke, Sprite, Dr Pepper, or other fountain beverages.', price: 1.85, cal: 140, points: 100 },
    { cat: 'beverages', name: 'Bottled Water', desc: 'Dasani bottled water.', price: 1.85, cal: 0, healthier: 1, points: 50 },

    // Breakfast
    { cat: 'breakfast', name: 'Chicken Biscuit', desc: 'A breakfast portion of our famous boneless breast of chicken, seasoned and breaded, served on a warm, fresh-baked buttermilk biscuit.', price: 4.19, cal: 450, featured: 1, points: 250 , img: '/images/chicken_biscuit_1778964776967.png' },
    { cat: 'breakfast', name: 'Spicy Chicken Biscuit', desc: 'A breakfast portion of our spicy boneless breast of chicken on a warm, fresh-baked buttermilk biscuit.', price: 4.49, cal: 460, points: 250 },
    { cat: 'breakfast', name: 'Chicken, Egg & Cheese Biscuit', desc: 'Chicken, a folded egg, and American cheese on a biscuit baked fresh at each restaurant.', price: 5.39, cal: 500, points: 350 },
    { cat: 'breakfast', name: 'Egg White Grill', desc: 'Grilled chicken with egg whites and American cheese on a toasted multi-grain English muffin.', price: 5.29, cal: 300, healthier: 1, points: 350 },
    { cat: 'breakfast', name: 'Hash Brown Scramble Burrito', desc: 'Sliced nuggets with scrambled eggs and hash browns in a warm flour tortilla.', price: 4.89, cal: 680, isNew: 1, points: 300 },
    { cat: 'breakfast', name: 'Hash Browns', desc: 'Crispy potato hash browns.', price: 1.49, cal: 270, points: 100 },
    { cat: 'breakfast', name: 'Chick-n-Minis (4-ct)', desc: 'Bite-sized chicken nestled in warm mini yeast rolls that are lightly coated in honey butter spread.', price: 4.59, cal: 360, featured: 1, points: 300, img: '/images/chick_n_minis_4ct_1778966236182.png' },

    // Sauces
    { cat: 'sauces', name: 'Chick-fil-B Sauce', desc: 'Our signature sauce: a sweet and tangy blend of honey mustard and barbecue.', price: 0.00, cal: 140, img: '/images/chick_fil_b_sauce_1778966189337.png' },
    { cat: 'sauces', name: 'Polynesian Sauce', desc: 'Sweet and sour with a slight kick.', price: 0.00, cal: 110, img: '/images/polynesian_sauce_1778966223875.png' },
    { cat: 'sauces', name: 'Garden Herb Ranch', desc: 'Creamy buttermilk ranch with savory herbs.', price: 0.00, cal: 140, img: '/images/ranch_sauce_1778966214144.png' },
    { cat: 'sauces', name: 'Honey Mustard', desc: 'A sweet and zesty classic blend.', price: 0.00, cal: 150 },
    { cat: 'sauces', name: 'Barbeque Sauce', desc: 'Smoky and sweet with a hint of tang.', price: 0.00, cal: 45, img: '/images/barbeque_sauce_1778966201456.png' },
    { cat: 'sauces', name: 'Sriracha Sauce', desc: 'A spicy, sweet and garlicky chili sauce.', price: 0.00, cal: 45, isNew: 1 },
  ];

  for (const item of items) {
    insertItem.run(
      categoryIds[item.cat],
      item.name,
      item.desc,
      item.price,
      item.cal,
      item.img || null,
      item.featured || 0,
      item.seasonal || 0,
      item.isNew || 0,
      item.healthier || 0,
      JSON.stringify(item.tags || []),
      item.points || 0
    );
  }

  // --- Promotions ---
  const insertPromo = db.prepare(
    `INSERT INTO promotions (title, description, discount_type, discount_value, min_order_amount, code, active)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  insertPromo.run('Welcome Offer', 'Get 15% off your first order!', 'percent', 15, 0, 'WELCOME15', 1);
  insertPromo.run('Free Fries Friday', 'Free medium Waffle Fries with any entree purchase on Fridays.', 'free_item', 0, 5.00, 'FRYFRIDAY', 1);
  insertPromo.run('$3 Off $15+', 'Save $3 when you spend $15 or more.', 'fixed', 3, 15, 'SAVE3', 1);

  console.log('🌱 Database seeded successfully!');
  console.log(`   👤 Demo user: demo@chickfilb.com / password123`);
  console.log(`   📦 ${items.length} menu items across ${categories.length} categories`);
  console.log(`   🎉 3 promotions`);

  closeDb();
}

seed();
