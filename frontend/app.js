const API_URL = '/api';

function parseAddress(addr) {
  if (!addr) return { street: '', apt: '', city: '', state: '', zip: '' };
  const parts = addr.split(',').map(p => p.trim());
  let street = parts[0] || '';
  let apt = '';
  if (parts.length > 3) {
    street = parts[0];
    apt = parts[1];
    parts.splice(1, 1);
  }
  let city = parts[1] || '';
  let stateZip = parts[2] || '';
  let state = stateZip.split(' ')[0] || '';
  let zip = stateZip.split(' ')[1] || '';
  return { street, apt, city, state, zip };
}

// --- State ---
let state = {
  user: null,
  cartCount: 0,
  cartPointsUsed: 0,
  currentPage: 'home',
  lastMainTab: 'home',
  chatSessionId: null,
  chatMutatedData: false,
  guestCheckoutEmail: null  // set after guest checkout for register pre-fill
};

// Generate or retrieve a persistent guest token for non-logged-in cart
function getGuestToken() {
  let token = localStorage.getItem('guestToken');
  if (!token) {
    token = 'guest_' + crypto.randomUUID();
    localStorage.setItem('guestToken', token);
  }
  return token;
}

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
  const token = localStorage.getItem('token');
  if (token) {
    fetchUser(token);
  } else {
    updateCartCount(); // Load guest cart count
    updateChatState();
    navigate('home');
  }
});

// --- Navigation ---
function navigate(page, force = false) {
  const container = document.getElementById('page-container');
  if (!force && state.currentPage === page && container && container.innerHTML.trim() !== '') {
    return; // Already on this page, do nothing
  }

  if (['home', 'menu', 'rewards', 'account'].includes(page)) {
    state.lastMainTab = page;
  }
  state.currentPage = page;
  
  // Update nav links style
  document.querySelectorAll('.nav-link').forEach(link => {
    const icon = link.querySelector('.material-symbols-outlined');
    if (link.dataset.page === page) {
      link.classList.remove('text-secondary', 'dark:text-secondary-fixed');
      link.classList.add('text-primary', 'dark:text-primary', 'scale-95');
      icon.style.fontVariationSettings = "'FILL' 1";
    } else {
      link.classList.remove('text-primary', 'dark:text-primary', 'scale-95');
      link.classList.add('text-secondary', 'dark:text-secondary-fixed');
      icon.style.fontVariationSettings = "'FILL' 0";
    }
  });

  const header = document.getElementById('header-container');
  
  // Trigger fade-in animation
  container.classList.remove('animate-fade-in');
  void container.offsetWidth; // Force reflow
  container.classList.add('animate-fade-in');

  container.innerHTML = ''; 
  header.innerHTML = '';

  switch (page) {
    case 'home':
      renderHome(header, container);
      break;
    case 'menu':
      renderMenu(header, container);
      break;
    case 'cart':
      renderCart(header, container);
      break;
    case 'customize-item':
      renderCustomizeItem(header, container);
      break;
    case 'rewards':
      renderRewards(header, container);
      break;
    case 'checkout':
      renderCheckout(header, container);
      break;
    case 'guest-checkout':
      renderGuestCheckout(header, container);
      break;
    case 'profile-settings':
      renderProfileSettings(header, container);
      break;
    case 'account':
      renderAccount(header, container);
      break;
  }
}

function renderHeader(header, title, showProfile = false, backRoute = 'home') {
  let leftSide = '';
  if (showProfile && state.user) {
    leftSide = `
      <div class="flex items-center gap-stack-md">
        <div class="w-10 h-10 rounded-full overflow-hidden bg-surface-container-highest flex items-center justify-center text-primary font-bold">
          ${state.user.name.charAt(0).toUpperCase()}
        </div>
        <div>
          <p class="text-body-sm font-body-sm text-secondary">Good Morning,</p>
          <h1 class="text-headline-lg-mobile font-headline-lg-mobile text-on-surface">${state.user.name.split(' ')[0]}</h1>
        </div>
      </div>
    `;
  } else if (showProfile && !state.user) {
    leftSide = `
      <div class="flex items-center gap-stack-md">
        <div class="w-10 h-10 rounded-full overflow-hidden bg-surface-container-highest flex items-center justify-center text-primary font-bold">
          ?
        </div>
        <div>
          <p class="text-body-sm font-body-sm text-secondary">Welcome,</p>
          <h1 class="text-headline-lg-mobile font-headline-lg-mobile text-on-surface" onclick="navigate('account')" style="cursor:pointer">Sign In</h1>
        </div>
      </div>
    `;
  } else {
    leftSide = `
      <div class="flex items-center gap-2">
        <button onclick="navigate('${backRoute}')" aria-label="Go back" class="w-10 h-10 rounded-full flex items-center justify-center bg-surface-container-low hover:bg-surface-container-highest transition-colors">
          <span class="material-symbols-outlined" data-icon="arrow_back">arrow_back</span>
        </button>
        <h1 class="text-headline-lg-mobile font-headline-lg-mobile text-primary dark:text-primary">${title}</h1>
      </div>
    `;
  }

  header.innerHTML = `
    <header class="bg-surface dark:bg-surface text-primary dark:text-primary docked full-width top-0 flat no shadows flex justify-between items-center px-container-padding py-base w-full sticky z-40 gap-2 border-b border-surface-variant/50">
      ${leftSide}
      <div class="flex items-center gap-2">
        <button onclick="toggleChat()" aria-label="AI Assistant" class="w-10 h-10 rounded-full flex items-center justify-center hover:bg-surface-container-low dark:hover:bg-surface-dim transition-colors text-primary relative z-50">
          <span class="material-symbols-outlined" data-icon="auto_awesome">auto_awesome</span>
        </button>
        <button onclick="navigate('cart')" aria-label="Shopping bag" class="w-10 h-10 rounded-full flex items-center justify-center hover:bg-surface-container-low dark:hover:bg-surface-dim transition-colors text-primary relative">
          <span class="material-symbols-outlined" data-icon="shopping_bag">shopping_bag</span>
          ${state.cartCount > 0 ? `<div class="absolute top-1 right-1 w-3 h-3 bg-error rounded-full border-2 border-surface"></div>` : ''}
        </button>
      </div>
    </header>
  `;
}

// --- Auth ---
async function fetchUser(token) {
  try {
    const res = await fetch(`${API_URL}/auth/me`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.ok) {
      state.user = await res.json();
      updateCartCount();
      navigate(state.currentPage); // Re-render current page
      updateChatState();
    } else {
      localStorage.removeItem('token');
      updateChatState();
    }
  } catch (e) {
    console.error('Failed to fetch user', e);
  }
}

async function login() {
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;
  
  try {
    const res = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    
    const data = await res.json();
    if (res.ok) {
      localStorage.setItem('token', data.token);
      showToast('Logged in successfully!');
      await fetchUser(data.token);
      navigate('home');
    } else {
      showToast(data.error || 'Login failed');
    }
  } catch (e) {
    showToast('Network error');
  }
}

