import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable, TextInput, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Colors from '@/constants/Colors';
import { useAuth } from '@/context/AuthContext';
import { guestCheckoutApi } from '@/api';

export default function GuestCheckoutScreen() {
  const { refreshCart, register } = useAuth();
  const router = useRouter();
  const [orderType, setOrderType] = useState<'pickup' | 'delivery'>('pickup');
  const [locationId, setLocationId] = useState('loc1');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState({ street: '', city: '', state: '', zip: '' });
  const [cardName, setCardName] = useState('');
  const [cardNum, setCardNum] = useState('');
  const [cardExp, setCardExp] = useState('');
  const [cardCvc, setCardCvc] = useState('');
  const [placing, setPlacing] = useState(false);

  const locations = [
    { id: 'loc1', name: 'Chick-fil-B Downtown', dist: '1.2 mi', time: '10-15 min' },
    { id: 'loc2', name: 'Chick-fil-B Northside', dist: '3.4 mi', time: '15-20 min' },
    { id: 'loc3', name: 'Chick-fil-B Westend', dist: '5.1 mi', time: '20-25 min' },
  ];

  const handlePlace = async () => {
    if (!email.trim()) { Alert.alert('Error', 'Please enter your email'); return; }
    if (!cardNum.trim() || !cardExp.trim() || !cardCvc.trim()) { Alert.alert('Error', 'Please enter your card details'); return; }

    let addr = '';
    if (orderType === 'pickup') {
      const loc = locations.find(l => l.id === locationId);
      addr = loc?.name || 'Chick-fil-B Downtown';
    } else {
      if (!address.street || !address.city || !address.state || !address.zip) {
        Alert.alert('Error', 'Please enter a complete delivery address'); return;
      }
      addr = `${address.street}, ${address.city}, ${address.state} ${address.zip}`;
    }

    setPlacing(true);
    try {
      const data = await guestCheckoutApi({ email, orderType, address: addr, cardName, cardNumber: cardNum, cardExp, cardCvc });
      await refreshCart();

      // Show success + register prompt
      Alert.alert(
        'Order Placed! 🎉',
        `Total: $${data.total.toFixed(2)}\nReceipt will be sent to ${email}\n\nCreate an account to earn ${Math.floor(data.total * 10)} reward points from this order?`,
        [
          { text: 'No Thanks', style: 'cancel', onPress: () => { router.dismiss(); } },
          {
            text: 'Create Account',
            onPress: () => {
              router.dismiss();
              router.navigate({ pathname: '/(tabs)/account', params: { prefillEmail: email, showRegister: '1' } });
            }
          },
        ]
      );
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Checkout failed');
    } finally {
      setPlacing(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Ionicons name="arrow-back" size={22} color={Colors.onSurface} />
          <Text style={styles.headerTitle}>Guest Checkout</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 180, gap: 24 }} keyboardShouldPersistTaps="handled">
        {/* Info banner */}
        <View style={styles.banner}>
          <Ionicons name="information-circle-outline" size={18} color={Colors.primary} />
          <Text style={{ fontSize: 13, color: Colors.secondary, flex: 1 }}>No account needed. A receipt will be sent to your email.</Text>
        </View>

        {/* Email */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Email (for receipt)</Text>
          <TextInput style={styles.input} placeholder="you@example.com" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
        </View>

        {/* Order Type */}
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
            <Text style={styles.cardTitle}>Delivery Address</Text>
            <TextInput style={styles.input} placeholder="Street Address" value={address.street} onChangeText={v => setAddress(p => ({ ...p, street: v }))} />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TextInput style={[styles.input, { flex: 2 }]} placeholder="City" value={address.city} onChangeText={v => setAddress(p => ({ ...p, city: v }))} />
              <TextInput style={[styles.input, { flex: 1 }]} placeholder="State" value={address.state} onChangeText={v => setAddress(p => ({ ...p, state: v }))} />
              <TextInput style={[styles.input, { flex: 1 }]} placeholder="Zip" value={address.zip} onChangeText={v => setAddress(p => ({ ...p, zip: v }))} keyboardType="number-pad" />
            </View>
          </View>
        )}

        {/* Payment */}
        <View style={styles.card}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <Ionicons name="card-outline" size={20} color={Colors.primary} />
            <Text style={styles.cardTitle}>Payment Details</Text>
          </View>
          <TextInput style={styles.input} placeholder="Name on Card" value={cardName} onChangeText={setCardName} autoCapitalize="words" />
          <TextInput style={styles.input} placeholder="Card Number" value={cardNum} onChangeText={setCardNum} keyboardType="number-pad" maxLength={19} />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextInput style={[styles.input, { flex: 1 }]} placeholder="MM/YY" value={cardExp} onChangeText={setCardExp} keyboardType="number-pad" maxLength={5} />
            <TextInput style={[styles.input, { flex: 1 }]} placeholder="CVC" value={cardCvc} onChangeText={setCardCvc} keyboardType="number-pad" secureTextEntry maxLength={4} />
          </View>
        </View>
      </ScrollView>

      {/* Place Order */}
      <View style={styles.placeOrderBar}>
        <Pressable onPress={handlePlace} style={[styles.placeOrderBtn, placing && { opacity: 0.6 }]} disabled={placing}>
          <Text style={{ color: Colors.onPrimary, fontWeight: '700', fontSize: 16 }}>
            {placing ? 'Placing Order...' : 'Place Guest Order'}
          </Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface },
  header: { paddingHorizontal: 20, paddingTop: 60, paddingBottom: 12, borderBottomWidth: 0.5, borderBottomColor: Colors.surfaceVariant },
  headerTitle: { fontSize: 20, fontWeight: '700', color: Colors.primary },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(186,0,38,0.06)', padding: 14, borderRadius: 12 },
  card: { backgroundColor: Colors.surfaceContainerLowest, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: Colors.surfaceVariant, gap: 12 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: Colors.onSurface },
  tabRow: { flexDirection: 'row', backgroundColor: Colors.surfaceContainer, borderRadius: 24, padding: 4 },
  tab: { flex: 1, paddingVertical: 12, borderRadius: 20, alignItems: 'center' },
  tabActive: { backgroundColor: Colors.primary },
  tabText: { fontSize: 14, fontWeight: '600', color: Colors.onSurface },
  tabTextActive: { color: Colors.onPrimary },
  input: { backgroundColor: Colors.surfaceContainer, borderWidth: 1, borderColor: Colors.surfaceVariant, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 14, fontSize: 15 },
  locationRow: { padding: 14, borderWidth: 1, borderColor: Colors.surfaceVariant, borderRadius: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  locationActive: { borderColor: Colors.primary, backgroundColor: 'rgba(186,0,38,0.04)' },
  placeOrderBar: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 20, paddingBottom: 40, backgroundColor: Colors.surface },
  placeOrderBtn: { backgroundColor: Colors.primary, paddingVertical: 16, borderRadius: 28, alignItems: 'center' },
});
