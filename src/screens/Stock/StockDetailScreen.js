import React, { useEffect, useState } from 'react';
import {
  View,
  Image,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from '@components/containers';
import { MaterialIcons } from '@expo/vector-icons';
import Text from '@components/Text';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import { fetchProductStockDetailOdoo } from '@api/services/generalApi';
import Toast from 'react-native-toast-message';

const NAVY = COLORS.primaryThemeColor;
const ORANGE = '#F47B20';
const MUTED = '#8896ab';

const stateOf = (qty) => {
  if (qty <= 0) return { bg: '#FEE2E2', fg: '#B91C1C', label: 'Out of stock' };
  if (qty <= 5) return { bg: '#FEF3C7', fg: '#92400E', label: 'Low stock' };
  return { bg: '#DCFCE7', fg: '#166534', label: 'In stock' };
};

const formatDate = (s) => {
  if (!s) return '—';
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleString('en-US', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const StockDetailScreen = ({ navigation, route }) => {
  const { productId } = route?.params || {};
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    if (!productId) {
      setLoading(false);
      return;
    }
    fetchProductStockDetailOdoo(productId)
      .then((res) => {
        if (!alive) return;
        if (res?.error) {
          Toast.show({ type: 'error', text1: 'Failed to load stock', position: 'bottom' });
          return;
        }
        setData(res);
      })
      .catch(() => {
        Toast.show({ type: 'error', text1: 'Failed to load stock', position: 'bottom' });
      })
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [productId]);

  if (loading) {
    return (
      <SafeAreaView backgroundColor="#F5F6FA">
        <StatusBar barStyle="light-content" backgroundColor={NAVY} />
        <View style={s.topBar}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={s.backBtn}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <MaterialIcons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={s.topTitle}>Stock</Text>
          <View style={{ width: 36 }} />
        </View>
        <View style={s.center}>
          <ActivityIndicator size="large" color={NAVY} />
        </View>
      </SafeAreaView>
    );
  }

  if (!data || !data.product) {
    return (
      <SafeAreaView backgroundColor="#F5F6FA">
        <StatusBar barStyle="light-content" backgroundColor={NAVY} />
        <View style={s.topBar}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
            <MaterialIcons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={s.topTitle}>Stock</Text>
          <View style={{ width: 36 }} />
        </View>
        <View style={s.center}>
          <Text style={{ color: MUTED }}>Product not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  const { product, quants, lastMove } = data;
  const badge = stateOf(product.qty_available);
  const showForecast = product.virtual_available !== null && product.virtual_available !== product.qty_available;

  return (
    <SafeAreaView backgroundColor="#F5F6FA">
      <StatusBar barStyle="light-content" backgroundColor={NAVY} />

      <View style={s.topBar}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={s.backBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <MaterialIcons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={s.topTitle} numberOfLines={1}>{product.name || 'Stock'}</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 14, paddingBottom: 30 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero card */}
        <View style={s.heroCard}>
          <View style={s.heroRow}>
            {product.image_url && !imgFailed ? (
              <Image
                source={{ uri: product.image_url }}
                style={s.heroImg}
                onError={() => setImgFailed(true)}
              />
            ) : (
              <View style={[s.heroImg, { alignItems: 'center', justifyContent: 'center', backgroundColor: '#eef0f5' }]}>
                <MaterialIcons name="inventory-2" size={36} color={NAVY} />
              </View>
            )}
            <View style={{ flex: 1, marginLeft: 14 }}>
              <Text style={s.productName} numberOfLines={2}>{product.name || '—'}</Text>
              {product.default_code ? <Text style={s.productCode}>{product.default_code}</Text> : null}
              <View style={[s.statePill, { backgroundColor: badge.bg, marginTop: 6 }]}>
                <Text style={[s.statePillText, { color: badge.fg }]}>{badge.label}</Text>
              </View>
            </View>
          </View>

          <View style={s.divider} />

          <View style={s.qtyRow}>
            <View style={s.qtyCell}>
              <Text style={s.qtyLabel}>ON HAND</Text>
              <Text style={[s.qtyBig, { color: badge.fg }]}>
                {product.qty_available} <Text style={s.qtyUom}>{product.uom?.name || ''}</Text>
              </Text>
            </View>
            {showForecast ? (
              <View style={s.qtyCell}>
                <Text style={s.qtyLabel}>FORECAST</Text>
                <Text style={s.qtyBig}>
                  {product.virtual_available} <Text style={s.qtyUom}>{product.uom?.name || ''}</Text>
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* Locations */}
        <Text style={s.sectionTitle}>Locations</Text>
        <View style={s.card}>
          {quants && quants.length > 0 ? (
            quants.map((q, idx) => (
              <View
                key={String(q.id)}
                style={[s.quantRow, idx === quants.length - 1 && { borderBottomWidth: 0 }]}
              >
                <View style={s.iconDisk}>
                  <MaterialIcons name="place" size={18} color={NAVY} />
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={s.quantLocation} numberOfLines={2}>{q.location?.name || '—'}</Text>
                  {q.reserved > 0 ? (
                    <Text style={s.quantReserved}>{q.reserved} reserved · {q.available} available</Text>
                  ) : null}
                </View>
                <Text style={s.quantQty}>{q.quantity}</Text>
              </View>
            ))
          ) : (
            <Text style={s.emptyLine}>Not stored in any location yet.</Text>
          )}
        </View>

        {/* Last movement */}
        {lastMove ? (
          <>
            <Text style={s.sectionTitle}>Last Movement</Text>
            <View style={s.card}>
              <View style={[s.quantRow, { borderBottomWidth: 0 }]}>
                <View style={s.iconDisk}>
                  <MaterialIcons name="swap-horiz" size={18} color={NAVY} />
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={s.quantLocation} numberOfLines={2}>
                    {lastMove.from?.name || '—'} → {lastMove.to?.name || '—'}
                  </Text>
                  <Text style={s.quantReserved}>{formatDate(lastMove.date)}</Text>
                </View>
                <Text style={[s.quantQty, { color: ORANGE }]}>{lastMove.qty}</Text>
              </View>
            </View>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
};

export default StockDetailScreen;

const s = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  topBar: {
    backgroundColor: NAVY,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', justifyContent: 'center',
  },
  topTitle: {
    flex: 1, textAlign: 'center',
    color: '#fff', fontSize: 16,
    fontFamily: FONT_FAMILY.urbanistBold, letterSpacing: 0.4,
  },

  heroCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
    ...Platform.select({
      ios: { shadowColor: '#1a1a2e', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
      android: { elevation: 2 },
    }),
  },
  heroRow: { flexDirection: 'row', alignItems: 'flex-start' },
  heroImg: { width: 72, height: 72, borderRadius: 12 },
  productName: { fontSize: 17, color: NAVY, fontFamily: FONT_FAMILY.urbanistBold, letterSpacing: 0.2 },
  productCode: { fontSize: 12, color: MUTED, marginTop: 2, fontFamily: FONT_FAMILY.urbanistMedium },

  statePill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 999,
  },
  statePillText: { fontSize: 11, fontFamily: FONT_FAMILY.urbanistBold, letterSpacing: 0.3 },

  divider: { height: 1, backgroundColor: '#F1F2F6', marginVertical: 12 },

  qtyRow: { flexDirection: 'row', gap: 14 },
  qtyCell: { flex: 1 },
  qtyLabel: { fontSize: 10, color: MUTED, fontFamily: FONT_FAMILY.urbanistBold, letterSpacing: 0.6 },
  qtyBig: { fontSize: 24, color: NAVY, fontFamily: FONT_FAMILY.urbanistBold, marginTop: 2 },
  qtyUom: { fontSize: 12, color: MUTED, fontFamily: FONT_FAMILY.urbanistMedium },

  sectionTitle: {
    fontSize: 11, color: MUTED,
    fontFamily: FONT_FAMILY.urbanistBold,
    letterSpacing: 0.6,
    marginLeft: 4, marginBottom: 6,
    textTransform: 'uppercase',
  },

  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 4,
    marginBottom: 14,
    ...Platform.select({
      ios: { shadowColor: '#1a1a2e', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
      android: { elevation: 2 },
    }),
  },
  quantRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#F1F2F6',
  },
  iconDisk: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#eef0f5',
    alignItems: 'center', justifyContent: 'center',
  },
  quantLocation: { fontSize: 14, color: '#1a1a2e', fontFamily: FONT_FAMILY.urbanistBold, letterSpacing: 0.2 },
  quantReserved: { fontSize: 12, color: MUTED, marginTop: 2, fontFamily: FONT_FAMILY.urbanistMedium },
  quantQty: { fontSize: 16, color: NAVY, fontFamily: FONT_FAMILY.urbanistBold, marginLeft: 8 },

  emptyLine: {
    fontSize: 13,
    color: '#9ca3af',
    fontFamily: FONT_FAMILY.urbanistMedium,
    fontStyle: 'italic',
    paddingVertical: 14,
    paddingHorizontal: 4,
    textAlign: 'center',
  },
});
