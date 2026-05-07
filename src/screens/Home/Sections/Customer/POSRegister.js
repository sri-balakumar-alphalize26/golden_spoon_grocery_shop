import React, { useState, useEffect, useRef } from 'react';
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
} from 'react-native';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView } from '@components/containers';
import { NavigationHeader } from '@components/Header';
import {
  fetchPOSRegisters,
  fetchPOSSessions,
  createPOSSesionOdoo,
  closePOSSesionOdoo,
  fetchDraftPosOrders,
  unlinkPosOrders,
} from '@api/services/generalApi';
import useAuthStore from '@stores/auth/useAuthStore';
import { formatCurrency } from '@utils/currency';

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

  // Close confirmation modal state — shown when user taps "Close" on an active session
  const [closeModalVisible, setCloseModalVisible] = useState(false);
  const [closeTargetId, setCloseTargetId] = useState(null);

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
    } catch (err) {
      console.error('[POSRegister] load error:', err);
      setError('Failed to load POS registers or sessions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRegistersAndSessions();
  }, []);

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
      const sessions = await fetchPOSSessions({ state: 'opened' });
      setOpenSessions(Array.isArray(sessions) ? sessions : []);
    } catch (err) {
      console.error('[POSRegister] open register exception:', err);
      Alert.alert('Error', err?.message || 'Failed to open register');
    } finally {
      setOpeningSubmitting(false);
    }
  };

  // Open the styled "Close Register?" confirmation modal (replaces native Alert).
  const handleCloseRegisterSession = (sessionId) => {
    setCloseTargetId(sessionId);
    setCloseModalVisible(true);
  };

  const confirmCloseRegister = () => {
    const id = closeTargetId;
    setCloseModalVisible(false);
    setCloseTargetId(null);
    if (id) doCloseRegister(id);
  };

  // Tries to close. If Odoo refuses with "still orders in draft state",
  // offers the user a one-tap "Discard X drafts and retry close" path.
  const doCloseRegister = async (sessionId) => {
    console.log('[POSRegister] Close Register confirmed', { sessionId });
    setLoading(true);
    try {
      const resp = await closePOSSesionOdoo({ sessionId });
      console.log('[POSRegister] closePOSSesionOdoo response:', resp);
      if (resp && resp.error) {
        const msg = resp.error.data?.message || resp.error.message || 'Failed to close register';
        console.error('[POSRegister] close register error:', msg);
        const isDraftError = /draft state/i.test(msg) && /Pay or cancel/i.test(msg);
        if (isDraftError) {
          // Offer to discard the drafts and retry
          const drafts = await fetchDraftPosOrders(sessionId);
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
                      setLoading(true);
                      try {
                        const ids = drafts.map((d) => d.id);
                        console.log('[POSRegister] discarding drafts', ids);
                        const r = await unlinkPosOrders(ids);
                        if (r?.error) {
                          Alert.alert('Discard Error', r.error);
                          return;
                        }
                        // Retry close
                        const retryResp = await closePOSSesionOdoo({ sessionId });
                        if (retryResp?.error) {
                          const retryMsg = retryResp.error.data?.message || retryResp.error.message || 'Failed to close register';
                          Alert.alert('Odoo Error', retryMsg);
                          return;
                        }
                        Alert.alert('Register Closed', 'Drafts discarded and session closed.');
                        const sessions = await fetchPOSSessions({ state: 'opened' });
                        setOpenSessions(Array.isArray(sessions) ? sessions : []);
                      } catch (e) {
                        Alert.alert('Error', e?.message || 'Failed to discard drafts');
                      } finally {
                        setLoading(false);
                      }
                    },
                  },
                ]
              : [{ text: 'OK' }]
          );
        } else {
          Alert.alert('Odoo Error', msg);
        }
      } else {
        Alert.alert('Register Closed', 'Session closed successfully');
        const sessions = await fetchPOSSessions({ state: 'opened' });
        setOpenSessions(Array.isArray(sessions) ? sessions : []);
      }
    } catch (err) {
      console.error('[POSRegister] close register exception:', err);
      Alert.alert('Error', err?.message || 'Failed to close register');
    } finally {
      setLoading(false);
    }
  };

  const handleContinueSelling = (session) => {
    navigation.navigate('TakeoutDelivery', {
      sessionId: session.id,
      registerId: session.config_id?.[0],
      registerName: session.name,
      userId: session.user_id?.[0],
      userName: session.user_id?.[1],
      openingAmount: session.cash_register_balance_start || 0,
      presetName: 'Takeaway',
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
                      currency || { symbol: 'ر.ع.', position: 'before' }
                    )
                  : '—'}
              </Text>
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
          <TouchableOpacity
            style={s.btnClose}
            activeOpacity={0.8}
            onPress={() => handleCloseRegisterSession(item.id)}
          >
            <Text style={s.btnCloseText}>Close</Text>
          </TouchableOpacity>
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
        </View>

        {/* Separator */}
        <View style={s.separator} />

        <Text style={s.registerDesc}>Tap below to open this register and start a new session.</Text>

        {/* Action button */}
        <TouchableOpacity
          style={s.btnOpen}
          activeOpacity={0.8}
          onPress={() => handleOpenRegisterSession(item)}
        >
          <Text style={s.btnOpenText}>Open Register</Text>
        </TouchableOpacity>
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

      {/* Close Register confirmation — styled like LogoutModal */}
      <Modal
        visible={closeModalVisible}
        animationType="fade"
        transparent
        onRequestClose={() => setCloseModalVisible(false)}
      >
        <View style={s.alertBg}>
          <View style={s.alertCard}>
            <View style={s.alertIconDisk}>
              <MaterialIcons name="warning-amber" size={28} color="#dc2626" />
            </View>
            <Text style={s.alertTitle}>Close Register?</Text>
            <Text style={s.alertText}>
              This will end the current POS session. Make sure all orders are paid or cancelled before closing.
            </Text>
            <View style={s.alertBtnRow}>
              <TouchableOpacity
                onPress={() => { setCloseModalVisible(false); setCloseTargetId(null); }}
                style={[s.alertBtn, s.alertBtnGhost]}
                activeOpacity={0.85}
              >
                <Text style={s.alertBtnGhostText}>NO</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={confirmCloseRegister}
                style={[s.alertBtn, s.alertBtnDanger]}
                activeOpacity={0.85}
              >
                <Text style={s.alertBtnDangerText}>YES, CLOSE</Text>
              </TouchableOpacity>
            </View>
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
});

export default POSRegister;
