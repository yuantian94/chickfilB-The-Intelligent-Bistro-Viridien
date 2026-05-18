import React, { useEffect, useState, useCallback, useRef } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable, Image, RefreshControl, ActivityIndicator, Animated, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Colors from '@/constants/Colors';
import { useAuth } from '@/context/AuthContext';
import { fetchFeatured, fetchOrders, addToCartApi, resolveImageUrl } from '@/api';

export default function HomeScreen() {
  const { user, cartCount, refreshCart } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [featured, setFeatured] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  // Animated scroll indicator for recent orders
  const ordersScrollX = useRef(new Animated.Value(0)).current;
  const { width: screenWidth } = useWindowDimensions();
  const ordersTrackWidth = screenWidth - 40;
  const [ordersContentWidth, setOrdersContentWidth] = useState(1);

  const loadData = useCallback(async () => {
    try {
      const items = await fetchFeatured();
      setFeatured(items.slice(0, 3));
      if (user) {
        const o = await fetchOrders();
        setOrders(o.slice(0, 4));
      }
    } catch {} finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { loadData(); }, [loadData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    await refreshCart();
    setRefreshing(false);
  };

  // Rewards progress
  let progressPct = 0;
  let tierInfo = 'Sign in to earn points';
  if (user?.rewards) {
    const tp = user.rewards.total_points_earned || 0;
    const bal = user.rewards.points || 0;
    if (tp < 1000) { progressPct = (tp / 1000) * 100; tierInfo = `Member (${1000 - tp} pts to Silver) • ${bal} balance`; }
    else if (tp < 3000) { progressPct = ((tp - 1000) / 2000) * 100; tierInfo = `Silver 2% Off (${3000 - tp} pts to Gold) • ${bal} balance`; }
    else if (tp < 5000) { progressPct = ((tp - 3000) / 2000) * 100; tierInfo = `Gold 3% Off (${5000 - tp} pts to Platinum) • ${bal} balance`; }
    else { progressPct = 100; tierInfo = `Platinum 5% Off (Max Tier) • ${bal} balance`; }
  }

  const handleAddToCart = async (id: number) => {
    if (!user) { router.push('/(tabs)/account'); return; }
    try {
      const data = await addToCartApi(id);
      await refreshCart();
    } catch {}
  };

  return (
    <ScrollView
      style={[styles.container, { paddingTop: insets.top }]}
      contentContainerStyle={{ paddingBottom: 100 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{user ? user.name.charAt(0).toUpperCase() : '?'}</Text>
          </View>
          <View>
            <Text style={styles.greeting}>{user ? 'Good Morning,' : 'Welcome,'}</Text>
            <Pressable onPress={() => !user && router.push('/(tabs)/account')}>
              <Text style={styles.userName}>{user ? user.name.split(' ')[0] : 'Sign In'}</Text>
            </Pressable>
          </View>
        </View>
        <View style={styles.headerRight}>
          <Pressable onPress={() => router.navigate('/chat')} style={styles.iconBtn}>
            <Ionicons name="sparkles" size={22} color={Colors.primary} />
          </Pressable>
          <Pressable onPress={() => router.navigate('/cart')} style={styles.iconBtn}>
            <View>
              <Ionicons name="bag-handle-outline" size={22} color={Colors.primary} />
              {cartCount > 0 && <View style={styles.badge}><Text style={styles.badgeText}>{cartCount > 9 ? '9+' : cartCount}</Text></View>}
            </View>
          </Pressable>
        </View>
      </View>

      <View style={styles.content}>
        {/* Rewards Card */}
        <Pressable onPress={() => router.push('/(tabs)/rewards')} style={styles.rewardsCard}>
          <View style={styles.rewardsTop}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rewardsTitle}>CFB Fresh Rewards</Text>
              <Text style={styles.rewardsSub}>{tierInfo}</Text>
            </View>
            <Ionicons name="ribbon" size={28} color={Colors.primary} />
          </View>
          {user && (
            <>
              <View style={styles.progressTrack}>
                <View style={[styles.progressBar, { width: `${progressPct}%` }]} />
              </View>
              <View style={styles.rewardsBottom}>
                <Text style={styles.viewBalance}>View Balance</Text>
                <View style={styles.redeemBtn}>
                  <Text style={styles.redeemBtnText}>Redeem</Text>
                  <Ionicons name="arrow-forward" size={14} color={Colors.onPrimary} />
                </View>
              </View>
            </>
          )}
        </Pressable>

        {/* Recent Orders */}
        {user && orders.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Recent Orders</Text>
              <Pressable onPress={() => router.push('/(tabs)/account')}>
                <Text style={styles.viewAll}>View all</Text>
              </Pressable>
            </View>
            <Animated.ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 12 }}
              onContentSizeChange={(w: number) => setOrdersContentWidth(Math.max(1, w))}
              onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: ordersScrollX } } }], { useNativeDriver: false })}
              scrollEventThrottle={16}
            >
              {orders.map(order => {
                const topItem = order.items?.[0];
                return (
                  <Pressable key={order.id} onPress={() => router.push({ pathname: '/order-detail', params: { orderId: String(order.id) } })}>
                    <View style={styles.orderCard}>
                      <View style={{ flexDirection: 'row', gap: 12 }}>
                        {topItem?.image_url && <Image source={{ uri: resolveImageUrl(topItem.image_url)! }} style={styles.orderImg} />}
                        <View style={{ flex: 1 }}>
                          <Text style={styles.orderTitle}>Order #{order.id}</Text>
                          {order.items?.slice(0, 2).map((it: any, i: number) => (
                            <Text key={i} style={styles.orderItemText} numberOfLines={1}>{it.quantity}x {it.name}</Text>
                          ))}
                          <Text style={{ fontSize: 11, color: Colors.primary, fontWeight: '600', marginTop: 4 }}>Tap for details</Text>
                        </View>
                      </View>
                    </View>
                  </Pressable>
                );
              })}
            </Animated.ScrollView>
            {/* Dynamic scroll indicator */}
            {ordersContentWidth > ordersTrackWidth && (() => {
              const thumbRatio = Math.max(0.2, ordersTrackWidth / ordersContentWidth);
              const thumbW = thumbRatio * ordersTrackWidth;
              const maxS = Math.max(1, ordersContentWidth - ordersTrackWidth);
              const maxT = ordersTrackWidth - thumbW;
              return (
                <View style={styles.ordersScrollTrack}>
                  <Animated.View style={[
                    styles.ordersScrollThumb,
                    {
                      width: thumbW,
                      transform: [{ translateX: ordersScrollX.interpolate({ inputRange: [0, maxS], outputRange: [0, maxT], extrapolate: 'clamp' }) }],
                    },
                  ]} />
                </View>
              );
            })()}
          </View>
        )}

        {/* Featured Items */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Featured & Seasonal</Text>
            <Pressable onPress={() => router.push('/(tabs)/menu')}>
              <Text style={styles.viewAll}>View Menu</Text>
            </Pressable>
          </View>
          {loading ? <ActivityIndicator color={Colors.primary} /> : featured.map(item => (
            <View key={item.id} style={styles.featuredCard}>
              {item.image_url && <Image source={{ uri: resolveImageUrl(item.image_url)! }} style={styles.featuredImg} />}
              <View style={styles.featuredBadge}><Text style={styles.featuredBadgeText}>Featured</Text></View>
              <View style={styles.featuredBody}>
                <View style={styles.featuredTop}>
                  <Text style={styles.featuredName}>{item.name}</Text>
                  <Text style={styles.featuredPrice}>${item.price.toFixed(2)}</Text>
                </View>
                <Text style={styles.featuredDesc} numberOfLines={2}>{item.description}</Text>
                <Pressable onPress={() => handleAddToCart(item.id)} style={styles.addBtn}>
                  <Text style={styles.addBtnText}>Add to Order</Text>
                </Pressable>
              </View>
            </View>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: Colors.surfaceVariant },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerRight: { flexDirection: 'row', gap: 4 },
  iconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.surfaceContainerHighest, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: Colors.primary, fontWeight: '700', fontSize: 16 },
  greeting: { fontSize: 12, color: Colors.secondary },
  userName: { fontSize: 18, fontWeight: '700', color: Colors.onSurface },
  badge: { position: 'absolute', top: -4, right: -6, backgroundColor: Colors.error, borderRadius: 8, minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  badgeText: { color: '#fff', fontSize: 9, fontWeight: '700' },
  content: { padding: 20, gap: 32 },
  rewardsCard: { backgroundColor: Colors.surfaceContainerLowest, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: Colors.surfaceVariant, gap: 12 },
  rewardsTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  rewardsTitle: { fontSize: 18, fontWeight: '700', color: Colors.onSurface },
  rewardsSub: { fontSize: 13, color: Colors.secondary, marginTop: 4 },
  progressTrack: { height: 8, backgroundColor: Colors.surfaceVariant, borderRadius: 4, overflow: 'hidden' },
  progressBar: { height: 8, backgroundColor: Colors.primary, borderRadius: 4 },
  rewardsBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  viewBalance: { fontSize: 14, fontWeight: '600', color: Colors.onSurface },
  redeemBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.primary, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 },
  redeemBtnText: { color: Colors.onPrimary, fontSize: 12, fontWeight: '600' },
  section: { gap: 12 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: Colors.onSurface },
  viewAll: { fontSize: 14, fontWeight: '600', color: Colors.primary },
  orderCard: { width: 280, backgroundColor: Colors.surfaceContainerLowest, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: Colors.surfaceVariant, gap: 12 },
  orderImg: { width: 64, height: 64, borderRadius: 8 },
  orderTitle: { fontSize: 16, fontWeight: '700', color: Colors.onSurface },
  orderItemText: { fontSize: 13, color: Colors.secondary, marginTop: 2 },
  ordersScrollTrack: { marginTop: 10, height: 3, backgroundColor: Colors.surfaceVariant, borderRadius: 1.5 },
  ordersScrollThumb: { height: 3, backgroundColor: Colors.primary, borderRadius: 1.5, opacity: 0.5 },
  featuredCard: { backgroundColor: Colors.surfaceContainerLowest, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: Colors.surfaceVariant },
  featuredImg: { width: '100%', height: 180 },
  featuredBadge: { position: 'absolute', top: 12, left: 12, backgroundColor: Colors.tertiaryContainer, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  featuredBadgeText: { color: Colors.onTertiaryContainer, fontSize: 11, fontWeight: '600' },
  featuredBody: { padding: 16, gap: 8 },
  featuredTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  featuredName: { fontSize: 18, fontWeight: '700', color: Colors.onSurface, flex: 1 },
  featuredPrice: { fontSize: 14, fontWeight: '600', color: Colors.onSurface },
  featuredDesc: { fontSize: 13, color: Colors.secondary },
  addBtn: { backgroundColor: Colors.surfaceContainerLow, paddingVertical: 14, borderRadius: 8, alignItems: 'center', marginTop: 4 },
  addBtnText: { fontSize: 14, fontWeight: '600', color: Colors.onSurface },
});
