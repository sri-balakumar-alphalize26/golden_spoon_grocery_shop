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
} from 'react-native';
import { SafeAreaView } from '@components/containers';
import { NavigationHeader } from '@components/Header';
import {
  fetchPOSRegisters,
  fetchPOSSessions,
  createPOSSesionOdoo,
  closePOSSesionOdoo,
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

  const handleOpenRegisterSession = async (register) => {
    console.log('[POSRegister] Open Register tapped', { id: register?.id, name: register?.name });
    setLoading(true);
    try {
      const user = useAuthStore.getState().user;
      const userId = user?.uid || user?.id || null;
      console.log('[POSRegister] opening session as user', { userId });

      const resp = await createPOSSesionOdoo({ configId: register.id, userId });
      console.log('[POSRegister] createPOSSesionOdoo response:', resp);

      if (resp && resp.error) {
        const msg = resp.error.message || resp.error.data?.message || 'Failed to open register';
        console.error('[POSRegister] open register error:', msg);
        Alert.alert('Odoo Error', msg);
      } else {
        const sessionLabel = resp.sessionId ? `Session ID: ${resp.sessionId}` : 'Session opened';
        Alert.alert('Register Opened', sessionLabel);
        const sessions = await fetchPOSSessions({ state: 'opened' });
        setOpenSessions(Array.isArray(sessions) ? sessions : []);
      }
    } catch (err) {
      console.error('[POSRegister] open register exception:', err);
      Alert.alert('Error', err?.message || 'Failed to open register');
    } finally {
      setLoading(false);
    }
  };

  const handleCloseRegisterSession = async (sessionId) => {
    Alert.alert(
      'Close Register',
      'Are you sure you want to close this register?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Close',
          style: 'destructive',
          onPress: async () => {
            console.log('[POSRegister] Close Register confirmed', { sessionId });
            setLoading(true);
            try {
              const resp = await closePOSSesionOdoo({ sessionId });
              console.log('[POSRegister] closePOSSesionOdoo response:', resp);
              if (resp && resp.error) {
                const msg = resp.error.data?.message || resp.error.message || 'Failed to close register';
                console.error('[POSRegister] close register error:', msg);
                Alert.alert('Odoo Error', msg);
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
          },
        },
      ]
    );
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
                      currency || { symbol: '$', position: 'before' }
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
});

export default POSRegister;
