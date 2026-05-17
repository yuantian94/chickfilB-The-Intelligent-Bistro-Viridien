import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable, Image, ActivityIndicator, Alert } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Colors from '@/constants/Colors';
import { useAuth } from '@/context/AuthContext';
import { fetchOrder, fetchCart, addToCartApi, resolveImageUrl } from '@/api';

export default function OrderDetailScreen() {
  const router = useRouter();
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const { user, refreshCart } = useAuth();
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [reordering, setReordering] = useState(false);

  useEffect(() => {
    if (!orderId) { router.back(); return; }
    fetchOrder(Number(orderId)).then(o => { setOrder(o); setLoading(false); }).catch(() => router.back());
  }, [orderId]);

  const handleReorder = async () => {
    if (!order?.items || reordering) return;
    setReordering(true);

    try {
      // Get current cart to calculate available points
      const cartData = await fetchCart();
      let cartPointsUsed = 0;
      (cartData.items || []).forEach((ci: any) => {
        try {
          const mods = JSON.parse(ci.modifiers || '[]');
          mods.forEach((m: any) => { if (m.points_cost) cartPointsUsed += m.points_cost * ci.quantity; });
        } catch {}
      });
      let remainingPoints = (user?.rewards?.points || 0) - cartPointsUsed;

      let itemsAdded = 0;
      let redeemedCount = 0;
      let fallbackCount = 0;

      for (const item of order.items) {
        let mods: any[] = [];
        let isRedeem = false;
        let pointsCost = 0;

        try {
          mods = JSON.parse(item.modifiers || '[]');
          const redeemMod = mods.find((m: any) => m.name === 'Reward Redemption');
          if (redeemMod) {
            isRedeem = true;
            pointsCost = (redeemMod.points_cost || item.redeem_points || 0) * item.quantity;
          }
        } catch {}

        let finalMods = mods;
        if (isRedeem) {
          if (pointsCost > remainingPoints) {
            // Insufficient points — strip reward mod, add as regular
            finalMods = mods.filter((m: any) => m.name !== 'Reward Redemption');
            fallbackCount++;
          } else {
            remainingPoints -= pointsCost;
            redeemedCount++;
          }
        }

        try {
          await addToCartApi(item.menu_item_id, item.quantity, finalMods);
          itemsAdded++;
        } catch {}
      }

      await refreshCart();

      let msg = 'Items added to your bag! 🎉';
      if (redeemedCount > 0 && fallbackCount === 0) {
        msg = `Items added! ${redeemedCount} item(s) redeemed with points 🎉`;
      } else if (fallbackCount > 0) {
        msg = `Items added! ${fallbackCount} reward item(s) added as regular items due to insufficient points.`;
      }
      Alert.alert('Order Again', msg);
    } catch {
      Alert.alert('Error', 'Failed to reorder items');
    } finally {
      setReordering(false);
    }
  };

  if (loading) return <View style={styles.container}><ActivityIndicator color={Colors.primary} style={{ marginTop: 80 }} /></View>;
  if (!order) return null;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Ionicons name="arrow-back" size={22} color={Colors.onSurface} />
          <Text style={styles.headerTitle}>Order #{order.id}</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 160, gap: 16 }}>
        {/* Order Meta */}
        <View style={styles.metaCard}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View>
              <Text style={{ fontSize: 12, color: Colors.secondary }}>{new Date(order.created_at).toLocaleString()}</Text>
              <Text style={{ fontSize: 13, color: Colors.secondary, marginTop: 2 }}>{order.order_type?.toUpperCase()} • {order.status?.toUpperCase()}</Text>
            </View>
            <View style={styles.totalBadge}>
              <Text style={styles.totalBadgeText}>${order.total?.toFixed(2)}</Text>
            </View>
          </View>
        </View>

        {/* Items */}
        <Text style={{ fontSize: 16, fontWeight: '700', color: Colors.onSurface }}>Items</Text>
        {(order.items || []).map((item: any, idx: number) => {
          const imgUri = resolveImageUrl(item.image_url);
          let modsDisplay: string[] = [];
          let isReward = false;
          try {
            const parsed = JSON.parse(item.modifiers || '[]');
            parsed.forEach((m: any) => {
              if (m.points_cost || m.name === 'Reward Redemption') isReward = true;
              else modsDisplay.push(m.name);
            });
          } catch {}

          return (
            <View key={idx} style={styles.itemCard}>
              {imgUri ? (
                <Image source={{ uri: imgUri }} style={styles.itemImg} />
              ) : (
                <View style={[styles.itemImg, styles.itemImgPlaceholder]}><Text style={{ fontSize: 24 }}>🐔</Text></View>
              )}
              <View style={{ flex: 1, gap: 2 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: Colors.onSurface, flex: 1 }} numberOfLines={1}>
                    {item.quantity}x {item.name}
                  </Text>
                  {isReward && (
                    <View style={styles.rewardBadge}>
                      <Text style={styles.rewardBadgeText}>Redeemed</Text>
                    </View>
                  )}
                </View>
                {modsDisplay.length > 0 && (
                  <Text style={{ fontSize: 12, color: Colors.secondary }}>• {modsDisplay.join(', ')}</Text>
                )}
              </View>
            </View>
          );
        })}
      </ScrollView>

      {/* Order Again Bar */}
      <View style={styles.actionBar}>
        <Pressable onPress={handleReorder} style={[styles.reorderBtn, reordering && { opacity: 0.6 }]} disabled={reordering}>
          {reordering ? <ActivityIndicator color={Colors.onPrimary} /> : (
            <>
              <Ionicons name="bag-add-outline" size={20} color={Colors.onPrimary} />
              <Text style={{ color: Colors.onPrimary, fontWeight: '700', fontSize: 16 }}>Order Again</Text>
            </>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface },
  header: { paddingHorizontal: 20, paddingTop: 60, paddingBottom: 12, borderBottomWidth: 0.5, borderBottomColor: Colors.surfaceVariant },
  headerTitle: { fontSize: 20, fontWeight: '700', color: Colors.primary },
  metaCard: { backgroundColor: Colors.surfaceContainerLowest, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: Colors.surfaceVariant },
  totalBadge: { backgroundColor: Colors.primary, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  totalBadgeText: { color: Colors.onPrimary, fontWeight: '700', fontSize: 18 },
  itemCard: { flexDirection: 'row', gap: 12, backgroundColor: Colors.surfaceContainerLowest, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: Colors.surfaceVariant, alignItems: 'center' },
  itemImg: { width: 56, height: 56, borderRadius: 8 },
  itemImgPlaceholder: { backgroundColor: Colors.surfaceContainerLow, alignItems: 'center', justifyContent: 'center' },
  rewardBadge: { backgroundColor: 'rgba(186,0,38,0.1)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  rewardBadgeText: { fontSize: 11, fontWeight: '700', color: Colors.primary },
  actionBar: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 20, paddingBottom: 40, backgroundColor: Colors.surface },
  reorderBtn: { backgroundColor: Colors.primary, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, paddingVertical: 16, borderRadius: 28 },
});
