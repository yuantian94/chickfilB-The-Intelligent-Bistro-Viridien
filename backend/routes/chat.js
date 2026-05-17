const express = require('express');
const { getDb } = require('../db/database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// --- AI Chat (uses OpenAI if available, falls back to rule-based) ---
let OpenAI;
try {
  OpenAI = require('openai');
} catch (e) {
  // openai not installed
}

function getAvailablePoints(db, userId) {
  const rewards = db.prepare('SELECT points FROM rewards WHERE user_id = ?').get(userId);
  if (!rewards) return 0;
  
  const cartItems = db.prepare('SELECT modifiers, quantity FROM cart_items WHERE user_id = ?').all(userId);
  let cartPointsUsed = 0;
  cartItems.forEach(ci => {
    try {
      const mods = JSON.parse(ci.modifiers || '[]');
      mods.forEach(m => {
        if (m.points_cost) cartPointsUsed += (m.points_cost * ci.quantity);
      });
    } catch(e) {}
  });
  return rewards.points - cartPointsUsed;
}

function getMenuContext(db, availablePoints) {
  const items = db.prepare(`
    SELECT mi.name, mi.price, mi.calories, mi.description, mi.redeem_points, c.name as category
    FROM menu_items mi
    JOIN categories c ON mi.category_id = c.id
    WHERE mi.available = 1
    ORDER BY c.display_order, mi.name
  `).all();
  return items.map(i => {
    let affordPrefix = '';
    let ptsStr = '';
    if (i.redeem_points > 0) {
      const maxRedeem = Math.floor(availablePoints / i.redeem_points);
      affordPrefix = `[Can afford: ${maxRedeem}] `;
      ptsStr = `, ${i.redeem_points} pts`;
    }
    return `${affordPrefix}${i.name} ($${i.price.toFixed(2)}, ${i.calories} cal${ptsStr}) - ${i.category}: ${i.description}`;
  }).join('\n');
}

function getCartContext(db, userId) {
  const items = db.prepare(`
    SELECT ci.id, ci.quantity, ci.modifiers, mi.name
    FROM cart_items ci
    JOIN menu_items mi ON ci.menu_item_id = mi.id
    WHERE ci.user_id = ?
  `).all(userId);
  if (items.length === 0) return "The user's cart is currently empty.";
  
  return "The user's current cart:\n" + items.map(i => {
    let mods = '';
    try {
      const parsed = JSON.parse(i.modifiers);
      if (parsed.length > 0) mods = ` (Modifiers: ${parsed.map(m => m.name).join(', ')})`;
    } catch(e) {}
    return `- [ID: ${i.id}] ${i.quantity}x ${i.name}${mods}`;
  }).join('\n');
}

function getUserContext(db, userId, availablePoints) {
  const user = db.prepare('SELECT name, email FROM users WHERE id = ?').get(userId);
  const rewards = db.prepare('SELECT points, tier FROM rewards WHERE user_id = ?').get(userId);
  
  if (!user) return "User info not available.";
  
  let info = `The user's name is ${user.name.split(' ')[0]}. `;
  if (rewards) {
    info += `They are a ${rewards.tier.charAt(0).toUpperCase() + rewards.tier.slice(1)} member with ${rewards.points} total reward points. However, they currently have items in their cart reserving ${rewards.points - availablePoints} points. Therefore, their TRUE AVAILABLE BALANCE right now is exactly ${availablePoints} points. Base all affordability calculations solely on this available balance. `;
  } else {
    info += `They do not have a rewards account yet. `;
  }
  
  // Fetch favorite order
  const favoriteOrder = db.prepare('SELECT id, created_at FROM orders WHERE user_id = ? AND is_favorite = 1').get(userId);
  if (favoriteOrder) {
    info += `\n\nFavorite Order:\n`;
    const items = db.prepare('SELECT name, quantity, modifiers FROM order_items WHERE order_id = ?').all(favoriteOrder.id);
    info += `- Order #${favoriteOrder.id}: `;
    const itemsStr = items.map(i => {
      let mods = '';
      let isReward = false;
      try {
        const parsed = JSON.parse(i.modifiers || '[]');
        if (parsed.find(m => m.name === 'Reward Redemption')) isReward = true;
        const filtered = parsed.filter(m => m.name !== 'Reward Redemption');
        if (filtered.length > 0) mods = ' (with ' + filtered.map(m => m.name).join(', ') + ')';
      } catch(e) {}
      let rewardTag = isReward ? ' [previously redeemed with points]' : '';
      return `${i.quantity}x ${i.name}${mods}${rewardTag}`;
    }).join(', ');
    info += itemsStr + '\n';

    // Calculate if user can afford the reward items in the favorite order
    let totalFavoritePointsNeeded = 0;
    const favoriteRewardItems = [];
    items.forEach(i => {
      try {
        const parsed = JSON.parse(i.modifiers || '[]');
        if (parsed.find(m => m.name === 'Reward Redemption')) {
          const menuItem = db.prepare('SELECT redeem_points FROM menu_items WHERE name = ?').get(i.name);
          if (menuItem && menuItem.redeem_points) {
            totalFavoritePointsNeeded += (menuItem.redeem_points * i.quantity);
            favoriteRewardItems.push(`${i.quantity}x ${i.name}`);
          }
        }
      } catch(e) {}
    });

    if (favoriteRewardItems.length > 0) {
      const cartItems = db.prepare('SELECT modifiers, quantity FROM cart_items WHERE user_id = ?').all(userId);
      let cartPointsUsed = 0;
      cartItems.forEach(ci => {
        try {
          const mods = JSON.parse(ci.modifiers || '[]');
          mods.forEach(m => {
            if (m.points_cost) cartPointsUsed += (m.points_cost * ci.quantity);
          });
        } catch(e) {}
      });
      const availablePoints = (rewards ? rewards.points : 0) - cartPointsUsed;
      
      info += `\n(SYSTEM CALCULATION: The reward items in this favorite order (${favoriteRewardItems.join(', ')}) cost ${totalFavoritePointsNeeded} points. The user has ${availablePoints} available points right now. `;
      if (availablePoints >= totalFavoritePointsNeeded) {
        info += `Result: YES, the user CAN afford to redeem all of them. Use the redeem_item_with_points tool for these items!)\n`;
      } else {
        info += `Result: NO, the user CANNOT afford to redeem all of them. You MUST fallback to adding some/all of them as regular items using add_to_cart. EXTREMELY IMPORTANT: You MUST explicitly list out EVERY single item you added in your chat response, AND you MUST append this EXACT sentence to the END of your chat response: "Items that did not have enough points to redeem were added as regular items.")\n`;
      }
    }
  }

  // Fetch recent orders
  const recentOrders = db.prepare('SELECT id, created_at, status FROM orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 3').all(userId);
  if (recentOrders.length > 0) {
    info += `\n\nRecent Order History:\n`;
    recentOrders.forEach(order => {
      const date = new Date(order.created_at).toLocaleDateString();
      info += `- Order #${order.id} (${date}): `;
      const items = db.prepare('SELECT name, quantity, modifiers FROM order_items WHERE order_id = ?').all(order.id);
      let totalOrderPointsNeeded = 0;
      const orderRewardItems = [];

      const itemsStr = items.map(i => {
        let mods = '';
        let isReward = false;
        try {
          const parsed = JSON.parse(i.modifiers || '[]');
          if (parsed.find(m => m.name === 'Reward Redemption')) {
            isReward = true;
            const menuItem = db.prepare('SELECT redeem_points FROM menu_items WHERE name = ?').get(i.name);
            if (menuItem && menuItem.redeem_points) {
              totalOrderPointsNeeded += (menuItem.redeem_points * i.quantity);
              orderRewardItems.push(`${i.quantity}x ${i.name}`);
            }
          }
          const filtered = parsed.filter(m => m.name !== 'Reward Redemption');
          if (filtered.length > 0) mods = ' (with ' + filtered.map(m => m.name).join(', ') + ')';
        } catch(e) {}
        let rewardTag = isReward ? ' [previously redeemed with points]' : '';
        return `${i.quantity}x ${i.name}${mods}${rewardTag}`;
      }).join(', ');
      info += itemsStr + '\n';

      if (orderRewardItems.length > 0) {
        info += `  (SYSTEM CALCULATION for Order #${order.id}: Reward items cost ${totalOrderPointsNeeded} pts. User has ${availablePoints} available pts right now. `;
        if (availablePoints >= totalOrderPointsNeeded) {
          info += `Result: YES, they CAN afford it. Use redeem_item_with_points!)\n`;
        } else {
          info += `Result: NO, they CANNOT afford it. Fallback to add_to_cart for some/all! EXTREMELY IMPORTANT: You MUST explicitly list out EVERY single item you added in your chat response, AND you MUST append this EXACT sentence to the END of your chat response: "Items that did not have enough points to redeem were added as regular items.")\n`;
        }
      }
    });
  } else {
    info += `\n\nThe user has no past orders.`;
  }
  
  return info;
}

const SYSTEM_PROMPT = `You are Bessie, the friendly AI assistant for Chick-fil-B (a demo fast food restaurant app). You're warm, helpful, and knowledgeable about the menu. You can help with:
- Menu recommendations and item details
- Nutrition information
- Adding items to the user's order / bag / cart
- Redeeming items using reward points
- Order status questions
- General restaurant information
- User profile, tier status, and reward points
- Past order history and reordering (including their favorite order)

Keep your responses concise, friendly, and helpful. Use emojis sparingly. If asked something you don't know, be honest about it.
When a user asks to "reorder my favorite" or "order my favorite meal", look at their Favorite Order in your context. If it exists, meticulously use the add_to_cart tool for each item (and apply the same modifiers!). If they don't have a favorite order, politely inform them they can set one in their Account Order History. If the user merely asks "what is my favorite order" or "check my favorite", DO NOT use the add_to_cart tool! Just list the items out in text.
IMPORTANT: You have an add_to_cart tool and a redeem_item_with_points tool. When the user asks you to add items to their bag, order, or cart, you MUST use the add_to_cart tool. When they ask to REDEEM points for a SPECIFIC item, you MUST use the redeem_item_with_points tool. 
EXTREMELY CRITICAL: If the user asks a hypothetical or informational question like "how many can I redeem?", "can I afford?", "what's in my cart?", DO NOT USE ANY TOOLS! Instead, look at the menu context. Every item has a prefix like [Can afford: X]. You MUST simply tell the user the exact number X for the item they asked about. DO NOT calculate anything, just read the X from the prefix. Pay close attention to item sizes (e.g. Medium vs Large) as they have different affordabilities. ONLY execute the add_to_cart or redeem_item_with_points tool if the user gives a direct, explicit command like "Yes, do it", "Please order it", or "Redeem it now".
IMPORTANT REORDERING LOGIC: If a user asks to reorder a meal that contains items tagged with '[previously redeemed with points]', you MUST look at the SYSTEM CALCULATION text provided next to that order. If the SYSTEM CALCULATION says "Result: YES", you MUST use the 'redeem_item_with_points' tool for those tagged items. If the SYSTEM CALCULATION says "Result: NO", you MUST use the 'add_to_cart' tool to add those items as regular paid items. NEVER pass '[previously redeemed with points]' into the tool arguments.
CRITICAL RESPONSE FORMAT FOR REORDERS: Whenever you process a reorder involving '[previously redeemed with points]' items, you MUST explicitly list out EVERY single item you added to their cart! If the SYSTEM CALCULATION was NO, you MUST append this exact fixed sentence to the end of your response: "Items that did not have enough points to redeem were added as regular items." NEVER include the text "Reward Redemption" or "redeemed with points" (whether in brackets, parentheses, or plain text) anywhere in your response unless the item was ACTUALLY successfully redeemed with points in this transaction!
IMPORTANT: If the user explicitly asks to remove ALL items or clear their entire bag/cart, you MUST use the clear_cart tool to wipe it cleanly. If the user asks to remove ONLY redeem items (e.g. "remove all redeem items"), you MUST use the remove_all_redeem_items tool instead of clear_cart.
CRITICAL: If the user modifies an item they already have in their cart (e.g. "make ONE of the chicken sandwiches no pickle" or "make one of regular sandwiches no tomato"), you MUST use the update_item_modifiers tool! Do NOT remove and re-add it, and DO NOT use add_to_cart. You must pass the specific 'cart_item_id' of the item. If the cart item has a quantity > 1, and the user only wants to modify SOME of them, you MUST pass the 'quantity_to_modify' parameter to specify how many should receive the new modifiers.
CRITICAL AI TARGETING RULE: When a user asks to modify an item to match another (e.g. "make the other one no pickle too" or "make the other..."), you MUST carefully read the cart context and select the cart_item_id of the item that DOES NOT YET have those modifiers! Do NOT select the ID of an item that already perfectly matches the requested modifiers.
CRITICAL: If the user asks to change the QUANTITY of an item they already have in their cart, OR if they ask to REMOVE an item entirely, you MUST use the update_item_quantity tool! Do NOT use add_to_cart. You must pass the specific 'cart_item_id' of the item. For update_item_quantity, the 'new_quantity' parameter must be the FINAL total quantity they want. If they want to remove it completely, set new_quantity to 0.
CRITICAL: If a tool call fails (e.g., "Failed to find menu item"), you MUST tell the user you couldn't find the item and ask for clarification. DO NOT pretend the item was added!

Here's the current menu:
`;

function ruleBasedResponse(message) {
  const msg = message.toLowerCase();

  if (msg.includes('recommend') || msg.includes('popular') || msg.includes('best')) {
    return "Our most popular items are the Chicken Sandwich, Waffle Fries, and the Frosted Lemonade! 🐔 The Spicy Chicken Sandwich is also a huge fan favorite if you like a little heat.";
  }
  if (msg.includes('spicy')) {
    return "We have several spicy options! The Spicy Chicken Sandwich ($5.89), Spicy Deluxe Sandwich ($6.69), and the Spicy Southwest Salad ($9.49). Our Sriracha Sauce is also great for adding extra heat!";
  }
  if (msg.includes('healthy') || msg.includes('diet') || msg.includes('calorie') || msg.includes('low cal')) {
    return "Looking for lighter options? Try our Grilled Chicken Sandwich (390 cal), Grilled Nuggets (130 cal for 8-ct), Fruit Cup (60 cal), or Market Salad (340 cal). We also have Diet Lemonade at just 30 calories!";
  }
  if (msg.includes('breakfast')) {
    return "Our breakfast menu features classics like the Chicken Biscuit ($4.19), Chick-n-Minis ($4.59), and the Egg White Grill ($5.29) for a lighter option. Don't forget the Hash Browns ($1.49)!";
  }
  if (msg.includes('dessert') || msg.includes('shake') || msg.includes('treat') || msg.includes('sweet')) {
    return "We have amazing treats! Our milkshakes (Chocolate, Vanilla, Strawberry, Cookies & Cream) start at $4.49. The Frosted Lemonade ($4.29) is a fan favorite, and our Icedream Cone is just $1.65!";
  }
  if (msg.includes('sauce')) {
    return "Our sauces are all complimentary! We have: Chick-fil-B Sauce (our signature!), Polynesian, Garden Herb Ranch, Honey Mustard, Barbeque, and our new Sriracha Sauce.";
  }
  if (msg.includes('reward') || msg.includes('point') || msg.includes('tier')) {
    return "Our rewards program has three tiers: Member, Silver (2,000 pts), and Gold (5,000 pts). You earn 10 points per dollar spent (12 at Gold!). Redeem points for free menu items. Silver and Gold members get birthday rewards and priority ordering!";
  }
  if (msg.includes('hello') || msg.includes('hi') || msg.includes('hey') || msg.includes('help')) {
    return "Hey there! 👋 I'm Bessie, your Chick-fil-B assistant. I can help you with menu recommendations, nutrition info, rewards questions, or anything else about our restaurant. What can I do for you?";
  }
  if (msg.includes('promo') || msg.includes('coupon') || msg.includes('discount') || msg.includes('deal')) {
    return "We have some great deals right now! Use code WELCOME15 for 15% off your first order, FRYFRIDAY for free fries with an entree on Fridays, or SAVE3 for $3 off orders over $15!";
  }
  if (msg.includes('kid') || msg.includes('child')) {
    return "Our Kid's Meals are $5.39 each and include a kid-sized side, drink, and a prize! Choose from Nuggets (5-ct), Chicken Strip, or Grilled Nuggets for a healthier option.";
  }

  return "Great question! I'd love to help. Could you tell me a bit more about what you're looking for? I can help with menu recommendations, nutrition info, rewards, deals, and more! 😊";
}

// Start or continue chat
router.post('/', authenticate, async (req, res) => {
  const { message, sessionId } = req.body;
  if (!message) return res.status(400).json({ error: 'Message is required' });

  const db = getDb();
  let chatSessionId = sessionId;

  // Create session if needed
  if (!chatSessionId) {
    const result = db.prepare('INSERT INTO chat_sessions (user_id) VALUES (?)').run(req.user.id);
    chatSessionId = result.lastInsertRowid;
  }

  // Save user message
  db.prepare('INSERT INTO chat_messages (session_id, role, content) VALUES (?, ?, ?)').run(chatSessionId, 'user', message);

  // Get chat history
  const history = db.prepare(
    'SELECT role, content FROM chat_messages WHERE session_id = ? ORDER BY created_at'
  ).all(chatSessionId);

  let assistantMessage;
  let dataChanged = false;

    // Try OpenAI first
  if (OpenAI && process.env.OPENAI_API_KEY) {
    try {
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const availablePoints = getAvailablePoints(db, req.user.id);
      const menuContext = getMenuContext(db, availablePoints);
      const cartContext = getCartContext(db, req.user.id);
      const userContext = getUserContext(db, req.user.id, availablePoints);

      const messages = [
        { role: 'system', content: SYSTEM_PROMPT + menuContext + "\n\n" + cartContext + "\n\n" + userContext },
        ...history.map(m => ({ role: m.role, content: m.content }))
      ];

      const tools = [
        {
          type: "function",
          function: {
            name: "add_to_cart",
            description: "Adds a specified menu item to the user's shopping bag/cart. DO NOT use this tool if the user is just asking a question about what they can afford. ONLY use it if they explicitly say 'add', 'order', or 'get'.",
            parameters: {
              type: "object",
              properties: {
                item_name: {
                  type: "string",
                  description: "The EXACT name of the menu item from the provided menu list, e.g., 'Spicy Chicken Sandwich' or 'Grilled Nuggets'. DO NOT include preferences like 'without pickle' here."
                },
                quantity: {
                  type: "integer",
                  description: "The number of items to add. Default is 1."
                },
                modifiers: {
                  type: "array",
                  items: { type: "string" },
                  description: "List of ingredient modifications. Valid examples: 'No Pickle', 'Extra Spicy', 'No Lettuce', 'No Tomato'. You must use this for preferences."
                }
              },
              required: ["item_name"]
            }
          }
        },
        {
          type: "function",
          function: {
            name: "redeem_item_with_points",
            description: "Redeems a menu item using the user's reward points and adds it to their cart. DO NOT use this tool if the user is just asking a question (e.g. 'how many can I redeem?'). ONLY use it if they explicitly say 'redeem it' or 'add it'.",
            parameters: {
              type: "object",
              properties: {
                item_name: {
                  type: "string",
                  description: "The EXACT name of the menu item to redeem."
                },
                quantity: {
                  type: "integer",
                  description: "Number of items to redeem. Default is 1."
                },
                modifiers: {
                  type: "array",
                  items: { type: "string" },
                  description: "List of ingredient modifications. Valid examples: 'No Pickle', 'Extra Spicy', 'No Lettuce', 'No Tomato'. You must use this for preferences."
                }
              },
              required: ["item_name"]
            }
          }
        },
        {
          type: "function",
          function: {
            name: "update_item_modifiers",
            description: "Updates the ingredient modifiers (e.g. 'No Pickle') for a specific menu item currently in the user's cart. This modifies the existing item without removing it.",
            parameters: {
              type: "object",
              properties: {
                cart_item_id: { type: "integer", description: "The ID of the cart item to update, found in brackets like [ID: 5] in the cart context." },
                new_modifiers: { type: "array", items: { type: "string" }, description: "The COMPLETE new list of ingredient modifications for this item. Valid examples: 'No Pickle', 'Extra Spicy'." },
                quantity_to_modify: { type: "integer", description: "If the cart item has a quantity > 1, and you only want to modify SOME of them (e.g. 'make one of them no pickle'), pass the number to modify here." }
              },
              required: ["cart_item_id", "new_modifiers"]
            }
          }
        },
        {
          type: "function",
          function: {
            name: "update_item_quantity",
            description: "Updates the quantity of a specific menu item currently in the user's cart. Use this when the user asks to reduce, increase, or change the amount of an item they already have.",
            parameters: {
              type: "object",
              properties: {
                cart_item_id: { type: "integer", description: "The ID of the cart item to update, found in brackets like [ID: 5] in the cart context." },
                new_quantity: { type: "integer", description: "The NEW total quantity for this item. If they had 3 and want to remove 1, new_quantity is 2. If new_quantity is 0, it will be removed completely." }
              },
              required: ["cart_item_id", "new_quantity"]
            }
          }
        },
        {
          type: "function",
          function: {
            name: "clear_cart",
            description: "Removes ALL items from the user's cart.",
            parameters: {
              type: "object",
              properties: {},
              required: []
            }
          }
        },
        {
          type: "function",
          function: {
            name: "remove_all_redeem_items",
            description: "Removes all items from the cart that were redeemed using reward points.",
            parameters: {
              type: "object",
              properties: {},
              required: []
            }
          }
        }
      ];

      console.log("=== SENDING TO OPENAI ===");
      console.log(JSON.stringify(messages, null, 2));
      console.log("=========================");

      let completion = await openai.chat.completions.create({
        model: 'gpt-4-turbo',
        messages,
        tools,
        tool_choice: "auto",
        max_tokens: 300,
        temperature: 0.1
      });

      let responseMessage = completion.choices[0].message;

      // Loop for recursive tool calls
      let toolCallCount = 0;
      while (responseMessage.tool_calls && toolCallCount < 5) {
        messages.push(responseMessage); // Add assistant's tool call to history
        toolCallCount++;
        dataChanged = true; // Assume any tool call execution modifies data

        // Execute removals before additions if parallel
        const sortedToolCalls = [...responseMessage.tool_calls].sort((a, b) => {
          if (a.function.name === 'remove_item_from_cart' && b.function.name !== 'remove_item_from_cart') return -1;
          if (a.function.name !== 'remove_item_from_cart' && b.function.name === 'remove_item_from_cart') return 1;
          return 0;
        });

        for (const toolCall of sortedToolCalls) {
          if (toolCall.function.name === 'add_to_cart') {
            const args = JSON.parse(toolCall.function.arguments);
            const item = db.prepare('SELECT id FROM menu_items WHERE name LIKE ? COLLATE NOCASE').get(`%${args.item_name}%`);
            
            if (item) {
              const qty = args.quantity || 1;
              const modifiersArg = args.modifiers || [];
              
              let mappedMods = [];
              if (modifiersArg.length > 0) {
                const itemMods = db.prepare('SELECT * FROM item_modifiers WHERE menu_item_id = ?').all(item.id);
                modifiersArg.forEach(m => {
                  const match = itemMods.find(mod => mod.name.toLowerCase() === m.toLowerCase());
                  if (match) mappedMods.push({ name: match.name, price_modifier: match.price_modifier });
                });
              }
              mappedMods.sort((a, b) => a.name.localeCompare(b.name));
              const modsStr = JSON.stringify(mappedMods);

              const existingItem = db.prepare(
                `SELECT * FROM cart_items WHERE user_id = ? AND menu_item_id = ? AND modifiers = ? AND special_instructions = ''`
              ).get(req.user.id, item.id, modsStr);
              
              if (existingItem) {
                db.prepare(`UPDATE cart_items SET quantity = quantity + ? WHERE id = ?`).run(qty, existingItem.id);
              } else {
                db.prepare(
                  `INSERT INTO cart_items (user_id, menu_item_id, quantity, modifiers, special_instructions) VALUES (?, ?, ?, ?, ?)`
                ).run(req.user.id, item.id, qty, modsStr, '');
              }
              
              messages.push({
                tool_call_id: toolCall.id,
                role: "tool",
                name: "add_to_cart",
                content: `Successfully added ${qty} to cart.`
              });
            } else {
              messages.push({
                tool_call_id: toolCall.id,
                role: "tool",
                name: "add_to_cart",
                content: "Failed to find menu item."
              });
            }
          } else if (toolCall.function.name === 'update_item_modifiers') {
            const args = JSON.parse(toolCall.function.arguments);
            console.log('update_item_modifiers args:', args);
            const targetItem = db.prepare('SELECT * FROM cart_items WHERE id = ? AND user_id = ?').get(args.cart_item_id, req.user.id);
            
            if (targetItem) {
              const item = db.prepare('SELECT id, price, redeem_points FROM menu_items WHERE id = ?').get(targetItem.menu_item_id);
              let mappedMods = [];
              
              // Preserve Reward Redemption if it was there
              let wasReward = false;
              try {
                const oldMods = JSON.parse(targetItem.modifiers || '[]');
                if (oldMods.some(m => m.name === 'Reward Redemption')) wasReward = true;
              } catch(e) {}
              
              if (wasReward) {
                mappedMods.push({ name: 'Reward Redemption', price_modifier: -item.price, points_cost: item.redeem_points });
              }
              
              const modifiersArg = args.new_modifiers || [];
              if (modifiersArg.length > 0) {
                const itemMods = db.prepare('SELECT * FROM item_modifiers WHERE menu_item_id = ?').all(item.id);
                modifiersArg.forEach(m => {
                  const match = itemMods.find(mod => mod.name.toLowerCase() === m.toLowerCase());
                  if (match) mappedMods.push({ name: match.name, price_modifier: match.price_modifier });
                });
              }
              mappedMods.sort((a, b) => a.name.localeCompare(b.name));
              const modsStr = JSON.stringify(mappedMods);
              
              const qtyToModify = args.quantity_to_modify || targetItem.quantity;
              const remainingQty = targetItem.quantity - qtyToModify;
              
              const existingMatch = db.prepare(
                `SELECT * FROM cart_items WHERE user_id = ? AND menu_item_id = ? AND modifiers = ? AND special_instructions = ? AND id != ?`
              ).get(req.user.id, item.id, modsStr, targetItem.special_instructions, targetItem.id);

              if (existingMatch) {
                db.prepare('UPDATE cart_items SET quantity = quantity + ? WHERE id = ?').run(qtyToModify, existingMatch.id);
                if (remainingQty > 0) {
                  db.prepare('UPDATE cart_items SET quantity = ? WHERE id = ?').run(remainingQty, targetItem.id);
                } else {
                  db.prepare('DELETE FROM cart_items WHERE id = ?').run(targetItem.id);
                }
              } else {
                if (remainingQty > 0) {
                  db.prepare('UPDATE cart_items SET quantity = ? WHERE id = ?').run(remainingQty, targetItem.id);
                  db.prepare(
                    `INSERT INTO cart_items (user_id, menu_item_id, quantity, modifiers, special_instructions) VALUES (?, ?, ?, ?, ?)`
                  ).run(req.user.id, item.id, qtyToModify, modsStr, targetItem.special_instructions);
                } else {
                  db.prepare('UPDATE cart_items SET modifiers = ? WHERE id = ?').run(modsStr, targetItem.id);
                }
              }
              
              messages.push({
                tool_call_id: toolCall.id,
                role: "tool",
                name: "update_item_modifiers",
                content: "Successfully updated item modifiers in the cart."
              });
            } else {
              messages.push({
                tool_call_id: toolCall.id,
                role: "tool",
                name: "update_item_modifiers",
                content: "Failed: Cart item ID not found."
              });
            }
          } else if (toolCall.function.name === 'update_item_quantity') {
            const args = JSON.parse(toolCall.function.arguments);
            const targetItem = db.prepare('SELECT * FROM cart_items WHERE id = ? AND user_id = ?').get(args.cart_item_id, req.user.id);
            
            if (targetItem) {
              const newQty = args.new_quantity || 0;
              if (newQty <= 0) {
                db.prepare('DELETE FROM cart_items WHERE id = ?').run(targetItem.id);
              } else {
                db.prepare('UPDATE cart_items SET quantity = ? WHERE id = ?').run(newQty, targetItem.id);
              }
              
              messages.push({
                tool_call_id: toolCall.id,
                role: "tool",
                name: "update_item_quantity",
                content: "Successfully updated item quantity in the cart."
              });
            } else {
              messages.push({
                tool_call_id: toolCall.id,
                role: "tool",
                name: "update_item_quantity",
                content: "Failed: Cart item ID not found."
              });
            }
          } else if (toolCall.function.name === 'remove_item_from_cart') {
            const args = JSON.parse(toolCall.function.arguments);
            const item = db.prepare('SELECT id FROM menu_items WHERE name LIKE ? COLLATE NOCASE').get(`%${args.item_name}%`);
            
            if (item) {
              db.prepare('DELETE FROM cart_items WHERE user_id = ? AND menu_item_id = ?').run(req.user.id, item.id);
              messages.push({
                tool_call_id: toolCall.id,
                role: "tool",
                name: "remove_item_from_cart",
                content: "Successfully removed all variations of this item from cart."
              });
            } else {
              messages.push({
                tool_call_id: toolCall.id,
                role: "tool",
                name: "remove_item_from_cart",
                content: "Failed to find menu item to remove."
              });
            }
          } else if (toolCall.function.name === 'redeem_item_with_points') {
            const args = JSON.parse(toolCall.function.arguments);
            const item = db.prepare('SELECT id, price, redeem_points FROM menu_items WHERE name LIKE ? COLLATE NOCASE').get(`%${args.item_name}%`);
            
            if (item) {
              if (item.redeem_points <= 0) {
                messages.push({
                  tool_call_id: toolCall.id, role: "tool", name: "redeem_item_with_points",
                  content: "Failed: This item is not redeemable with points."
                });
              } else {
                const qty = args.quantity || 1;
                const totalPointsNeeded = item.redeem_points * qty;
                
                // Get user's available points and cart's currently used points
                const rewards = db.prepare('SELECT points FROM rewards WHERE user_id = ?').get(req.user.id);
                const userPoints = rewards ? rewards.points : 0;
                
                const cartItems = db.prepare('SELECT modifiers, quantity FROM cart_items WHERE user_id = ?').all(req.user.id);
                let currentCartPointsUsed = 0;
                cartItems.forEach(ci => {
                  try {
                    const mods = JSON.parse(ci.modifiers || '[]');
                    mods.forEach(m => {
                      if (m.points_cost) currentCartPointsUsed += (m.points_cost * ci.quantity);
                    });
                  } catch(e) {}
                });
                
                const availablePoints = userPoints - currentCartPointsUsed;
                
                if (availablePoints >= totalPointsNeeded) {
                  let mappedMods = [{ name: 'Reward Redemption', price_modifier: -item.price, points_cost: item.redeem_points }];
                  
                  const modifiersArg = args.modifiers || [];
                  if (modifiersArg.length > 0) {
                    const itemMods = db.prepare('SELECT * FROM item_modifiers WHERE menu_item_id = ?').all(item.id);
                    modifiersArg.forEach(m => {
                      const match = itemMods.find(mod => mod.name.toLowerCase() === m.toLowerCase());
                      if (match) mappedMods.push({ name: match.name, price_modifier: match.price_modifier });
                    });
                  }
                  
                  mappedMods.sort((a, b) => a.name.localeCompare(b.name));
                  const modsStr = JSON.stringify(mappedMods);
                  
                  const existingItem = db.prepare(
                    `SELECT * FROM cart_items WHERE user_id = ? AND menu_item_id = ? AND modifiers = ? AND special_instructions = ''`
                  ).get(req.user.id, item.id, modsStr);
                  
                  if (existingItem) {
                    db.prepare(`UPDATE cart_items SET quantity = quantity + ? WHERE id = ?`).run(qty, existingItem.id);
                  } else {
                    db.prepare(
                      `INSERT INTO cart_items (user_id, menu_item_id, quantity, modifiers, special_instructions) VALUES (?, ?, ?, ?, ?)`
                    ).run(req.user.id, item.id, qty, modsStr, '');
                  }
                  
                  messages.push({
                    tool_call_id: toolCall.id, role: "tool", name: "redeem_item_with_points",
                    content: `Successfully redeemed ${qty} ${args.item_name} for ${totalPointsNeeded} points.`
                  });
                } else {
                  messages.push({
                    tool_call_id: toolCall.id, role: "tool", name: "redeem_item_with_points",
                    content: `Failed: User only has ${availablePoints} available points, but needs ${totalPointsNeeded}.`
                  });
                }
              }
            } else {
              messages.push({
                tool_call_id: toolCall.id, role: "tool", name: "redeem_item_with_points",
                content: "Failed to find menu item."
              });
            }
          } else if (toolCall.function.name === 'clear_cart') {
            db.prepare('DELETE FROM cart_items WHERE user_id = ?').run(req.user.id);
            messages.push({
              tool_call_id: toolCall.id, role: "tool", name: "clear_cart",
              content: "Successfully removed all items from cart."
            });
          } else if (toolCall.function.name === 'remove_all_redeem_items') {
            db.prepare("DELETE FROM cart_items WHERE user_id = ? AND modifiers LIKE '%Reward Redemption%'").run(req.user.id);
            messages.push({
              tool_call_id: toolCall.id, role: "tool", name: "remove_all_redeem_items",
              content: "Successfully removed all redeemed items from cart."
            });
          }
        }

        // Get next response from model
        completion = await openai.chat.completions.create({
          model: 'gpt-4-turbo',
          messages,
          tools,
          tool_choice: "auto",
          max_tokens: 300,
          temperature: 0.1
        });
        responseMessage = completion.choices[0].message;
      }

      assistantMessage = responseMessage.content;
    } catch (err) {
      console.error('OpenAI error, falling back to rule-based:', err.message);
      assistantMessage = ruleBasedResponse(message);
    }
  } else {
    assistantMessage = ruleBasedResponse(message);
  }

  // Save assistant message
  db.prepare('INSERT INTO chat_messages (session_id, role, content) VALUES (?, ?, ?)').run(chatSessionId, 'assistant', assistantMessage);

  res.json({ sessionId: chatSessionId, message: assistantMessage, dataChanged });
});

// Get chat history
router.get('/history', authenticate, (req, res) => {
  const db = getDb();
  const sessions = db.prepare(
    'SELECT * FROM chat_sessions WHERE user_id = ? ORDER BY started_at DESC LIMIT 10'
  ).all(req.user.id);

  const result = sessions.map(s => {
    const messages = db.prepare('SELECT * FROM chat_messages WHERE session_id = ? ORDER BY created_at').all(s.id);
    return { ...s, messages };
  });

  res.json(result);
});

module.exports = router;
