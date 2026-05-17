import React, { useState, useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable, Image, ActivityIndicator, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Colors from '@/constants/Colors';
import { useAuth } from '@/context/AuthContext';
import { fetchRewards, fetchRedeemable, addToCartApi, resolveImageUrl } from '@/api';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';

export default function RewardsScreen() {
  const { user, cartPointsUsed, refreshCart } = useAuth();
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [redeemItems, setRedeemItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  // Per-item pending quantity: { [itemId]: number }
  const [quantities, setQuantities] = useState<Record<number, number>>({});

  useFocusEffect(
    React.useCallback(() => {
      if (!user) return;
      setLoading(true);
      Promise.all([fetchRewards(), fetchRedeemable()]).then(([r, rd]) => {
        setData(r);
        setRedeemItems(rd.redeemableItems || []);
        // Reset all quantities to 0 (nothing pending)
        const qtyMap: Record<number, number> = {};
        (rd.redeemableItems || []).forEach((item: any) => { qtyMap[item.id] = 0; });
        setQuantities(qtyMap);
        setLoading(false);
      }).catch(() => setLoading(false));
    }, [user])
  );

  // Total points available (balance minus points already committed in cart)
  const totalBudget = (data?.points || 0) - cartPointsUsed;

  // Points currently "allocated" across all pending qty selections
  const pendingPointsUsed = useMemo(() => {
    return redeemItems.reduce((sum, item) => {
      const qty = quantities[item.id] || 0;
      return sum + qty * item.redeem_points;
    }, 0);
  }, [quantities, redeemItems]);

  // Points still unallocated
  const pointsRemaining = totalBudget - pendingPointsUsed;

  // For a specific item, the max qty it can be set to is:
  // (budget - points used by ALL OTHER items) / item cost
  const getMaxQty = (item: any) => {
    const pointsUsedByOthers = redeemItems.reduce((sum, other) => {
      if (other.id === item.id) return sum;
      return sum + (quantities[other.id] || 0) * other.redeem_points;
    }, 0);
    const pointsAvailableForThis = totalBudget - pointsUsedByOthers;
    return Math.max(0, Math.floor(pointsAvailableForThis / item.redeem_points));
  };

  const getQty = (id: number) => quantities[id] || 0;

  const setQty = (itemId: number, val: number, maxQty: number) => {
    const clamped = Math.max(0, Math.min(maxQty, isNaN(val) ? 0 : val));
    setQuantities(prev => ({ ...prev, [itemId]: clamped }));
  };

  const handleQtyInput = (itemId: number, text: string, maxQty: number) => {
    if (text === '') {
      setQuantities(prev => ({ ...prev, [itemId]: 0 }));
      return;
    }
    const num = parseInt(text, 10);
    if (!isNaN(num)) setQty(itemId, num, maxQty);
  };

  const handleRedeem = async (item: any) => {
    const qty = getQty(item.id);
    if (qty < 1) return;
    try {
      await addToCartApi(item.id, qty, [{ name: 'Reward Redemption', price_modifier: -item.price, points_cost: item.redeem_points }]);
      await refreshCart();
      // Refresh rewards data from server
      const [r, rd] = await Promise.all([fetchRewards(), fetchRedeemable()]);
      setData(r);
      setRedeemItems(rd.redeemableItems || []);
      // Reset ALL quantities after redemption
      const qtyMap: Record<number, number> = {};
      (rd.redeemableItems || []).forEach((i: any) => { qtyMap[i.id] = 0; });
      setQuantities(qtyMap);
    } catch {}
  };

  if (!user) { return <View style={styles.container}><Text style={{ textAlign: 'center', marginTop: 40, color: Colors.secondary }}>Please sign in to view rewards.</Text></View>; }
  if (loading) return <View style={styles.container}><ActivityIndicator color={Colors.primary} style={{ marginTop: 40 }} /></View>;

  const tierName = (data?.tier || 'member').charAt(0).toUpperCase() + (data?.tier || 'member').slice(1);

  // "Available" = items you can still add at least 1 of OR already have qty > 0 pending
  // "More" = items you can't afford even 1 of AND have no pending qty
  const available: any[] = [];
  const more: any[] = [];
  redeemItems.forEach(item => {
    const maxQ = getMaxQty(item);
    const currentQ = getQty(item.id);
    if (currentQ > 0 || maxQ >= 1) {
      available.push(item);
    } else {
      more.push(item);
    }
  });

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 20, paddingBottom: 120, gap: 24 }} keyboardShouldPersistTaps="handled">
      {/* Points Banner */}
      <View style={styles.banner}>
        <Text style={styles.bannerTitle}>{tierName} Member</Text>
        <Text style={styles.bannerPoints}>{totalBudget.toLocaleString()}</Text>
        <Text style={styles.bannerPts}>pts available</Text>
        {data?.tierInfo?.next ? <Text style={styles.bannerSub}>{data.pointsToNext?.toLocaleString()} points until {data.tierInfo.next.charAt(0).toUpperCase() + data.tierInfo.next.slice(1)}</Text> : <Text style={styles.bannerSub}>You are at the highest tier!</Text>}
      </View>

      {/* Live budget indicator — always visible to prevent layout shift */}
      <View style={styles.budgetBar}>
        <View style={styles.budgetRow}>
          <Text style={styles.budgetLabel}>Pending selections</Text>
          <Text style={styles.budgetValue}>{pendingPointsUsed > 0 ? `−${pendingPointsUsed.toLocaleString()} pts` : '0 pts'}</Text>
        </View>
        <View style={styles.budgetDivider} />
        <View style={styles.budgetRow}>
          <Text style={[styles.budgetLabel, { fontWeight: '700' }]}>Remaining after redeem</Text>
          <Text style={[styles.budgetValue, { fontWeight: '800', color: pointsRemaining < 0 ? Colors.error : Colors.primary }]}>{pointsRemaining.toLocaleString()} pts</Text>
        </View>
        <View style={styles.progressTrack}>
          <View style={[styles.progressBar, { width: `${Math.max(0, Math.min(100, (pointsRemaining / totalBudget) * 100))}%` }]} />
        </View>
      </View>

      {/* Available to Redeem */}
      {available.length > 0 && (
        <View style={{ gap: 12 }}>
          <Text style={styles.sectionTitle}>Available to Redeem</Text>
          {available.map((item: any) => {
            const maxQty = getMaxQty(item);
            const qty = getQty(item.id);
            const canAdd = qty < maxQty;
            return (
              <View key={item.id} style={styles.redeemCard}>
                {item.image_url ? <Image source={{ uri: resolveImageUrl(item.image_url)! }} style={styles.redeemImg} /> : null}
                <View style={{ flex: 1 }}>
                  <Text style={styles.redeemName}>{item.name}</Text>
                  <Text style={styles.redeemPts}>{item.redeem_points} pts</Text>
                  {qty > 0 && <Text style={styles.pendingCost}>{qty} × {item.redeem_points} = {qty * item.redeem_points} pts</Text>}
                </View>
                <View style={styles.qtyAddRow}>
                  {/* Quantity Stepper */}
                  <View style={styles.qtyStepper}>
                    <Pressable onPress={() => setQty(item.id, qty - 1, maxQty)} style={styles.qtyStepBtn} hitSlop={4}>
                      <Ionicons name="remove" size={14} color={qty <= 0 ? Colors.surfaceVariant : Colors.onSurface} />
                    </Pressable>
                    <TextInput
                      style={styles.qtyInput}
                      value={String(qty)}
                      onChangeText={(text) => handleQtyInput(item.id, text, maxQty)}
                      keyboardType="number-pad"
                      selectTextOnFocus
                      maxLength={2}
                    />
                    <Pressable onPress={() => setQty(item.id, qty + 1, maxQty)} style={[styles.qtyStepBtn, !canAdd && { opacity: 0.3 }]} hitSlop={4} disabled={!canAdd}>
                      <Ionicons name="add" size={14} color={canAdd ? Colors.onSurface : Colors.surfaceVariant} />
                    </Pressable>
                  </View>
                  {/* Redeem Button */}
                  <Pressable onPress={() => handleRedeem(item)} style={[styles.redeemBtn, qty < 1 && styles.redeemBtnDisabled]} disabled={qty < 1}>
                    <Ionicons name="checkmark" size={20} color={qty < 1 ? Colors.secondary : Colors.onPrimary} />
                  </Pressable>
                </View>
              </View>
            );
          })}
        </View>
      )}

      {/* More Rewards (can't afford) */}
      {more.length > 0 && (
        <View style={{ gap: 12 }}>
          <Text style={styles.sectionTitle}>More Rewards</Text>
          {more.map((item: any) => (
            <View key={item.id} style={[styles.redeemCard, { opacity: 0.6 }]}>
              {item.image_url ? <Image source={{ uri: resolveImageUrl(item.image_url)! }} style={styles.redeemImg} /> : null}
              <View style={{ flex: 1 }}>
                <Text style={styles.redeemName}>{item.name}</Text>
                <Text style={[styles.redeemPts, { color: Colors.secondary }]}>{item.redeem_points} pts</Text>
              </View>
              <Ionicons name="lock-closed-outline" size={18} color={Colors.secondary} />
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface },
  banner: { backgroundColor: Colors.primary, padding: 20, borderRadius: 12, overflow: 'hidden' },
  bannerTitle: { fontSize: 18, fontWeight: '700', color: Colors.onPrimary, marginBottom: 8 },
  bannerPoints: { fontSize: 40, fontWeight: '800', color: Colors.onPrimary },
  bannerPts: { fontSize: 16, color: 'rgba(255,255,255,0.9)', marginTop: -4 },
  bannerSub: { fontSize: 13, color: 'rgba(255,255,255,0.8)', marginTop: 8 },
  budgetBar: { backgroundColor: Colors.surfaceContainerLowest, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: Colors.primary, gap: 8 },
  budgetRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  budgetLabel: { fontSize: 13, color: Colors.secondary },
  budgetValue: { fontSize: 13, fontWeight: '600', color: Colors.onSurface },
  budgetDivider: { height: 1, backgroundColor: Colors.surfaceVariant },
  progressTrack: { height: 6, backgroundColor: Colors.surfaceVariant, borderRadius: 3, overflow: 'hidden' },
  progressBar: { height: 6, backgroundColor: Colors.primary, borderRadius: 3 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: Colors.onSurface },
  redeemCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.surfaceContainerLowest, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: Colors.surfaceVariant },
  redeemImg: { width: 56, height: 56, borderRadius: 8 },
  redeemName: { fontSize: 14, fontWeight: '700', color: Colors.onSurface },
  redeemPts: { fontSize: 13, fontWeight: '700', color: Colors.primary, marginTop: 2 },
  pendingCost: { fontSize: 11, color: Colors.secondary, marginTop: 2 },
  qtyAddRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  qtyStepper: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surfaceContainerHigh, borderRadius: 8, overflow: 'hidden' },
  qtyStepBtn: { width: 28, height: 32, alignItems: 'center', justifyContent: 'center' },
  qtyInput: { width: 28, height: 32, textAlign: 'center', fontSize: 13, fontWeight: '600', color: Colors.onSurface, padding: 0 },
  redeemBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
  redeemBtnDisabled: { backgroundColor: Colors.surfaceContainerHigh },
});
