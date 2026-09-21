import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { testnet } from './src/config';
import { checkConnection, type ConnectionCheck } from './src/network';

type Connection =
  | { state: 'unchecked' | 'checking' }
  | { state: 'checked'; check: ConnectionCheck }
  | { state: 'failed' };

function Home() {
  const [connection, setConnection] = useState<Connection>({ state: 'unchecked' });
  const active = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  async function refresh() {
    if (active.current) return;
    active.current = true;
    setConnection({ state: 'checking' });
    try {
      const check = await checkConnection({ chainId: testnet.chain_id, rpcUrl: testnet.public_rpc });
      if (mounted.current) setConnection({ state: 'checked', check });
    } catch {
      if (mounted.current) setConnection({ state: 'failed' });
    } finally {
      active.current = false;
    }
  }

  const status = connection.state === 'checked'
    ? `Last check passed at ${new Date(connection.check.checkedAt).toLocaleTimeString()}`
    : connection.state === 'checking' ? 'Checking connection…'
    : connection.state === 'failed' ? 'Connection unavailable. Try again.'
    : 'Connection not checked yet';

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.topbar}>
          <Text accessibilityRole="header" style={styles.wordmark}>flurbo<Text style={styles.brandDot}>.</Text></Text>
          <View style={styles.badge}><Text style={styles.badgeText}>TESTNET PREVIEW</Text></View>
        </View>

        <View style={styles.hero}>
          <Text style={styles.eyebrow}>PREDICTIONS, CONNECTED</Text>
          <Text accessibilityRole="header" style={styles.headline}>One pool.{"\n"}More possibilities.</Text>
          <Text style={styles.intro}>Bring outcomes together in a single prediction.</Text>
          <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.art}>
            <View style={[styles.orbit, styles.orbitLeft]} />
            <View style={[styles.orbit, styles.orbitRight]} />
            <View style={styles.centerDot} />
            <View style={styles.artLabel}><Text style={styles.artLabelText}>A + B</Text></View>
          </View>
        </View>

        <View style={styles.account}>
          <View style={styles.accountHeading}>
            <Text style={styles.eyebrow}>YOUR ACCOUNT</Text>
            <Text style={styles.asset}>AUSD</Text>
          </View>
          <Text accessibilityRole="header" style={styles.sectionTitle}>Start with your view.</Text>
          <Text style={styles.body}>Your balance and positions will appear here when your account is connected.</Text>
          <Pressable disabled accessibilityRole="button" accessibilityState={{ disabled: true }}
            accessibilityHint="Account setup is not available in this preview."
            style={styles.disabledButton}>
            <Text style={styles.disabledButtonText}>Passkey sign-in</Text>
          </Pressable>
          <Text style={styles.caption}>Account setup is not available in this preview.</Text>
        </View>

        <View style={styles.network}>
          <Text style={styles.eyebrow}>NETWORK</Text>
          <Text accessibilityRole="header" style={styles.networkTitle}>Monad testnet</Text>
          <Text accessibilityLiveRegion="polite" style={styles.networkStatus}>{status}</Text>
          {connection.state === 'checked' && (
            <Text style={styles.block}>Observed block {connection.check.blockNumber.toLocaleString()}</Text>
          )}
          <Pressable accessibilityRole="button" accessibilityLabel="Check Monad testnet connection"
            accessibilityState={{ disabled: connection.state === 'checking', busy: connection.state === 'checking' }}
            disabled={connection.state === 'checking'} onPress={refresh}
            style={({ pressed }) => [styles.checkButton, pressed && styles.pressed]}>
            {connection.state === 'checking' && <ActivityIndicator color={colors.ink} size="small" />}
            <Text style={styles.checkButtonText}>{connection.state === 'checking' ? 'Checking…' : 'Check connection'}</Text>
          </Pressable>
        </View>
        <Text style={styles.footer}>Trading is not connected yet. No funds are needed for this preview.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

export default function App() {
  return <SafeAreaProvider><Home /></SafeAreaProvider>;
}

const colors = { paper: '#F5F3EC', ink: '#19291F', muted: '#586358', accent: '#DBF46A', border: '#D9DED1' };
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  content: { paddingHorizontal: 24, paddingTop: 12, paddingBottom: 28, gap: 24, width: '100%', maxWidth: 640, alignSelf: 'center' },
  topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' },
  wordmark: { color: colors.ink, fontSize: 34, fontWeight: '800', letterSpacing: -2 },
  brandDot: { color: '#64791B' },
  badge: { borderRadius: 20, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 8 },
  badgeText: { color: colors.muted, fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  hero: { paddingTop: 20 },
  eyebrow: { color: colors.muted, fontSize: 11, fontWeight: '700', letterSpacing: 1.5 },
  headline: { color: colors.ink, fontSize: 42, lineHeight: 46, fontWeight: '600', letterSpacing: -1.8, marginTop: 14 },
  intro: { color: colors.muted, fontSize: 17, lineHeight: 25, marginTop: 16, maxWidth: 300 },
  art: { height: 125, marginTop: 24, alignItems: 'center', justifyContent: 'center' },
  orbit: { position: 'absolute', width: 130, height: 96, borderRadius: 65, borderWidth: 1.5, borderColor: colors.ink },
  orbitLeft: { backgroundColor: colors.accent, transform: [{ translateX: -36 }, { rotate: '-25deg' }] },
  orbitRight: { backgroundColor: '#19291F0D', transform: [{ translateX: 36 }, { rotate: '25deg' }] },
  centerDot: { width: 10, height: 10, backgroundColor: colors.ink, borderRadius: 5 },
  artLabel: { position: 'absolute', right: 20, bottom: 4, backgroundColor: colors.paper, padding: 7 },
  artLabelText: { color: colors.muted, fontSize: 12, letterSpacing: 2 },
  account: { borderRadius: 24, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: colors.border, padding: 22, gap: 14 },
  accountHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  asset: { color: colors.ink, fontSize: 12, fontWeight: '700' },
  sectionTitle: { color: colors.ink, fontSize: 26, fontWeight: '600', letterSpacing: -0.6 },
  body: { color: colors.muted, fontSize: 15, lineHeight: 23 },
  disabledButton: { backgroundColor: '#E8ECCF', minHeight: 52, borderRadius: 14, justifyContent: 'center', alignItems: 'center', padding: 12 },
  disabledButtonText: { color: '#596145', fontSize: 15, fontWeight: '600' },
  caption: { color: colors.muted, fontSize: 12, lineHeight: 18, textAlign: 'center' },
  network: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 24, gap: 10 },
  networkTitle: { color: colors.ink, fontSize: 20, fontWeight: '600' },
  networkStatus: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  block: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  checkButton: { minHeight: 48, alignSelf: 'flex-start', paddingHorizontal: 16, paddingVertical: 12, borderWidth: 1, borderColor: colors.ink, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  checkButtonText: { color: colors.ink, fontSize: 14, fontWeight: '600' },
  pressed: { backgroundColor: '#E4E9D8' },
  footer: { color: colors.muted, fontSize: 12, lineHeight: 18 },
});
