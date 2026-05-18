import React from 'react';
import { Tabs, useRouter } from 'expo-router';
import { Pressable, View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Colors from '@/constants/Colors';
import { useAuth } from '@/context/AuthContext';

export default function TabLayout() {
  const router = useRouter();
  const { cartCount } = useAuth();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.secondary,
        tabBarStyle: {
          backgroundColor: Colors.surface,
          borderTopColor: Colors.surfaceVariant,
          borderTopWidth: 0.5,
          paddingBottom: 4,
          height: 88,
          paddingTop: 8,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        headerStyle: {
          backgroundColor: Colors.surface,
          shadowColor: 'transparent',
          borderBottomWidth: 0.5,
          borderBottomColor: Colors.surfaceVariant,
        },
        headerTintColor: Colors.primary,
        headerTitleStyle: { fontWeight: '700', fontSize: 18 },
        headerRight: () => (
          <View style={{ flexDirection: 'row', gap: 4, marginRight: 12 }}>
            <Pressable onPress={() => router.navigate('/chat')} style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1, padding: 6 })}>
              <Ionicons name="sparkles" size={22} color={Colors.primary} />
            </Pressable>
            <Pressable onPress={() => router.navigate('/cart')} style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1, padding: 6 })}>
              <View>
                <Ionicons name="bag-handle-outline" size={22} color={Colors.primary} />
                {cartCount > 0 && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{cartCount > 9 ? '9+' : cartCount}</Text>
                  </View>
                )}
              </View>
            </Pressable>
          </View>
        ),
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          headerShown: false,
          tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'home' : 'home-outline'} size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="menu"
        options={{
          title: 'Menu',
          tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'restaurant' : 'restaurant-outline'} size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="rewards"
        options={{
          title: 'Rewards',
          tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'gift' : 'gift-outline'} size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: 'Account',
          tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'person' : 'person-outline'} size={24} color={color} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  badge: {
    position: 'absolute',
    top: -4,
    right: -6,
    backgroundColor: Colors.error,
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: { color: '#fff', fontSize: 9, fontWeight: '700' },
});
