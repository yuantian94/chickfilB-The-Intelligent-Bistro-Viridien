import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable, TextInput, Image, ActivityIndicator, Animated, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Colors from '@/constants/Colors';
import { useAuth } from '@/context/AuthContext';
import { fetchCategories, fetchMenu, addToCartApi, addToGuestCart, resolveImageUrl } from '@/api';

export default function MenuScreen() {
  const { user, refreshCart } = useAuth();
  const [categories, setCategories] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [activeSlug, setActiveSlug] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [quantities, setQuantities] = useState<Record<number, number>>({});
  // Animated scroll indicator — use screen width instead of onLayout
  const scrollX = useRef(new Animated.Value(0)).current;
  const { width: screenWidth } = useWindowDimensions();
  const trackWidth = screenWidth - 40; // minus 20px padding each side
  const [contentWidth, setContentWidth] = useState(1);

  useEffect(() => {
    fetchCategories().then(cats => {
      setCategories(cats);
      if (cats.length > 0) loadCategory(cats[0].slug);
    });
  }, []);

  const loadCategory = async (slug: string) => {
    setActiveSlug(slug);
    setLoading(true);
    const data = await fetchMenu(slug);
    setItems(data);
    const qtyMap: Record<number, number> = {};
    data.forEach((item: any) => { qtyMap[item.id] = 1; });
    setQuantities(qtyMap);
    setLoading(false);
  };

  useEffect(() => {
    const t = setTimeout(() => {
      if (search.trim()) {
        setActiveSlug(null);
        setLoading(true);
        fetchMenu(undefined, search.trim()).then(data => {
          setItems(data);
          const qtyMap: Record<number, number> = {};
          data.forEach((item: any) => { qtyMap[item.id] = 1; });
          setQuantities(qtyMap);
          setLoading(false);
        });
      } else if (categories.length > 0) {
        loadCategory(categories[0].slug);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const getQty = (id: number) => quantities[id] || 1;

  const setQty = (id: number, val: number) => {
    const clamped = Math.max(1, Math.min(99, isNaN(val) ? 1 : val));
    setQuantities(prev => ({ ...prev, [id]: clamped }));
  };

  const handleQtyInput = (id: number, text: string) => {
    if (text === '') { setQuantities(prev => ({ ...prev, [id]: 1 })); return; }
    const num = parseInt(text, 10);
    if (!isNaN(num)) setQty(id, num);
  };

  const handleAdd = async (id: number) => {
    const qty = getQty(id);
    try {
      if (user) {
        await addToCartApi(id, qty);
      } else {
        await addToGuestCart(id, qty);
      }
      await refreshCart();
      setQuantities(prev => ({ ...prev, [id]: 1 }));
    } catch {}
  };

  // Scroll indicator math
  const thumbRatio = Math.max(0.2, trackWidth / Math.max(1, contentWidth));
  const thumbWidth = thumbRatio * trackWidth;
  const maxScroll = Math.max(1, contentWidth - trackWidth);
  const maxThumbTravel = trackWidth - thumbWidth;

  return (
    <View style={styles.container}>
      {/* Search */}
      <View style={styles.searchWrap}>
        <View style={styles.searchRow}>
          <Ionicons name="search" size={18} color={Colors.secondary} />
          <TextInput style={styles.searchInput} placeholder="Search menu..." placeholderTextColor={Colors.secondary} value={search} onChangeText={setSearch} />
        </View>
      </View>

      {/* Category Chips */}
      <View style={styles.chipContainer}>
        <Animated.ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
          onContentSizeChange={(w: number) => setContentWidth(Math.max(1, w))}
          onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], { useNativeDriver: false })}
          scrollEventThrottle={16}
        >
          {categories.map(c => (
            <Pressable key={c.slug} onPress={() => { setSearch(''); loadCategory(c.slug); }} style={[styles.chip, activeSlug === c.slug && styles.chipActive]}>
              <Text style={[styles.chipText, activeSlug === c.slug && styles.chipTextActive]}>{c.name}</Text>
            </Pressable>
          ))}
        </Animated.ScrollView>
        {/* Dynamic scroll indicator */}
        {contentWidth > trackWidth && (
          <View style={styles.scrollTrack}>
            <Animated.View style={[
              styles.scrollThumb,
              {
                width: thumbWidth,
                transform: [{
                  translateX: scrollX.interpolate({
                    inputRange: [0, maxScroll],
                    outputRange: [0, maxThumbTravel],
                    extrapolate: 'clamp',
                  }),
                }],
              },
            ]} />
          </View>
        )}
      </View>

      {/* Items */}
      {loading ? <ActivityIndicator color={Colors.primary} style={{ marginTop: 40 }} /> : (
        <ScrollView contentContainerStyle={styles.itemList} keyboardShouldPersistTaps="handled">
          {items.map(item => {
            const imgUri = resolveImageUrl(item.image_url);
            const qty = getQty(item.id);
            return (
              <View key={item.id} style={styles.itemCard}>
                {imgUri ? (
                  <Image source={{ uri: imgUri }} style={styles.itemImg} />
                ) : (
                  <View style={[styles.itemImg, styles.itemImgPlaceholder]}>
                    <Text style={{ fontSize: 28 }}>🐔</Text>
                  </View>
                )}
                <View style={styles.itemBody}>
                  <View>
                    {item.is_healthier ? <View style={styles.healthBadge}><Text style={styles.healthBadgeText}>HEALTHIER</Text></View> : null}
                    <Text style={styles.itemName} numberOfLines={2}>{item.name}</Text>
                    <Text style={styles.itemCal}>{item.calories} Cal</Text>
                  </View>
                  <View style={styles.itemFooter}>
                    <Text style={styles.itemPrice}>${item.price.toFixed(2)}</Text>
                    <View style={styles.qtyAddRow}>
                      <View style={styles.qtyStepper}>
                        <Pressable onPress={() => setQty(item.id, qty - 1)} style={styles.qtyStepBtn} hitSlop={4}>
                          <Ionicons name="remove" size={14} color={qty <= 1 ? Colors.surfaceVariant : Colors.onSurface} />
                        </Pressable>
                        <TextInput
                          style={styles.qtyInput}
                          value={String(qty)}
                          onChangeText={(text) => handleQtyInput(item.id, text)}
                          keyboardType="number-pad"
                          selectTextOnFocus
                          maxLength={2}
                        />
                        <Pressable onPress={() => setQty(item.id, qty + 1)} style={styles.qtyStepBtn} hitSlop={4}>
                          <Ionicons name="add" size={14} color={qty >= 99 ? Colors.surfaceVariant : Colors.onSurface} />
                        </Pressable>
                      </View>
                      <Pressable onPress={() => handleAdd(item.id)} style={styles.addCircle}>
                        <Ionicons name="add" size={20} color={Colors.onPrimary} />
                      </Pressable>
                    </View>
                  </View>
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface },
  searchWrap: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4 },
  searchRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surfaceContainerLowest, borderWidth: 1, borderColor: Colors.surfaceVariant, borderRadius: 24, paddingHorizontal: 16, gap: 10 },
  searchInput: { flex: 1, paddingVertical: 12, fontSize: 15, color: Colors.onSurface },
  chipContainer: { paddingTop: 8, paddingBottom: 12, borderBottomWidth: 0.5, borderBottomColor: Colors.surfaceVariant },
  chipRow: { paddingHorizontal: 20, gap: 8 },
  chip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, backgroundColor: Colors.surfaceContainer },
  chipActive: { backgroundColor: Colors.primary },
  chipText: { fontSize: 13, fontWeight: '600', color: Colors.onSurface },
  chipTextActive: { color: Colors.onPrimary },
  scrollTrack: { marginTop: 10, marginHorizontal: 20, height: 3, backgroundColor: Colors.surfaceVariant, borderRadius: 1.5 },
  scrollThumb: { height: 3, backgroundColor: Colors.primary, borderRadius: 1.5, opacity: 0.5 },
  itemList: { paddingHorizontal: 20, gap: 12, paddingTop: 16, paddingBottom: 120 },
  itemCard: { flexDirection: 'row', backgroundColor: Colors.surfaceContainerLowest, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: Colors.surfaceVariant, gap: 12 },
  itemImg: { width: 88, height: 88, borderRadius: 8 },
  itemImgPlaceholder: { backgroundColor: Colors.surfaceContainerLow, alignItems: 'center', justifyContent: 'center' },
  itemBody: { flex: 1, justifyContent: 'space-between' },
  itemName: { fontSize: 16, fontWeight: '700', color: Colors.onSurface },
  itemCal: { fontSize: 12, color: Colors.secondary, marginTop: 2 },
  itemPrice: { fontSize: 16, fontWeight: '700', color: Colors.onSurface },
  itemFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  qtyAddRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  qtyStepper: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surfaceContainerHigh, borderRadius: 8, overflow: 'hidden' },
  qtyStepBtn: { width: 28, height: 32, alignItems: 'center', justifyContent: 'center' },
  qtyInput: { width: 32, height: 32, textAlign: 'center', fontSize: 14, fontWeight: '600', color: Colors.onSurface, padding: 0 },
  addCircle: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
  healthBadge: { backgroundColor: Colors.tertiaryFixed, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, alignSelf: 'flex-start', marginBottom: 4 },
  healthBadgeText: { fontSize: 9, fontWeight: '700', color: Colors.onTertiaryFixed, letterSpacing: 0.5 },
});
