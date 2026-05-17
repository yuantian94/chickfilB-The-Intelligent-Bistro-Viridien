import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable, TextInput, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Colors from '@/constants/Colors';
import { useAuth } from '@/context/AuthContext';
import { updateMe } from '@/api';

export default function ProfileSettingsScreen() {
  const { user, refreshUser } = useAuth();
  const router = useRouter();

  // Parse address
  const parts = (user?.default_address || '').split(',').map((p: string) => p.trim());
  const stateZip = (parts[2] || '').split(' ');

  const [addr, setAddr] = useState({ street: parts[0] || '', apt: '', city: parts[1] || '', state: stateZip[0] || '', zip: stateZip[1] || '' });
  const [cardName, setCardName] = useState(user?.paymentMethods?.[0]?.card_holder || user?.name || '');
  const [cardNum, setCardNum] = useState(user?.paymentMethods?.[0]?.last_four ? `**** **** **** ${user.paymentMethods[0].last_four}` : '');
  const [cardExp, setCardExp] = useState(user?.paymentMethods?.[0]?.expiry_month ? `${String(user.paymentMethods[0].expiry_month).padStart(2, '0')}/${String(user.paymentMethods[0].expiry_year).slice(-2)}` : '');

  const save = async () => {
    const address = addr.street ? `${addr.street}${addr.apt ? ' ' + addr.apt : ''}, ${addr.city}, ${addr.state} ${addr.zip}` : undefined;
    let paymentMethod: any = undefined;
    if (cardNum && !cardNum.includes('****')) {
      const expParts = cardExp.split('/');
      paymentMethod = {
        cardType: cardNum.startsWith('3') ? 'amex' : cardNum.startsWith('5') ? 'mastercard' : 'visa',
        lastFour: cardNum.slice(-4).replace(/\D/g, '') || '1234',
        cardHolder: cardName,
        expiryMonth: parseInt(expParts[0]) || 12,
        expiryYear: (parseInt(expParts[1]) || 30) + 2000,
      };
    }
    try {
      await updateMe({ defaultAddress: address, paymentMethod });
      await refreshUser();
      Alert.alert('Success', 'Profile updated!');
      router.back();
    } catch {
      Alert.alert('Error', 'Failed to update profile');
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Ionicons name="arrow-back" size={22} color={Colors.onSurface} />
          <Text style={styles.headerTitle}>Update Profile</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 120, gap: 24 }}>
        <View style={styles.card}>
          <View style={styles.sectionLabel}><Ionicons name="car-outline" size={18} color={Colors.primary} /><Text style={styles.sectionLabelText}>Delivery Address</Text></View>
          <TextInput style={styles.input} placeholder="Street" value={addr.street} onChangeText={v => setAddr(p => ({ ...p, street: v }))} />
          <TextInput style={styles.input} placeholder="Apt (optional)" value={addr.apt} onChangeText={v => setAddr(p => ({ ...p, apt: v }))} />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextInput style={[styles.input, { flex: 2 }]} placeholder="City" value={addr.city} onChangeText={v => setAddr(p => ({ ...p, city: v }))} />
            <TextInput style={[styles.input, { flex: 1 }]} placeholder="State" value={addr.state} onChangeText={v => setAddr(p => ({ ...p, state: v }))} />
            <TextInput style={[styles.input, { flex: 1 }]} placeholder="Zip" value={addr.zip} onChangeText={v => setAddr(p => ({ ...p, zip: v }))} keyboardType="number-pad" />
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.sectionLabel}><Ionicons name="card-outline" size={18} color={Colors.primary} /><Text style={styles.sectionLabelText}>Payment Method</Text></View>
          <TextInput style={styles.input} placeholder="Name on Card" value={cardName} onChangeText={setCardName} />
          <TextInput style={styles.input} placeholder="Card Number" value={cardNum} onChangeText={setCardNum} keyboardType="number-pad" />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextInput style={[styles.input, { flex: 1 }]} placeholder="MM/YY" value={cardExp} onChangeText={setCardExp} />
            <TextInput style={[styles.input, { flex: 1 }]} placeholder="CVC" secureTextEntry keyboardType="number-pad" />
          </View>
        </View>

        <Pressable onPress={save} style={styles.saveBtn}>
          <Text style={{ color: Colors.onPrimary, fontWeight: '700', fontSize: 16 }}>Save Profile Information</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface },
  header: { paddingHorizontal: 20, paddingTop: 60, paddingBottom: 12, borderBottomWidth: 0.5, borderBottomColor: Colors.surfaceVariant },
  headerTitle: { fontSize: 20, fontWeight: '700', color: Colors.primary },
  card: { backgroundColor: Colors.surfaceContainerLowest, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: Colors.surfaceVariant, gap: 12 },
  sectionLabel: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  sectionLabelText: { fontSize: 14, fontWeight: '700', color: Colors.onSurface },
  input: { backgroundColor: Colors.surfaceContainerLow, borderWidth: 1, borderColor: Colors.surfaceVariant, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 14, fontSize: 15 },
  saveBtn: { backgroundColor: Colors.primary, paddingVertical: 16, borderRadius: 28, alignItems: 'center' },
});
