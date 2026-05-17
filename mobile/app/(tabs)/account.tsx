import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable, TextInput, ActivityIndicator, Image } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import Colors from '@/constants/Colors';
import { useAuth } from '@/context/AuthContext';
import { fetchOrders, toggleFavoriteApi } from '@/api';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';

export default function AccountScreen() {
  const { user, login, register, logout } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ prefillEmail?: string; showRegister?: string }>();
  const [isRegister, setIsRegister] = useState(params.showRegister === '1');
  const [name, setName] = useState('');
  const [email, setEmail] = useState(params.prefillEmail || (params.showRegister === '1' ? '' : 'demo@chickfilb.com'));
  const [password, setPassword] = useState(params.showRegister === '1' ? '' : 'password123');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);
  const [error, setError] = useState('');
  const [orders, setOrders] = useState<any[]>([]);

  useFocusEffect(
    React.useCallback(() => {
      if (user) fetchOrders().then(setOrders).catch(() => {});
    }, [user])
  );

  const handleLogin = async () => {
    setLoggingIn(true);
    setError('');
    try {
      await login(email, password);
    } catch (e: any) {
      setError(e.message || 'Login failed');
    } finally {
      setLoggingIn(false);
    }
  };

  const handleRegister = async () => {
    if (!name.trim()) { setError('Name is required'); return; }
    if (!email.trim()) { setError('Email is required'); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters'); return; }
    if (password !== confirmPwd) { setError('Passwords do not match'); return; }
    setLoggingIn(true);
    setError('');
    try {
      await register(email, password, name);
    } catch (e: any) {
      setError(e.message || 'Registration failed');
    } finally {
      setLoggingIn(false);
    }
  };

  const toggleMode = () => {
    setIsRegister(!isRegister);
    setError('');
    if (!isRegister) {
      // Switching to register — clear demo defaults
      setEmail('');
      setPassword('');
      setConfirmPwd('');
      setName('');
    } else {
      // Switching back to login — restore demo defaults
      setEmail('demo@chickfilb.com');
      setPassword('password123');
    }
  };

  const toggleFav = async (id: number, fav: boolean) => {
    await toggleFavoriteApi(id, fav);
    const o = await fetchOrders();
    setOrders(o);
  };

  if (!user) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={{ padding: 20, paddingTop: 40 }} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Text style={styles.welcomeTitle}>{isRegister ? 'Create Account' : 'Welcome Back'}</Text>
          <View style={{ gap: 16 }}>
            {isRegister && (
              <View>
                <Text style={styles.label}>Full Name</Text>
                <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="John Doe" autoCapitalize="words" />
              </View>
            )}
            <View>
              <Text style={styles.label}>Email</Text>
              <TextInput style={styles.input} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="you@example.com" />
            </View>
            <View>
              <Text style={styles.label}>Password</Text>
              <TextInput style={styles.input} value={password} onChangeText={setPassword} secureTextEntry placeholder={isRegister ? 'Min 6 characters' : ''} />
            </View>
            {isRegister && (
              <View>
                <Text style={styles.label}>Confirm Password</Text>
                <TextInput style={styles.input} value={confirmPwd} onChangeText={setConfirmPwd} secureTextEntry placeholder="Re-enter password" />
              </View>
            )}
            {error ? <Text style={{ color: Colors.error, fontSize: 13 }}>{error}</Text> : null}
            <Pressable onPress={isRegister ? handleRegister : handleLogin} style={styles.loginBtn} disabled={loggingIn}>
              {loggingIn ? <ActivityIndicator color="#fff" /> : <Text style={styles.loginBtnText}>{isRegister ? 'Create Account' : 'Sign In'}</Text>}
            </Pressable>
            <Pressable onPress={toggleMode} style={{ alignItems: 'center', paddingTop: 4 }}>
              <Text style={{ color: Colors.primary, fontSize: 14, fontWeight: '600' }}>
                {isRegister ? 'Already have an account? Sign In' : "Don't have an account? Create one"}
              </Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 20, paddingBottom: 120, gap: 24 }}>
      {/* Profile Card */}
      <View style={[styles.card, { alignItems: 'center', gap: 12 }]}>
        <View style={styles.bigAvatar}><Text style={styles.bigAvatarText}>{user.name.charAt(0).toUpperCase()}</Text></View>
        <Text style={{ fontSize: 22, fontWeight: '700', color: Colors.onSurface }}>{user.name}</Text>
        <Text style={{ fontSize: 13, color: Colors.secondary }}>{user.email}</Text>
        <Pressable onPress={logout} style={styles.logoutBtn}><Text style={styles.logoutText}>Sign Out</Text></Pressable>
      </View>

      {/* Profile Info */}
      <View style={styles.card}>
        <View style={styles.infoHeader}>
          <Text style={styles.cardTitle}>Profile Info</Text>
          <Pressable onPress={() => router.push('/profile-settings')}><Text style={styles.updateLink}>Update</Text></Pressable>
        </View>
        <View style={{ gap: 16 }}>
          <View>
            <View style={styles.infoLabel}><Ionicons name="car-outline" size={18} color={Colors.primary} /><Text style={styles.infoLabelText}>Delivery Address</Text></View>
            <Text style={styles.infoValue}>{user.default_address || 'Not set'}</Text>
          </View>
          <View style={styles.divider} />
          <View>
            <View style={styles.infoLabel}><Ionicons name="card-outline" size={18} color={Colors.primary} /><Text style={styles.infoLabelText}>Payment Method</Text></View>
            <Text style={styles.infoValue}>{user.paymentMethods?.[0]?.last_four ? `${user.paymentMethods[0].card_type.toUpperCase()} ending in ${user.paymentMethods[0].last_four}` : 'Not set'}</Text>
          </View>
        </View>
      </View>

      {/* Order History */}
      <View style={{ gap: 12 }}>
        <Text style={styles.cardTitle}>Order History</Text>
        {orders.length === 0 ? (
          <View style={styles.card}><Text style={{ textAlign: 'center', color: Colors.secondary, paddingVertical: 12 }}>No past orders.</Text></View>
        ) : orders.map(order => (
          <Pressable key={order.id} onPress={() => router.push({ pathname: '/order-detail', params: { orderId: String(order.id) } })}>
            <View style={styles.card}>
              <View style={styles.orderHeader}>
                <View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={{ fontSize: 14, fontWeight: '700' }}>Order #{order.id}</Text>
                    <Pressable onPress={(e) => { e.stopPropagation(); toggleFav(order.id, !order.is_favorite); }}>
                      <Ionicons name={order.is_favorite ? 'star' : 'star-outline'} size={18} color={Colors.primary} />
                    </Pressable>
                  </View>
                  <Text style={{ fontSize: 12, color: Colors.secondary }}>{new Date(order.created_at).toLocaleDateString()} • {order.order_type?.toUpperCase()}</Text>
                </View>
                <Text style={{ fontSize: 14, fontWeight: '600', color: Colors.primary }}>${order.total?.toFixed(2)}</Text>
              </View>
              {order.items?.slice(0, 3).map((it: any, i: number) => {
                let modsStr = '';
                let isReward = false;
                try {
                  const mods = JSON.parse(it.modifiers || '[]');
                  const modNames = mods.map((m: any) => m.name).filter((n: string) => n !== 'Reward Redemption');
                  if (modNames.length > 0) modsStr = modNames.join(', ');
                  if (mods.find((m: any) => m.points_cost)) isReward = true;
                } catch {}
                return (
                  <View key={i} style={{ marginTop: 4 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Text style={{ fontSize: 13, color: Colors.onSurface }}>{it.quantity}x {it.name}</Text>
                      {isReward && <View style={styles.rewardBadge}><Text style={styles.rewardBadgeText}>Reward</Text></View>}
                    </View>
                    {modsStr ? <Text style={{ fontSize: 11, color: Colors.secondary, marginLeft: 16 }}>{modsStr}</Text> : null}
                  </View>
                );
              })}
              {(order.items?.length || 0) > 3 && <Text style={{ fontSize: 11, color: Colors.secondary, marginTop: 4 }}>+{order.items.length - 3} more items</Text>}
              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 8 }}>
                <View style={styles.orderAgainHint}>
                  <Ionicons name="bag-add-outline" size={14} color={Colors.primary} />
                  <Text style={{ fontSize: 12, fontWeight: '600', color: Colors.primary }}>Tap for details & reorder</Text>
                </View>
              </View>
            </View>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface },
  card: { backgroundColor: Colors.surfaceContainerLowest, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: Colors.surfaceVariant },
  welcomeTitle: { fontSize: 22, fontWeight: '700', textAlign: 'center', marginBottom: 24, color: Colors.onSurface },
  label: { fontSize: 12, fontWeight: '600', color: Colors.secondary, marginBottom: 4 },
  input: { backgroundColor: Colors.surfaceContainerLow, borderWidth: 1, borderColor: Colors.surfaceVariant, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 16, fontSize: 16 },
  loginBtn: { backgroundColor: Colors.primary, paddingVertical: 14, borderRadius: 10, alignItems: 'center', marginTop: 8 },
  loginBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  bigAvatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: Colors.surfaceContainerHighest, alignItems: 'center', justifyContent: 'center' },
  bigAvatarText: { fontSize: 28, fontWeight: '700', color: Colors.primary },
  logoutBtn: { width: '100%', backgroundColor: Colors.surfaceContainerLow, paddingVertical: 14, borderRadius: 10, alignItems: 'center', marginTop: 8 },
  logoutText: { fontWeight: '600', color: Colors.onSurface, fontSize: 14 },
  infoHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: Colors.surfaceVariant, paddingBottom: 12, marginBottom: 16 },
  cardTitle: { fontSize: 18, fontWeight: '700', color: Colors.onSurface },
  updateLink: { color: Colors.primary, fontWeight: '700', fontSize: 14 },
  infoLabel: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  infoLabelText: { fontSize: 14, fontWeight: '700', color: Colors.onSurface },
  infoValue: { fontSize: 15, color: Colors.secondary },
  divider: { height: 1, backgroundColor: Colors.surfaceVariant },
  orderHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
  rewardBadge: { backgroundColor: 'rgba(186,0,38,0.1)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  rewardBadgeText: { fontSize: 10, fontWeight: '700', color: Colors.primary },
  orderAgainHint: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(186,0,38,0.06)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12 },
});
