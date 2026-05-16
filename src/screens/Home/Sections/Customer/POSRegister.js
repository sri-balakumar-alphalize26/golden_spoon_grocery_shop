import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  FlatList,
  ActivityIndicator,
  Image,
  Animated,
  TouchableOpacity,
  Platform,
  Modal,
  TextInput,
  Dimensions,
  ScrollView,
} from 'react-native';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView } from '@components/containers';
import { NavigationHeader } from '@components/Header';
import {
  fetchPOSRegisters,
  fetchPOSSessions,
  createPOSSesionOdoo,
  closePOSSesionOdoo,
  fetchSessionClosingDetails,
  fetchSessionOngoing,
  fetchDraftPosOrders,
  unlinkPosOrders,
} from '@api/services/generalApi';
import useAuthStore from '@stores/auth/useAuthStore';
import { useProductStore } from '@stores/product';
import { formatCurrency } from '@utils/currency';
import { FeatureGate } from '@components/FeatureGate';
import * as Print from 'expo-print';
import { generateDailySaleHtml } from '@utils/invoiceHtml';
import Toast from 'react-native-toast-message';

// 3D Animated card wrapper — matches the Restaurantnexgenn reference
const Card3D = ({ children, style, delay = 0 }) => {
  const scaleAnim = useRef(new Animated.Value(0.92)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(40)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scaleAnim, { toValue: 1, friction: 6, tension: 80, delay, useNativeDriver: true }),
      Animated.timing(opacityAnim, { toValue: 1, duration: 400, delay, useNativeDriver: true }),
      Animated.spring(translateY, { toValue: 0, friction: 7, tension: 60, delay, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <Animated.View
      style={[
        style,
        {
          opacity: opacityAnim,
          transform: [{ scale: scaleAnim }, { translateY }, { perspective: 1000 }],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
};

const POSRegister = ({ navigation }) => {
  const currency = useAuthStore((state) => state.currency);
  const decimalAccuracy = useAuthStore((state) => state.decimalAccuracy);
  useEffect(() => { console.log('[CURRENCY:RENDER] POSRegister', currency); }, [currency]);
  useEffect(() => { console.log('[CURRENCY:RENDER] POSRegister decimalAccuracy=', decimalAccuracy); }, [decimalAccuracy]);
  const [registers, setRegisters] = useState([]);
  const [openSessions, setOpenSessions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Opening Control modal state — shown when user taps "Open Register"
  const [openingModalVisible, setOpeningModalVisible] = useState(false);
  const [openingTarget, setOpeningTarget] = useState(null);
  const [openingCash, setOpeningCash] = useState('');
  const [openingNote, setOpeningNote] = useState('');
  const [openingSubmitting, setOpeningSubmitting] = useState(false);

  // Closing Register modal state — shown when user taps "Close" on an active
  // session. Mirrors the Odoo Web POS "Closing Register" modal: per-payment-
  // method rows with Counted + Difference, plus a Cash Count input and Closing
  // note. The state below is populated from fetchSessionClosingDetails() the
  // moment the modal opens.
  const [closeModalVisible, setCloseModalVisible] = useState(false);
  const [closeTargetId, setCloseTargetId] = useState(null);
  const [closeDetails, setCloseDetails] = useState(null);       // { session, payments, methods, cashMoves, orderCount, orderTotal }
  const [closeLoading, setCloseLoading] = useState(false);      // fetching closing details
  const [closing, setClosing] = useState(false);                 // submitting the close
  const [countedCash, setCountedCash] = useState('');
  const [bankCounted, setBankCounted] = useState({});           // { [methodId]: '<string>' }
  const [closingNote, setClosingNote] = useState('');

  // Coins/Notes popup state — secondary modal that opens from the cash icon
  // next to the Cash Count field. Each row counts a denomination, the live
  // total goes into Cash Count on Confirm.
  const [coinsModalVisible, setCoinsModalVisible] = useState(false);
  const [coinCounts, setCoinCounts] = useState({});             // { '500': 0, '200': 0, ... }

  // Kebab popover state — the 3-dots menu on each register card. menuRegister
  // is the register the user tapped so the popover knows where to navigate.
  const [menuVisible, setMenuVisible] = useState(false);
  const [menuRegister, setMenuRegister] = useState(null);

  // Live "Ongoing" totals per open session, fetched after the session list.
  // Shape: { [sessionId]: { orderCount, orderTotal } }.
  const [ongoingBySession, setOngoingBySession] = useState({});

  // Continue Selling popup — choice between a fresh register (New Order)
  // and resuming an in-progress draft from this session (Existing Order).
  const [continueModalVisible, setContinueModalVisible] = useState(false);
  const [continueTargetSession, setContinueTargetSession] = useState(null);
  const { clearProducts } = useProductStore();

  const loadRegistersAndSessions = async () => {
    console.log('[POSRegister] loading registers and open sessions');
    const t0 = Date.now();
    setLoading(true);
    setError(null);
    try {
      const [regs, sessions] = await Promise.all([
        fetchPOSRegisters({ limit: 20 }),
        fetchPOSSessions({ state: 'opened' }),
      ]);
      console.log('[POSRegister] loaded', {
        registers: Array.isArray(regs) ? regs.length : 0,
        openSessions: Array.isArray(sessions) ? sessions.length : 0,
        ms: Date.now() - t0,
      });
      setRegisters(Array.isArray(regs) ? regs : []);
      setOpenSessions(Array.isArray(sessions) ? sessions : []);

      // Fan out one fetchSessionOngoing per open session in parallel — small
      // payload each, so total wall time is roughly one network round-trip.
      const list = Array.isArray(sessions) ? sessions : [];
      if (list.length) {
        const ongoingMap = {};
        await Promise.all(list.map(async (sess) => {
          const o = await fetchSessionOngoing({ sessionId: sess.id });
          ongoingMap[sess.id] = o;
        }));
        setOngoingBySession(ongoingMap);
      } else {
        setOngoingBySession({});
      }
    } catch (err) {
      console.error('[POSRegister] load error:', err);
      setError('Failed to load POS registers or sessions');
    } finally {
      setLoading(false);
    }
  };

  // Refresh on every focus (not just mount) so navigating back from a sale,
  // refund, or session-detail screen always shows the latest Ongoing total.
  useFocusEffect(
    useCallback(() => {
      loadRegistersAndSessions();
    }, []),
  );

  // Tap "Open Register" → show Odoo-style Opening Control popup so the user
  // can enter the opening cash and a note before the session is advanced to
  // `opened`.
  const handleOpenRegisterSession = (register) => {
    console.log('[POSRegister] Open Register tapped', { id: register?.id, name: register?.name });
    setOpeningTarget(register);
    setOpeningCash('');
    setOpeningNote('');
    setOpeningModalVisible(true);
  };

  // Called when the user taps "Open Register" inside the Opening Control modal.
  const confirmOpenRegister = async () => {
    if (!openingTarget) return;
    const cashAmount = parseFloat(openingCash);
    if (isNaN(cashAmount) || cashAmount < 0) {
      Alert.alert('Invalid amount', 'Please enter a valid opening cash amount (0 or more).');
      return;
    }
    setOpeningSubmitting(true);
    try {
      const user = useAuthStore.getState().user;
      const userId = user?.uid || user?.id || null;
      console.log('[POSRegister] opening session as user', { userId, openingCash: cashAmount, hasNote: !!openingNote });

      const resp = await createPOSSesionOdoo({
        configId: openingTarget.id,
        userId,
        openingCash: cashAmount,
        openingNote,
      });
      console.log('[POSRegister] createPOSSesionOdoo response:', resp);

      if (resp && resp.error) {
        const msg = resp.error.message || resp.error.data?.message || 'Failed to open register';
        console.error('[POSRegister] open register error:', msg);
        Alert.alert('Odoo Error', msg);
        return;
      }

      setOpeningModalVisible(false);
      const sessionLabel = resp.sessionId ? `Session ID: ${resp.sessionId}` : 'Session opened';
      Alert.alert('Register Opened', sessionLabel);
      // Full screen refresh: pulls fresh fetchPOSRegisters + fetchPOSSessions
      // so the closed-registers list updates as well as the open-sessions list.
      await loadRegistersAndSessions();
    } catch (err) {
      console.error('[POSRegister] open register exception:', err);
      Alert.alert('Error', err?.message || 'Failed to open register');
    } finally {
      setOpeningSubmitting(false);
    }
  };

  // Open the Odoo-style Closing Register modal. Fetches the session's
  // payments / methods / cash moves / order totals first so the modal can
  // render expected vs counted per payment method.
  const handleCloseRegisterSession = async (sessionId) => {
    setCloseTargetId(sessionId);
    setCloseModalVisible(true);
    setCloseLoading(true);
    setCloseDetails(null);
    setCountedCash('');
    setBankCounted({});
    setClosingNote('');
    try {
      const details = await fetchSessionClosingDetails({ sessionId });
      if (details?.error) {
        Alert.alert('Close Register', details.error.message || 'Could not load closing details');
        setCloseModalVisible(false);
        return;
      }
      // Seed bank-method counted amounts to the expected total so a zero-diff
      // close is one tap. Cashier overrides if they actually counted less/more.
      const seeded = {};
      (details.methods || []).forEach((m) => {
        if (m.is_cash_count) return;
        const expected = (details.payments || [])
          .filter((p) => Array.isArray(p.payment_method_id) && p.payment_method_id[0] === m.id)
          .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
        seeded[m.id] = String(expected.toFixed(2));
      });
      setBankCounted(seeded);
      setCloseDetails(details);
    } catch (e) {
      Alert.alert('Close Register', e?.message || 'Could not load closing details');
      setCloseModalVisible(false);
    } finally {
      setCloseLoading(false);
    }
  };

  const handleDiscardClose = () => {
    if (closing) return;
    setCloseModalVisible(false);
    setCloseTargetId(null);
    setCloseDetails(null);
    setCountedCash('');
    setBankCounted({});
    setClosingNote('');
    setCoinCounts({});
  };

  // Coins/Notes popup — denominations the cashier can count by physically
  // sorting the drawer. Defaults are INR-appropriate; symbol pulled from
  // formatCurrency below so it adapts if the org switches currency.
  const COIN_DENOMINATIONS = [500, 200, 100, 50, 20, 10, 5, 2, 1, 0.5];

  const openCoinsModal = () => {
    // Reset per-denomination counts every time so the popup is a clean slate.
    setCoinCounts({});
    setCoinsModalVisible(true);
  };

  const incCoin = (d, delta) => {
    setCoinCounts((c) => {
      const cur = Number(c[d]) || 0;
      const next = Math.max(0, cur + delta);
      return { ...c, [d]: next };
    });
  };

  const setCoinQty = (d, raw) => {
    const v = parseInt(String(raw).replace(/[^0-9]/g, ''), 10);
    setCoinCounts((c) => ({ ...c, [d]: Number.isFinite(v) ? v : 0 }));
  };

  const coinsTotal = COIN_DENOMINATIONS.reduce(
    (sum, d) => sum + d * (Number(coinCounts[d]) || 0),
    0,
  );

  const confirmCoinsModal = () => {
    setCountedCash(coinsTotal > 0 ? coinsTotal.toFixed(2) : '');
    setCoinsModalVisible(false);
  };

  // Daily Sale button — generate an A4 PDF summary of the current session's
  // takings and open the OS print/share sheet via expo-print. Reuses
  // generateDailySaleHtml + the company profile + cashier name from the auth
  // store (same source the receipt printer uses).
  const handleDailySale = async () => {
    if (!closeDetails?.session) {
      Toast.show({ type: 'error', text1: 'Daily Sale', text2: 'Session details not loaded yet' });
      return;
    }
    try {
      const authState = useAuthStore.getState();
      const companyProfile = authState.companyProfile || null;
      const cashierName = authState.user?.name || authState.user?.login || 'Cashier';
      const html = generateDailySaleHtml({
        session: closeDetails.session,
        closeDetails,
        countedCash: parseFloat(countedCash) || 0,
        closingNote,
        companyProfile,
        cashierName,
      });
      await Print.printAsync({ html });
    } catch (e) {
      Toast.show({ type: 'error', text1: 'Print failed', text2: e?.message || 'Try again' });
    }
  };

  // Copy-expected button: one-tap fill the Cash Count field with the cashier-
  // side expected total (Opening + Payments-in-Cash + Cash In/Out).
  const handleCopyExpectedCash = () => {
    if (!closeDetails) return;
    const methods = closeDetails.methods || [];
    const payments = closeDetails.payments || [];
    const cashMethod = methods.find((m) => m.is_cash_count) || null;
    if (!cashMethod) return;
    const opening = Number(closeDetails.session?.cash_register_balance_start) || 0;
    const cashInOut = (closeDetails.cashMoves || []).reduce((sum, m) => sum + (Number(m.amount) || 0), 0);
    const paymentsInCash = payments
      .filter((p) => Array.isArray(p.payment_method_id) && p.payment_method_id[0] === cashMethod.id)
      .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    const expected = opening + cashInOut + paymentsInCash;
    setCountedCash(expected.toFixed(2));
  };

  // Submit the close via the new 3-step RPC. On Odoo "draft order" error,
  // offer to discard drafts and retry (preserves the old recovery path).
  const handleConfirmClose = async () => {
    if (!closeTargetId || closing) return;
    setClosing(true);
    try {
      const bankDiffs = {};
      (closeDetails?.methods || []).forEach((m) => {
        if (m.is_cash_count) return;
        const v = parseFloat(bankCounted[m.id]);
        bankDiffs[m.id] = Number.isFinite(v) ? v : 0;
      });
      const resp = await closePOSSesionOdoo({
        sessionId: closeTargetId,
        countedCash: parseFloat(countedCash) || 0,
        bankDiffs,
        closingNote,
      });
      if (resp?.error) {
        const msg = resp.error.message || 'Failed to close register';
        const isDraftError = /draft state/i.test(msg) && /Pay or cancel/i.test(msg);
        if (isDraftError) {
          const drafts = await fetchDraftPosOrders(closeTargetId);
          const count = drafts.length;
          Alert.alert(
            'Draft Orders Block Close',
            count > 0
              ? `${count} draft order${count === 1 ? '' : 's'} in this session must be paid or cancelled before close.\n\nDiscard all drafts and retry close?`
              : 'Odoo says there are draft orders, but none could be fetched. Try clearing them in Odoo backend.',
            count > 0
              ? [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: `Discard ${count} & Retry`,
                    style: 'destructive',
                    onPress: async () => {
                      setClosing(true);
                      try {
                        const ids = drafts.map((d) => d.id);
                        const r = await unlinkPosOrders(ids);
                        if (r?.error) { Alert.alert('Discard Error', r.error); return; }
                        const retryResp = await closePOSSesionOdoo({
                          sessionId: closeTargetId,
                          countedCash: parseFloat(countedCash) || 0,
                          bankDiffs,
                          closingNote,
                        });
                        if (retryResp?.error) {
                          Alert.alert('Odoo Error', retryResp.error.message || 'Failed to close register');
                          return;
                        }
                        Alert.alert('Register Closed', 'Drafts discarded and session closed.');
                        handleDiscardClose();
                        await loadRegistersAndSessions();
                      } catch (e) {
                        Alert.alert('Error', e?.message || 'Failed to discard drafts');
                      } finally {
                        setClosing(false);
                      }
                    },
                  },
                ]
              : [{ text: 'OK' }]
          );
        } else {
          Alert.alert('Odoo Error', msg);
        }
        return;
      }
      Alert.alert('Register Closed', 'Session closed successfully');
      handleDiscardClose();
      await loadRegistersAndSessions();
    } catch (err) {
      Alert.alert('Error', err?.message || 'Failed to close register');
    } finally {
      setClosing(false);
    }
  };

  // Tap on Continue Selling → open the New/Existing choice popup instead of
  // jumping straight into TakeoutDelivery. Cashier picks New Order for a
  // clean register or Existing Order to resume a saved draft.
  const handleContinueSelling = (session) => {
    setContinueTargetSession(session);
    setContinueModalVisible(true);
  };

  const handleStartNewOrder = () => {
    const session = continueTargetSession;
    setContinueModalVisible(false);
    if (!session) return;
    // Wipe any leftover cart from a prior order so the register opens empty.
    try { clearProducts(); } catch (_) {}
    navigation.navigate('TakeoutDelivery', {
      sessionId: session.id,
      registerId: session.config_id?.[0],
      registerName: session.name,
      userId: session.user_id?.[0],
      userName: session.user_id?.[1],
      openingAmount: session.cash_register_balance_start || 0,
      presetName: 'Takeaway',
      forceNewOrder: true,
    });
  };

  const handleResumeExistingOrder = () => {
    const session = continueTargetSession;
    setContinueModalVisible(false);
    if (!session) return;
    navigation.navigate('MyOrdersScreen', {
      sessionId: session.id,
      configId: session.config_id?.[0],
      configName: session.config_id?.[1] || session.name,
      stateFilter: 'draft',
    });
  };

  const renderOpenSession = ({ item, index }) => (
    <Card3D style={s.card3dWrapper} delay={index * 100}>
      {/* Top accent bar */}
      <View style={s.accentBarGreen} />
      <View style={s.cardInner}>
        {/* Header row */}
        <View style={s.headerRow}>
          <View style={s.iconCircle}>
            <Image source={require('@assets/images/logo/logo.png')} style={s.logoImg} />
          </View>
          <View style={{ flex: 1, marginLeft: 14 }}>
            <Text style={s.cardTitle}>
              {item.config_id?.[1] || item.config_id?.[0] || 'Restaurant'}
            </Text>
            <Text style={s.cardMeta}>{`Session #${item.id}`}</Text>
          </View>
          <View style={s.statusBadgeActive}>
            <View style={s.statusDot} />
            <Text style={s.statusText}>
              {item.state === 'opening_control' ? 'OPENING' : 'ACTIVE'}
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => {
              // Open the kebab popover for the underlying register (config),
              // not the session — Sessions/Orders are scoped by config_id.
              const cfgId = Array.isArray(item.config_id) ? item.config_id[0] : item.config_id;
              const cfgName = Array.isArray(item.config_id) ? item.config_id[1] : '';
              setMenuRegister({ id: cfgId, name: cfgName || item.name });
              setMenuVisible(true);
            }}
            style={s.kebabBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            activeOpacity={0.7}
          >
            <MaterialIcons name="more-vert" size={20} color="#374151" />
          </TouchableOpacity>
        </View>

        {/* Separator */}
        <View style={s.separator} />

        {/* Info rows */}
        <View style={s.infoGrid}>
          <View style={s.infoItem}>
            <Text style={s.infoIcon}>👤</Text>
            <View>
              <Text style={s.infoLabel}>USER</Text>
              <Text style={s.infoValue}>{item.user_id?.[1] || '—'}</Text>
            </View>
          </View>
          <View style={s.infoItem}>
            <Text style={s.infoIcon}>🕒</Text>
            <View>
              <Text style={s.infoLabel}>OPENED AT</Text>
              <Text style={s.infoValue}>
                {item.start_at ? new Date(item.start_at).toLocaleString() : '—'}
              </Text>
            </View>
          </View>
          <View style={s.infoItem}>
            <Text style={s.infoIcon}>💰</Text>
            <View>
              <Text style={s.infoLabel}>OPENING AMOUNT</Text>
              <Text style={[s.infoValue, s.amountValue]}>
                {typeof item.cash_register_balance_start === 'number'
                  ? formatCurrency(
                      item.cash_register_balance_start,
                      currency || { symbol: '', name: '', position: 'before' }
                    )
                  : '—'}
              </Text>
            </View>
          </View>
          <View style={s.infoItem}>
            <Text style={s.infoIcon}>📈</Text>
            <View>
              <Text style={s.infoLabel}>ONGOING</Text>
              {(() => {
                const ongoing = ongoingBySession[item.id] || { orderCount: 0, orderTotal: 0 };
                const isNegative = ongoing.orderTotal < 0;
                return (
                  <Text style={[s.infoValue, s.amountValue, isNegative && s.amountNegative]}>
                    {`${formatCurrency(
                      ongoing.orderTotal,
                      currency || { symbol: '', name: '', position: 'before' }
                    )} (${ongoing.orderCount} order${ongoing.orderCount === 1 ? '' : 's'})`}
                  </Text>
                );
              })()}
            </View>
          </View>
        </View>

        {/* Action buttons */}
        <View style={s.actionRow}>
          <TouchableOpacity
            style={s.btnContinue}
            activeOpacity={0.8}
            onPress={() => handleContinueSelling(item)}
          >
            <Text style={s.btnContinueText}>Continue Selling</Text>
          </TouchableOpacity>
          <FeatureGate featureKey="pos.close_register">
            <TouchableOpacity
              style={s.btnClose}
              activeOpacity={0.8}
              onPress={() => handleCloseRegisterSession(item.id)}
            >
              <Text style={s.btnCloseText}>Close</Text>
            </TouchableOpacity>
          </FeatureGate>
        </View>
      </View>
    </Card3D>
  );

  const renderRegister = ({ item, index }) => (
    <Card3D style={s.card3dWrapper} delay={(openSessions.length + index) * 100}>
      {/* Top accent bar */}
      <View style={s.accentBarBlue} />
      <View style={s.cardInner}>
        {/* Header row */}
        <View style={s.headerRow}>
          <View style={[s.iconCircle, s.iconCircleBlue]}>
            <Image source={require('@assets/images/logo/logo.png')} style={s.logoImg} />
          </View>
          <View style={{ flex: 1, marginLeft: 14 }}>
            <Text style={s.cardTitle}>{item.name}</Text>
            <Text style={s.cardMeta}>{`Register ID #${item.id}`}</Text>
          </View>
          <View style={s.statusBadgeIdle}>
            <Text style={s.statusTextIdle}>AVAILABLE</Text>
          </View>
          <TouchableOpacity
            onPress={() => {
              setMenuRegister({ id: item.id, name: item.name });
              setMenuVisible(true);
            }}
            style={s.kebabBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            activeOpacity={0.7}
          >
            <MaterialIcons name="more-vert" size={20} color="#374151" />
          </TouchableOpacity>
        </View>

        {/* Separator */}
        <View style={s.separator} />

        <Text style={s.registerDesc}>Tap below to open this register and start a new session.</Text>

        {/* Action button */}
        <FeatureGate featureKey="pos.open_register">
          <TouchableOpacity
            style={s.btnOpen}
            activeOpacity={0.8}
            onPress={() => handleOpenRegisterSession(item)}
          >
            <Text style={s.btnOpenText}>Open Register</Text>
          </TouchableOpacity>
        </FeatureGate>
      </View>
    </Card3D>
  );

  // Filter out registers that already have open sessions
  const openConfigIds = openSessions.map((sess) => Number(sess.config_id?.[0]));
  const availableRegisters = registers.filter((r) => !openConfigIds.includes(Number(r.id)));

  return (
    <SafeAreaView style={s.container}>
      <NavigationHeader title="POS Register" onBackPress={() => navigation.goBack()} logo={false} />

      {/* Centered logo with glow */}
      <View style={s.logoWrap}>
        <View style={s.logoGlow} />
        <Image source={require('@assets/images/logo2.png')} style={s.logoImage} />
      </View>

      {loading ? (
        <View style={s.loaderWrap}>
          <ActivityIndicator size="large" color="#F47B20" />
          <Text style={s.loaderText}>Loading registers…</Text>
        </View>
      ) : error ? (
        <View style={s.errorWrap}>
          <Text style={s.errorIcon}>⚠️</Text>
          <Text style={s.errorText}>{error}</Text>
          <TouchableOpacity style={s.retryBtn} activeOpacity={0.8} onPress={loadRegistersAndSessions}>
            <Text style={s.retryBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={[
            ...(openSessions.length > 0
              ? [{ _type: 'sectionHeader', _title: 'Active Sessions', _count: openSessions.length }]
              : []),
            ...openSessions.map((sess) => ({ ...sess, _type: 'session' })),
            ...(availableRegisters.length > 0
              ? [{ _type: 'sectionHeader', _title: 'Available Registers', _count: availableRegisters.length }]
              : []),
            ...availableRegisters.map((r) => ({ ...r, _type: 'register' })),
          ]}
          keyExtractor={(item, idx) =>
            item._type === 'sectionHeader' ? `header-${idx}` : `item-${item.id}`
          }
          renderItem={({ item, index }) => {
            if (item._type === 'sectionHeader') {
              return (
                <View style={s.sectionHeaderRow}>
                  <Text style={s.sectionTitle}>{item._title}</Text>
                  <View style={s.countBadge}>
                    <Text style={s.countBadgeText}>{item._count}</Text>
                  </View>
                </View>
              );
            }
            if (item._type === 'session') return renderOpenSession({ item, index });
            return renderRegister({ item, index });
          }}
          contentContainerStyle={s.listContent}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={s.emptyWrap}>
              <Text style={s.emptyIcon}>📋</Text>
              <Text style={s.emptyText}>No registers found.</Text>
            </View>
          }
        />
      )}

      {/* Closing Register modal — mirrors the Odoo Web POS "Closing Register"
          dialog. Renders per-payment-method rows (Cash with Opening / Cash In-
          Out / Counted / Difference; non-cash with Counted / Difference), a
          Cash Count input, a Closing note text area, and an order-count badge
          on the right of the header. Tapping Close Register submits via the
          3-step RPC that sets stop_at and ending balance correctly. */}
      <Modal
        visible={closeModalVisible}
        animationType="fade"
        transparent
        onRequestClose={handleDiscardClose}
      >
        <View style={s.closeModalBg}>
          <View style={s.closeModalCard}>
            <View style={s.closeHeaderRow}>
              <Text style={s.closeTitle}>Closing Register</Text>
              <Text style={s.closeOrders}>
                {`${closeDetails?.orderCount ?? 0} orders: ${formatCurrency(closeDetails?.orderTotal || 0)}`}
              </Text>
            </View>

            {closeLoading ? (
              <View style={s.closeLoadingWrap}>
                <ActivityIndicator size="large" color="#7c3aed" />
                <Text style={s.closeLoadingText}>Loading closing details…</Text>
              </View>
            ) : (
              <ScrollView style={{ maxHeight: Dimensions.get('window').height * 0.55 }}>
                {(() => {
                  // Derive everything the rows need from closeDetails.
                  const methods = closeDetails?.methods || [];
                  const payments = closeDetails?.payments || [];
                  const cashMoves = closeDetails?.cashMoves || [];
                  const openingCashAmt = Number(closeDetails?.session?.cash_register_balance_start) || 0;
                  const cashInOutTotal = cashMoves.reduce((sum, m) => sum + (Number(m.amount) || 0), 0);

                  // Expected per method (sum of pos.payment.amount for that method)
                  const expectedByMethod = {};
                  methods.forEach((m) => {
                    expectedByMethod[m.id] = payments
                      .filter((p) => Array.isArray(p.payment_method_id) && p.payment_method_id[0] === m.id)
                      .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
                  });

                  const cashMethod = methods.find((m) => m.is_cash_count) || null;
                  const cashExpected = openingCashAmt + cashInOutTotal + (cashMethod ? expectedByMethod[cashMethod.id] || 0 : 0);
                  const cashCountedNum = parseFloat(countedCash) || 0;
                  const cashDiff = cashCountedNum - cashExpected;
                  const bankMethods = methods.filter((m) => !m.is_cash_count);

                  return (
                    <>
                      {/* Cash section */}
                      {cashMethod ? (
                        <View style={s.methodSection}>
                          <View style={s.methodHeaderRow}>
                            <Text style={s.methodName}>{cashMethod.name || 'Cash'}</Text>
                            <Text style={s.methodAmount}>{formatCurrency(cashExpected)}</Text>
                          </View>
                          <View style={s.closeRow}>
                            <Text style={s.closeRowLabel}>Opening</Text>
                            <Text style={s.closeRowValue}>{formatCurrency(openingCashAmt)}</Text>
                          </View>
                          <View style={s.closeRow}>
                            <Text style={s.closeRowLabel}>Payments in Cash</Text>
                            <Text style={s.closeRowValue}>{formatCurrency(expectedByMethod[cashMethod.id] || 0)}</Text>
                          </View>
                          <View style={s.closeRow}>
                            <Text style={s.closeRowLabel}>Cash In / Out</Text>
                            <Text style={s.closeRowValue}>{`${cashInOutTotal >= 0 ? '+ ' : ''}${formatCurrency(cashInOutTotal)}`}</Text>
                          </View>
                          <View style={s.closeRow}>
                            <Text style={s.closeRowLabel}>Counted</Text>
                            <Text style={s.closeRowValue}>{formatCurrency(cashCountedNum)}</Text>
                          </View>
                          <View style={s.closeRow}>
                            <Text style={[s.closeRowLabel, cashDiff !== 0 && s.closeRowRed]}>Difference</Text>
                            <Text style={[s.closeRowValue, cashDiff !== 0 && s.closeRowRed]}>{formatCurrency(cashDiff)}</Text>
                          </View>
                        </View>
                      ) : null}

                      {/* Non-cash methods (Card, Credit, Customer Account, etc.) */}
                      {bankMethods.map((m) => {
                        const expected = expectedByMethod[m.id] || 0;
                        const counted = parseFloat(bankCounted[m.id]) || 0;
                        const diff = counted - expected;
                        return (
                          <View key={m.id} style={s.methodSection}>
                            <View style={s.methodHeaderRow}>
                              <Text style={s.methodName}>{m.name}</Text>
                              <Text style={s.methodAmount}>{formatCurrency(expected)}</Text>
                            </View>
                            <View style={s.closeRow}>
                              <Text style={s.closeRowLabel}>Counted</Text>
                              <TextInput
                                style={s.closeRowInput}
                                value={bankCounted[m.id] ?? ''}
                                onChangeText={(t) => setBankCounted({ ...bankCounted, [m.id]: t.replace(/[^0-9.\-]/g, '') })}
                                keyboardType="decimal-pad"
                                placeholder="0"
                              />
                            </View>
                            <View style={s.closeRow}>
                              <Text style={[s.closeRowLabel, diff !== 0 && s.closeRowRed]}>Difference</Text>
                              <Text style={[s.closeRowValue, diff !== 0 && s.closeRowRed]}>{formatCurrency(diff)}</Text>
                            </View>
                          </View>
                        );
                      })}

                      {/* Cash Count input row — text input + X clear + Coins/Notes
                          icon + Copy-expected icon. Mirrors the Odoo Web layout. */}
                      <Text style={s.closeFieldLabel}>Cash Count</Text>
                      <View style={s.cashCountRow}>
                        <View style={s.cashCountInputWrap}>
                          <TextInput
                            style={s.cashCountInput}
                            value={countedCash}
                            onChangeText={(t) => setCountedCash(t.replace(/[^0-9.]/g, ''))}
                            keyboardType="decimal-pad"
                            placeholder="0"
                            placeholderTextColor="#9ca3af"
                          />
                          {countedCash ? (
                            <TouchableOpacity
                              onPress={() => setCountedCash('')}
                              style={s.cashCountClearBtn}
                              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            >
                              <MaterialIcons name="close" size={16} color="#6b7280" />
                            </TouchableOpacity>
                          ) : null}
                        </View>
                        <TouchableOpacity
                          onPress={openCoinsModal}
                          style={s.cashCountIconBtn}
                          activeOpacity={0.7}
                        >
                          <MaterialCommunityIcons name="cash-multiple" size={20} color="#374151" />
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={handleCopyExpectedCash}
                          style={s.cashCountIconBtn}
                          activeOpacity={0.7}
                        >
                          <MaterialIcons name="content-copy" size={18} color="#374151" />
                        </TouchableOpacity>
                      </View>

                      {/* Closing note */}
                      <Text style={s.closeFieldLabel}>Closing note</Text>
                      <TextInput
                        style={s.closingNoteInput}
                        value={closingNote}
                        onChangeText={setClosingNote}
                        multiline
                        numberOfLines={3}
                        placeholder="Add a closing note..."
                        placeholderTextColor="#9ca3af"
                      />
                    </>
                  );
                })()}
              </ScrollView>
            )}

            <View style={s.closeFooterRow}>
              <TouchableOpacity
                onPress={handleConfirmClose}
                style={[s.closeRegisterBtn, (closing || closeLoading) && { opacity: 0.55 }]}
                disabled={closing || closeLoading}
                activeOpacity={0.85}
              >
                {closing ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={s.closeRegisterText}>Close Register</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleDiscardClose}
                style={s.discardBtn}
                disabled={closing}
                activeOpacity={0.85}
              >
                <Text style={s.discardText}>Discard</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleDailySale}
                style={s.dailySaleBtn}
                disabled={closing || closeLoading || !closeDetails?.session}
                activeOpacity={0.85}
              >
                <MaterialIcons name="file-download" size={16} color="#374151" />
                <Text style={s.dailySaleText}>Daily Sale</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Coins/Notes popup — opens from the cash icon next to Cash Count. The
          cashier increments each denomination row physically counted; Confirm
          writes the running total into the Cash Count field. */}
      <Modal
        visible={coinsModalVisible}
        animationType="fade"
        transparent
        onRequestClose={() => setCoinsModalVisible(false)}
      >
        <View style={s.coinsModalBg}>
          <View style={s.coinsModalCard}>
            <View style={s.coinsHeaderRow}>
              <Text style={s.coinsTitle}>Coins/Notes</Text>
              <TouchableOpacity
                onPress={() => setCoinsModalVisible(false)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <MaterialIcons name="close" size={20} color="#374151" />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: Dimensions.get('window').height * 0.55 }}>
              <View style={s.coinsGrid}>
                {COIN_DENOMINATIONS.map((d) => {
                  const qty = Number(coinCounts[d]) || 0;
                  return (
                    <View key={d} style={s.coinRow}>
                      <TouchableOpacity
                        onPress={() => incCoin(d, -1)}
                        style={s.coinStepBtn}
                        activeOpacity={0.7}
                      >
                        <MaterialIcons name="remove" size={16} color="#374151" />
                      </TouchableOpacity>
                      <TextInput
                        style={s.coinQtyInput}
                        value={String(qty)}
                        onChangeText={(v) => setCoinQty(d, v)}
                        keyboardType="number-pad"
                        textAlign="center"
                      />
                      <TouchableOpacity
                        onPress={() => incCoin(d, +1)}
                        style={s.coinStepBtn}
                        activeOpacity={0.7}
                      >
                        <MaterialIcons name="add" size={16} color="#374151" />
                      </TouchableOpacity>
                      <Text style={s.coinDenomLabel}>{formatCurrency(d)}</Text>
                    </View>
                  );
                })}
              </View>
            </ScrollView>
            <View style={s.coinsFooterRow}>
              <TouchableOpacity
                onPress={confirmCoinsModal}
                style={s.coinsConfirmBtn}
                activeOpacity={0.85}
              >
                <Text style={s.coinsConfirmText}>Confirm</Text>
              </TouchableOpacity>
              <Text style={s.coinsTotalText}>{`Total ${formatCurrency(coinsTotal)}`}</Text>
            </View>
          </View>
        </View>
      </Modal>

      {/* Kebab popover — opens from the 3-dots on each register card. Two
          shortcuts: Sessions (this register's pos.session list) and Orders
          (this register's pos.order list, scoped by config_id). */}
      <Modal
        visible={menuVisible}
        animationType="fade"
        transparent
        onRequestClose={() => setMenuVisible(false)}
      >
        <TouchableOpacity
          style={s.kebabModalBg}
          activeOpacity={1}
          onPress={() => setMenuVisible(false)}
        >
          <View style={s.kebabCard}>
            <TouchableOpacity
              style={s.kebabRow}
              activeOpacity={0.7}
              onPress={() => {
                const reg = menuRegister;
                setMenuVisible(false);
                if (!reg) return;
                navigation.navigate('POSConfigSessions', { configId: reg.id, configName: reg.name });
              }}
            >
              <MaterialIcons name="history" size={18} color="#374151" />
              <Text style={s.kebabRowText}>Sessions</Text>
            </TouchableOpacity>
            <View style={s.kebabDivider} />
            <TouchableOpacity
              style={s.kebabRow}
              activeOpacity={0.7}
              onPress={() => {
                const reg = menuRegister;
                setMenuVisible(false);
                if (!reg) return;
                navigation.navigate('MyOrdersScreen', { configId: reg.id, configName: reg.name });
              }}
            >
              <MaterialIcons name="receipt-long" size={18} color="#374151" />
              <Text style={s.kebabRowText}>Orders</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Continue Selling choice — opens when the cashier taps Continue
          Selling on an open-session card. Two rows: New Order (clears the
          cart and enters TakeoutDelivery fresh) and Existing Order (opens
          this session's drafts in MyOrdersScreen). */}
      <Modal
        visible={continueModalVisible}
        animationType="fade"
        transparent
        onRequestClose={() => setContinueModalVisible(false)}
      >
        <View style={s.continueBg}>
          <View style={s.continueCard}>
            <View style={s.continueIconDisk}>
              <MaterialIcons name="storefront" size={28} color="#7c3aed" />
            </View>
            <Text style={s.continueTitle}>Continue Selling</Text>
            <Text style={s.continueSub} numberOfLines={1}>
              {continueTargetSession?.config_id?.[1] || continueTargetSession?.name || 'Register'}
            </Text>

            <TouchableOpacity
              onPress={handleStartNewOrder}
              style={[s.continueChoiceBtn, s.continueChoicePrimary]}
              activeOpacity={0.85}
            >
              <MaterialIcons name="add-shopping-cart" size={22} color="#fff" />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={s.continueChoicePrimaryText}>New Order</Text>
                <Text style={s.continueChoicePrimarySub}>Open a clean register</Text>
              </View>
              <MaterialIcons name="chevron-right" size={22} color="#fff" />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleResumeExistingOrder}
              style={[s.continueChoiceBtn, s.continueChoiceGhost]}
              activeOpacity={0.85}
            >
              <MaterialIcons name="history" size={22} color="#7c3aed" />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={s.continueChoiceGhostText}>Existing Order</Text>
                <Text style={s.continueChoiceGhostSub}>Resume a draft from this session</Text>
              </View>
              <MaterialIcons name="chevron-right" size={22} color="#7c3aed" />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setContinueModalVisible(false)}
              style={s.continueCancelBtn}
              activeOpacity={0.85}
            >
              <Text style={s.continueCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Opening Control modal — Odoo-style cash + note prompt */}
      <Modal
        visible={openingModalVisible}
        animationType="fade"
        transparent
        onRequestClose={() => !openingSubmitting && setOpeningModalVisible(false)}
      >
        <View style={s.opModalBg}>
          <View style={s.opModalCard}>
            {/* Navy hero header */}
            <View style={s.opHero}>
              <View style={s.opHeroIconDisk}>
                <MaterialCommunityIcons name="cash-register" size={26} color="#fff" />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={s.opHeroTitle}>Opening Control</Text>
                <Text style={s.opHeroSub} numberOfLines={1}>
                  {openingTarget?.name || 'Register'}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => !openingSubmitting && setOpeningModalVisible(false)}
                style={s.opCloseBtn}
                disabled={openingSubmitting}
              >
                <MaterialIcons name="close" size={18} color="#fff" />
              </TouchableOpacity>
            </View>

            {/* Body */}
            <View style={s.opBody}>
              {/* Opening cash */}
              <Text style={s.opLabel}>Opening cash</Text>
              <View style={s.opCashField}>
                <View style={s.opCashIcon}>
                  <MaterialCommunityIcons name="cash-multiple" size={20} color="#F47B20" />
                </View>
                <TextInput
                  style={s.opCashInput}
                  placeholder="0.00"
                  placeholderTextColor="#cbd5e1"
                  keyboardType="numeric"
                  value={openingCash}
                  onChangeText={(v) => setOpeningCash(v.replace(/[^0-9.]/g, ''))}
                  editable={!openingSubmitting}
                />
                {openingCash ? (
                  <TouchableOpacity
                    onPress={() => setOpeningCash('')}
                    style={s.opClearBtn}
                    disabled={openingSubmitting}
                  >
                    <MaterialIcons name="close" size={14} color="#dc2626" />
                  </TouchableOpacity>
                ) : null}
              </View>
              <Text style={s.opHelpText}>Cash currently in the drawer.</Text>

              {/* Note */}
              <Text style={[s.opLabel, { marginTop: 16 }]}>Opening note</Text>
              <TextInput
                style={s.opNoteInput}
                placeholder="Add an opening note (optional)…"
                placeholderTextColor="#9ca3af"
                value={openingNote}
                onChangeText={setOpeningNote}
                multiline
                editable={!openingSubmitting}
              />

              {/* Actions */}
              <View style={s.opActions}>
                <TouchableOpacity
                  onPress={() => !openingSubmitting && setOpeningModalVisible(false)}
                  style={[s.opBtn, s.opBtnGhost]}
                  disabled={openingSubmitting}
                  activeOpacity={0.85}
                >
                  <Text style={s.opBtnGhostText}>Discard</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={confirmOpenRegister}
                  style={[s.opBtn, s.opBtnPrimary, openingSubmitting && { opacity: 0.6 }]}
                  disabled={openingSubmitting}
                  activeOpacity={0.85}
                >
                  <View style={s.opBtnGloss} />
                  <View style={s.opBtnInner}>
                    {openingSubmitting ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <>
                        <MaterialIcons name="lock-open" size={18} color="#fff" />
                        <Text style={s.opBtnPrimaryText}>Open Register</Text>
                      </>
                    )}
                  </View>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const CARD_RADIUS = 18;

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f2f8' },
  logoWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -30,
    marginBottom: -40,
  },
  logoGlow: {
    position: 'absolute',
    width: 340,
    height: 160,
    borderRadius: 80,
    backgroundColor: 'rgba(255,255,255,0.45)',
  },
  logoImage: {
    width: 260,
    height: 260,
    resizeMode: 'contain',
  },
  listContent: { paddingHorizontal: 16, paddingTop: 6, paddingBottom: 32 },

  // 3D Card wrapper
  card3dWrapper: {
    marginBottom: 18,
    borderRadius: CARD_RADIUS,
    backgroundColor: '#fff',
    ...Platform.select({
      ios: {
        shadowColor: '#1a1a2e',
        shadowOpacity: 0.18,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 10 },
      },
      android: { elevation: 12 },
    }),
  },

  // Top accent bars
  accentBarGreen: {
    height: 5,
    borderTopLeftRadius: CARD_RADIUS,
    borderTopRightRadius: CARD_RADIUS,
    backgroundColor: '#27ae60',
  },
  accentBarBlue: {
    height: 5,
    borderTopLeftRadius: CARD_RADIUS,
    borderTopRightRadius: CARD_RADIUS,
    backgroundColor: '#2E294E',
  },

  cardInner: { padding: 18 },

  // Header
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: '#f0fdf4',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#bbf7d0',
    overflow: 'hidden',
  },
  iconCircleBlue: { backgroundColor: '#eeecf5', borderColor: '#c4b5fd' },
  logoImg: { width: 46, height: 46, borderRadius: 12, resizeMode: 'contain' },
  cardTitle: { fontSize: 19, fontWeight: '800', color: '#1a1a2e', letterSpacing: 0.3 },
  cardMeta: { fontSize: 12, color: '#8896ab', marginTop: 2, fontWeight: '500' },

  // Status badges
  statusBadgeActive: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ecfdf5',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#a7f3d0',
  },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#22c55e', marginRight: 6 },
  statusText: { fontSize: 12, fontWeight: '700', color: '#16a34a' },
  statusBadgeIdle: {
    backgroundColor: '#eeecf5',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#c4b5fd',
  },
  statusTextIdle: { fontSize: 12, fontWeight: '700', color: '#7c3aed' },

  // Separator
  separator: { height: 1, backgroundColor: '#e8ecf4', marginVertical: 14 },

  // Info grid
  infoGrid: { gap: 10 },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8f9fc',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  infoIcon: { fontSize: 22, marginRight: 12 },
  infoLabel: {
    fontSize: 11,
    color: '#8896ab',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  infoValue: { fontSize: 15, color: '#1a1a2e', fontWeight: '700', marginTop: 1 },
  amountValue: { color: '#F47B20', fontSize: 17 },

  // Register description
  registerDesc: { fontSize: 14, color: '#6b7a90', lineHeight: 20, marginBottom: 16 },

  // Action buttons
  actionRow: { flexDirection: 'row', marginTop: 16, gap: 10 },
  btnContinue: {
    flex: 2,
    backgroundColor: '#2E294E',
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: { shadowColor: '#2E294E', shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
      android: { elevation: 6 },
    }),
  },
  btnContinueText: { color: '#fff', fontSize: 16, fontWeight: '800', letterSpacing: 0.3 },
  btnClose: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#e74c3c',
  },
  btnCloseText: { color: '#e74c3c', fontSize: 16, fontWeight: '800' },
  btnOpen: {
    backgroundColor: '#F47B20',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: { shadowColor: '#F47B20', shadowOpacity: 0.35, shadowRadius: 10, shadowOffset: { width: 0, height: 5 } },
      android: { elevation: 8 },
    }),
  },
  btnOpenText: { color: '#fff', fontSize: 17, fontWeight: '800', letterSpacing: 0.5 },

  // Section headers
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginTop: 14,
    marginBottom: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#2E294E',
    borderRadius: 12,
    zIndex: 20,
    ...Platform.select({
      ios: { shadowColor: '#2E294E', shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
      android: { elevation: 6 },
    }),
  },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: '#fff', letterSpacing: 0.5 },
  countBadge: {
    backgroundColor: '#F47B20',
    borderRadius: 10,
    paddingVertical: 3,
    paddingHorizontal: 10,
    marginLeft: 10,
  },
  countBadgeText: { color: '#fff', fontSize: 12, fontWeight: '800' },

  // Loader
  loaderWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loaderText: { marginTop: 12, fontSize: 15, color: '#8896ab', fontWeight: '600' },

  // Error
  errorWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 },
  errorIcon: { fontSize: 48, marginBottom: 12 },
  errorText: { fontSize: 16, color: '#e74c3c', fontWeight: '700', textAlign: 'center', marginBottom: 20 },
  retryBtn: {
    backgroundColor: '#2E294E',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 40,
    ...Platform.select({
      ios: { shadowColor: '#2E294E', shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
      android: { elevation: 6 },
    }),
  },
  retryBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },

  // Empty
  emptyWrap: { alignItems: 'center', paddingVertical: 60 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyText: { fontSize: 16, color: '#8896ab', fontWeight: '600' },

  // Close Register confirmation alert (LogoutModal-style)
  alertBg: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center', alignItems: 'center', padding: 18,
  },
  alertCard: {
    width: '100%', maxWidth: 380,
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#2E294E',
    paddingVertical: 22,
    paddingHorizontal: 18,
    alignItems: 'center',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 18, shadowOffset: { width: 0, height: 8 } },
      android: { elevation: 14 },
    }),
  },
  alertIconDisk: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: '#fee2e2',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 12,
  },
  alertTitle: {
    fontSize: 17, fontWeight: '800', color: '#1a1a2e',
    textAlign: 'center', marginBottom: 6,
  },
  alertText: {
    fontSize: 13, color: '#6b7280',
    textAlign: 'center', lineHeight: 18,
    marginBottom: 18, paddingHorizontal: 4,
  },
  alertBtnRow: { flexDirection: 'row', gap: 10, alignSelf: 'stretch' },
  alertBtn: {
    flex: 1, paddingVertical: 14, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  alertBtnGhost: { backgroundColor: '#f3f4f6' },
  alertBtnGhostText: { color: '#374151', fontWeight: '800', fontSize: 13, letterSpacing: 0.4 },
  alertBtnDanger: {
    backgroundColor: '#dc2626',
    ...Platform.select({
      ios: { shadowColor: '#dc2626', shadowOpacity: 0.32, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
      android: { elevation: 5 },
    }),
  },
  alertBtnDangerText: { color: '#fff', fontWeight: '800', fontSize: 13, letterSpacing: 0.4 },

  // Opening Control modal — polished
  opModalBg: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center', alignItems: 'center', padding: 16,
  },
  opModalCard: {
    width: '100%', maxWidth: 480,
    backgroundColor: '#fff', borderRadius: 18, overflow: 'hidden',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 18, shadowOffset: { width: 0, height: 8 } },
      android: { elevation: 12 },
    }),
  },
  // Hero — navy header band
  opHero: {
    backgroundColor: '#2E294E',
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14,
  },
  opHeroIconDisk: {
    width: 44, height: 44, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center', justifyContent: 'center',
  },
  opHeroTitle: { fontSize: 16, fontWeight: '800', color: '#fff', letterSpacing: 0.3 },
  opHeroSub: { fontSize: 12, color: 'rgba(255,255,255,0.7)', fontWeight: '600', marginTop: 2 },
  opCloseBtn: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center', justifyContent: 'center',
  },
  // Body
  opBody: { padding: 18 },
  opLabel: {
    fontSize: 11, fontWeight: '700', color: '#8896ab',
    textTransform: 'uppercase', letterSpacing: 0.5,
    marginBottom: 6,
  },
  // Cash input — big, with orange icon prefix
  opCashField: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#f8f9fc',
    borderWidth: 1, borderColor: '#eef0f5',
    borderRadius: 14,
    paddingHorizontal: 12, paddingVertical: 10,
  },
  opCashIcon: {
    width: 38, height: 38, borderRadius: 11,
    backgroundColor: '#fff7ed',
    alignItems: 'center', justifyContent: 'center',
    marginRight: 10,
  },
  opCashInput: {
    flex: 1,
    fontSize: 24, fontWeight: '800',
    color: '#1a1a2e',
    paddingVertical: 4,
  },
  opClearBtn: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: '#fee2e2',
    alignItems: 'center', justifyContent: 'center',
    marginLeft: 6,
  },
  opHelpText: {
    fontSize: 11, color: '#8896ab', fontWeight: '500',
    marginTop: 6, marginLeft: 4,
  },
  // Note
  opNoteInput: {
    minHeight: 80, textAlignVertical: 'top',
    borderWidth: 1, borderColor: '#eef0f5', borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 14, color: '#1a1a2e',
    backgroundColor: '#f8f9fc',
  },
  // Actions
  opActions: { flexDirection: 'row', gap: 10, marginTop: 18 },
  opBtn: {
    flex: 1, paddingVertical: 14, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
  },
  opBtnGhost: { backgroundColor: '#f3f4f6' },
  opBtnGhostText: { color: '#6b7280', fontWeight: '800', fontSize: 14 },
  opBtnPrimary: {
    backgroundColor: '#F47B20',
    ...Platform.select({
      ios: { shadowColor: '#F47B20', shadowOpacity: 0.35, shadowRadius: 12, shadowOffset: { width: 0, height: 5 } },
      android: { elevation: 7 },
    }),
  },
  opBtnGloss: {
    position: 'absolute', top: 0, left: 0, right: 0, height: '50%',
    backgroundColor: '#ff8f3a', opacity: 0.55,
  },
  opBtnInner: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  opBtnPrimaryText: { color: '#fff', fontWeight: '800', fontSize: 14, letterSpacing: 0.3, marginLeft: 6 },

  // ── Closing Register modal — mirrors the Odoo Web POS dialog ─────────────
  closeModalBg: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center', justifyContent: 'center', padding: 16,
  },
  closeModalCard: {
    width: '100%', maxWidth: 520, backgroundColor: '#fff',
    borderRadius: 14, paddingVertical: 18, paddingHorizontal: 18,
    maxHeight: '92%',
  },
  closeHeaderRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderBottomWidth: 1, borderBottomColor: '#e5e7eb',
    paddingBottom: 12, marginBottom: 6,
  },
  closeTitle: { fontSize: 18, fontWeight: '800', color: '#111' },
  closeOrders: { fontSize: 13, fontWeight: '700', color: '#111' },
  closeLoadingWrap: { paddingVertical: 40, alignItems: 'center' },
  closeLoadingText: { marginTop: 10, color: '#6b7280', fontSize: 13 },

  methodSection: {
    paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: '#e5e7eb',
  },
  methodHeaderRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 4,
  },
  methodName: { fontSize: 16, fontWeight: '700', color: '#111' },
  methodAmount: { fontSize: 15, fontWeight: '700', color: '#111' },

  closeRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 4, paddingLeft: 12,
  },
  closeRowLabel: { fontSize: 13, color: '#6b7280' },
  closeRowValue: { fontSize: 13, color: '#111' },
  closeRowRed: { color: '#dc2626', fontWeight: '700' },
  closeRowInput: {
    minWidth: 100, paddingHorizontal: 8, paddingVertical: 4,
    borderBottomWidth: 1, borderBottomColor: '#cbd5e1',
    fontSize: 13, color: '#111', textAlign: 'right',
  },

  closeFieldLabel: {
    marginTop: 14, marginBottom: 6, fontSize: 13, fontWeight: '600', color: '#111',
  },
  cashCountRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
  },
  cashCountInputWrap: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8,
    paddingHorizontal: 12,
  },
  cashCountInput: {
    flex: 1, paddingVertical: 10, fontSize: 14, color: '#111',
  },
  cashCountClearBtn: {
    width: 22, height: 22, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#f1f5f9',
  },
  cashCountIconBtn: {
    width: 38, height: 38, borderRadius: 8,
    borderWidth: 1, borderColor: '#cbd5e1',
    backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
  },

  // ── Coins/Notes popup ────────────────────────────────────────────────────
  coinsModalBg: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center', justifyContent: 'center', padding: 16,
  },
  coinsModalCard: {
    width: '100%', maxWidth: 460, backgroundColor: '#fff',
    borderRadius: 14, paddingVertical: 16, paddingHorizontal: 16,
    maxHeight: '92%',
  },
  coinsHeaderRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderBottomWidth: 1, borderBottomColor: '#e5e7eb',
    paddingBottom: 10, marginBottom: 8,
  },
  coinsTitle: { fontSize: 16, fontWeight: '800', color: '#111' },
  coinsGrid: {
    flexDirection: 'row', flexWrap: 'wrap',
    paddingVertical: 4,
  },
  coinRow: {
    flexDirection: 'row', alignItems: 'center',
    width: '50%',
    paddingVertical: 6, paddingHorizontal: 4,
  },
  coinStepBtn: {
    width: 28, height: 28, borderRadius: 6,
    borderWidth: 1, borderColor: '#cbd5e1',
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#fff',
  },
  coinQtyInput: {
    width: 50, height: 30, marginHorizontal: 4,
    borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 6,
    paddingVertical: 0, paddingHorizontal: 4,
    fontSize: 13, color: '#111',
  },
  coinDenomLabel: {
    flex: 1, marginLeft: 8, fontSize: 13, color: '#111', fontWeight: '600',
  },
  coinsFooterRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: 12, paddingTop: 10,
    borderTopWidth: 1, borderTopColor: '#e5e7eb',
  },
  coinsConfirmBtn: {
    paddingVertical: 10, paddingHorizontal: 20,
    backgroundColor: '#7c3aed', borderRadius: 8,
  },
  coinsConfirmText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  coinsTotalText: { fontSize: 14, fontWeight: '700', color: '#111' },
  closingNoteInput: {
    borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8,
    paddingVertical: 10, paddingHorizontal: 12, fontSize: 13, color: '#111',
    textAlignVertical: 'top', minHeight: 64,
  },

  closeFooterRow: {
    flexDirection: 'row', gap: 10,
    marginTop: 16, paddingTop: 12,
    borderTopWidth: 1, borderTopColor: '#e5e7eb',
  },
  closeRegisterBtn: {
    flex: 1,
    backgroundColor: '#7c3aed',
    paddingVertical: 12, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
  },
  closeRegisterText: { color: '#fff', fontWeight: '700', fontSize: 14, letterSpacing: 0.3 },
  discardBtn: {
    flex: 1,
    backgroundColor: '#fff',
    borderWidth: 1, borderColor: '#cbd5e1',
    paddingVertical: 12, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
  },
  discardText: { color: '#374151', fontWeight: '700', fontSize: 14 },
  dailySaleBtn: {
    flexDirection: 'row', gap: 6,
    flex: 1,
    backgroundColor: '#fff',
    borderWidth: 1, borderColor: '#cbd5e1',
    paddingVertical: 12, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
  },
  dailySaleText: { color: '#374151', fontWeight: '700', fontSize: 14 },

  // Kebab popover (3-dots → Sessions / Orders shortcuts) ───────────────────
  kebabBtn: {
    marginLeft: 6,
    padding: 4,
    borderRadius: 6,
  },
  kebabModalBg: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center', justifyContent: 'center',
    padding: 16,
  },
  kebabCard: {
    width: '70%', maxWidth: 280,
    backgroundColor: '#fff', borderRadius: 10,
    paddingVertical: 6,
    borderWidth: 1, borderColor: '#e5e7eb',
    shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  kebabRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, paddingHorizontal: 16,
  },
  kebabRowText: { fontSize: 14, fontWeight: '600', color: '#111' },
  kebabDivider: { height: 1, backgroundColor: '#e5e7eb', marginHorizontal: 12 },

  // Negative ongoing total (refund-net session) — used in the open-session
  // card's Ongoing value to flag a red total.
  amountNegative: { color: '#dc2626' },

  // ── Continue Selling popup ──────────────────────────────────────────────
  continueBg: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center', justifyContent: 'center', padding: 18,
  },
  continueCard: {
    width: '100%', maxWidth: 420,
    backgroundColor: '#fff', borderRadius: 16,
    paddingVertical: 22, paddingHorizontal: 20,
    alignItems: 'stretch',
  },
  continueIconDisk: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: '#f3e8ff',
    alignItems: 'center', justifyContent: 'center',
    alignSelf: 'center', marginBottom: 12,
  },
  continueTitle: {
    fontSize: 17, fontWeight: '800', color: '#1a1a2e',
    textAlign: 'center',
  },
  continueSub: {
    marginTop: 2, marginBottom: 16,
    fontSize: 13, color: '#6b7280', textAlign: 'center',
  },
  continueChoiceBtn: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 14, paddingHorizontal: 14,
    borderRadius: 12,
    marginBottom: 10,
  },
  continueChoicePrimary: {
    backgroundColor: '#7c3aed',
  },
  continueChoicePrimaryText: {
    color: '#fff', fontWeight: '800', fontSize: 14,
  },
  continueChoicePrimarySub: {
    color: 'rgba(255,255,255,0.85)', fontSize: 11, marginTop: 2,
  },
  continueChoiceGhost: {
    backgroundColor: '#faf5ff',
    borderWidth: 1, borderColor: '#e9d5ff',
  },
  continueChoiceGhostText: {
    color: '#581c87', fontWeight: '800', fontSize: 14,
  },
  continueChoiceGhostSub: {
    color: '#6b7280', fontSize: 11, marginTop: 2,
  },
  continueCancelBtn: {
    marginTop: 6, paddingVertical: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  continueCancelText: {
    color: '#6b7280', fontWeight: '700', fontSize: 13,
  },
});

export default POSRegister;
