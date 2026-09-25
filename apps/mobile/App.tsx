import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ActivityIndicator, AppState, Linking, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as Clipboard from 'expo-clipboard';
import Constants from 'expo-constants';
import { account } from './src/native-account';
import { RP_ID } from './src/account';
import { balanceTarget } from './src/config';
import { formatAmount, readBalance, type WalletBalance } from './src/balance';
import { readPerplContext, type PerplContext } from './src/perpl';

function Button({ title, onPress, disabled = false, secondary = false }: { title: string; onPress: () => void; disabled?: boolean; secondary?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.button, secondary && styles.secondary, disabled && styles.disabled, pressed && styles.pressed]}>
    <Text style={[styles.buttonText, secondary && styles.secondaryText]}>{title}</Text>
  </Pressable>;
}
function Home() {
  const auth = useSyncExternalStore(account.subscribe, account.getSnapshot);
  const [tab, setTab] = useState<'wallet' | 'perpl'>('wallet');
  const [balance, setBalance] = useState<WalletBalance | null>(null);
  const [markets, setMarkets] = useState<PerplContext | null>(null);
  const [busy, setBusy] = useState(false);
  const [balanceError, setBalanceError] = useState<string | null>(null);
  const [marketError, setMarketError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const request = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const ready = Platform.OS !== 'web' && Constants.expoConfig?.extra?.passkeyRpId === RP_ID;
  useEffect(() => {
    void account.restore();
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'background') {
        // The native credential prompt can change activity while no key is open.
        if (!account.getSnapshot().busy) account.lock();
        request.current?.abort(); generation.current++; setBusy(false);
      }
    });
    return () => { subscription.remove(); account.lock(); request.current?.abort(); generation.current++; };
  }, []);
  useEffect(() => {
    request.current?.abort(); generation.current++;
    setBalance(null); setBalanceError(null); setNotice(null);
    void refresh(auth.address);
  }, [auth.address]);
  async function refresh(owner = auth.address) {
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    const current = ++generation.current;
    setBusy(true); setBalanceError(null); setMarketError(null);
    const fresh = () => generation.current === current && !controller.signal.aborted;
    await Promise.allSettled([
      owner ? readBalance(balanceTarget, owner, controller.signal).then(value => { if (fresh()) setBalance(value); })
        .catch(() => { if (fresh()) setBalanceError('Your balance could not be refreshed. Pull down to try again.'); }) : Promise.resolve(),
      readPerplContext(balanceTarget.token, controller.signal).then(value => { if (fresh()) setMarkets(value); })
        .catch(() => { if (fresh()) setMarketError('Perpl prices are unavailable. Pull down to try again.'); }),
    ]);
    if (fresh()) setBusy(false);
  }
  async function authenticate(mode: 'login' | 'signup', another = false) {
    await account.authenticate(mode, another);
    if (AppState.currentState !== 'active') account.lock();
  }
  const walletBalance = balance?.owner === auth.address ? balance : null;
  return <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
    <StatusBar style="dark" />
    <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={busy} onRefresh={() => void refresh()} tintColor={colors.ink} />}>
      <View style={styles.row}><Text style={styles.wordmark}>flurbo<Text style={styles.dot}>.</Text></Text>
        <View style={styles.badge}><Text style={styles.badgeText}>MONAD TESTNET</Text></View></View>
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>YOUR VIEW, ON THE MOVE</Text>
        <Text accessibilityRole="header" style={styles.headline}>{tab === 'wallet' ? 'A little more\npossibility.' : 'A different\nkind of market.'}</Text>
        <Text style={styles.intro}>{tab === 'wallet' ? 'Your Flurbo wallet. One passkey to get started.' : 'Explore Perpl perpetuals, with test AUSD on Monad.'}</Text>
      </View>
      <View style={styles.tabs} accessibilityRole="tablist">
        {(['wallet', 'perpl'] as const).map(value => <Pressable key={value} accessibilityRole="tab" accessibilityState={{ selected: tab === value }} onPress={() => setTab(value)} style={[styles.tab, tab === value && styles.activeTab]}>
          <Text style={[styles.tabText, tab === value && styles.activeText]}>{value === 'wallet' ? 'Your wallet' : 'Perpl markets'}</Text></Pressable>)}
      </View>
      {!!notice && <Text accessibilityLiveRegion="polite" style={styles.caption}>{notice}</Text>}
      {tab === 'wallet' && <>
        {!auth.address ? <View style={styles.card}>
          <Text style={styles.eyebrow}>WELCOME TO FLURBO</Text>
          <Text accessibilityRole="header" style={styles.sectionTitle}>Make yourself at home.</Text>
          <Text style={styles.body}>Use your Flurbo passkey, or create an account. Your device helps you sign in without a password.</Text>
          <Button title={auth.busy ? 'Opening passkey…' : 'Sign in with passkey'} disabled={!ready || auth.busy} onPress={() => void authenticate('login')} />
          <Button title="Create an account" secondary disabled={!ready || auth.busy} onPress={() => void authenticate('signup')} />
          <Text style={styles.caption}>Already use Flurbo on the web? Choose that same passkey to access the same wallet. A new passkey creates a different wallet.</Text>
          {!ready && <Text style={styles.error}>Use a native Flurbo build configured for flurbo.singu.online. Browser preview and Expo Go cannot validate native passkeys.</Text>}
        </View> : <>
          <View style={styles.balanceCard}>
            <Text style={styles.balanceEyebrow}>YOUR TEST AUSD</Text>
            <Text style={styles.balanceNumber}>{walletBalance ? formatAmount(walletBalance.ausd, 6) : 'Unavailable'}</Text>
            <Text style={styles.balanceCaption}>Wallet balance · Monad testnet</Text><View style={styles.balanceRule} />
            <Text style={styles.balanceCaption}>{walletBalance ? `${formatAmount(walletBalance.mon, 18)} test MON for network fees` : 'Refresh to check your on-chain balance'}</Text>
            {walletBalance && <Text style={styles.balanceCaption}>Last checked {new Date(walletBalance.checkedAt).toLocaleTimeString()}{busy ? ' · Refreshing' : ''}</Text>}
          </View>
          {balanceError && <Text accessibilityLiveRegion="polite" style={styles.error}>{balanceError}{walletBalance ? ' The amount above is from the previous check.' : ''}</Text>}
          <View style={styles.card}>
            <Text style={styles.eyebrow}>YOUR MERA WALLET</Text><Text selectable style={styles.address}>{auth.address}</Text>
            <Text style={styles.body}>{auth.unlockedUntil ? 'Passkey verified on this device. Signing locks when you leave the app.' : 'Your wallet is remembered. Use your passkey to unlock it.'}</Text>
            <Button title="Copy wallet address" secondary onPress={() => {
              void Clipboard.setStringAsync(auth.address!).then(() => setNotice('Wallet address copied.')).catch(() => setNotice('Could not copy. Press and hold the address to copy it.'));
            }} />
            <Button title={auth.busy ? 'Opening passkey…' : auth.unlockedUntil ? 'Lock signing' : 'Unlock with passkey'} disabled={auth.busy || !ready} onPress={() => auth.unlockedUntil ? account.lock() : void authenticate('login')} />
            <Button title="Use another passkey" secondary disabled={auth.busy || !ready} onPress={() => void authenticate('login', true)} />
          </View>
          <View style={styles.card}>
            <Text accessibilityRole="header" style={styles.sectionTitle}>Add a little possibility.</Text>
            <Text style={styles.body}>Send test AUSD and test MON to the address above on Monad testnet. AUSD is your balance; MON pays network fees.</Text>
            <Button title="Get test MON in browser" secondary onPress={() => { void Linking.openURL('https://faucet.monad.xyz').catch(() => setNotice('Could not open the faucet. Try again.')); }} />
            <Text style={styles.caption}>Test assets only. A MetaMask wallet has its own balance. Never send mainnet assets to testnet.</Text>
            <Text selectable style={styles.caption}>AUSD contract: {balanceTarget.token.toLowerCase()}</Text>
          </View>
          <Button title="Sign out on this device" secondary disabled={auth.busy} onPress={() => void account.signOut()} />
        </>}
        {auth.error && <Text accessibilityLiveRegion="polite" style={styles.error}>{auth.error}</Text>}
      </>}
      {tab === 'perpl' && <>
        <View style={styles.card}>
          <Text style={styles.eyebrow}>PERPL · MARKET PREVIEW</Text><Text style={styles.sectionTitle}>Follow the market.</Text>
          <Text style={styles.body}>Perpetuals track asset prices. They are separate from Flurbo's Yes and No predictions.</Text>
          <Text style={styles.caption}>Live market data only. Native Perpl account setup and order placement are not enabled in this build.</Text>
          {markets && <Text style={styles.caption}>Perpl currently requires {formatAmount(markets.minimumDeposit, 6)} test AUSD to open an exchange account. Your wallet balance stays separate until you deposit.</Text>}
        </View>
        {marketError && <Text accessibilityLiveRegion="polite" style={styles.error}>{marketError}{markets ? ' Previous prices remain below.' : ''}</Text>}
        {!markets && busy && <ActivityIndicator accessibilityLabel="Loading Perpl markets" color={colors.ink} />}
        {markets?.markets.map(market => <View key={market.id} style={styles.marketCard}>
          <View style={styles.row}><Text style={styles.sectionTitle}>{market.symbol}</Text><Text style={styles.marketPrice}>{formatAmount(String(market.mark), market.decimals, market.decimals)}</Text></View>
          <View style={styles.row}><Text style={styles.caption}>{market.name}</Text><Text style={styles.caption}>{market.open ? 'Mark price · USD' : 'Market closed'}</Text></View>
        </View>)}
        {markets && <Text style={styles.caption}>Checked {new Date(markets.checkedAt).toLocaleTimeString()}. Pull down to refresh. A mark price is not an executable quote.</Text>}
      </>}
      <Button title={busy ? 'Restart refresh' : 'Refresh balances and markets'} secondary onPress={() => void refresh()} />
      <View style={styles.footer}><Text style={styles.body}>One pool. More possibilities.</Text><Text style={styles.caption}>Native preview · Test assets only</Text></View>
    </ScrollView>
  </SafeAreaView>;
}
export default function App() { return <SafeAreaProvider><Home /></SafeAreaProvider>; }
const colors = { paper: '#F5F3EC', ink: '#192D23', muted: '#667068', accent: '#DAF76B', border: '#D7DBD0' };
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper }, content: { paddingHorizontal: 22, paddingTop: 12, paddingBottom: 28, gap: 20, width: '100%', maxWidth: 640, alignSelf: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' },
  wordmark: { color: colors.ink, fontSize: 34, fontWeight: '800', letterSpacing: -2 }, dot: { color: '#7F9530' },
  badge: { borderRadius: 20, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 8 }, badgeText: { color: colors.muted, fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  hero: { paddingTop: 28, paddingBottom: 8, gap: 14 }, eyebrow: { color: colors.muted, fontSize: 10, fontWeight: '700', letterSpacing: 1.5 },
  headline: { color: colors.ink, fontSize: 44, lineHeight: 49, fontWeight: '600', letterSpacing: -2 }, intro: { color: colors.muted, fontSize: 16, lineHeight: 24, maxWidth: 330 },
  tabs: { flexDirection: 'row', padding: 4, borderWidth: 1, borderColor: colors.border, borderRadius: 30, gap: 4 }, tab: { flex: 1, minHeight: 48, justifyContent: 'center', alignItems: 'center', padding: 10, borderRadius: 24 }, activeTab: { backgroundColor: colors.ink },
  tabText: { color: colors.ink, fontSize: 14, fontWeight: '600' }, activeText: { color: colors.paper },
  card: { borderRadius: 22, backgroundColor: '#FBFAF6', borderWidth: 1, borderColor: colors.border, padding: 22, gap: 16 }, sectionTitle: { color: colors.ink, fontSize: 24, fontWeight: '600', letterSpacing: -0.8 },
  body: { color: colors.muted, fontSize: 15, lineHeight: 23 }, caption: { color: colors.muted, fontSize: 12, lineHeight: 19 },
  button: { backgroundColor: colors.ink, minHeight: 50, borderRadius: 26, justifyContent: 'center', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 18 }, buttonText: { color: colors.paper, fontSize: 14, fontWeight: '600', textAlign: 'center' },
  secondary: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.border }, secondaryText: { color: colors.ink }, disabled: { opacity: 0.5 }, pressed: { opacity: 0.75 },
  balanceCard: { backgroundColor: colors.ink, borderRadius: 24, padding: 24, gap: 12 }, balanceEyebrow: { color: colors.accent, fontSize: 11, letterSpacing: 1.5, fontWeight: '600' }, balanceNumber: { color: colors.paper, fontSize: 40, fontWeight: '500', letterSpacing: -1.8 },
  balanceCaption: { color: '#C3CBBE', fontSize: 12, lineHeight: 18 }, balanceRule: { height: 1, backgroundColor: '#496050', marginVertical: 8 }, address: { color: colors.ink, fontSize: 14, lineHeight: 23 },
  error: { color: '#973D2E', fontSize: 13, lineHeight: 21 }, marketCard: { borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: 20, gap: 10 }, marketPrice: { color: colors.ink, fontSize: 22, fontWeight: '500' }, footer: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 24, gap: 8 },
});
