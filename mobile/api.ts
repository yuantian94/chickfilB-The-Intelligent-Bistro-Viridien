import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

// Use your Mac's local IP when running on simulator — localhost works for iOS simulator
const SERVER_ROOT = 'http://localhost:3000';
const BASE_URL = `${SERVER_ROOT}/api`;

/** Resolve image URLs: local paths like /images/... need the full server URL */
export function resolveImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith('http')) return url;
  if (url.startsWith('/')) return `${SERVER_ROOT}${url}`;
  return url;
}

let cachedToken: string | null = null;

export async function getToken(): Promise<string | null> {
  if (cachedToken) return cachedToken;
  if (Platform.OS === 'web') {
    cachedToken = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
  } else {
    cachedToken = await SecureStore.getItemAsync('token');
  }
  return cachedToken;
}

export async function setToken(token: string): Promise<void> {
  cachedToken = token;
  if (Platform.OS === 'web') {
    localStorage.setItem('token', token);
  } else {
    await SecureStore.setItemAsync('token', token);
  }
}

export async function removeToken(): Promise<void> {
  cachedToken = null;
  if (Platform.OS === 'web') {
    localStorage.removeItem('token');
  } else {
    await SecureStore.deleteItemAsync('token');
  }
}

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getToken();
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) h['Authorization'] = `Bearer ${token}`;
  return h;
}

// ---- Guest Token ----
let cachedGuestToken: string | null = null;

export async function getGuestToken(): Promise<string> {
  if (cachedGuestToken) return cachedGuestToken;
  if (Platform.OS === 'web') {
    cachedGuestToken = typeof localStorage !== 'undefined' ? localStorage.getItem('guestToken') : null;
  } else {
    cachedGuestToken = await SecureStore.getItemAsync('guestToken');
  }
  if (!cachedGuestToken) {
    cachedGuestToken = 'guest_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    if (Platform.OS === 'web') {
      localStorage.setItem('guestToken', cachedGuestToken);
    } else {
      await SecureStore.setItemAsync('guestToken', cachedGuestToken);
    }
  }
  return cachedGuestToken;
}

async function guestHeaders(): Promise<Record<string, string>> {
  const gt = await getGuestToken();
  return { 'Content-Type': 'application/json', 'X-Guest-Token': gt };
}

// ---- Guest Cart ----
export async function fetchGuestCart() {
  const res = await fetch(`${BASE_URL}/guest/cart`, { headers: await guestHeaders() });
  return res.json();
}

export async function addToGuestCart(menuItemId: number, quantity = 1, modifiers: any[] = []) {
  const res = await fetch(`${BASE_URL}/guest/cart`, {
    method: 'POST',
    headers: await guestHeaders(),
    body: JSON.stringify({ menuItemId, quantity, modifiers }),
  });
  return res.json();
}

export async function updateGuestCartItem(id: number, quantity: number) {
  const res = await fetch(`${BASE_URL}/guest/cart/${id}`, {
    method: 'PUT',
    headers: await guestHeaders(),
    body: JSON.stringify({ quantity }),
  });
  return res.json();
}

export async function clearGuestCart() {
  await fetch(`${BASE_URL}/guest/cart`, { method: 'DELETE', headers: await guestHeaders() });
}

