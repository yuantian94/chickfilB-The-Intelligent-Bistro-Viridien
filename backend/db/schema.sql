-- Users table
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    avatar_url TEXT,
    default_address TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_active_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Payment methods (demo fake cards)
CREATE TABLE IF NOT EXISTS payment_methods (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    card_type TEXT NOT NULL,
    last_four TEXT NOT NULL,
    card_holder TEXT NOT NULL,
    expiry_month INTEGER NOT NULL,
    expiry_year INTEGER NOT NULL,
    is_default INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Menu categories
CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    image_url TEXT,
    display_order INTEGER DEFAULT 0
);

-- Menu items
CREATE TABLE IF NOT EXISTS menu_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    price REAL NOT NULL,
    calories INTEGER,
    image_url TEXT,
    is_featured INTEGER DEFAULT 0,
    is_seasonal INTEGER DEFAULT 0,
    is_new INTEGER DEFAULT 0,
    is_healthier INTEGER DEFAULT 0,
    tags TEXT DEFAULT '[]',
    redeem_points INTEGER DEFAULT 0,
    available INTEGER DEFAULT 1,
    FOREIGN KEY (category_id) REFERENCES categories(id)
);

-- Item customization modifiers
CREATE TABLE IF NOT EXISTS item_modifiers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    menu_item_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    modifier_type TEXT NOT NULL DEFAULT 'add',
    price_modifier REAL DEFAULT 0,
    FOREIGN KEY (menu_item_id) REFERENCES menu_items(id) ON DELETE CASCADE
);

-- Shopping cart
CREATE TABLE IF NOT EXISTS cart_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    menu_item_id INTEGER NOT NULL,
    quantity INTEGER DEFAULT 1,
    modifiers TEXT DEFAULT '[]',
    special_instructions TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (menu_item_id) REFERENCES menu_items(id)
);

-- Orders
CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    status TEXT DEFAULT 'placed',
    order_type TEXT DEFAULT 'pickup',
    address TEXT,
    subtotal REAL NOT NULL,
    tax REAL NOT NULL,
    total REAL NOT NULL,
    payment_method_id INTEGER,
    points_earned INTEGER DEFAULT 0,
    points_redeemed INTEGER DEFAULT 0,
    is_favorite INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (payment_method_id) REFERENCES payment_methods(id)
);

-- Order items (snapshot)
CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    menu_item_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    price REAL NOT NULL,
    quantity INTEGER DEFAULT 1,
    calories INTEGER,
    modifiers TEXT DEFAULT '[]',
    image_url TEXT,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    FOREIGN KEY (menu_item_id) REFERENCES menu_items(id)
);

-- Rewards
CREATE TABLE IF NOT EXISTS rewards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL UNIQUE,
    points INTEGER DEFAULT 0,
    tier TEXT DEFAULT 'member',
    total_points_earned INTEGER DEFAULT 0,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Promotions
CREATE TABLE IF NOT EXISTS promotions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    discount_type TEXT,
    discount_value REAL,
    min_order_amount REAL DEFAULT 0,
    valid_from DATETIME,
    valid_until DATETIME,
    code TEXT UNIQUE,
    active INTEGER DEFAULT 1
);

-- Chat sessions
CREATE TABLE IF NOT EXISTS chat_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    ended_at DATETIME,
    is_active INTEGER DEFAULT 1,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Chat messages
CREATE TABLE IF NOT EXISTS chat_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    function_call TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
);

-- Guest shopping cart (identified by guest_token UUID)
CREATE TABLE IF NOT EXISTS guest_cart_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guest_token TEXT NOT NULL,
    menu_item_id INTEGER NOT NULL,
    quantity INTEGER DEFAULT 1,
    modifiers TEXT DEFAULT '[]',
    special_instructions TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (menu_item_id) REFERENCES menu_items(id)
);

-- Guest orders (keyed by email, auto-evict after 1 day)
CREATE TABLE IF NOT EXISTS guest_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guest_email TEXT NOT NULL,
    guest_token TEXT,
    order_type TEXT DEFAULT 'pickup',
    address TEXT,
    subtotal REAL NOT NULL,
    tax REAL NOT NULL,
    total REAL NOT NULL,
    status TEXT DEFAULT 'placed',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Guest order items
CREATE TABLE IF NOT EXISTS guest_order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guest_order_id INTEGER NOT NULL,
    menu_item_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    price REAL NOT NULL,
    quantity INTEGER DEFAULT 1,
    calories INTEGER,
    modifiers TEXT DEFAULT '[]',
    image_url TEXT,
    FOREIGN KEY (guest_order_id) REFERENCES guest_orders(id) ON DELETE CASCADE,
    FOREIGN KEY (menu_item_id) REFERENCES menu_items(id)
);
