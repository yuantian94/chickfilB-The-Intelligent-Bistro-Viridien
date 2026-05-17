import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable, Image, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Colors from '@/constants/Colors';
import { useAuth } from '@/context/AuthContext';
import { fetchCart, fetchGuestCart, updateCartItemApi, updateGuestCartItem, resolveImageUrl } from '@/api';
import { useFocusEffect } from '@react-navigation/native';

export default function CartScreen() {
  const { user, refreshCart } = useAuth();
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const loadCart = useCallback(async () => {
    setLoading(true);
    try {
      const d = user ? await fetchCart() : await fetchGuestCart();
      setData(d);
    } catch {} finally { setLoading(false); }
  }, [user]);

  useFocusEffect(useCallback(() => { loadCart(); }, [loadCart]));

  const updateQty = async (id: number, qty: number) => {
    if (user) {
      await updateCartItemApi(id, qty);
    } else {
      await updateGuestCartItem(id, qty);
    }
    await loadCart();
    await refreshCart();
  };

  if (loading) return <View style={styles.container}><ActivityIndicator color={Colors.primary} style={{ marginTop: 60 }} /></View>;



  const items = data?.items || [];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>My Bag</Text>
        <Pressable onPress={() => router.back()}><Ionicons name="close" size={24} color={Colors.onSurface} /></Pressable>
      </View>

      {items.length === 0 ? (
        <View style={{ alignItems: 'center', paddingTop: 60, gap: 12 }}>
          <Ionicons name="bag-outline" size={64} color={Colors.surfaceVariant} />
          <Text style={{ fontSize: 18, fontWeight: '700', color: Colors.onSurface }}>Your bag is empty</Text>
          <Pressable onPress={() => { router.back(); setTimeout(() => router.push('/(tabs)/menu'), 100); }} style={styles.browseBtn}>
            <Text style={{ fontSize: 14, fontWeight: '600' }}>Browse Menu</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 160, gap: 16 }}>
            {items.map((item: any) => {
              let itemPrice = item.price;
              let rewardTag = '';
              let pureMods: string[] = [];
              try {
                const mods = JSON.parse(item.modifiers || '[]');
                mods.forEach((m: any) => {
                  itemPrice += (m.price_modifier || 0);
                  if (m.points_cost) rewardTag = `Reward (-${m.points_cost} pts/ea)`;
                  else if (m.name !== 'Reward Redemption') pureMods.push(m.name);
                });
              } catch {}
              const total = itemPrice * item.quantity;

              return (
                <View key={item.id} style={styles.itemCard}>
                  {item.image_url ? <Image source={{ uri: resolveImageUrl(item.image_url)! }} style={styles.itemImg} /> : null}
                  <View style={{ flex: 1, gap: 4 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
                      <Text style={styles.itemTotal}>${total.toFixed(2)}</Text>
                    </View>
                    <Text style={{ fontSize: 12, color: Colors.secondary }}>{item.calories} Cal</Text>
                    {rewardTag ? <Text style={{ fontSize: 12, color: Colors.primary, fontWeight: '700' }}>{rewardTag}</Text> : null}
                    {pureMods.map((m, i) => <Text key={i} style={{ fontSize: 12, color: Colors.secondary }}>{m} x {item.quantity}</Text>)}

                    {/* Edit link — only shown when item has modifiers available */}
                    {item.mod_count > 0 && (
                      <Pressable onPress={() => router.push({ pathname: '/customize-item', params: { cartItemId: String(item.id), menuItemId: String(item.menu_item_id) } })}>
                        <Text style={{ fontSize: 13, color: Colors.primary, fontWeight: '700', textDecorationLine: 'underline', marginTop: 2 }}>edit</Text>
                      </Pressable>
                    )}

                    <View style={styles.qtyRow}>
                      <View style={styles.qtyControls}>
                        <Pressable onPress={() => updateQty(item.id, item.quantity - 1)} style={styles.qtyBtn}><Ionicons name="remove" size={16} color={Colors.onSurface} /></Pressable>
                        <Text style={styles.qtyText}>{item.quantity}</Text>
                        <Pressable onPress={() => updateQty(item.id, item.quantity + 1)} style={styles.qtyBtn}><Ionicons name="add" size={16} color={Colors.onSurface} /></Pressable>
                      </View>
                      <Pressable onPress={() => updateQty(item.id, 0)}><Text style={{ fontSize: 13, color: Colors.secondary, textDecorationLine: 'underline' }}>Remove</Text></Pressable>
                    </View>
                  </View>
                </View>
              );
            })}

            {/* Summary */}
            <View style={styles.summaryCard}>
              <Text style={{ fontSize: 18, fontWeight: '700', marginBottom: 8 }}>Order Summary</Text>
              <View style={styles.summaryRow}><Text>Subtotal</Text><Text>${data.subtotal?.toFixed(2)}</Text></View>
              {data.discount > 0 && <View style={styles.summaryRow}><Text style={{ color: 'green' }}>Tier Discount ({data.tier})</Text><Text style={{ color: 'green' }}>-${data.discount?.toFixed(2)}</Text></View>}
              <View style={styles.summaryRow}><Text style={{ fontSize: 13, color: Colors.secondary }}>Tax</Text><Text style={{ fontSize: 13, color: Colors.secondary }}>${data.tax?.toFixed(2)}</Text></View>
              <View style={[styles.summaryRow, { borderTopWidth: 1, borderTopColor: Colors.surfaceVariant, paddingTop: 8, marginTop: 4 }]}>
                <Text style={{ fontSize: 18, fontWeight: '700' }}>Total</Text>
                <Text style={{ fontSize: 18, fontWeight: '700' }}>${data.total?.toFixed(2)}</Text>
              </View>
            </View>
          </ScrollView>

          {/* Checkout Button */}
          <View style={styles.checkoutBar}>
            <Pressable onPress={() => router.push(user ? '/checkout' : '/guest-checkout')} style={styles.checkoutBtn}>
              <Text style={styles.checkoutText}>{user ? 'Check Out' : 'Guest Checkout'}</Text>
              <Text style={styles.checkoutTotal}>${data.total?.toFixed(2)}</Text>
            </Pressable>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12, borderBottomWidth: 0.5, borderBottomColor: Colors.surfaceVariant },
  headerTitle: { fontSize: 20, fontWeight: '700', color: Colors.primary },
  itemCard: { flexDirection: 'row', backgroundColor: Colors.surfaceContainerLowest, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: Colors.surfaceVariant, gap: 12 },
  itemImg: { width: 72, height: 72, borderRadius: 8 },
  itemName: { fontSize: 16, fontWeight: '700', color: Colors.onSurface, flex: 1 },
  itemTotal: { fontSize: 14, fontWeight: '600', color: Colors.onSurface },
  qtyRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  qtyControls: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.surfaceContainer, borderRadius: 20, paddingHorizontal: 8, paddingVertical: 4 },
  qtyBtn: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  qtyText: { fontSize: 14, fontWeight: '600', width: 20, textAlign: 'center' },
  summaryCard: { backgroundColor: Colors.surfaceContainerLowest, padding: 16, borderRadius: 12, borderWidth: 1, borderColor: Colors.surfaceVariant },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  checkoutBar: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 20, paddingBottom: 40, backgroundColor: Colors.surface },
  checkoutBtn: { backgroundColor: Colors.primary, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 16, paddingHorizontal: 24, borderRadius: 28 },
  checkoutText: { color: Colors.onPrimary, fontWeight: '600', fontSize: 16 },
  checkoutTotal: { color: Colors.onPrimary, fontWeight: '700', fontSize: 18 },
  browseBtn: { backgroundColor: Colors.surfaceContainerLow, paddingVertical: 12, paddingHorizontal: 24, borderRadius: 20, marginTop: 8 },
});