async function register() {
  const name = document.getElementById('reg-name').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const password = document.getElementById('reg-password').value;
  const confirm = document.getElementById('reg-confirm').value;

  if (!name) { showToast('Name is required'); return; }
  if (!email) { showToast('Email is required'); return; }
  if (password.length < 6) { showToast('Password must be at least 6 characters'); return; }
  if (password !== confirm) { showToast('Passwords do not match'); return; }

  try {
    const res = await fetch(`${API_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name })
    });

    const data = await res.json();
    if (res.ok) {
      localStorage.setItem('token', data.token);
      showToast('Account created! Welcome to Chick-fil-B! 🎉');
      await fetchUser(data.token);
      navigate('home');
    } else {
      showToast(data.error || 'Registration failed');
    }
  } catch (e) {
    showToast('Network error');
  }
}

function toggleAuthForm() {
  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');
  if (loginForm && registerForm) {
    loginForm.classList.toggle('hidden');
    registerForm.classList.toggle('hidden');
  }
}

async function logout() {
  if (state.user) {
    try {
      await fetch(`${API_URL}/cart`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
    } catch (e) {}
  }
  
  localStorage.removeItem('token');
  state.user = null;
  state.cartCount = 0;
  state.cartPointsUsed = 0;
  updateChatState();
  navigate('home');
  showToast('Logged out');
}

// --- Cart ---
async function updateCartCount() {
  try {
    let res;
    if (state.user) {
      res = await fetch(`${API_URL}/cart`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
    } else {
      res = await fetch(`${API_URL}/guest/cart`, {
        headers: { 'X-Guest-Token': getGuestToken() }
      });
    }
    if (res.ok) {
      const data = await res.json();
      state.cartCount = data.itemCount;
      if (state.user) state.user.points = data.points;
      state.cartPointsUsed = (data.items || []).reduce((sum, item) => {
        let pts = 0;
        try {
          const mods = JSON.parse(item.modifiers || '[]');
          mods.forEach(m => {
            if (m.points_cost) pts += m.points_cost;
          });
        } catch(e) {}
        return sum + (pts * item.quantity);
      }, 0);
      if(state.currentPage !== 'cart') renderHeader(document.getElementById('header-container'), '', state.currentPage === 'home');
    }
  } catch (e) {
    console.error('Failed to update cart count');
  }
}

async function addToCart(menuItemId) {
  let quantity = 1;
  const qtyInput = document.getElementById(`menu-qty-${menuItemId}`);
  if (qtyInput) {
    quantity = parseInt(qtyInput.value, 10);
    if (isNaN(quantity) || quantity < 1) quantity = 1;
  }

  try {
    let res;
    if (state.user) {
      res = await fetch(`${API_URL}/cart`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ menuItemId, quantity })
      });
    } else {
      res = await fetch(`${API_URL}/guest/cart`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'X-Guest-Token': getGuestToken()
        },
        body: JSON.stringify({ menuItemId, quantity })
      });
    }
    
    if (res.ok) {
      const data = await res.json();
      if (data.totalQuantity > 1) {
        showToast(`Added to bag! You now have ${data.totalQuantity} of this item in bag.`);
      } else {
        showToast('Added to bag!');
      }
      updateCartCount();
    }
  } catch (e) {
    showToast('Failed to add to cart');
  }
}

async function redeemReward(menuItemId, price, points) {
  let quantity = 1;
  const qtyInput = document.getElementById(`reward-qty-${menuItemId}`);
  if (qtyInput) {
    quantity = parseInt(qtyInput.value, 10);
    if (isNaN(quantity) || quantity < 1) quantity = 1;
  }

  if (!state.user) {
    showToast('Please login to order');
    navigate('account');
    return;
  }
  try {
    const res = await fetch(`${API_URL}/cart`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      },
      body: JSON.stringify({ 
        menuItemId, 
        quantity,
        modifiers: [{ name: 'Reward Redemption', price_modifier: -price, points_cost: points }]
      })
    });
    
    if (res.ok) {
      const data = await res.json();
      if (data.totalQuantity > 1) {
        showToast(`Reward added to bag! You now have ${data.totalQuantity} of this item in bag. 🎉`);
      } else {
        showToast('Reward added to bag! 🎉');
      }
      await updateCartCount();
      if (state.currentPage === 'rewards') {
        renderRewards(document.getElementById('header-container'), document.getElementById('page-container'));
      }
    } else {
      const data = await res.json();
      showToast(data.error || 'Failed to add reward');
    }
  } catch (e) {
    showToast('Network error');
  }
}

async function updateCartItem(cartItemId, newQty) {
  try {
    if (state.user) {
      await fetch(`${API_URL}/cart/${cartItemId}`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ quantity: newQty })
      });
    } else {
      await fetch(`${API_URL}/guest/cart/${cartItemId}`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'X-Guest-Token': getGuestToken()
        },
        body: JSON.stringify({ quantity: newQty })
      });
    }
    
    if (state.currentPage === 'cart') {
      const header = document.getElementById('header-container');
      const container = document.getElementById('page-container');
      await renderCart(header, container);
    } else {
      navigate('cart');
    }
    updateCartCount();
  } catch (e) {}
}

window.submitCheckout = async () => {
  let address = '';
  if (checkoutState.orderType === 'pickup') {
    address = checkoutState.locationId === 'loc1' ? 'Chick-fil-B Downtown' : checkoutState.locationId === 'loc2' ? 'Chick-fil-B Northside' : 'Chick-fil-B Westend';
  } else {
    const sStreet = document.getElementById('checkout-addr-street')?.value || '';
    const sApt = document.getElementById('checkout-addr-apt')?.value || '';
    const sCity = document.getElementById('checkout-addr-city')?.value || '';
    const sState = document.getElementById('checkout-addr-state')?.value || '';
    const sZip = document.getElementById('checkout-addr-zip')?.value || '';
    if (sStreet && sCity && sState && sZip) {
      address = `${sStreet}${sApt ? ' ' + sApt : ''}, ${sCity}, ${sState} ${sZip}`;
    }
  }
    
  if (checkoutState.orderType === 'delivery' && !address) {
    showToast('Please enter a delivery address');
    return;
  }

  const saveAddress = document.getElementById('save-address-default')?.checked;
  const saveCard = document.getElementById('save-card-default')?.checked;
  
  let newPaymentMethod = null;
  if (checkoutState.paymentMethodId === 'new' || state.user.paymentMethods?.length === 0) {
    const cardNum = document.getElementById('checkout-card-num')?.value;
    const cardExp = document.getElementById('checkout-card-exp')?.value;
    if (!cardNum || !cardExp) {
      showToast('Please enter new card details');
      return;
    }
    const expParts = cardExp.split('/');
    newPaymentMethod = {
      cardType: cardNum.startsWith('3') ? 'amex' : cardNum.startsWith('5') ? 'mastercard' : 'visa',
      lastFour: cardNum.slice(-4).replace(/\D/g, '') || '1234',
      cardHolder: document.getElementById('checkout-card-name')?.value || state.user.name,
      expiryMonth: parseInt(expParts[0]) || 12,
      expiryYear: (parseInt(expParts[1]) || 30) + 2000
    };
  }

  if ((saveAddress && checkoutState.orderType === 'delivery') || (saveCard && newPaymentMethod)) {
    try {
      await fetch(`${API_URL}/auth/me`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ 
          defaultAddress: saveAddress && checkoutState.orderType === 'delivery' ? address : undefined, 
          paymentMethod: saveCard ? newPaymentMethod : undefined 
        })
      });
      await fetchUser(localStorage.getItem('token'));
    } catch(e) {}
  }
  
  let paymentId = checkoutState.paymentMethodId;
  if (paymentId === 'new' || !paymentId) {
    paymentId = state.user.paymentMethods?.[0]?.id || null;
  }
  
  try {
    const res = await fetch(`${API_URL}/orders`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      },
      body: JSON.stringify({ 
        orderType: checkoutState.orderType,
        address: address,
        paymentMethodId: paymentId,
        saveAsFavorite: document.getElementById('checkout-save-favorite')?.checked
      })
    });
    
    if (res.ok) {
      showToast('Order placed successfully! 🎉');
      await fetchUser(localStorage.getItem('token'));
      updateCartCount();
      navigate('home');
    } else {
      const data = await res.json();
      showToast(data.error || 'Failed to place order');
    }
  } catch (e) {
    showToast('Network error');
  }
};

// --- Pages ---

function renderHome(header, container) {
  renderHeader(header, '', true);

  let progressStr = '0%';
  let tierInfo = 'Sign in to earn points';
  
  if (state.user && state.user.rewards) {
    const totalPoints = state.user.rewards.total_points_earned || 0;
    const balance = state.user.rewards.points || 0;
    
    if (totalPoints < 1000) {
      progressStr = `${(totalPoints / 1000) * 100}%`;
      tierInfo = `Member (${1000 - totalPoints} pts to Silver) • ${balance} balance`;
    } else if (totalPoints < 3000) {
      progressStr = `${((totalPoints - 1000) / 2000) * 100}%`;
      tierInfo = `Silver 2% Off (${3000 - totalPoints} pts to Gold) • ${balance} balance`;
    } else if (totalPoints < 5000) {
      progressStr = `${((totalPoints - 3000) / 2000) * 100}%`;
      tierInfo = `Gold 3% Off (${5000 - totalPoints} pts to Platinum) • ${balance} balance`;
    } else {
      progressStr = '100%';
      tierInfo = `Platinum 5% Off (Max Tier) • ${balance} balance`;
    }
  }

  container.innerHTML = `
    <div class="px-container-padding pt-stack-lg flex flex-col gap-section-gap">
      <!-- Rewards Card -->
      <section onclick="navigate('rewards')" class="cursor-pointer">
        <div class="bg-surface-container-lowest rounded-xl p-gutter shadow-[0_4px_12px_rgba(0,0,0,0.04)] border border-surface-variant flex flex-col gap-stack-md relative overflow-hidden">
          <div class="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-bl-full -mr-8 -mt-8"></div>
          <div class="flex justify-between items-start z-10">
            <div>
              <h2 class="text-headline-md font-headline-md text-on-surface">CFB Fresh Rewards</h2>
              <p class="text-body-sm font-body-sm text-secondary mt-1">${tierInfo}</p>
            </div>
            <span class="material-symbols-outlined text-primary text-[28px]" style="font-variation-settings: 'FILL' 1;">loyalty</span>
          </div>
          ${state.user ? `
            <div class="w-full bg-surface-variant rounded-full h-2 mt-stack-sm z-10">
              <div class="bg-primary h-2 rounded-full transition-all duration-500" style="width: ${progressStr}"></div>
            </div>
            <div class="flex justify-between items-center mt-stack-sm z-10">
              <span class="text-label-lg font-label-lg text-on-surface">View Balance</span>
              <button class="bg-primary text-on-primary px-4 py-2 rounded-lg text-label-sm font-label-sm flex items-center gap-2 hover:bg-primary-container transition-colors">
                Redeem
                <span class="material-symbols-outlined text-[16px]">arrow_forward</span>
              </button>
            </div>
          ` : ''}
        </div>
      </section>

      <!-- Recent Orders (Only if logged in) -->
      ${state.user ? `
      <section class="flex flex-col gap-gutter">
        <div class="flex justify-between items-end">
          <h2 class="text-headline-md font-headline-md text-on-surface">Recent Orders</h2>
          <button onclick="navigate('account')" class="text-label-lg font-label-lg text-primary hover:text-primary-container">View all</button>
        </div>
        
        <!-- Draggable container -->
        <div class="relative w-full overflow-hidden">
          <div id="recent-orders-track" class="flex gap-4 overflow-x-auto pb-4 no-scrollbar select-none cursor-grab active:cursor-grabbing" style="-webkit-overflow-scrolling: touch;">
            <div class="w-full text-center text-body-sm text-secondary">Loading...</div>
          </div>
          <!-- Custom Scrollbar Track -->
          <div class="absolute bottom-0 left-0 right-0 h-1 bg-surface-variant rounded-full overflow-hidden hidden" id="recent-orders-scrollbar-track">
            <div id="recent-orders-scrollbar-thumb" class="h-full bg-primary rounded-full w-1/3 relative"></div>
          </div>
        </div>
      </section>
      ` : ''}

      <!-- Featured Items -->
      <section class="flex flex-col gap-gutter pb-section-gap">
        <div class="flex justify-between items-end">
          <h2 class="text-headline-md font-headline-md text-on-surface">Featured & Seasonal</h2>
          <button onclick="navigate('menu')" class="text-label-lg font-label-lg text-primary hover:text-primary-container">View Menu</button>
        </div>
        <div class="grid grid-cols-1 gap-stack-lg" id="featured-container">
          <div class="p-4 text-center">Loading featured items...</div>
        </div>
      </section>
    </div>
  `;

  // Fetch featured
  fetch(`${API_URL}/menu?featured=true`)
    .then(r => r.json())
    .then(items => {
      const fc = document.getElementById('featured-container');
      fc.innerHTML = '';
      items.slice(0, 2).forEach(item => {
        const fallbackImg = `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='400' height='200'><rect width='100%' height='100%' fill='%23f9f9f9'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' font-size='50'>🐔</text></svg>`;
        fc.innerHTML += `
          <div class="bg-surface-container-lowest rounded-xl overflow-hidden shadow-[0_4px_12px_rgba(0,0,0,0.04)] border border-surface-variant">
            <div class="h-48 w-full relative">
              <img alt="${item.name}" class="w-full h-full object-cover" src="${item.image_url || fallbackImg}">
              <div class="absolute top-4 left-4 bg-tertiary-container text-on-tertiary-container px-3 py-1 rounded-full text-label-sm font-label-sm shadow-sm">
                Featured
              </div>
            </div>
            <div class="p-gutter flex flex-col gap-stack-sm">
              <div class="flex justify-between items-start">
                <h3 class="text-headline-md font-headline-md text-on-surface">${item.name}</h3>
                <span class="text-label-lg font-label-lg text-on-surface">$${item.price.toFixed(2)}</span>
              </div>
              <p class="text-body-sm font-body-sm text-secondary">${item.description}</p>
              <button onclick="addToCart(${item.id})" class="mt-2 w-full bg-surface-container-low text-on-surface hover:bg-surface-container-high py-3 rounded-lg text-label-lg font-label-lg transition-colors">
                Add to Order
              </button>
            </div>
          </div>
        `;
      });
    });

  // Fetch recent orders
  if (state.user) {
    fetch(`${API_URL}/orders`, { headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` } })
      .then(r => r.json())
      .then(orders => {
        const trackEl = document.getElementById('recent-orders-track');
        const scrollTrack = document.getElementById('recent-orders-scrollbar-track');
        const scrollThumb = document.getElementById('recent-orders-scrollbar-thumb');
        if (!trackEl) return;
        
        trackEl.innerHTML = '';
        if (!orders || orders.length === 0) {
          trackEl.innerHTML = '<div class="w-full text-center text-body-sm text-secondary">No recent orders found.</div>';
          return;
        }

        const topOrders = orders.slice(0, 4);
        topOrders.forEach(order => {
          let itemsHtml = '';
          const displayItems = order.items.slice(0, 3);
          displayItems.forEach(i => {
            itemsHtml += `<div class="text-body-sm font-body-sm text-secondary truncate">${i.quantity}x ${i.name}</div>`;
          });
          if (order.items.length > 3) {
            itemsHtml += `<div class="text-body-sm font-body-sm text-secondary">...</div>`;
          }

          let mostExpensiveItem = order.items.reduce((max, item) => (item.price > max.price ? item : max), order.items[0]);
          const fallbackImg = `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100'><rect width='100%' height='100%' fill='%23f9f9f9'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' font-size='20'>🐔</text></svg>`;
          const imageUrl = mostExpensiveItem && mostExpensiveItem.image_url ? mostExpensiveItem.image_url : fallbackImg;

          trackEl.innerHTML += `
            <div onclick="showOrderDetails(${order.id})" class="min-w-[280px] w-[80%] max-w-[320px] shrink-0 bg-surface-container-lowest border border-surface-variant rounded-xl p-4 shadow-[0_4px_12px_rgba(0,0,0,0.04)] cursor-pointer hover:bg-surface-container-low transition-colors flex flex-col gap-3 pointer-events-auto">
              <div class="flex gap-4">
                <img src="${imageUrl}" class="w-20 h-20 object-cover rounded-lg shrink-0">
                <div class="flex flex-col flex-1 overflow-hidden">
                  <h3 class="text-headline-md font-headline-md text-on-surface truncate">Order #${order.id}</h3>
                  <div class="flex flex-col flex-1 mt-1">${itemsHtml}</div>
                </div>
              </div>
              <button onclick="event.stopPropagation(); reorderOrder(${order.id})" class="w-full mt-1 border border-surface-variant text-on-surface hover:bg-primary hover:text-on-primary hover:border-primary py-2 rounded-lg text-label-sm font-label-sm flex items-center justify-center gap-2 transition-all pointer-events-auto shadow-sm">
                <span class="material-symbols-outlined text-[16px]">add_shopping_cart</span> Reorder
              </button>
            </div>
          `;
        });

        // Setup dragging and slider
        if (topOrders.length > 1) {
          scrollTrack.classList.remove('hidden');
        }
        
        const updateIndicator = () => {
          const maxScroll = trackEl.scrollWidth - trackEl.clientWidth;
          if (maxScroll <= 0) {
            scrollTrack.style.display = 'none';
            return;
          }
          scrollTrack.style.display = 'block';
          const pct = trackEl.scrollLeft / maxScroll;
          const maxThumbLeft = scrollTrack.clientWidth - scrollThumb.clientWidth;
          scrollThumb.style.left = `${pct * maxThumbLeft}px`;
        };
        trackEl.addEventListener('scroll', updateIndicator);
        window.addEventListener('resize', updateIndicator);
        setTimeout(updateIndicator, 100);

        let isDown = false;
        let startX;
        let scrollLeft;
        let isDragging = false;

        trackEl.addEventListener('mousedown', (e) => {
          isDown = true;
          isDragging = false;
          trackEl.classList.remove('cursor-grab');
          trackEl.classList.add('cursor-grabbing');
          startX = e.pageX - trackEl.offsetLeft;
          scrollLeft = trackEl.scrollLeft;
        });
        trackEl.addEventListener('mouseleave', () => {
          isDown = false;
          trackEl.classList.remove('cursor-grabbing');
          trackEl.classList.add('cursor-grab');
        });
        trackEl.addEventListener('mouseup', () => {
          isDown = false;
          trackEl.classList.remove('cursor-grabbing');
          trackEl.classList.add('cursor-grab');
        });
        trackEl.addEventListener('mousemove', (e) => {
          if (!isDown) return;
          e.preventDefault();
          const x = e.pageX - trackEl.offsetLeft;
          const walk = (x - startX) * 2;
          if (Math.abs(walk) > 5) {
            isDragging = true;
          }
          trackEl.scrollLeft = scrollLeft - walk;
        });

        trackEl.querySelectorAll('button, div[onclick]').forEach(btn => {
          btn.addEventListener('click', (e) => {
            if (isDragging) {
              e.stopPropagation();
              e.preventDefault();
            }
          }, true);
        });

        scrollTrack.style.cursor = 'pointer';
        const updateScrollFromTrack = (e) => {
          const trackRect = scrollTrack.getBoundingClientRect();
          const indicatorWidth = trackRect.width * (trackEl.clientWidth / trackEl.scrollWidth);
          let x = e.clientX - trackRect.left;
          x = x - (indicatorWidth / 2);
          const maxTrackX = trackRect.width - indicatorWidth;
          let pct = maxTrackX > 0 ? x / maxTrackX : 0;
          if (pct < 0) pct = 0;
          if (pct > 1) pct = 1;
          const maxScroll = trackEl.scrollWidth - trackEl.clientWidth;
          trackEl.scrollLeft = pct * maxScroll;
        };

        const trackMouseup = () => {
          document.body.style.userSelect = '';
          window.removeEventListener('mousemove', updateScrollFromTrack);
          window.removeEventListener('mouseup', trackMouseup);
        };

        scrollTrack.addEventListener('mousedown', (e) => {
          document.body.style.userSelect = 'none';
          updateScrollFromTrack(e);
          window.addEventListener('mousemove', updateScrollFromTrack);
          window.addEventListener('mouseup', trackMouseup);
        });
      });
  }
}

async function renderMenu(header, container) {
  renderHeader(header, 'Menu');
  
  container.innerHTML = `
    <div class="px-container-padding pt-stack-md pb-section-gap max-w-7xl mx-auto w-full">
      <div class="mb-4">
        <input type="text" id="menu-search-input" placeholder="Search menu (e.g. sandwich, meal, ice cream)" class="w-full bg-surface-container-lowest border border-surface-variant rounded-full py-3 px-6 text-body-lg font-body-lg focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors shadow-sm">
      </div>
      <div class="relative mb-stack-lg">
        <div class="flex gap-gutter overflow-x-auto no-scrollbar pb-stack-sm" id="cat-chips">
          <!-- Categories -->
        </div>
        <div class="w-full h-1 bg-surface-container rounded-full mx-auto overflow-hidden max-w-[100px] mt-1" id="cat-chips-indicator-track" style="display:none;">
          <div id="cat-chips-indicator" class="h-full bg-primary rounded-full"></div>
        </div>
      </div>
      <div id="menu-loading" class="text-center p-4">Loading menu...</div>
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-stack-lg" id="menu-content" style="display:none">
      </div>
    </div>
  `;
  
  try {
    const catsRes = await fetch(`${API_URL}/menu/categories`);
    const cats = await catsRes.json();
    
    const chips = document.getElementById('cat-chips');
    const indicator = document.getElementById('cat-chips-indicator');
    const track = document.getElementById('cat-chips-indicator-track');
    
    chips.classList.add('cursor-grab', 'select-none');
    cats.forEach((c, idx) => {
      const activeClass = idx === 0 ? 'bg-primary text-on-primary' : 'bg-surface-container text-on-surface hover:bg-surface-container-high';
      chips.innerHTML += `<button onclick="loadCategory('${c.slug}')" class="px-4 py-2 rounded-full ${activeClass} text-label-lg font-label-lg whitespace-nowrap shadow-sm transition-colors cat-chip pointer-events-auto">${c.name}</button>`;
    });

    const updateIndicator = () => {
      if (chips.scrollWidth <= chips.clientWidth) {
        track.style.display = 'none';
        return;
      }
      track.style.display = 'block';
      const maxScroll = chips.scrollWidth - chips.clientWidth;
      const pct = chips.scrollLeft / maxScroll;
      const widthPct = (chips.clientWidth / chips.scrollWidth) * 100;
      indicator.style.width = `${widthPct}%`;
      const maxTranslate = (100 / (widthPct / 100)) - 100;
      indicator.style.transform = `translateX(${pct * maxTranslate}%)`;
    };

    chips.addEventListener('scroll', updateIndicator);
    window.addEventListener('resize', updateIndicator);
    setTimeout(updateIndicator, 100);

    let searchTimeout;
    document.getElementById('menu-search-input').addEventListener('input', (e) => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        const query = e.target.value.trim();
        if (query.length > 0) {
          loadCategory(null, query);
        } else {
          loadCategory(cats[0].slug);
        }
      }, 300);
    });

    // Drag-to-scroll logic
    let isDown = false;
    let startX;
    let scrollLeft;
    let isDragging = false;

    chips.addEventListener('mousedown', (e) => {
      isDown = true;
      isDragging = false;
      chips.classList.remove('cursor-grab');
      chips.classList.add('cursor-grabbing');
      startX = e.pageX - chips.offsetLeft;
      scrollLeft = chips.scrollLeft;
    });
    chips.addEventListener('mouseleave', () => {
      isDown = false;
      chips.classList.remove('cursor-grabbing');
      chips.classList.add('cursor-grab');
    });
    chips.addEventListener('mouseup', () => {
      isDown = false;
      chips.classList.remove('cursor-grabbing');
      chips.classList.add('cursor-grab');
    });
    chips.addEventListener('mousemove', (e) => {
      if (!isDown) return;
      e.preventDefault();
      const x = e.pageX - chips.offsetLeft;
      const walk = (x - startX) * 2; // Scroll-fast multiplier
      if (Math.abs(walk) > 5) {
        isDragging = true;
      }
      chips.scrollLeft = scrollLeft - walk;
    });

    // Intercept clicks on buttons if dragging occurred
    chips.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', (e) => {
        if (isDragging) {
          e.stopPropagation();
          e.preventDefault();
        }
      }, true); // Use capture phase
    });
    
    // Slider Drag Logic
    track.style.cursor = 'pointer';
    const updateScrollFromTrack = (e) => {
      const trackRect = track.getBoundingClientRect();
      const indicatorWidth = trackRect.width * (chips.clientWidth / chips.scrollWidth);
      let x = e.clientX - trackRect.left;
      x = x - (indicatorWidth / 2);
      const maxTrackX = trackRect.width - indicatorWidth;
      let pct = maxTrackX > 0 ? x / maxTrackX : 0;
      if (pct < 0) pct = 0;
      if (pct > 1) pct = 1;
      const maxScroll = chips.scrollWidth - chips.clientWidth;
      chips.scrollLeft = pct * maxScroll;
    };

    const trackMouseup = () => {
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', updateScrollFromTrack);
      window.removeEventListener('mouseup', trackMouseup);
    };

    track.addEventListener('mousedown', (e) => {
      document.body.style.userSelect = 'none';
      updateScrollFromTrack(e);
      window.addEventListener('mousemove', updateScrollFromTrack);
      window.addEventListener('mouseup', trackMouseup);
    });

    if(cats.length > 0) loadCategory(cats[0].slug);

  } catch (e) {
    document.getElementById('menu-loading').textContent = 'Failed to load menu.';
  }
}

async function loadCategory(slug, searchQuery = null) {
  const chips = document.querySelectorAll('.cat-chip');
  chips.forEach(c => {
    if(!searchQuery && slug && c.textContent.toLowerCase() === slug.replace('-',' ')) {
      c.className = 'px-4 py-2 rounded-full bg-primary text-on-primary text-label-lg font-label-lg whitespace-nowrap shadow-sm transition-colors cat-chip pointer-events-auto';
    } else {
      c.className = 'px-4 py-2 rounded-full bg-surface-container text-on-surface hover:bg-surface-container-high text-label-lg font-label-lg whitespace-nowrap shadow-sm transition-colors cat-chip pointer-events-auto';
    }
  });

  const mc = document.getElementById('menu-content');
  const ml = document.getElementById('menu-loading');
  mc.style.display = 'none';
  ml.style.display = 'block';

  try {
    const url = searchQuery 
      ? `${API_URL}/menu?search=${encodeURIComponent(searchQuery)}` 
      : `${API_URL}/menu?category=${slug}`;
    const res = await fetch(url);
    const items = await res.json();
    mc.innerHTML = '';
    
    items.forEach(item => {
      const fallbackImg = `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100'><rect width='100%' height='100%' fill='%23f9f9f9'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' font-size='40'>🐔</text></svg>`;
      mc.innerHTML += `
        <article class="bg-surface-container-lowest rounded-xl p-stack-md flex flex-row md:flex-col gap-stack-md shadow-[0_4px_12px_rgba(0,0,0,0.04)] border border-surface-variant hover:shadow-[0_8px_24px_rgba(0,0,0,0.08)] transition-all duration-200">
          <div class="w-24 h-24 md:w-full md:h-48 flex-shrink-0 rounded-lg overflow-hidden bg-surface-container-low relative flex items-center justify-center">
            <img alt="${item.name}" class="w-full h-full object-cover" src="${item.image_url || fallbackImg}">
          </div>
          <div class="flex flex-col justify-between flex-grow">
            <div>
              ${item.is_healthier ? `<div class="flex gap-2 mb-2"><span class="px-2 py-0.5 rounded bg-tertiary-fixed text-on-tertiary-fixed text-[10px] font-bold uppercase tracking-wider">Healthier Option</span></div>` : ''}
              <h2 class="text-headline-md font-headline-md text-on-surface mb-stack-sm line-clamp-2">${item.name}</h2>
              <div class="flex items-center gap-2 text-body-sm font-body-sm text-secondary mb-stack-md">
                <span>${item.calories} Cal</span>
              </div>
            </div>
            <div class="flex items-center justify-between mt-auto">
              <span class="text-headline-md font-headline-md text-on-surface">$${item.price.toFixed(2)}</span>
              <div class="flex items-center gap-2">
                <input type="number" id="menu-qty-${item.id}" value="1" min="1" max="99" oninput="if(this.value>99)this.value=99;if(this.value<1&&this.value!=='')this.value=1;" class="w-16 px-1 h-10 text-center rounded bg-surface-container-high border-none text-on-surface font-label-lg focus:ring-2 focus:ring-primary outline-none">
                <button onclick="addToCart(${item.id})" aria-label="Add to order" class="w-10 h-10 rounded-full bg-primary text-on-primary flex items-center justify-center hover:bg-primary-container transition-colors shadow-md">
                  <span class="material-symbols-outlined" data-icon="add">add</span>
                </button>
              </div>
            </div>
          </div>
        </article>
      `;
    });
    ml.style.display = 'none';
    mc.style.display = 'grid';
  } catch (e) {}
}

async function renderCart(header, container) {
  renderHeader(header, 'My Bag', false, state.lastMainTab);
  
  const isGuest = !state.user;
  const checkoutPage = isGuest ? 'guest-checkout' : 'checkout';
  
  if (!document.getElementById('cart-items')) {
    container.innerHTML = `
      <div class="flex-grow px-container-padding pt-stack-lg pb-[160px] flex flex-col gap-section-gap max-w-3xl mx-auto w-full">
        <div id="cart-loading" class="text-center">Loading...</div>
        <section id="cart-items" class="flex flex-col gap-stack-lg" style="display:none"></section>
        <section id="cart-summary" class="bg-surface-container-lowest p-gutter rounded-xl shadow-[0_4px_12px_rgba(0,0,0,0.04)] flex flex-col gap-stack-md" style="display:none"></section>
      </div>
      <div id="checkout-btn-area" class="fixed left-0 w-full px-container-padding pb-stack-md z-40 bg-surface hidden" style="bottom: 72px;">
        <div class="pointer-events-auto shadow-[0_-2px_20px_rgba(0,0,0,0.08)] rounded-full bg-primary overflow-hidden max-w-3xl mx-auto">
          <button onclick="navigate('${checkoutPage}')" class="w-full bg-primary text-on-primary py-4 px-6 flex justify-between items-center hover:bg-primary-container transition-colors focus:outline-none focus:ring-4 focus:ring-primary-fixed-dim">
            <span class="text-label-lg font-label-lg">${isGuest ? 'Guest Checkout' : 'Check Out'}</span>
            <span id="checkout-total" class="text-headline-md font-headline-md"></span>
          </button>
        </div>
      </div>
    `;
  }
  
  try {
    let res;
    if (state.user) {
      res = await fetch(`${API_URL}/cart`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
    } else {
      res = await fetch(`${API_URL}/guest/cart`, {
        headers: { 'X-Guest-Token': getGuestToken() }
      });
    }
    const data = await res.json();
    
    document.getElementById('cart-loading').style.display = 'none';
    const itemsSection = document.getElementById('cart-items');
    const sumSection = document.getElementById('cart-summary');
    const checkoutArea = document.getElementById('checkout-btn-area');
    
    if (data.items.length === 0) {
      itemsSection.style.display = 'flex';
      sumSection.style.display = 'none';
      checkoutArea.classList.add('hidden');
      itemsSection.innerHTML = `
        <div class="text-center py-10 flex flex-col items-center">
          <img src="/images/generic_bag_1778991050603.png" alt="Empty Bag" class="w-48 h-48 object-cover mb-4">
          <h2 class="text-headline-md mb-2">Your bag is empty</h2>
          <button onclick="navigate('menu')" class="mt-4 bg-surface-container-low hover:bg-surface-container-highest transition-colors py-2 px-6 rounded-full font-label-lg shadow-sm hover:shadow-md">Browse Menu</button>
        </div>
      `;
      return;
    }
    
    itemsSection.style.display = 'flex';
    sumSection.style.display = 'flex';
    checkoutArea.classList.remove('hidden');
    
    const currentCartPointsUsed = data.items.reduce((sum, item) => {
      let pts = 0;
      try {
        const mods = JSON.parse(item.modifiers || '[]');
        mods.forEach(m => {
          if (m.points_cost) pts += m.points_cost;
        });
      } catch(e) {}
      return sum + (pts * item.quantity);
    }, 0);
    if (state.user) state.user.points = data.points;
    state.cartPointsUsed = currentCartPointsUsed;
    
    itemsSection.innerHTML = '';
    data.items.forEach(item => {
      let itemPrice = item.price;
      let pointsCost = 0;
      let rewardTag = '';
      let modsDisplay = '';
      let pureMods = [];
      try {
        const mods = JSON.parse(item.modifiers || '[]');
        mods.forEach(m => {
          itemPrice += (m.price_modifier || 0);
          if (m.points_cost) {
            pointsCost += m.points_cost;
            rewardTag = `<div class="text-body-sm text-primary font-bold mt-1">Reward Redeemed (-${m.points_cost} pts/ea)</div>`;
          } else {
            pureMods.push(m);
            modsDisplay += `<div class="text-body-sm text-secondary">${m.name} x ${item.quantity}</div>`;
          }
        });
      } catch(e) {}
      
      const itemTotal = itemPrice * item.quantity;
      const fallbackImg = `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='80' height='80'><rect width='100%' height='100%' fill='%23f9f9f9'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' font-size='30'>🐔</text></svg>`;
      
      const canAddMore = pointsCost === 0 || ((data.points - currentCartPointsUsed) >= pointsCost);
      const addDisabledClass = canAddMore ? 'hover:bg-surface-variant text-on-surface' : 'opacity-30 cursor-not-allowed text-secondary';
      const addDisabledAttr = canAddMore ? '' : 'disabled';
      
      itemsSection.innerHTML += `
        <div class="bg-surface-container-lowest p-gutter rounded-xl shadow-[0_4px_12px_rgba(0,0,0,0.04)] flex gap-gutter items-start">
          <div class="w-20 h-20 rounded-lg overflow-hidden shrink-0 bg-surface-container-high flex items-center justify-center">
            <img alt="${item.name}" class="w-full h-full object-cover" src="${item.image_url || fallbackImg}">
          </div>
          <div class="flex-grow flex flex-col gap-stack-sm">
            <div class="flex justify-between items-start">
              <h3 class="text-headline-md font-headline-md text-on-surface">${item.name}</h3>
              <span class="text-label-lg font-label-lg text-on-surface">$${itemTotal.toFixed(2)}</span>
            </div>
            <p class="text-body-sm font-body-sm text-secondary">${item.calories} Cal</p>
            ${rewardTag}
            ${modsDisplay}
            ${item.mod_count > 0 ? `<button onclick="editCartItem(${item.id}, ${item.menu_item_id})" class="text-body-sm text-primary font-bold underline cursor-pointer self-start">edit</button>` : ''}
            <div class="flex justify-between items-center mt-stack-md">
              <div class="flex items-center gap-2 bg-surface-container rounded-full px-2 py-1">
                <button onclick="updateCartItem(${item.id}, ${item.quantity - 1})" class="w-6 h-6 rounded-full flex items-center justify-center text-on-surface hover:bg-surface-variant transition-colors">
                  <span class="material-symbols-outlined text-[16px]" data-icon="remove">remove</span>
                </button>
                <span class="text-label-lg font-label-lg w-4 text-center">${item.quantity}</span>
                <button onclick="updateCartItem(${item.id}, ${item.quantity + 1})" class="w-6 h-6 rounded-full flex items-center justify-center transition-colors ${addDisabledClass}" ${addDisabledAttr}>
                  <span class="material-symbols-outlined text-[16px]" data-icon="add">add</span>
                </button>
              </div>
              <button onclick="updateCartItem(${item.id}, 0)" class="text-body-sm font-body-sm text-secondary hover:text-error transition-colors underline">Remove</button>
            </div>
          </div>
        </div>
      `;
    });

    sumSection.innerHTML = `
      <h2 class="text-headline-md font-headline-md text-on-surface mb-stack-sm">Order Summary</h2>
      <div class="flex justify-between items-center text-body-lg font-body-lg text-on-surface">
        <span>Subtotal</span><span>$${data.subtotal.toFixed(2)}</span>
      </div>
      ${data.discount > 0 ? `
      <div class="flex justify-between items-center text-body-lg font-body-lg text-green-600">
        <span class="capitalize">Tier Discount (${data.tier})</span><span>-$${data.discount.toFixed(2)}</span>
      </div>
      ` : ''}
      <div class="flex justify-between items-center text-body-sm font-body-sm text-secondary">
        <span>Tax</span><span>$${data.tax.toFixed(2)}</span>
      </div>
      <hr class="border-surface-variant my-stack-sm"/>
      <div class="flex justify-between items-center text-headline-lg-mobile font-headline-lg-mobile text-on-surface">
        <span>Total</span><span>$${data.total.toFixed(2)}</span>
      </div>
    `;

    document.getElementById('checkout-total').textContent = `$${data.total.toFixed(2)}`;
    
  } catch (e) {
    document.getElementById('cart-loading').textContent = 'Failed to load cart.';
  }
}