export async function updateGuestCartItemModifiers(cartItemId: number, modifiers: any[], quantityToUpdate: number) {
  const res = await fetch(`${BASE_URL}/guest/cart/${cartItemId}/modifiers`, {
    method: 'PUT',
    headers: await guestHeaders(),
    body: JSON.stringify({ modifiers, quantityToUpdate }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Update failed');
  return data;
}

export async function guestCheckoutApi(body: any) {
  const res = await fetch(`${BASE_URL}/guest/checkout`, {
    method: 'POST',
    headers: await guestHeaders(),
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Checkout failed');
  return data;
}

// ---- Auth ----
export async function loginApi(email: string, password: string) {
  const res = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Login failed');
  await setToken(data.token);
  return data;
}

export async function registerApi(email: string, password: string, name: string) {
  const res = await fetch(`${BASE_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, name }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Registration failed');
  await setToken(data.token);
  return data;
}

export async function fetchMe() {
  const res = await fetch(`${BASE_URL}/auth/me`, { headers: await authHeaders() });
  if (!res.ok) throw new Error('Not authenticated');
  return res.json();
}

export async function updateMe(body: any) {
  const res = await fetch(`${BASE_URL}/auth/me`, {
    method: 'PUT',
    headers: await authHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error('Update failed');
  return res.json();
}

// ---- Menu ----
export async function fetchMenu(category?: string, search?: string) {
  let url = `${BASE_URL}/menu`;
  if (search) url += `?search=${encodeURIComponent(search)}`;
  else if (category) url += `?category=${category}`;
  const res = await fetch(url);
  return res.json();
}

export async function fetchFeatured() {
  const res = await fetch(`${BASE_URL}/menu?featured=true`);
  return res.json();
}

export async function fetchCategories() {
  const res = await fetch(`${BASE_URL}/menu/categories`);
  return res.json();
}

export async function fetchMenuItem(id: number) {
  const res = await fetch(`${BASE_URL}/menu/${id}`);
  return res.json();
}

// ---- Cart ----
export async function fetchCart() {
  const res = await fetch(`${BASE_URL}/cart`, { headers: await authHeaders() });
  return res.json();
}

export async function addToCartApi(menuItemId: number, quantity: number = 1, modifiers?: any[]) {
  const body: any = { menuItemId, quantity };
  if (modifiers) body.modifiers = modifiers;
  const res = await fetch(`${BASE_URL}/cart`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error('Failed to add');
  return res.json();
}

export async function updateCartItemApi(cartItemId: number, quantity: number) {
  const res = await fetch(`${BASE_URL}/cart/${cartItemId}`, {
    method: 'PUT',
    headers: await authHeaders(),
    body: JSON.stringify({ quantity }),
  });
  return res.json();
}

export async function updateCartItemModifiers(cartItemId: number, modifiers: any[], quantityToUpdate: number) {
  const res = await fetch(`${BASE_URL}/cart/${cartItemId}/modifiers`, {
    method: 'PUT',
    headers: await authHeaders(),
    body: JSON.stringify({ modifiers, quantityToUpdate }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Update failed');
  return data;
}

export async function clearCartApi() {
  const res = await fetch(`${BASE_URL}/cart`, {
    method: 'DELETE',
    headers: await authHeaders(),
  });
  return res.json();
}

// ---- Orders ----
export async function fetchOrders() {
  const res = await fetch(`${BASE_URL}/orders`, { headers: await authHeaders() });
  return res.json();
}

export async function fetchOrder(id: number) {
  const res = await fetch(`${BASE_URL}/orders/${id}`, { headers: await authHeaders() });
  return res.json();
}

export async function placeOrder(body: any) {
  const res = await fetch(`${BASE_URL}/orders`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || 'Order failed');
  }
  return res.json();
}

export async function toggleFavoriteApi(orderId: number, isFavorite: boolean) {
  const res = await fetch(`${BASE_URL}/orders/${orderId}/favorite`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ is_favorite: isFavorite }),
  });
  return res.json();
}

// ---- Rewards ----
export async function fetchRewards() {
  const res = await fetch(`${BASE_URL}/rewards`, { headers: await authHeaders() });
  return res.json();
}

export async function fetchRedeemable() {
  const res = await fetch(`${BASE_URL}/rewards/redeemable`, { headers: await authHeaders() });
  return res.json();
}

// ---- Chat ----
export async function sendChatMessageApi(message: string, sessionId: number | null) {
  const res = await fetch(`${BASE_URL}/chat`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ message, sessionId }),
  });
  return res.json();
}

export async function fetchChatHistory() {
  const res = await fetch(`${BASE_URL}/chat/history`, { headers: await authHeaders() });
  return res.json();
}
