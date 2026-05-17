import React, { useState, useRef, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput, ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Colors from '@/constants/Colors';
import { useAuth } from '@/context/AuthContext';
import { sendChatMessageApi, fetchChatHistory } from '@/api';

type Message = { role: 'user' | 'assistant'; content: string };

export default function ChatScreen() {
  const { user, refreshCart } = useAuth();
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  // Load the most recent chat session from the server on mount
  useEffect(() => {
    if (!user) {
      setMessages([{ role: 'assistant', content: "To better let Bessie assist you, please login." }]);
      setLoadingHistory(false);
      return;
    }

    let cancelled = false;
    fetchChatHistory().then(sessions => {
      if (cancelled) return;
      if (sessions && sessions.length > 0) {
        // Use the most recent session
        const latest = sessions[0];
        setSessionId(latest.id);
        const restored: Message[] = (latest.messages || []).map((m: any) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        }));
        if (restored.length > 0) {
          setMessages(restored);
        } else {
          setMessages([{ role: 'assistant', content: "Hi! I'm Bessie. How can I help you today?" }]);
        }
      } else {
        // No previous sessions
        setMessages([{ role: 'assistant', content: "Hi! I'm Bessie. How can I help you today?" }]);
      }
      setLoadingHistory(false);
    }).catch(() => {
      if (!cancelled) {
        setMessages([{ role: 'assistant', content: "Hi! I'm Bessie. How can I help you today?" }]);
        setLoadingHistory(false);
      }
    });

    return () => { cancelled = true; };
  }, [user]);

  // Auto-scroll when messages change
  useEffect(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  }, [messages]);

  const startNewSession = useCallback(() => {
    setSessionId(null);
    setMessages([{ role: 'assistant', content: "Hi! I'm Bessie. How can I help you today?" }]);
  }, []);

  const send = async () => {
    if (!input.trim() || !user) return;
    const msg = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: msg }]);
    setSending(true);

    try {
      const data = await sendChatMessageApi(msg, sessionId);
      setSessionId(data.sessionId);
      setMessages(prev => [...prev, { role: 'assistant', content: data.message }]);
      if (data.dataChanged) await refreshCart();
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, I am having trouble connecting.' }]);
    } finally {
      setSending(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={0}>
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Ionicons name="sparkles" size={18} color={Colors.primary} />
          <Text style={{ fontSize: 14, fontWeight: '600', color: Colors.primary }}>Bessie</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
          {/* New chat button */}
          {user && (
            <Pressable onPress={startNewSession}>
              <Ionicons name="add-circle-outline" size={22} color={Colors.secondary} />
            </Pressable>
          )}
          <Pressable onPress={() => router.back()}><Ionicons name="close" size={24} color={Colors.secondary} /></Pressable>
        </View>
      </View>

      {/* Messages */}
      {loadingHistory ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator color={Colors.primary} />
          <Text style={{ color: Colors.secondary, fontSize: 12, marginTop: 8 }}>Loading conversation...</Text>
        </View>
      ) : (
        <ScrollView ref={scrollRef} style={styles.messages} contentContainerStyle={{ gap: 10, padding: 16, paddingBottom: 20 }} onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}>
          {messages.map((m, i) => (
            <View key={i} style={m.role === 'user' ? styles.userBubble : styles.assistantBubble}>
              <Text style={m.role === 'user' ? styles.userText : styles.assistantText}>{m.content}</Text>
            </View>
          ))}
          {sending && <View style={styles.assistantBubble}><ActivityIndicator size="small" color={Colors.primary} /></View>}
        </ScrollView>
      )}

      {/* Input */}
      <View style={styles.inputBar}>
        <TextInput
          style={styles.input}
          placeholder={user ? "Type a message..." : "Please login first"}
          placeholderTextColor={Colors.secondary}
          value={input}
          onChangeText={setInput}
          editable={!!user}
          onSubmitEditing={send}
          returnKeyType="send"
        />
        <Pressable onPress={send} style={[styles.sendBtn, (!user || sending) && { opacity: 0.5 }]} disabled={!user || sending}>
          <Ionicons name="send" size={18} color={Colors.onPrimary} />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surfaceContainerLowest },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: Colors.surfaceVariant },
  messages: { flex: 1 },
  userBubble: { alignSelf: 'flex-end', backgroundColor: Colors.primary, padding: 12, borderRadius: 16, borderTopRightRadius: 4, maxWidth: '85%' },
  userText: { color: Colors.onPrimary, fontSize: 14 },
  assistantBubble: { alignSelf: 'flex-start', backgroundColor: Colors.surfaceContainer, padding: 12, borderRadius: 16, borderTopLeftRadius: 4, maxWidth: '85%' },
  assistantText: { color: Colors.onSurface, fontSize: 14 },
  inputBar: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderTopWidth: 1, borderTopColor: Colors.surfaceVariant, paddingBottom: 28 },
  input: { flex: 1, backgroundColor: Colors.surfaceContainerLow, borderWidth: 1, borderColor: Colors.surfaceVariant, borderRadius: 24, paddingVertical: 10, paddingHorizontal: 16, fontSize: 14 },
  sendBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
});