async function renderRewards(header, container) {
  renderHeader(header, 'Rewards');
  if (!state.user) {
    navigate('account');
    return;
  }
  
  container.innerHTML = `
    <div class="px-container-padding pt-stack-lg w-full max-w-3xl mx-auto">
      <div id="rewards-loading">Loading...</div>
      <div id="rewards-content" style="display: none;" class="flex flex-col gap-6">
        <div class="bg-primary text-on-primary p-gutter rounded-xl shadow-lg relative overflow-hidden">
          <div class="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-bl-full -mr-8 -mt-8"></div>
          <h2 class="text-headline-md font-headline-md mb-2 z-10 relative" id="tier-name">Tier</h2>
          <div class="text-display-lg font-display-lg z-10 relative">
            <span id="points-balance">0</span> <span class="text-headline-md font-normal opacity-90">pts</span>
          </div>
          <p id="points-to-next" class="text-body-sm opacity-90 mt-2 z-10 relative"></p>
        </div>
        
        <div id="redeem-items" class="mt-4"></div>
      </div>
    </div>
  `;
  
  try {
    const res = await fetch(`${API_URL}/rewards`, {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
    });
    const data = await res.json();
    
    document.getElementById('rewards-loading').style.display = 'none';
    document.getElementById('rewards-content').style.display = 'flex';
    
    const remainingPoints = data.points - (state.cartPointsUsed || 0);

    document.getElementById('tier-name').textContent = `${data.tier.charAt(0).toUpperCase() + data.tier.slice(1)} Member`;
    document.getElementById('points-balance').textContent = remainingPoints.toLocaleString();
    
    if (data.tierInfo.next) {
      document.getElementById('points-to-next').textContent = `${data.pointsToNext.toLocaleString()} points until ${data.tierInfo.next.charAt(0).toUpperCase() + data.tierInfo.next.slice(1)}`;
    } else {
      document.getElementById('points-to-next').textContent = 'You are at the highest tier!';
    }

    // Fetch redeemable items
    const redeemRes = await fetch(`${API_URL}/rewards/redeemable`, {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
    });
    const redeemData = await redeemRes.json();

    const available = redeemData.redeemableItems.filter(i => i.redeem_points <= remainingPoints);
    const more = redeemData.redeemableItems.filter(i => i.redeem_points > remainingPoints);

    let html = '';
    if (available.length > 0) {
      html += `<h3 class="text-headline-md mb-3 mt-6">Available to Redeem</h3>
               <div class="grid grid-cols-1 md:grid-cols-2 gap-4">`;
      available.forEach(item => {
        const maxQty = Math.floor(remainingPoints / item.redeem_points);
        html += `
          <div class="bg-surface-container-lowest p-4 rounded-xl shadow-sm border border-surface-variant flex items-center gap-4">
            <div class="w-16 h-16 bg-surface-container rounded-md overflow-hidden flex-shrink-0">
              <img src="${item.image_url}" class="w-full h-full object-cover">
            </div>
            <div class="flex-grow">
              <div class="text-label-lg font-bold text-on-surface">${item.name}</div>
              <div class="text-body-sm text-primary font-bold">${item.redeem_points} pts</div>
            </div>
            <div class="flex items-center gap-2">
              <input type="number" id="reward-qty-${item.id}" value="1" min="1" max="${maxQty}" oninput="if(this.value>${maxQty})this.value=${maxQty};if(this.value<1&&this.value!=='')this.value=1;" class="w-16 px-1 h-10 text-center rounded bg-surface-container border-none text-on-surface font-label-lg focus:ring-2 focus:ring-primary outline-none">
              <button onclick="redeemReward(${item.id}, ${item.price}, ${item.redeem_points})" class="w-10 h-10 rounded-full bg-primary text-on-primary flex items-center justify-center hover:bg-primary-container transition-colors shadow-md">
                <span class="material-symbols-outlined" data-icon="add">add</span>
              </button>
            </div>
          </div>
        `;
      });
      html += `</div>`;
    }

    if (more.length > 0) {
      html += `<h3 class="text-headline-md mb-3 mt-6">More Rewards</h3>
               <div class="grid grid-cols-1 md:grid-cols-2 gap-4">`;
      more.forEach(item => {
        html += `
          <div class="bg-surface-container-lowest p-4 rounded-xl shadow-sm border border-surface-variant flex items-center gap-4">
            <div class="w-16 h-16 bg-surface-container rounded-md overflow-hidden flex-shrink-0">
              <img src="${item.image_url}" class="w-full h-full object-cover">
            </div>
            <div class="flex-grow">
              <div class="text-label-lg font-bold text-on-surface">${item.name}</div>
              <div class="text-body-sm text-secondary">${item.redeem_points} pts</div>
            </div>
          </div>
        `;
      });
      html += `</div>`;
    }

    document.getElementById('redeem-items').innerHTML = html;

  } catch (e) {
    document.getElementById('rewards-loading').textContent = 'Failed to load rewards.';
  }
}
async function renderCheckout(header, container) {
  renderHeader(header, 'Checkout', false, 'cart');
  
  if (!state.user) {
    navigate('account');
    return;
  }
  
  const defaultAddress = state.user.default_address || '';
  const paymentMethods = state.user.paymentMethods || [];
  let defaultCardId = paymentMethods.find(p => p.is_default)?.id || (paymentMethods[0]?.id || '');
  
  const parsedAddr = parseAddress(defaultAddress);

  // Fake locations
  const locations = [
    { id: 'loc1', name: 'Chick-fil-B Downtown', dist: '1.2 mi', time: '10-15 min' },
    { id: 'loc2', name: 'Chick-fil-B Northside', dist: '3.4 mi', time: '15-20 min' },
    { id: 'loc3', name: 'Chick-fil-B Westend', dist: '5.1 mi', time: '20-25 min' }
  ];

  window.checkoutState = { orderType: 'pickup', locationId: 'loc1', addressObj: parsedAddr, paymentMethodId: defaultCardId };

  container.innerHTML = `
    <div class="px-container-padding pt-stack-lg flex flex-col gap-section-gap max-w-3xl mx-auto w-full pb-32">
      
      <!-- Order Type Tabs -->
      <div class="flex p-1 bg-surface-container rounded-full shadow-sm">
        <button onclick="switchOrderType('pickup')" id="tab-pickup" class="flex-1 py-3 text-label-lg font-label-lg rounded-full bg-primary text-on-primary transition-colors">Pickup</button>
        <button onclick="switchOrderType('delivery')" id="tab-delivery" class="flex-1 py-3 text-label-lg font-label-lg rounded-full text-on-surface hover:bg-surface-variant transition-colors">Delivery</button>
      </div>

      <!-- Content -->
      <div id="checkout-content"></div>

      <!-- Payment -->
      <div class="bg-surface-container-lowest p-gutter rounded-xl shadow-[0_4px_12px_rgba(0,0,0,0.04)] border border-surface-variant">
        <h2 class="text-headline-sm mb-4">Payment Method</h2>
        ${paymentMethods.length > 0 ? `
          <select id="checkout-payment" onchange="window.onCheckoutPaymentChange(this.value)" class="w-full p-4 bg-surface-container border border-outline rounded-lg text-body-lg mb-4">
            ${paymentMethods.map(p => `<option value="${p.id}" ${p.id === defaultCardId ? 'selected' : ''}>${p.card_type.toUpperCase()} ending in ${p.last_four}</option>`).join('')}
            <option value="new">Use a new card...</option>
          </select>
        ` : ''}
        
        <div id="new-card-form" class="${paymentMethods.length > 0 ? 'hidden' : 'flex'} flex-col gap-4">
          <input type="text" id="checkout-card-name" placeholder="Name on Card" value="${state.user.name}" class="w-full p-4 bg-surface-container border border-outline rounded-lg text-body-lg focus:outline-none focus:border-primary">
          <input type="text" id="checkout-card-num" placeholder="Card Number" class="w-full p-4 bg-surface-container border border-outline rounded-lg text-body-lg focus:outline-none focus:border-primary">
          <div class="flex gap-4">
            <input type="text" id="checkout-card-exp" placeholder="MM/YY" class="w-1/2 p-4 bg-surface-container border border-outline rounded-lg text-body-lg focus:outline-none focus:border-primary">
            <input type="text" id="checkout-card-cvc" placeholder="CVC" class="w-1/2 p-4 bg-surface-container border border-outline rounded-lg text-body-lg focus:outline-none focus:border-primary">
          </div>
          <div class="flex items-center gap-2 mt-1">
            <input type="checkbox" id="save-card-default" class="w-5 h-5 accent-primary cursor-pointer">
            <label for="save-card-default" class="text-body-sm cursor-pointer text-secondary">Save as default payment method</label>
          </div>
        </div>
      </div>
      
    </div>
    
    <div class="fixed left-0 w-full px-container-padding pb-stack-md z-40 bg-surface" style="bottom: 72px;">
      <div class="max-w-3xl mx-auto flex items-center gap-2 mb-3 px-2">
        <input type="checkbox" id="checkout-save-favorite" class="w-5 h-5 accent-primary cursor-pointer">
        <label for="checkout-save-favorite" class="text-body-sm cursor-pointer text-secondary font-bold flex items-center gap-1"><span class="material-symbols-outlined text-[18px] text-primary" data-weight="fill">star</span> Save as favorite order</label>
      </div>
      <div class="pointer-events-auto shadow-[0_-2px_20px_rgba(0,0,0,0.08)] rounded-full bg-primary overflow-hidden max-w-3xl mx-auto">
        <button onclick="submitCheckout()" class="w-full bg-primary text-on-primary py-4 px-6 font-label-lg hover:bg-primary-container transition-colors">
          Place Order
        </button>
      </div>
    </div>
  `;

  window.switchOrderType = (type) => {
    checkoutState.orderType = type;
    document.getElementById('tab-pickup').className = type === 'pickup' ? 'flex-1 py-3 text-label-lg font-label-lg rounded-full bg-primary text-on-primary transition-colors' : 'flex-1 py-3 text-label-lg font-label-lg rounded-full text-on-surface hover:bg-surface-variant transition-colors';
    document.getElementById('tab-delivery').className = type === 'delivery' ? 'flex-1 py-3 text-label-lg font-label-lg rounded-full bg-primary text-on-primary transition-colors' : 'flex-1 py-3 text-label-lg font-label-lg rounded-full text-on-surface hover:bg-surface-variant transition-colors';
    
    if (type === 'pickup') {
      document.getElementById('checkout-content').innerHTML = `
        <div class="bg-surface-container-lowest p-gutter rounded-xl shadow-[0_4px_12px_rgba(0,0,0,0.04)] border border-surface-variant">
          <h2 class="text-headline-sm mb-4">Select Location</h2>
          <div class="flex flex-col gap-3">
            ${locations.map(loc => `
              <div onclick="checkoutState.locationId = '${loc.id}'; switchOrderType('pickup');" class="p-4 border rounded-xl cursor-pointer flex justify-between items-center transition-colors ${checkoutState.locationId === loc.id ? 'border-primary bg-primary/5' : 'border-outline hover:border-primary'}">
                <div>
                  <div class="font-bold text-label-lg">${loc.name}</div>
                  <div class="text-body-sm text-secondary mt-1">${loc.dist} • Ready in <span class="text-primary font-bold">${loc.time}</span></div>
                </div>
                ${checkoutState.locationId === loc.id ? '<span class="material-symbols-outlined text-primary" data-icon="check_circle">check_circle</span>' : ''}
              </div>
            `).join('')}
          </div>
        </div>
      `;
    } else {
      document.getElementById('checkout-content').innerHTML = `
        <div class="bg-surface-container-lowest p-gutter rounded-xl shadow-[0_4px_12px_rgba(0,0,0,0.04)] border border-surface-variant">
          <h2 class="text-headline-sm mb-4">Delivery Details</h2>
          <div class="flex flex-col gap-4">
            <input type="text" id="checkout-addr-street" value="${checkoutState.addressObj.street}" onchange="checkoutState.addressObj.street = this.value" placeholder="Street Address" class="w-full p-4 bg-surface-container border border-outline rounded-lg text-body-lg focus:outline-none focus:border-primary">
            <input type="text" id="checkout-addr-apt" value="${checkoutState.addressObj.apt}" onchange="checkoutState.addressObj.apt = this.value" placeholder="Apt, Suite, etc. (optional)" class="w-full p-4 bg-surface-container border border-outline rounded-lg text-body-lg focus:outline-none focus:border-primary">
            <div class="flex gap-4">
              <input type="text" id="checkout-addr-city" value="${checkoutState.addressObj.city}" onchange="checkoutState.addressObj.city = this.value" placeholder="City" class="w-1/2 p-4 bg-surface-container border border-outline rounded-lg text-body-lg focus:outline-none focus:border-primary">
              <div class="flex gap-4 w-1/2">
                <input type="text" id="checkout-addr-state" value="${checkoutState.addressObj.state}" onchange="checkoutState.addressObj.state = this.value" placeholder="State" class="w-1/2 p-4 bg-surface-container border border-outline rounded-lg text-body-lg focus:outline-none focus:border-primary">
                <input type="text" id="checkout-addr-zip" value="${checkoutState.addressObj.zip}" onchange="checkoutState.addressObj.zip = this.value" placeholder="Zip" class="w-1/2 p-4 bg-surface-container border border-outline rounded-lg text-body-lg focus:outline-none focus:border-primary">
              </div>
            </div>
          </div>
          <div class="mt-4 flex items-center gap-2">
            <input type="checkbox" id="save-address-default" class="w-5 h-5 accent-primary cursor-pointer">
            <label for="save-address-default" class="text-body-sm cursor-pointer text-secondary">Save as default address</label>
          </div>
          <div class="text-body-sm text-secondary mt-4 flex items-center gap-2">
            <span class="material-symbols-outlined text-[18px]">schedule</span>
            Estimated delivery: <strong class="text-on-surface">30-45 mins</strong>
          </div>
        </div>
      `;
    }
  };

  window.onCheckoutPaymentChange = (val) => {
    checkoutState.paymentMethodId = val;
    document.getElementById('new-card-form').style.display = val === 'new' ? 'flex' : 'none';
  };

  switchOrderType('pickup');
}

