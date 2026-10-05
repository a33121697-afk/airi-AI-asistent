import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList, ScrollView, Switch,
  StyleSheet, KeyboardAvoidingView, Platform, SafeAreaView, StatusBar, ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Speech from 'expo-speech';

const C = { bg: '#0d0f1a', card: '#171a2b', line: '#262a42', pink: '#ff2d78', text: '#f2f3fa', dim: '#8b90ad' };
const MODES = {
  calm: 'Nada tenang dan lembut.',
  focus: 'Jawaban singkat, langsung ke inti, tanpa basa-basi.',
  playful: 'Nada ceria, usil, boleh pakai emoji.',
};
const store = {
  get: async (k, d) => { try { const v = await AsyncStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set: (k, v) => AsyncStorage.setItem(k, JSON.stringify(v)).catch(() => {}),
};

export default function App() {
  const [tab, setTab] = useState('home');
  const [msgs, setMsgs] = useState([]);
  const [runs, setRuns] = useState([]);
  const [memories, setMemories] = useState([]);
  const [cfg, setCfg] = useState({ apiKey: '', model: 'gemini-2.5-flash', mode: 'calm', speak: true });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      setMsgs(await store.get('msgs', []));
      setRuns(await store.get('runs', []));
      setMemories(await store.get('memories', []));
      setCfg(await store.get('cfg', cfg));
    })();
  }, []);

  const updateCfg = (patch) => { const n = { ...cfg, ...patch }; setCfg(n); store.set('cfg', n); };

  async function send(text) {
    text = text.trim();
    if (!text || loading) return;
    if (!cfg.apiKey) { setTab('settings'); return; }
    const next = [...msgs, { role: 'user', text }];
    setMsgs(next); setLoading(true);
    const nr = [{ text, at: new Date().toLocaleString('id-ID') }, ...runs].slice(0, 50);
    setRuns(nr); store.set('runs', nr);

    const system =
      `Kamu Airi, teman AI yang akrab, berbahasa Indonesia santai. ${MODES[cfg.mode]} ` +
      `Kamu tidak bisa melihat jam atau layar pengguna.\n` +
      (memories.length ? 'Hal yang harus kamu ingat:\n' + memories.map((m) => `- ${m.title}: ${m.body}`).join('\n') : '');
    let reply;
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${cfg.model}:generateContent`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': cfg.apiKey },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: system }] },
            contents: next.slice(-20).map((m) => ({
              role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.text }],
            })),
          }),
        }
      );
      const data = await res.json();
      reply = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') ||
        `Gagal: ${data?.error?.message || 'tidak ada jawaban'}. Cek API key dan nama model di Settings.`;
    } catch (e) {
      reply = 'Gagal terhubung. Cek koneksi internetmu.';
    }
    const done = [...next, { role: 'ai', text: reply }];
    setMsgs(done); store.set('msgs', done.slice(-100)); setLoading(false);
    if (cfg.speak) Speech.speak(reply, { language: 'id-ID' });
  }

  const tabs = [['home', 'Home'], ['runs', 'Runs'], ['memory', 'Memory'], ['settings', 'Settings']];
  return (
    <SafeAreaView style={s.root}>
      <StatusBar barStyle="light-content" />
      <View style={{ flex: 1 }}>
        {tab === 'home' && <Chat msgs={msgs} loading={loading} onSend={send}
          onClear={() => { setMsgs([]); store.set('msgs', []); Speech.stop(); }} />}
        {tab === 'runs' && <Runs runs={runs} onPick={(t) => { setTab('home'); send(t); }} />}
        {tab === 'memory' && <Memory items={memories}
          onChange={(m) => { setMemories(m); store.set('memories', m); }} />}
        {tab === 'settings' && <Settings cfg={cfg} onChange={updateCfg} />}
      </View>
      <View style={s.tabbar}>
        {tabs.map(([k, label]) => (
          <TouchableOpacity key={k} style={s.tab} onPress={() => setTab(k)}>
            <Text style={[s.tabText, tab === k && { color: C.pink, fontWeight: '700' }]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </SafeAreaView>
  );
}

function Chat({ msgs, loading, onSend, onClear }) {
  const [text, setText] = useState('');
  const ref = useRef();
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={s.header}>
        <View>
          <Text style={s.h1}>Airi</Text>
          <Text style={s.dim}>Teman ngobrolmu</Text>
        </View>
        <TouchableOpacity onPress={onClear}><Text style={s.dim}>Hapus chat</Text></TouchableOpacity>
      </View>
      <FlatList
        ref={ref} data={msgs} keyExtractor={(_, i) => String(i)} contentContainerStyle={{ padding: 16 }}
        onContentSizeChange={() => ref.current?.scrollToEnd({ animated: true })}
        ListEmptyComponent={<Text style={[s.dim, { textAlign: 'center', marginTop: 60 }]}>Sapa Airi untuk mulai ngobrol.</Text>}
        renderItem={({ item }) => (
          <View style={[s.bubble, item.role === 'user' ? s.me : s.ai]}>
            <Text style={{ color: C.text, fontSize: 15 }}>{item.text}</Text>
          </View>
        )}
      />
      {loading && <ActivityIndicator color={C.pink} style={{ marginBottom: 6 }} />}
      <View style={s.inputRow}>
        <TextInput style={s.input} value={text} onChangeText={setText} placeholder="Tulis pesan..."
          placeholderTextColor={C.dim} onSubmitEditing={() => { onSend(text); setText(''); }} />
        <TouchableOpacity style={s.send} onPress={() => { onSend(text); setText(''); }}>
          <Text style={{ color: '#fff', fontSize: 20 }}>↑</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

function Runs({ runs, onPick }) {
  return (
    <FlatList data={runs} keyExtractor={(_, i) => String(i)} contentContainerStyle={{ padding: 16 }}
      ListHeaderComponent={<Text style={s.h1}>Riwayat pesan</Text>}
      ListEmptyComponent={<Text style={[s.dim, { marginTop: 16 }]}>Belum ada pesan. Ketuk satu nanti untuk mengirim ulang.</Text>}
      renderItem={({ item }) => (
        <TouchableOpacity style={s.card} onPress={() => onPick(item.text)}>
          <Text style={{ color: C.text }}>{item.text}</Text>
          <Text style={[s.dim, { marginTop: 4, fontSize: 12 }]}>{item.at}</Text>
        </TouchableOpacity>
      )} />
  );
}

function Memory({ items, onChange }) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const add = () => {
    if (!title.trim() || !body.trim()) return;
    onChange([{ title: title.trim(), body: body.trim() }, ...items]); setTitle(''); setBody('');
  };
  return (
    <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
      <Text style={s.h1}>Hal penting, tetap milikmu.</Text>
      <Text style={[s.dim, { marginBottom: 14 }]}>Simpan catatan yang ingin Airi ingat di percakapan berikutnya.</Text>
      <View style={s.card}>
        <TextInput style={s.field} placeholder="Judul singkat" placeholderTextColor={C.dim} value={title} onChangeText={setTitle} />
        <TextInput style={[s.field, { height: 80, textAlignVertical: 'top' }]} multiline placeholder="Apa yang perlu Airi ingat?"
          placeholderTextColor={C.dim} value={body} onChangeText={setBody} />
        <TouchableOpacity style={s.btn} onPress={add}><Text style={{ color: '#fff', fontWeight: '700' }}>Simpan memory</Text></TouchableOpacity>
      </View>
      {items.map((m, i) => (
        <View key={i} style={s.card}>
          <Text style={{ color: C.text, fontWeight: '700' }}>{m.title}</Text>
          <Text style={[s.dim, { marginVertical: 4 }]}>{m.body}</Text>
          <TouchableOpacity onPress={() => onChange(items.filter((_, j) => j !== i))}>
            <Text style={{ color: C.pink }}>Hapus</Text>
          </TouchableOpacity>
        </View>
      ))}
    </ScrollView>
  );
}

function Settings({ cfg, onChange }) {
  return (
    <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
      <Text style={s.h1}>Settings</Text>
      <View style={s.card}>
        <Text style={s.label}>Gemini API key</Text>
        <TextInput style={s.field} secureTextEntry value={cfg.apiKey} onChangeText={(v) => onChange({ apiKey: v.trim() })}
          placeholder="Tempel API key dari aistudio.google.com" placeholderTextColor={C.dim} autoCapitalize="none" />
        <Text style={s.label}>Model</Text>
        <TextInput style={s.field} value={cfg.model} onChangeText={(v) => onChange({ model: v.trim() })} autoCapitalize="none" />
      </View>
      <View style={s.card}>
        <Text style={s.label}>Personality</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {Object.keys(MODES).map((m) => (
            <TouchableOpacity key={m} onPress={() => onChange({ mode: m })}
              style={[s.chip, cfg.mode === m && { backgroundColor: C.pink, borderColor: C.pink }]}>
              <Text style={{ color: C.text }}>{m} mode</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
      <View style={[s.card, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}>
        <View style={{ flex: 1, paddingRight: 12 }}>
          <Text style={s.label}>Bacakan jawaban</Text>
          <Text style={s.dim}>Airi menyuarakan balasan di perangkat ini.</Text>
        </View>
        <Switch value={cfg.speak} onValueChange={(v) => onChange({ speak: v })} trackColor={{ true: C.pink }} />
      </View>
      <Text style={[s.dim, { textAlign: 'center', marginTop: 10 }]}>Airi Mobile AI, companion build 1.0</Text>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderColor: C.line },
  h1: { color: C.text, fontSize: 26, fontWeight: '800', marginBottom: 6 },
  dim: { color: C.dim },
  label: { color: C.text, fontWeight: '700', marginBottom: 6, marginTop: 4 },
  bubble: { maxWidth: '82%', padding: 12, borderRadius: 16, marginBottom: 10 },
  me: { alignSelf: 'flex-end', backgroundColor: C.pink, borderBottomRightRadius: 4 },
  ai: { alignSelf: 'flex-start', backgroundColor: C.card, borderBottomLeftRadius: 4 },
  inputRow: { flexDirection: 'row', padding: 12, alignItems: 'center' },
  input: { flex: 1, backgroundColor: C.card, color: C.text, borderRadius: 14, paddingHorizontal: 14, height: 46, borderWidth: 1, borderColor: C.line },
  send: { width: 46, height: 46, borderRadius: 23, backgroundColor: C.pink, alignItems: 'center', justifyContent: 'center', marginLeft: 8 },
  card: { backgroundColor: C.card, borderRadius: 16, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: C.line },
  field: { backgroundColor: C.bg, color: C.text, borderRadius: 12, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: C.line },
  btn: { backgroundColor: C.pink, borderRadius: 12, padding: 13, alignItems: 'center' },
  chip: { borderWidth: 1, borderColor: C.line, borderRadius: 20, paddingVertical: 8, paddingHorizontal: 14, marginRight: 8, marginBottom: 8 },
  tabbar: { flexDirection: 'row', backgroundColor: C.card, borderTopWidth: 1, borderColor: C.line },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 16 },
  tabText: { color: C.dim },
});
