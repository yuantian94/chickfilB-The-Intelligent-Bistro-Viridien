import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable, Image, Switch, ActivityIndicator, Alert, TextInput } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Colors from '@/constants/Colors';
import { fetchMenuItem, fetchCart, fetchGuestCart, updateCartItemModifiers, updateGuestCartItemModifiers, resolveImageUrl } from '@/api';
import { useAuth } from '@/context/AuthContext';

export default function CustomizeItemScreen() {
  const router = useRouter();
  const { cartItemId, menuItemId } = useLocalSearchParams<{ cartItemId: string; menuItemId: string }>();
  const { refreshCart, user } = useAuth();
  const [menuData, setMenuData] = useState<any>(null);
  const [cartItem, setCartItem] = useState<any>(null);
  const [selectedMods, setSelectedMods] = useState<Set<string>>(new Set());
  const [rewardMod, setRewardMod] = useState<any>(null);
  const [qty, setQty] = useState('1');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!cartItemId || !menuItemId) { router.back(); return; }
    Promise.all([fetchMenuItem(Number(menuItemId)), user ? fetchCart() : fetchGuestCart()]).then(([menu, cart]) => {
      setMenuData(menu);
      const ci = cart.items?.find((i: any) => i.id === Number(cartItemId));
      if (!ci) { router.back(); return; }
      setCartItem(ci);
      setQty(String(ci.quantity)); // Default: apply to all
      try {
        const parsed = JSON.parse(ci.modifiers || '[]');
        const modNames = parsed.filter((m: any) => !m.points_cost).map((m: any) => m.name);
        setSelectedMods(new Set(modNames));
        const rw = parsed.find((m: any) => m.points_cost);
        if (rw) setRewardMod(rw);
      } catch {}
      setLoading(false);
    }).catch(() => router.back());
  }, [cartItemId, menuItemId]);

  const toggleMod = (name: string) => {
    setSelectedMods(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  // Clamp the qty input
  const handleQtyChange = (text: string) => {
    if (text === '') { setQty(''); return; }
    let num = parseInt(text, 10);
    if (isNaN(num)) return;
    if (num < 1) num = 1;
    if (cartItem && num > cartItem.quantity) num = cartItem.quantity;
    setQty(String(num));
  };

  const save = async () => {
    // Build modifier list
    const mods: any[] = [];
    (menuData?.modifiers || []).forEach((m: any) => {
      if (selectedMods.has(m.name)) mods.push({ name: m.name, price_modifier: m.price_modifier });
    });
    // Preserve reward modifier if any
    if (rewardMod) mods.push(rewardMod);

    let q = parseInt(qty, 10);
    if (isNaN(q) || q < 1) q = 1;
    if (q > cartItem.quantity) q = cartItem.quantity;

    try {
      // Backend handles split (q < total) and aggregate (matching existing row) automatically
      if (user) {
        await updateCartItemModifiers(Number(cartItemId), mods, q);
      } else {
        await updateGuestCartItemModifiers(Number(cartItemId), mods, q);
      }
      await refreshCart();
      router.back();
    } catch {
      Alert.alert('Error', 'Failed to update preferences');
    }
  };

  if (loading) return <View style={styles.container}><ActivityIndicator color={Colors.primary} style={{ marginTop: 60 }} /></View>;

  const isSplitting = parseInt(qty, 10) < cartItem?.quantity;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Customize Item</Text>
        <Pressable onPress={() => router.back()}><Ionicons name="close" size={24} color={Colors.onSurface} /></Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 160, gap: 20 }} keyboardShouldPersistTaps="handled">
        {/* Item Info Card */}
        <View style={styles.card}>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            {menuData?.image_url && <Image source={{ uri: resolveImageUrl(menuData.image_url)! }} style={{ width: 72, height: 72, borderRadius: 8 }} />}
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 18, fontWeight: '700', color: Colors.onSurface }}>{menuData?.name}</Text>
              <Text style={{ fontSize: 13, color: Colors.secondary, marginTop: 4 }}>Total in bag: {cartItem?.quantity}</Text>
            </View>
          </View>
        </View>

        {/* Apply-to-how-many (split feature) */}
        <View style={styles.card}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: Colors.onSurface }}>Apply to how many items?</Text>
          <Text style={{ fontSize: 12, color: Colors.secondary, marginTop: 4 }}>
            Leave as default ({cartItem?.quantity}) to apply to all identical items in this stack.
          </Text>
          <View style={styles.qtyRow}>
            <Pressable onPress={() => { const n = Math.max(1, (parseInt(qty, 10) || 1) - 1); setQty(String(n)); }} style={styles.qtyStepBtn}>
              <Ionicons name="remove" size={16} color={Colors.onSurface} />
            </Pressable>
            <TextInput
              style={styles.qtyInput}
              value={qty}
              onChangeText={handleQtyChange}
              keyboardType="number-pad"
              selectTextOnFocus
              maxLength={3}
            />
            <Pressable onPress={() => { const n = Math.min(cartItem?.quantity || 99, (parseInt(qty, 10) || 0) + 1); setQty(String(n)); }} style={styles.qtyStepBtn}>
              <Ionicons name="add" size={16} color={Colors.onSurface} />
            </Pressable>
            <Text style={{ fontSize: 12, color: Colors.secondary, marginLeft: 8 }}>of {cartItem?.quantity}</Text>
          </View>

          {/* Split hint */}
          {isSplitting && (
            <View style={styles.splitHint}>
              <Ionicons name="git-branch-outline" size={16} color={Colors.primary} />
              <Text style={{ fontSize: 12, color: Colors.primary, flex: 1 }}>
                This will split the stack: {parseInt(qty, 10)} item(s) with new preferences, {cartItem.quantity - parseInt(qty, 10)} item(s) unchanged.
                {'\n'}If matching items already exist in your bag, they'll be combined automatically.
              </Text>
            </View>
          )}
        </View>

        {/* Ingredients & Preferences (modifier checkboxes) */}
        <View>
          <Text style={{ fontSize: 16, fontWeight: '700', color: Colors.onSurface, marginBottom: 12 }}>Ingredients & Preferences</Text>
          {(menuData?.modifiers || []).length === 0 ? (
            <View style={styles.card}><Text style={{ color: Colors.secondary, fontSize: 13 }}>No options available for this item.</Text></View>
          ) : (menuData?.modifiers || []).map((mod: any) => (
            <Pressable key={mod.name} onPress={() => toggleMod(mod.name)} style={[styles.modRow, selectedMods.has(mod.name) && styles.modRowActive]}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: Colors.onSurface }}>{mod.name}</Text>
                {mod.price_modifier !== 0 && (
                  <Text style={{ fontSize: 11, color: Colors.secondary, marginTop: 2 }}>
                    {mod.price_modifier > 0 ? `+$${mod.price_modifier.toFixed(2)}` : `-$${Math.abs(mod.price_modifier).toFixed(2)}`}
                  </Text>
                )}
              </View>
              <Ionicons name={selectedMods.has(mod.name) ? 'checkbox' : 'square-outline'} size={24} color={selectedMods.has(mod.name) ? Colors.primary : Colors.secondary} />
            </Pressable>
          ))}
        </View>
      </ScrollView>

      {/* Action Buttons */}
      <View style={styles.actionBar}>
        <Pressable onPress={() => router.back()} style={styles.cancelBtn}>
          <Text style={{ fontWeight: '600', color: Colors.onSurface }}>Cancel</Text>
        </Pressable>
        <Pressable onPress={save} style={styles.saveBtn}>
          <Text style={{ color: Colors.onPrimary, fontWeight: '700' }}>Save Updates</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12, borderBottomWidth: 0.5, borderBottomColor: Colors.surfaceVariant },
  headerTitle: { fontSize: 20, fontWeight: '700', color: Colors.primary },
  card: { backgroundColor: Colors.surfaceContainerLowest, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: Colors.surfaceVariant },
  qtyRow: { flexDirection: 'row', alignItems: 'center', marginTop: 12, gap: 4 },
  qtyStepBtn: { width: 36, height: 36, borderRadius: 8, backgroundColor: Colors.surfaceContainerHigh, alignItems: 'center', justifyContent: 'center' },
  qtyInput: { width: 56, height: 36, textAlign: 'center', fontSize: 16, fontWeight: '700', color: Colors.onSurface, backgroundColor: Colors.surfaceContainer, borderWidth: 1, borderColor: Colors.surfaceVariant, borderRadius: 8 },
  splitHint: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', marginTop: 12, padding: 12, backgroundColor: 'rgba(186,0,38,0.04)', borderRadius: 10, borderWidth: 1, borderColor: 'rgba(186,0,38,0.15)' },
  modRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, backgroundColor: Colors.surfaceContainerLowest, borderRadius: 12, borderWidth: 1, borderColor: Colors.surfaceVariant, marginBottom: 8 },
  modRowActive: { borderColor: Colors.primary, backgroundColor: 'rgba(186,0,38,0.04)' },
  actionBar: { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', gap: 12, padding: 20, paddingBottom: 40, backgroundColor: Colors.surface, borderTopWidth: 0.5, borderTopColor: Colors.surfaceVariant },
  cancelBtn: { flex: 1, paddingVertical: 14, borderRadius: 24, borderWidth: 1, borderColor: Colors.surfaceVariant, alignItems: 'center' },
  saveBtn: { flex: 1, paddingVertical: 14, borderRadius: 24, backgroundColor: Colors.primary, alignItems: 'center' },
});