async function renderAccount(header, container) {
  renderHeader(header, 'Account');
  
  if (state.user) {
    let ordersHtml = '<div class="text-center text-secondary py-4">Loading past orders...</div>';
    
    // Render initial layout immediately
    container.innerHTML = `
      <div class="px-container-padding pt-stack-lg max-w-md mx-auto w-full pb-32">
        <div class="bg-surface-container-lowest rounded-xl p-gutter shadow-[0_4px_12px_rgba(0,0,0,0.04)] border border-surface-variant flex flex-col items-center gap-4 text-center">
          <div class="w-20 h-20 rounded-full bg-surface-container-highest flex items-center justify-center text-[32px] font-bold text-primary">
            ${state.user.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <h2 class="text-headline-lg font-headline-lg">${state.user.name}</h2>
            <p class="text-body-sm text-secondary">${state.user.email}</p>
          </div>
          <button onclick="logout()" class="w-full mt-4 bg-surface-container-low text-on-surface py-3 rounded-lg font-label-lg hover:bg-surface-variant transition-colors">
            Sign Out
          </button>
        </div>
        
        <div class="mt-8 bg-surface-container-lowest rounded-xl p-gutter shadow-[0_4px_12px_rgba(0,0,0,0.04)] border border-surface-variant">
          <div class="flex justify-between items-center mb-6 border-b border-surface-variant pb-4">
            <h2 class="text-headline-md font-headline-md text-on-surface">Profile Info</h2>
            <button onclick="navigate('profile-settings')" class="text-primary font-bold hover:underline">Update</button>
          </div>
          
          <div class="flex flex-col gap-6">
            <div>
              <h3 class="text-label-lg font-bold text-on-surface mb-2 flex items-center gap-2">
                <span class="material-symbols-outlined text-[20px] text-primary">local_shipping</span>
                Delivery Address
              </h3>
              <p class="text-body-lg text-secondary">${state.user.default_address || 'Not set'}</p>
            </div>
            <hr class="border-surface-variant">
            <div>
              <h3 class="text-label-lg font-bold text-on-surface mb-2 flex items-center gap-2">
                <span class="material-symbols-outlined text-[20px] text-primary">credit_card</span>
                Payment Method
              </h3>
              <p class="text-body-lg text-secondary">
                ${state.user.paymentMethods?.[0]?.last_four ? `${state.user.paymentMethods[0].card_type.toUpperCase()} ending in ${state.user.paymentMethods[0].last_four}` : 'Not set'}
              </p>
            </div>
          </div>
        </div>
        
        <div class="mt-8">
          <h2 class="text-headline-md mb-4">Order History</h2>
          <div id="order-history-container" class="flex flex-col gap-4">
            ${ordersHtml}
          </div>
        </div>
      </div>
    `;

    try {
      const res = await fetch(`${API_URL}/orders`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (res.ok) {
        const orders = await res.json();
        if (orders.length === 0) {
          ordersHtml = '<div class="text-center text-secondary py-4 bg-surface-container-lowest rounded-xl border border-surface-variant">No past orders.</div>';
        } else {
          ordersHtml = orders.map(order => `
            <div class="bg-surface-container-lowest p-4 rounded-xl shadow-sm border border-surface-variant">
              <div class="flex justify-between items-start mb-2">
                <div>
                  <div class="text-label-lg font-bold flex items-center gap-2">
                    Order #${order.id}
                    <button onclick="toggleFavoriteOrder(${order.id}, ${!order.is_favorite})" class="text-primary hover:scale-110 transition-transform flex items-center" title="${order.is_favorite ? 'Unfavorite this order' : 'Set as favorite order'}">
                      <span class="material-symbols-outlined text-[20px]" ${order.is_favorite ? 'data-weight="fill"' : ''}>star</span>
                    </button>
                  </div>
                  <div class="text-body-sm text-secondary">${new Date(order.created_at).toLocaleDateString()} • ${order.order_type.toUpperCase()}</div>
                </div>
                <div class="text-label-lg text-primary">$${order.total.toFixed(2)}</div>
              </div>
              <div class="text-body-sm text-secondary mt-2">
                ${order.address ? `<div class="mb-1"><span class="material-symbols-outlined text-[14px] align-middle mr-1">location_on</span>${order.address}</div>` : ''}
              </div>
              <hr class="my-3 border-surface-variant">
              <div class="text-body-sm flex flex-col gap-2">
                ${order.items.map(i => {
                  let modsStr = '';
                  let isReward = false;
                  let pointsCost = 0;
                  try {
                    const mods = JSON.parse(i.modifiers || '[]');
                    const rewardMod = mods.find(m => m.points_cost);
                    if (rewardMod) {
                      isReward = true;
                      pointsCost = rewardMod.points_cost;
                    }
                    const modNames = mods.map(m => m.name).filter(n => n !== 'Reward Redemption');
                    if (modNames.length > 0) modsStr = `<div class="text-[12px] text-secondary ml-4">${modNames.join(', ')}</div>`;
                  } catch(e) {}
                  
                  const rewardBadge = isReward ? `<span class="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-sm font-bold ml-2 align-middle">Reward (-${pointsCost} pts)</span>` : '';
                  
                  return `
                    <div class="flex flex-col">
                      <div class="flex justify-between">
                        <span>${i.quantity}x ${i.name} ${rewardBadge}</span>
                      </div>
                      ${modsStr}
                    </div>
                  `;
                }).join('')}
              </div>
              <div class="mt-4 pt-3 border-t border-surface-variant flex justify-end">
                <button onclick="reorderOrder(${order.id})" class="border border-surface-variant text-on-surface hover:bg-primary hover:text-on-primary hover:border-primary px-4 py-2 rounded-lg text-label-sm font-label-sm flex items-center gap-2 transition-all shadow-sm">
                  <span class="material-symbols-outlined text-[16px]">add_shopping_cart</span> Order Again
                </button>
              </div>
            </div>
          `).join('');
        }
        document.getElementById('order-history-container').innerHTML = ordersHtml;
      }
    } catch (e) {
      document.getElementById('order-history-container').innerHTML = '<div class="text-center text-error py-4">Failed to load orders.</div>';
    }
  } else {
    container.innerHTML = `
      <div class="px-container-padding pt-stack-lg max-w-md mx-auto w-full">
        <!-- Login Form -->
        <div id="login-form" class="bg-surface-container-lowest rounded-xl p-gutter shadow-[0_4px_12px_rgba(0,0,0,0.04)] border border-surface-variant">
          <h2 class="text-headline-lg font-headline-lg mb-6 text-center">Welcome Back</h2>
          <div class="flex flex-col gap-4">
            <div>
              <label class="block text-label-sm mb-1 text-secondary">Email</label>
              <input type="email" id="email" class="w-full bg-surface-container-low border border-surface-variant rounded-lg py-3 px-4 focus:border-primary focus:outline-none" value="demo@chickfilb.com">
            </div>
            <div>
              <label class="block text-label-sm mb-1 text-secondary">Password</label>
              <input type="password" id="password" class="w-full bg-surface-container-low border border-surface-variant rounded-lg py-3 px-4 focus:border-primary focus:outline-none" value="password123">
            </div>
            <button onclick="login()" class="w-full bg-primary text-on-primary py-3 rounded-lg font-label-lg hover:bg-primary-container transition-colors mt-2">
              Sign In
            </button>
            <button onclick="toggleAuthForm()" class="w-full text-primary font-label-md py-2 hover:underline transition-colors">
              Don't have an account? Create one
            </button>
          </div>
        </div>

        <!-- Register Form (hidden by default) -->
        <div id="register-form" class="hidden bg-surface-container-lowest rounded-xl p-gutter shadow-[0_4px_12px_rgba(0,0,0,0.04)] border border-surface-variant">
          <h2 class="text-headline-lg font-headline-lg mb-6 text-center">Create Account</h2>
          <div class="flex flex-col gap-4">
            <div>
              <label class="block text-label-sm mb-1 text-secondary">Full Name</label>
              <input type="text" id="reg-name" placeholder="John Doe" class="w-full bg-surface-container-low border border-surface-variant rounded-lg py-3 px-4 focus:border-primary focus:outline-none">
            </div>
            <div>
              <label class="block text-label-sm mb-1 text-secondary">Email</label>
              <input type="email" id="reg-email" placeholder="you@example.com" class="w-full bg-surface-container-low border border-surface-variant rounded-lg py-3 px-4 focus:border-primary focus:outline-none">
            </div>
            <div>
              <label class="block text-label-sm mb-1 text-secondary">Password</label>
              <input type="password" id="reg-password" placeholder="Min 6 characters" class="w-full bg-surface-container-low border border-surface-variant rounded-lg py-3 px-4 focus:border-primary focus:outline-none">
            </div>
            <div>
              <label class="block text-label-sm mb-1 text-secondary">Confirm Password</label>
              <input type="password" id="reg-confirm" placeholder="Re-enter password" class="w-full bg-surface-container-low border border-surface-variant rounded-lg py-3 px-4 focus:border-primary focus:outline-none">
            </div>
            <button onclick="register()" class="w-full bg-primary text-on-primary py-3 rounded-lg font-label-lg hover:bg-primary-container transition-colors mt-2">
              Create Account
            </button>
            <button onclick="toggleAuthForm()" class="w-full text-primary font-label-md py-2 hover:underline transition-colors">
              Already have an account? Sign In
            </button>
          </div>
        </div>
      </div>
    `;
  }
}

// --- Guest Checkout ---
async function renderGuestCheckout(header, container) {
  renderHeader(header, 'Guest Checkout', false, 'cart');

  container.innerHTML = `
    <div class="px-container-padding pt-stack-lg max-w-lg mx-auto w-full pb-40">
      <div class="bg-surface-container-lowest rounded-xl p-gutter shadow-[0_4px_12px_rgba(0,0,0,0.04)] border border-surface-variant flex flex-col gap-6">
        <h2 class="text-headline-md font-headline-md text-center">Guest Checkout</h2>
        <p class="text-body-sm text-secondary text-center -mt-4">No account needed — a receipt will be sent to your email.</p>

        <!-- Email -->
        <div>
          <label class="block text-label-sm mb-1 text-secondary">Email (for receipt)</label>
          <input type="email" id="guest-email" placeholder="you@example.com" class="w-full bg-surface-container-low border border-surface-variant rounded-lg py-3 px-4 focus:border-primary focus:outline-none">
        </div>

        <!-- Order Type -->
        <div>
          <label class="block text-label-sm mb-2 text-secondary">Order Type</label>
          <div class="flex gap-2">
            <button id="guest-type-pickup" onclick="setGuestOrderType('pickup')" class="flex-1 py-3 rounded-full text-label-lg font-label-lg bg-primary text-on-primary transition-colors">Pickup</button>
            <button id="guest-type-delivery" onclick="setGuestOrderType('delivery')" class="flex-1 py-3 rounded-full text-label-lg font-label-lg bg-surface-container text-on-surface transition-colors">Delivery</button>
          </div>
        </div>

        <!-- Pickup Location Selector (shown by default) -->
        <div id="guest-location-section" class="flex flex-col gap-3">
          <label class="block text-label-sm mb-1 text-secondary">Select Pickup Location</label>
          <button onclick="selectGuestLocation('loc1')" id="guest-loc-loc1" class="w-full text-left p-4 rounded-xl border-2 border-primary bg-primary/5 flex justify-between items-center transition-colors">
            <div><div class="font-bold text-on-surface">Chick-fil-B Downtown</div><div class="text-body-sm text-secondary mt-0.5">1.2 mi • Ready in <span class="text-primary font-bold">10-15 min</span></div></div>
            <span class="material-symbols-outlined text-primary">check_circle</span>
          </button>
          <button onclick="selectGuestLocation('loc2')" id="guest-loc-loc2" class="w-full text-left p-4 rounded-xl border border-surface-variant hover:border-primary/50 flex justify-between items-center transition-colors">
            <div><div class="font-bold text-on-surface">Chick-fil-B Northside</div><div class="text-body-sm text-secondary mt-0.5">3.4 mi • Ready in <span class="text-primary font-bold">15-20 min</span></div></div>
            <span class="material-symbols-outlined text-transparent">check_circle</span>
          </button>
          <button onclick="selectGuestLocation('loc3')" id="guest-loc-loc3" class="w-full text-left p-4 rounded-xl border border-surface-variant hover:border-primary/50 flex justify-between items-center transition-colors">
            <div><div class="font-bold text-on-surface">Chick-fil-B Westend</div><div class="text-body-sm text-secondary mt-0.5">5.1 mi • Ready in <span class="text-primary font-bold">20-25 min</span></div></div>
            <span class="material-symbols-outlined text-transparent">check_circle</span>
          </button>
        </div>

        <!-- Delivery Address (hidden by default) -->
        <div id="guest-address-section" class="hidden flex flex-col gap-3">
          <label class="block text-label-sm mb-1 text-secondary">Delivery Address</label>
          <input type="text" id="guest-addr-street" placeholder="Street Address" class="w-full bg-surface-container-low border border-surface-variant rounded-lg py-3 px-4 focus:border-primary focus:outline-none">
          <div class="flex gap-2">
            <input type="text" id="guest-addr-city" placeholder="City" class="flex-1 bg-surface-container-low border border-surface-variant rounded-lg py-3 px-4 focus:border-primary focus:outline-none">
            <input type="text" id="guest-addr-state" placeholder="State" class="w-20 bg-surface-container-low border border-surface-variant rounded-lg py-3 px-4 focus:border-primary focus:outline-none">
            <input type="text" id="guest-addr-zip" placeholder="Zip" class="w-24 bg-surface-container-low border border-surface-variant rounded-lg py-3 px-4 focus:border-primary focus:outline-none">
          </div>
        </div>

        <!-- Payment -->
        <div>
          <label class="block text-label-sm mb-2 text-secondary">Payment Details</label>
          <div class="flex flex-col gap-3">
            <input type="text" id="guest-card-name" placeholder="Name on Card" class="w-full bg-surface-container-low border border-surface-variant rounded-lg py-3 px-4 focus:border-primary focus:outline-none">
            <input type="text" id="guest-card-num" placeholder="Card Number" maxlength="19" class="w-full bg-surface-container-low border border-surface-variant rounded-lg py-3 px-4 focus:border-primary focus:outline-none">
            <div class="flex gap-2">
              <input type="text" id="guest-card-exp" placeholder="MM/YY" maxlength="5" class="flex-1 bg-surface-container-low border border-surface-variant rounded-lg py-3 px-4 focus:border-primary focus:outline-none">
              <input type="text" id="guest-card-cvc" placeholder="CVC" maxlength="4" class="flex-1 bg-surface-container-low border border-surface-variant rounded-lg py-3 px-4 focus:border-primary focus:outline-none">
            </div>
          </div>
        </div>

        <button onclick="submitGuestCheckout()" class="w-full bg-primary text-on-primary py-4 rounded-full font-label-lg hover:bg-primary-container transition-colors mt-2">
          Place Guest Order
        </button>
      </div>
    </div>
  `;
}

let guestOrderType = 'pickup';
let guestLocationId = 'loc1';
const guestLocations = {
  loc1: 'Chick-fil-B Downtown',
  loc2: 'Chick-fil-B Northside',
  loc3: 'Chick-fil-B Westend',
};

function selectGuestLocation(locId) {
  guestLocationId = locId;
  ['loc1', 'loc2', 'loc3'].forEach(id => {
    const el = document.getElementById('guest-loc-' + id);
    if (!el) return;
    if (id === locId) {
      el.className = 'w-full text-left p-4 rounded-xl border-2 border-primary bg-primary/5 flex justify-between items-center transition-colors';
      el.querySelector('.material-symbols-outlined').className = 'material-symbols-outlined text-primary';
    } else {
      el.className = 'w-full text-left p-4 rounded-xl border border-surface-variant hover:border-primary/50 flex justify-between items-center transition-colors';
      el.querySelector('.material-symbols-outlined').className = 'material-symbols-outlined text-transparent';
    }
  });
}

function setGuestOrderType(type) {
  guestOrderType = type;
  document.getElementById('guest-type-pickup').className = type === 'pickup'
    ? 'flex-1 py-3 rounded-full text-label-lg font-label-lg bg-primary text-on-primary transition-colors'
    : 'flex-1 py-3 rounded-full text-label-lg font-label-lg bg-surface-container text-on-surface transition-colors';
  document.getElementById('guest-type-delivery').className = type === 'delivery'
    ? 'flex-1 py-3 rounded-full text-label-lg font-label-lg bg-primary text-on-primary transition-colors'
    : 'flex-1 py-3 rounded-full text-label-lg font-label-lg bg-surface-container text-on-surface transition-colors';
  document.getElementById('guest-address-section').classList.toggle('hidden', type !== 'delivery');
  document.getElementById('guest-location-section').classList.toggle('hidden', type !== 'pickup');
}

async function submitGuestCheckout() {
  const email = document.getElementById('guest-email')?.value?.trim();
  const cardName = document.getElementById('guest-card-name')?.value?.trim();
  const cardNumber = document.getElementById('guest-card-num')?.value?.trim();
  const cardExp = document.getElementById('guest-card-exp')?.value?.trim();
  const cardCvc = document.getElementById('guest-card-cvc')?.value?.trim();

  if (!email) { showToast('Please enter your email'); return; }
  if (!cardNumber || !cardExp || !cardCvc) { showToast('Please enter your card details'); return; }

  let address = guestLocations[guestLocationId] || 'Chick-fil-B Downtown';
  if (guestOrderType === 'delivery') {
    const street = document.getElementById('guest-addr-street')?.value?.trim();
    const city = document.getElementById('guest-addr-city')?.value?.trim();
    const st = document.getElementById('guest-addr-state')?.value?.trim();
    const zip = document.getElementById('guest-addr-zip')?.value?.trim();
    if (!street || !city || !st || !zip) { showToast('Please enter a complete delivery address'); return; }
    address = `${street}, ${city}, ${st} ${zip}`;
  }

  try {
    const res = await fetch(`${API_URL}/guest/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Guest-Token': getGuestToken() },
      body: JSON.stringify({ email, orderType: guestOrderType, address, cardName, cardNumber, cardExp, cardCvc })
    });
    const data = await res.json();
    if (!res.ok) { showToast(data.error || 'Checkout failed'); return; }

    state.guestCheckoutEmail = email;
    state.cartCount = 0;
    renderHeader(document.getElementById('header-container'), '', false);

    // Show success + register prompt
    document.getElementById('page-container').innerHTML = `
      <div class="px-container-padding pt-stack-lg max-w-md mx-auto w-full text-center flex flex-col gap-6 items-center">
        <div class="text-6xl">🎉</div>
        <h2 class="text-headline-lg font-headline-lg">Order Placed!</h2>
        <p class="text-body-lg text-secondary">Your order total: <span class="font-bold text-on-surface">$${data.total.toFixed(2)}</span></p>
        <p class="text-body-sm text-secondary">A receipt will be sent to <span class="font-bold">${email}</span></p>

        <div class="bg-surface-container-lowest rounded-xl p-gutter shadow-[0_4px_12px_rgba(0,0,0,0.04)] border border-surface-variant w-full mt-4">
          <h3 class="text-headline-md font-headline-md mb-2">Create an Account?</h3>
          <p class="text-body-sm text-secondary mb-4">Sign up to earn <span class="font-bold text-primary">${Math.floor(data.total * 10)} reward points</span> from this order, track your order history, and unlock exclusive perks!</p>
          <button onclick="promptGuestRegister()" class="w-full bg-primary text-on-primary py-3 rounded-lg font-label-lg hover:bg-primary-container transition-colors">
            Yes, Create My Account
          </button>
          <button onclick="navigate('home')" class="w-full text-secondary py-2 mt-2 hover:underline font-label-md">
            No thanks, continue as guest
          </button>
        </div>
      </div>
    `;
  } catch (e) {
    showToast('Network error during checkout');
  }
}

function promptGuestRegister() {
  // Navigate to account page and pre-fill email, show register form
  navigate('account');
  setTimeout(() => {
    // Toggle to register form and pre-fill email
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    if (loginForm && registerForm) {
      loginForm.classList.add('hidden');
      registerForm.classList.remove('hidden');
      const regEmail = document.getElementById('reg-email');
      if (regEmail && state.guestCheckoutEmail) regEmail.value = state.guestCheckoutEmail;
    }
  }, 100);
}

async function renderProfileSettings(header, container) {
  renderHeader(header, 'Update Profile', false, 'account');
  
  if (!state.user) {
    navigate('account');
    return;
  }
  
  const parsedAddr = parseAddress(state.user.default_address);

  container.innerHTML = `
    <div class="px-container-padding pt-stack-lg max-w-md mx-auto w-full pb-32">
      <div class="bg-surface-container-lowest rounded-xl p-gutter shadow-[0_4px_12px_rgba(0,0,0,0.04)] border border-surface-variant">
        <div class="mb-6 border-b border-surface-variant pb-4">
          <h2 class="text-headline-md font-headline-md text-on-surface">Update Profile Info</h2>
          <p class="text-body-sm text-secondary mt-1">Manage your delivery address and payment details below.</p>
        </div>
        
        <form onsubmit="event.preventDefault(); updateProfile();" class="flex flex-col gap-6">
          <!-- Address Section -->
          <div>
            <h3 class="text-label-lg font-bold text-on-surface mb-3 flex items-center gap-2">
              <span class="material-symbols-outlined text-[20px] text-primary">local_shipping</span>
              Delivery Address
            </h3>
            <div class="flex flex-col gap-3">
              <div>
                <label class="block text-label-sm mb-1 text-secondary">Street Address</label>
                <input type="text" id="settings-addr-street" required class="w-full bg-surface-container-low border border-outline rounded-lg py-3 px-4 focus:border-primary focus:outline-none" value="${parsedAddr.street}" placeholder="123 Main St">
              </div>
              <div>
                <label class="block text-label-sm mb-1 text-secondary">Apt, Suite, etc. (optional)</label>
                <input type="text" id="settings-addr-apt" class="w-full bg-surface-container-low border border-outline rounded-lg py-3 px-4 focus:border-primary focus:outline-none" value="${parsedAddr.apt}" placeholder="Apt 4B">
              </div>
              <div class="flex gap-4">
                <div class="flex-[2]">
                  <label class="block text-label-sm mb-1 text-secondary">City</label>
                  <input type="text" id="settings-addr-city" required class="w-full bg-surface-container-low border border-outline rounded-lg py-3 px-4 focus:border-primary focus:outline-none" placeholder="Atlanta" value="${parsedAddr.city}">
                </div>
                <div class="flex-1">
                  <label class="block text-label-sm mb-1 text-secondary">State</label>
                  <input type="text" id="settings-addr-state" required class="w-full bg-surface-container-low border border-outline rounded-lg py-3 px-4 focus:border-primary focus:outline-none" placeholder="GA" value="${parsedAddr.state}">
                </div>
                <div class="flex-1">
                  <label class="block text-label-sm mb-1 text-secondary">Zip</label>
                  <input type="text" id="settings-addr-zip" required class="w-full bg-surface-container-low border border-outline rounded-lg py-3 px-4 focus:border-primary focus:outline-none" placeholder="30303" value="${parsedAddr.zip}">
                </div>
              </div>
            </div>
          </div>

          <hr class="border-surface-variant">

          <!-- Payment Section -->
          <div>
            <h3 class="text-label-lg font-bold text-on-surface mb-3 flex items-center gap-2">
              <span class="material-symbols-outlined text-[20px] text-primary">credit_card</span>
              Payment Method
            </h3>
            <div class="flex flex-col gap-4">
              <div>
                <label class="block text-label-sm mb-1 text-secondary">Name on Card</label>
                <input type="text" id="settings-card-name" required class="w-full bg-surface-container-low border border-outline rounded-lg py-3 px-4 focus:border-primary focus:outline-none" placeholder="Jordan Smith" value="${state.user.paymentMethods?.[0]?.card_holder || state.user.name}">
              </div>
              <div>
                <label class="block text-label-sm mb-1 text-secondary">Card Number</label>
                <input type="text" id="settings-card-num" required class="w-full bg-surface-container-low border border-outline rounded-lg py-3 px-4 focus:border-primary focus:outline-none tracking-widest" placeholder="0000 0000 0000 0000" value="${state.user.paymentMethods?.[0]?.last_four ? '**** **** **** ' + state.user.paymentMethods[0].last_four : ''}">
              </div>
              <div class="flex gap-4">
                <div class="flex-1">
                  <label class="block text-label-sm mb-1 text-secondary">Expiration (MM/YY)</label>
                  <input type="text" id="settings-card-exp" required class="w-full bg-surface-container-low border border-outline rounded-lg py-3 px-4 focus:border-primary focus:outline-none" placeholder="12/26" value="${state.user.paymentMethods?.[0]?.expiry_month ? String(state.user.paymentMethods[0].expiry_month).padStart(2, '0') + '/' + String(state.user.paymentMethods[0].expiry_year).slice(-2) : ''}">
                </div>
                <div class="flex-1">
                  <label class="block text-label-sm mb-1 text-secondary">CVC</label>
                  <input type="text" id="settings-card-cvc" required class="w-full bg-surface-container-low border border-outline rounded-lg py-3 px-4 focus:border-primary focus:outline-none" placeholder="123" value="***">
                </div>
              </div>
            </div>
          </div>

          <button type="submit" class="w-full bg-primary text-on-primary py-4 rounded-full font-label-lg hover:bg-primary-container transition-colors mt-4 shadow-[0_2px_8px_rgba(0,0,0,0.1)]">
            Save Profile Information
          </button>
        </form>
      </div>
    </div>
  `;
}

window.updateProfile = async () => {
  const addrStreet = document.getElementById('settings-addr-street')?.value || '';
  const addrApt = document.getElementById('settings-addr-apt')?.value || '';
  const addrCity = document.getElementById('settings-addr-city')?.value || '';
  const addrState = document.getElementById('settings-addr-state')?.value || '';
  const addrZip = document.getElementById('settings-addr-zip')?.value || '';
  
  const address = addrStreet ? `${addrStreet}${addrApt ? ' ' + addrApt : ''}, ${addrCity}, ${addrState} ${addrZip}` : '';

  const cardName = document.getElementById('settings-card-name').value;
  const cardNum = document.getElementById('settings-card-num').value;
  const cardExp = document.getElementById('settings-card-exp').value;
  
  let paymentMethod = null;
  if (cardNum && !cardNum.includes('****')) {
    const expParts = cardExp.split('/');
    let month = 12;
    let year = 2030;
    if (expParts.length === 2) {
      month = parseInt(expParts[0]) || 12;
      year = parseInt(expParts[1]) + 2000 || 2030;
    }
    
    paymentMethod = {
      cardType: cardNum.startsWith('3') ? 'amex' : cardNum.startsWith('5') ? 'mastercard' : 'visa',
      lastFour: cardNum.slice(-4).replace(/\D/g, '') || '1234',
      cardHolder: cardName,
      expiryMonth: month,
      expiryYear: year
    };
  }

  try {
    const res = await fetch(`${API_URL}/auth/me`, {
      method: 'PUT',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      },
      body: JSON.stringify({ defaultAddress: address, paymentMethod })
    });
    
    if (res.ok) {
      showToast('Profile updated successfully!');
      await fetchUser(localStorage.getItem('token'));
      navigate('account');
    } else {
      showToast('Failed to update profile');
    }
  } catch (e) {
    showToast('Network error');
  }
};

// --- Chat ---
function updateChatState() {
  const msgs = document.getElementById('chat-messages');
  const input = document.getElementById('chat-input');
  const btn = input.parentElement.nextElementSibling;
  
  if (!state.user) {
    state.chatSessionId = null;
    msgs.innerHTML = `
      <div class="bg-surface-container p-3 rounded-2xl rounded-tl-sm self-start max-w-[85%] shadow-sm">
        <p class="text-body-sm font-body-sm text-on-surface">To better let Bessie assist you, please login</p>
      </div>
    `;
    input.disabled = true;
    input.placeholder = "Please login first";
    input.classList.add('opacity-50', 'cursor-not-allowed');
    btn.disabled = true;
    btn.classList.add('opacity-50', 'cursor-not-allowed');
  } else {
    if (!state.chatSessionId && msgs.children.length <= 1) {
      msgs.innerHTML = `
        <div class="bg-surface-container p-3 rounded-2xl rounded-tl-sm self-start max-w-[85%] shadow-sm">
          <p class="text-body-sm font-body-sm text-on-surface">Hi! I'm Bessie. How can I help you today?</p>
        </div>
      `;
    }
    input.disabled = false;
    input.placeholder = "Type a message...";
    input.classList.remove('opacity-50', 'cursor-not-allowed');
    btn.disabled = false;
    btn.classList.remove('opacity-50', 'cursor-not-allowed');
  }
}

async function toggleChat() {
  const overlay = document.getElementById('chat-overlay');
  overlay.classList.toggle('hidden');
  if (!overlay.classList.contains('hidden')) {
    document.getElementById('chat-input').focus();
    const msgs = document.getElementById('chat-messages');
    msgs.scrollTop = msgs.scrollHeight;
  } else {
    if (state.chatMutatedData) {
      state.chatMutatedData = false;
      await updateCartCount();
      if (state.currentPage === 'cart') {
        const header = document.getElementById('header-container');
        const container = document.getElementById('page-container');
        await renderCart(header, container);
      } else {
        navigate(state.currentPage);
      }
    }
  }
}

function appendMessage(role, content) {
  const msgs = document.getElementById('chat-messages');
  const el = document.createElement('div');
  
  if (role === 'assistant') {
    el.className = 'bg-surface-container p-3 rounded-2xl rounded-tl-sm self-start max-w-[85%] shadow-sm';
    el.innerHTML = `<p class="text-body-sm font-body-sm text-on-surface">${content}</p>`;
  } else {
    el.className = 'bg-primary text-on-primary p-3 rounded-2xl rounded-tr-sm self-end max-w-[85%] shadow-sm';
    el.innerHTML = `<p class="text-body-sm font-body-sm">${content}</p>`;
  }
  
  msgs.appendChild(el);
  msgs.scrollTop = msgs.scrollHeight;
}

async function sendChatMessage() {
  const input = document.getElementById('chat-input');
  const message = input.value.trim();
  if (!message) return;
  
  input.value = '';
  appendMessage('user', message);
  
  const token = localStorage.getItem('token');
  try {
    const headers = { 'Content-Type': 'application/json' };
    if(token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${API_URL}/chat`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ message, sessionId: state.chatSessionId })
    });
    
    const data = await res.json();
    if (res.ok) {
      state.chatSessionId = data.sessionId;
      appendMessage('assistant', data.message);
      if (data.dataChanged) {
        state.chatMutatedData = true;
        updateCartCount(); // Refresh the bag count in case the AI added an item
      }
    }
  } catch (e) {
    appendMessage('assistant', 'Sorry, I am having trouble connecting right now.');
  }
}

