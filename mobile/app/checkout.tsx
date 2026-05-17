import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable, TextInput, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Colors from '@/constants/Colors';
import { useAuth } from '@/context/AuthContext';
import { fetchCart, placeOrder, updateMe } from '@/api';

export default function CheckoutScreen() {
  const { user, refreshUser, refreshCart } = useAuth();
  const router = useRouter();
  const [orderType, setOrderType] = useState<'pickup' | 'delivery'>('pickup');
  const [locationId, setLocationId] = useState('loc1');
  const [address, setAddress] = useState({ street: '', apt: '', city: '', state: '', zip: '' });
  const [saveAsFavorite, setSaveAsFavorite] = useState(false);
  const [cartData, setCartData] = useState<any>(null);

  // Payment state
  const paymentMethods = user?.paymentMethods || [];
  const defaultCardId = paymentMethods.find((p: any) => p.is_default)?.id || paymentMethods[0]?.id || '';
  const [selectedPaymentId, setSelectedPaymentId] = useState<string>(defaultCardId || 'new');
  const showNewCardForm = selectedPaymentId === 'new' || paymentMethods.length === 0;

  // New card form fields
  const [cardName, setCardName] = useState(user?.name || '');
  const [cardNum, setCardNum] = useState('');
  const [cardExp, setCardExp] = useState('');
  const [cardCvc, setCardCvc] = useState('');
  const [saveCard, setSaveCard] = useState(false);

  const locations = [
    { id: 'loc1', name: 'Chick-fil-B Downtown', dist: '1.2 mi', time: '10-15 min' },
    { id: 'loc2', name: 'Chick-fil-B Northside', dist: '3.4 mi', time: '15-20 min' },
    { id: 'loc3', name: 'Chick-fil-B Westend', dist: '5.1 mi', time: '20-25 min' },
  ];

  useEffect(() => {
    fetchCart().then(setCartData);
    if (user?.default_address) {
      const parts = user.default_address.split(',').map((p: string) => p.trim());
      const stateZip = (parts[2] || '').split(' ');
      setAddress({ street: parts[0] || '', apt: '', city: parts[1] || '', state: stateZip[0] || '', zip: stateZip[1] || '' });
    }
  }, [user]);

  const handlePlaceOrder = async () => {
    // Address
    let addr = '';
    if (orderType === 'pickup') {
      const loc = locations.find(l => l.id === locationId);
      addr = loc?.name || '';
    } else {
      if (!address.street || !address.city || !address.state || !address.zip) {
        Alert.alert('Error', 'Please enter a complete delivery address.');
        return;
      }
      addr = `${address.street}${address.apt ? ' ' + address.apt : ''}, ${address.city}, ${address.state} ${address.zip}`;
    }

    // Payment validation for new card
    if (showNewCardForm) {
      if (!cardNum.replace(/\s/g, '') || !cardExp || !cardCvc) {
        Alert.alert('Error', 'Please enter your card details.');
        return;
      }
    }

    // Save card + address if requested
    if (saveCard && showNewCardForm) {
      const expParts = cardExp.split('/');
      const newPayment = {
        cardType: cardNum.replace(/\s/g, '').startsWith('3') ? 'amex' : cardNum.replace(/\s/g, '').startsWith('5') ? 'mastercard' : 'visa',
        lastFour: cardNum.replace(/\s/g, '').slice(-4),
        cardHolder: cardName,
        expiryMonth: parseInt(expParts[0]) || 12,
        expiryYear: (parseInt(expParts[1]) || 30) + 2000,
      };
      try {
        await updateMe({ paymentMethod: newPayment });
        await refreshUser();
      } catch {}
    }

    try {
      let paymentId = selectedPaymentId;
      // If using a new card (not saved), just send the first available or null
      if (paymentId === 'new') {
        paymentId = user?.paymentMethods?.[0]?.id || null;
      }

      await placeOrder({
        orderType,
        address: addr,
        paymentMethodId: paymentId,
        saveAsFavorite,
      });
      await refreshUser();
      await refreshCart();
      Alert.alert('Success', 'Order placed successfully! 🎉', [{ text: 'OK', onPress: () => { router.dismiss(); router.dismiss(); } }]);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to place order');
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Ionicons name="arrow-back" size={22} color={Colors.onSurface} />
          <Text style={styles.headerTitle}>Checkout</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 180, gap: 24 }} keyboardShouldPersistTaps="handled">
        {/* Order Type Tabs */}
        <View style={styles.tabRow}>
          <Pressable onPress={() => setOrderType('pickup')} style={[styles.tab, orderType === 'pickup' && styles.tabActive]}>
            <Text style={[styles.tabText, orderType === 'pickup' && styles.tabTextActive]}>Pickup</Text>
          </Pressable>
          <Pressable onPress={() => setOrderType('delivery')} style={[styles.tab, orderType === 'delivery' && styles.tabActive]}>
            <Text style={[styles.tabText, orderType === 'delivery' && styles.tabTextActive]}>Delivery</Text>
          </Pressable>
        </View>

        {/* Pickup Locations */}
        {orderType === 'pickup' && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Select Location</Text>
            {locations.map(loc => (
              <Pressable key={loc.id} onPress={() => setLocationId(loc.id)} style={[styles.locationRow, locationId === loc.id && styles.locationActive]}>
                <View>
                  <Text style={{ fontWeight: '600', fontSize: 14 }}>{loc.name}</Text>
                  <Text style={{ fontSize: 12, color: Colors.secondary, marginTop: 2 }}>{loc.dist} • Ready in <Text style={{ color: Colors.primary, fontWeight: '700' }}>{loc.time}</Text></Text>
                </View>
                {locationId === loc.id && <Ionicons name="checkmark-circle" size={22} color={Colors.primary} />}
              </Pressable>
            ))}
          </View>
        )}

        {/* Delivery Address */}
        {orderType === 'delivery' && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Delivery Details</Text>
            <TextInput style={styles.input} placeholder="Street Address" value={address.street} onChangeText={v => setAddress(p => ({ ...p, street: v }))} />
            <TextInput style={styles.input} placeholder="Apt, Suite (optional)" value={address.apt} onChangeText={v => setAddress(p => ({ ...p, apt: v }))} />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TextInput style={[styles.input, { flex: 2 }]} placeholder="City" value={address.city} onChangeText={v => setAddress(p => ({ ...p, city: v }))} />
              <TextInput style={[styles.input, { flex: 1 }]} placeholder="State" value={address.state} onChangeText={v => setAddress(p => ({ ...p, state: v }))} />
              <TextInput style={[styles.input, { flex: 1 }]} placeholder="Zip" value={address.zip} onChangeText={v => setAddress(p => ({ ...p, zip: v }))} keyboardType="number-pad" />
            </View>
          </View>
        )}

        {/* Payment Method */}
        <View style={styles.card}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <Ionicons name="card-outline" size={20} color={Colors.primary} />
            <Text style={styles.cardTitle}>Payment Method</Text>
          </View>

          {/* Existing card selector */}
          {paymentMethods.length > 0 && (
            <View style={styles.paymentOptions}>
              {paymentMethods.map((pm: any) => (
                <Pressable key={pm.id} onPress={() => setSelectedPaymentId(String(pm.id))} style={[styles.paymentOption, selectedPaymentId === String(pm.id) && styles.paymentOptionActive]}>
                  <Ionicons name={selectedPaymentId === String(pm.id) ? 'radio-button-on' : 'radio-button-off'} size={20} color={selectedPaymentId === String(pm.id) ? Colors.primary : Colors.secondary} />
                  <Ionicons name="card" size={18} color={Colors.onSurface} />
                  <Text style={styles.paymentOptionText}>{pm.card_type.toUpperCase()} ending in {pm.last_four}</Text>
                </Pressable>
              ))}
              <Pressable onPress={() => setSelectedPaymentId('new')} style={[styles.paymentOption, selectedPaymentId === 'new' && styles.paymentOptionActive]}>
                <Ionicons name={selectedPaymentId === 'new' ? 'radio-button-on' : 'radio-button-off'} size={20} color={selectedPaymentId === 'new' ? Colors.primary : Colors.secondary} />
                <Ionicons name="add-circle-outline" size={18} color={Colors.onSurface} />
                <Text style={styles.paymentOptionText}>Use a new card...</Text>
              </Pressable>
            </View>
          )}

          {/* New card form */}
          {showNewCardForm && (
            <View style={styles.newCardForm}>
              {paymentMethods.length === 0 && (
                <Text style={{ fontSize: 13, color: Colors.secondary, marginBottom: 4 }}>No saved cards. Enter your card details below.</Text>
              )}
              <TextInput style={styles.input} placeholder="Name on Card" value={cardName} onChangeText={setCardName} autoCapitalize="words" />
              <TextInput style={styles.input} placeholder="Card Number" value={cardNum} onChangeText={setCardNum} keyboardType="number-pad" maxLength={19} />
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TextInput style={[styles.input, { flex: 1 }]} placeholder="MM/YY" value={cardExp} onChangeText={setCardExp} keyboardType="number-pad" maxLength={5} />
                <TextInput style={[styles.input, { flex: 1 }]} placeholder="CVC" value={cardCvc} onChangeText={setCardCvc} keyboardType="number-pad" secureTextEntry maxLength={4} />
              </View>
              <Pressable onPress={() => setSaveCard(!saveCard)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
                <Ionicons name={saveCard ? 'checkbox' : 'square-outline'} size={22} color={Colors.primary} />
                <Text style={{ fontSize: 13, color: Colors.secondary }}>Save as default payment method</Text>
              </Pressable>
            </View>
          )}
        </View>

        {/* Favorite toggle */}
        <Pressable onPress={() => setSaveAsFavorite(!saveAsFavorite)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Ionicons name={saveAsFavorite ? 'checkbox' : 'square-outline'} size={22} color={Colors.primary} />
          <Text style={{ fontSize: 13, color: Colors.secondary, fontWeight: '600' }}>Save as favorite order</Text>
        </Pressable>
      </ScrollView>

      {/* Place Order */}
      <View style={styles.placeOrderBar}>
        <Pressable onPress={handlePlaceOrder} style={styles.placeOrderBtn}>
          <Text style={{ color: Colors.onPrimary, fontWeight: '700', fontSize: 16 }}>Place Order</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface },
  header: { paddingHorizontal: 20, paddingTop: 60, paddingBottom: 12, borderBottomWidth: 0.5, borderBottomColor: Colors.surfaceVariant },
  headerTitle: { fontSize: 20, fontWeight: '700', color: Colors.primary },
  tabRow: { flexDirection: 'row', backgroundColor: Colors.surfaceContainer, borderRadius: 24, padding: 4 },
  tab: { flex: 1, paddingVertical: 12, borderRadius: 20, alignItems: 'center' },
  tabActive: { backgroundColor: Colors.primary },
  tabText: { fontSize: 14, fontWeight: '600', color: Colors.onSurface },
  tabTextActive: { color: Colors.onPrimary },
  card: { backgroundColor: Colors.surfaceContainerLowest, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: Colors.surfaceVariant, gap: 12 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: Colors.onSurface },
  locationRow: { padding: 14, borderWidth: 1, borderColor: Colors.surfaceVariant, borderRadius: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  locationActive: { borderColor: Colors.primary, backgroundColor: 'rgba(186,0,38,0.04)' },
  input: { backgroundColor: Colors.surfaceContainer, borderWidth: 1, borderColor: Colors.surfaceVariant, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 14, fontSize: 15 },
  paymentOptions: { gap: 8 },
  paymentOption: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderWidth: 1, borderColor: Colors.surfaceVariant, borderRadius: 12 },
  paymentOptionActive: { borderColor: Colors.primary, backgroundColor: 'rgba(186,0,38,0.04)' },
  paymentOptionText: { fontSize: 14, fontWeight: '600', color: Colors.onSurface },
  newCardForm: { gap: 12, paddingTop: 4 },
  placeOrderBar: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 20, paddingBottom: 40, backgroundColor: Colors.surface },
  placeOrderBtn: { backgroundColor: Colors.primary, paddingVertical: 16, borderRadius: 28, alignItems: 'center' },
});
