import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { fetchMe, loginApi, registerApi, removeToken, getToken, clearCartApi, fetchCart, fetchGuestCart } from '../api';

type User = {
  id: number;
  name: string;
  email: string;
  default_address?: string;
  rewards?: { points: number; tier: string; total_points_earned: number };
  paymentMethods?: any[];
};

type AuthContextType = {
  user: User | null;
  cartCount: number;
  cartPointsUsed: number;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  refreshCart: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  cartCount: 0,
  cartPointsUsed: 0,
  loading: true,
  login: async () => {},
  register: async () => {},
  logout: async () => {},
  refreshUser: async () => {},
  refreshCart: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [cartCount, setCartCount] = useState(0);
  const [cartPointsUsed, setCartPointsUsed] = useState(0);
  const [loading, setLoading] = useState(true);

  const refreshCart = useCallback(async () => {
    try {
      const token = await getToken();
      const data = token ? await fetchCart() : await fetchGuestCart();
      setCartCount(data.itemCount || 0);
      let ptsUsed = 0;
      (data.items || []).forEach((item: any) => {
        try {
          const mods = JSON.parse(item.modifiers || '[]');
          mods.forEach((m: any) => {
            if (m.points_cost) ptsUsed += m.points_cost * item.quantity;
          });
        } catch {}
      });
      setCartPointsUsed(ptsUsed);
    } catch {}
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const token = await getToken();
      if (!token) {
        setUser(null);
        await refreshCart(); // Still refresh to pick up guest cart
        setLoading(false);
        return;
      }
      const u = await fetchMe();
      setUser(u);
      await refreshCart();
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, [refreshCart]);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const login = async (email: string, password: string) => {
    await loginApi(email, password);
    await refreshUser();
  };

  const register = async (email: string, password: string, name: string) => {
    await registerApi(email, password, name);
    await refreshUser();
  };

  const logout = async () => {
    try { await clearCartApi(); } catch {}
    await removeToken();
    setUser(null);
    setCartCount(0);
    setCartPointsUsed(0);
  };

  return (
    <AuthContext.Provider value={{ user, cartCount, cartPointsUsed, loading, login, register, logout, refreshUser, refreshCart }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