// --- Utils ---
function showToast(message) {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = 'bg-inverse-surface text-inverse-on-surface px-4 py-3 rounded-lg shadow-lg text-label-lg font-label-lg transition-all transform duration-300 translate-y-[-20px] opacity-0';
  toast.innerHTML = message;
  container.appendChild(toast);
  
  requestAnimationFrame(() => {
    toast.classList.remove('translate-y-[-20px]', 'opacity-0');
  });
  
  setTimeout(() => {
    toast.classList.add('opacity-0');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

function editCartItem(cartItemId, menuItemId) {
  state.editingCartItem = { cartItemId, menuItemId };
  navigate('customize-item');
}

async function renderCustomizeItem(header, container) {
  renderHeader(header, 'Customize Item', false, 'cart');
  
  if (!state.editingCartItem) {
    navigate('cart');
    return;
  }

  container.innerHTML = `<div class="p-8 text-center" id="customize-loading">Loading...</div><div id="customize-content" style="display:none;" class="flex-grow px-container-padding pt-stack-lg pb-[120px] flex flex-col gap-section-gap max-w-2xl mx-auto w-full"></div>`;

  try {
    const [menuRes, cartRes] = await Promise.all([
      fetch(`${API_URL}/menu/${state.editingCartItem.menuItemId}`),
      fetch(`${API_URL}/cart`, { headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` } })
    ]);
    const menuData = await menuRes.json();
    const cartData = await cartRes.json();
    
    const cartItem = cartData.items.find(i => i.id === state.editingCartItem.cartItemId);
    if (!cartItem) {
      navigate('cart');
      return;
    }

    let existingMods = [];
    let rewardMod = null;
    try {
      const parsed = JSON.parse(cartItem.modifiers || '[]');
      existingMods = parsed.filter(m => !m.points_cost).map(m => m.name);
      rewardMod = parsed.find(m => m.points_cost);
    } catch(e) {}

    let modsHtml = '';
    menuData.modifiers.forEach(mod => {
      const isChecked = existingMods.includes(mod.name) ? 'checked' : '';
      modsHtml += `
        <label class="flex items-center justify-between p-4 bg-surface-container-lowest rounded-xl shadow-sm border border-surface-variant cursor-pointer">
          <span class="text-label-lg font-bold text-on-surface">${mod.name}</span>
          <input type="checkbox" name="modifiers" value="${mod.name}" data-price="${mod.price_modifier}" class="w-5 h-5 accent-primary rounded border-outline" ${isChecked}>
        </label>
      `;
    });

    document.getElementById('customize-loading').style.display = 'none';
    const content = document.getElementById('customize-content');
    content.style.display = 'flex';
    
    content.innerHTML = `
      <div class="flex gap-4 items-center mb-4 bg-surface-container-lowest p-4 rounded-xl shadow-sm border border-surface-variant">
        <div class="w-20 h-20 bg-surface-container rounded-md overflow-hidden flex-shrink-0">
          <img src="${menuData.image_url}" class="w-full h-full object-cover">
        </div>
        <div>
          <h2 class="text-headline-md">${menuData.name}</h2>
          <p class="text-body-sm text-secondary mt-1">Total Quantity in bag: ${cartItem.quantity}</p>
        </div>
      </div>
      
      <div class="mb-6 bg-surface-container-lowest p-4 rounded-xl shadow-sm border border-surface-variant">
        <label class="block text-label-lg font-bold mb-2">Apply to how many items?</label>
        <p class="text-body-sm text-secondary mb-3">Leave as default to apply to all identical items in this stack.</p>
        <input type="number" id="customize-qty" value="${cartItem.quantity}" min="1" max="${cartItem.quantity}" class="w-full p-3 rounded-lg bg-surface-container border border-surface-variant text-on-surface font-label-lg outline-none focus:ring-2 focus:ring-primary" oninput="if(this.value>${cartItem.quantity})this.value=${cartItem.quantity};if(this.value<1&&this.value!=='')this.value=1;">
      </div>

      <h3 class="text-headline-sm mb-2 px-1">Ingredients & Preferences</h3>
      <div class="flex flex-col gap-3 mb-8">
        ${modsHtml || '<div class="p-4 text-secondary text-body-sm bg-surface-container-lowest rounded-xl border border-surface-variant">No options available for this item.</div>'}
      </div>

      <div class="fixed left-0 w-full p-4 bg-surface border-t border-surface-variant z-40" style="bottom: 72px;">
        <div class="max-w-2xl mx-auto flex gap-4">
          <button onclick="navigate('cart')" class="flex-1 py-3 px-6 rounded-full border border-outline text-on-surface font-label-lg hover:bg-surface-variant transition-colors">Cancel</button>
          <button id="save-customize-btn" class="flex-1 py-3 px-6 rounded-full bg-primary text-on-primary font-label-lg hover:bg-primary-container transition-colors shadow-md">Save Updates</button>
        </div>
      </div>
    `;

    document.getElementById('save-customize-btn').onclick = async () => {
      const selectedBoxes = document.querySelectorAll('input[name="modifiers"]:checked');
      const selectedMods = Array.from(selectedBoxes).map(box => ({
        name: box.value,
        price_modifier: parseFloat(box.dataset.price) || 0
      }));
      if (rewardMod) selectedMods.push(rewardMod);

      let qty = parseInt(document.getElementById('customize-qty').value, 10);
      if (isNaN(qty) || qty < 1) qty = 1;

      try {
        const res = await fetch(`${API_URL}/cart/${cartItem.id}/modifiers`, {
          method: 'PUT',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          },
          body: JSON.stringify({ modifiers: selectedMods, quantityToUpdate: qty })
        });
        if (res.ok) {
          showToast('Preferences updated');
          navigate('cart');
        } else {
          showToast('Failed to update');
        }
      } catch(e) {
        showToast('Network error');
      }
    };

  } catch(e) {
    navigate('cart');
  }
}

async function showOrderDetails(orderId) {
  try {
    const res = await fetch(`${API_URL}/orders/${orderId}`, {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
    });
    const order = await res.json();
    
    const fallbackImg = `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100'><rect width='100%' height='100%' fill='%23f9f9f9'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' font-size='20'>🐔</text></svg>`;
    
    let itemsHtml = order.items.map(item => {
      const img = item.image_url || fallbackImg;
      let modsHtml = '';
      let isRedeem = false;
      try {
        const mods = JSON.parse(item.modifiers || '[]');
        modsHtml = mods.map(m => {
          if (m.name === 'Reward Redemption') isRedeem = true;
          return `<div class="text-body-sm text-secondary">• ${m.name}</div>`;
        }).join('');
      } catch(e) {}
      
      return `
        <div class="flex gap-4 p-3 bg-surface-container-lowest border border-surface-variant rounded-xl shadow-sm">
          <img src="${img}" class="w-16 h-16 object-cover rounded-lg shrink-0">
          <div class="flex-1 flex flex-col justify-center">
            <div class="flex justify-between items-start">
              <span class="text-label-lg font-label-lg text-on-surface">${item.quantity}x ${item.name}</span>
              ${isRedeem ? `<span class="bg-primary/10 text-primary px-2 py-0.5 rounded text-label-sm">Redeemed</span>` : ''}
            </div>
            ${modsHtml}
          </div>
        </div>
      `;
    }).join('');

    const dt = new Date(order.created_at).toLocaleString();

    const overlay = document.createElement('div');
    overlay.className = 'fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4 sm:p-0';
    overlay.onclick = (e) => { if(e.target === overlay) overlay.remove(); };
    
    overlay.innerHTML = `
      <div class="bg-surface w-full sm:w-[500px] max-h-[90vh] rounded-2xl shadow-xl flex flex-col overflow-hidden animate-slide-up" onclick="event.stopPropagation()">
        <div class="p-4 border-b border-surface-variant flex justify-between items-center bg-surface-container-lowest">
          <h2 class="text-headline-md font-headline-md text-on-surface">Order #${order.id}</h2>
          <button onclick="this.closest('.fixed').remove()" class="material-symbols-outlined text-secondary hover:text-on-surface">close</button>
        </div>
        <div class="p-4 overflow-y-auto flex-1 flex flex-col gap-4">
          <div class="text-body-sm text-secondary">${dt}</div>
          <div class="flex flex-col gap-2">
            ${itemsHtml}
          </div>
          <div class="mt-2 pt-4 border-t border-surface-variant flex justify-between items-center">
            <span class="text-label-lg font-label-lg text-on-surface">Total</span>
            <span class="text-headline-md font-headline-md text-primary">$${order.total.toFixed(2)}</span>
          </div>
        </div>
        <div class="p-4 border-t border-surface-variant bg-surface-container-lowest flex justify-end">
          <button onclick="reorderOrder(${order.id}); this.closest('.fixed').remove();" class="bg-primary text-on-primary px-6 py-3 rounded-lg text-label-lg font-label-lg hover:bg-primary-container transition-colors shadow-sm flex items-center gap-2">
            <span class="material-symbols-outlined text-[20px]">add_shopping_cart</span> Order Again
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
  } catch(e) {
    showToast('Failed to load order details');
  }
}

async function reorderOrder(orderId) {
  try {
    const res = await fetch(`${API_URL}/orders/${orderId}`, {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
    });
    const order = await res.json();
    
    let itemsAdded = 0;
    let fallbackCount = 0;
    let redeemedCount = 0;
    // Use a RUNNING remaining-points counter so each iteration sees the true balance
    let remainingPoints = (state.user?.rewards?.points || 0) - (state.cartPointsUsed || 0);
    
    for (const item of order.items) {
      let mods = [];
      let isRedeem = false;
      let pointsCost = 0;
      try {
        mods = JSON.parse(item.modifiers || '[]');
        const redeemMod = mods.find(m => m.name === 'Reward Redemption');
        if (redeemMod) {
          isRedeem = true;
          pointsCost = (redeemMod.points_cost || item.redeem_points) * item.quantity;
        }
      } catch(e) {}
      
      let finalMods = mods;
      if (isRedeem) {
        if (pointsCost > remainingPoints) {
          // Insufficient points — strip the Reward Redemption mod, add as regular paid item
          finalMods = mods.filter(m => m.name !== 'Reward Redemption');
          fallbackCount++;
        } else {
          // Deduct from the running balance so the next item sees the updated total
          remainingPoints -= pointsCost;
          redeemedCount++;
        }
      }
      
      const addRes = await fetch(`${API_URL}/cart`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ 
          menuItemId: item.menu_item_id, 
          quantity: item.quantity,
          modifiers: finalMods,
          specialInstructions: item.special_instructions || ''
        })
      });
      if (addRes.ok) itemsAdded++;
    }
    
    if (itemsAdded > 0) {
      await updateCartCount();
      let msg = 'Items added to bag! 🎉';
      if (redeemedCount > 0 && fallbackCount === 0) {
        msg = `Items added! ${redeemedCount} item(s) redeemed with points 🎉`;
      } else if (fallbackCount > 0) {
        msg = `Items added! (${fallbackCount} reward item(s) added as regular items due to insufficient points)`;
      }
      showToast(msg);
    }
  } catch(e) {
    showToast('Failed to reorder items');
  }
}

async function toggleFavoriteOrder(orderId, isFavorite) {
  try {
    const res = await fetch(`${API_URL}/orders/${orderId}/favorite`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      },
      body: JSON.stringify({ is_favorite: isFavorite })
    });
    
    if (res.ok) {
      if (isFavorite) {
        showToast('Order saved as favorite! ⭐');
      } else {
        showToast('Order removed from favorites');
      }
      renderAccount(document.getElementById('header-container'), document.getElementById('page-container'));
    } else {
      showToast('Failed to toggle favorite');
    }
  } catch(e) {
    showToast('Network error');
  }
}
