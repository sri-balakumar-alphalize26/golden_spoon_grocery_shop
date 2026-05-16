// QuickPurchaseReturnDetailScreen — read-only view of a confirmed (or
// draft / cancelled) quick.purchase.return.app record. Shows the header,
// the per-line return quantities, the totals, and the three linked records
// (Vendor Credit Note, Return Picking, Source Vendor Bill).

import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from '@components/containers';
import { NavigationHeader } from '@components/Header';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import { useAuthStore } from '@stores/auth';
import { formatCurrency } from '@utils/currency';
import { showToastMessage } from '@components/Toast';
import {
  fetchQuickReturnDetail,
  draftQuickReturn,
  cancelQuickReturn,
  readCreditNote,
  readReturnPicking,
  readSourceInvoice,
} from '@api/services/quickPurchaseReturnApi';

const NAVY = COLORS.primaryThemeColor;
const RED = '#B91C1C';

const STATE_STYLE = {
  draft: { bg: '#fff7ed', fg: '#b45309', label: 'DRAFT' },
  done: { bg: '#ecfdf5', fg: '#15803d', label: 'DONE' },
  cancelled: { bg: '#fee2e2', fg: '#b91c1c', label: 'CANCELLED' },
};

const fmtDate = (raw) => {
  if (!raw) return '—';
  try {
    const d = new Date(raw);
    if (isNaN(d.getTime())) return String(raw);
    return d.toLocaleDateString();
  } catch (_) { return String(raw); }
};

const QuickPurchaseReturnDetailScreen = ({ navigation, route }) => {
  const id = route?.params?.id;
  const currency = useAuthStore((s) => s.currency);

  const [record, setRecord] = useState(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [linked, setLinked] = useState({ creditNote: null, picking: null, source: null });

  const load = useCallback(async (isRefresh = false) => {
    if (!id) return;
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const rec = await fetchQuickReturnDetail(id);
      setRecord(rec || null);

      // Load linked records in parallel.
      const cnId = Array.isArray(rec?.credit_note_id) ? rec.credit_note_id[0] : null;
      const pkId = Array.isArray(rec?.return_picking_id) ? rec.return_picking_id[0] : null;
      const srcId = Array.isArray(rec?.source_invoice_id) ? rec.source_invoice_id[0] : null;
      const [cn, pk, src] = await Promise.all([
        cnId ? readCreditNote(cnId) : Promise.resolve(null),
        pkId ? readReturnPicking(pkId) : Promise.resolve(null),
        srcId ? readSourceInvoice(srcId) : Promise.resolve(null),
      ]);
      setLinked({ creditNote: cn, picking: pk, source: src });
    } catch (e) {
      console.error('[QuickReturnDetail]', e);
      showToastMessage(e?.message || 'Could not load return');
    } finally {
      if (isRefresh) setRefreshing(false); else setLoading(false);
    }
  }, [id]);

  useFocusEffect(useCallback(() => { load(false); }, [load]));

  const handleResetToDraft = async () => {
    try {
      await draftQuickReturn(id);
      showToastMessage('Reset to draft');
      load(false);
    } catch (e) {
      showToastMessage(e?.message || 'Reset failed');
    }
  };

  const handleCancel = async () => {
    try {
      await cancelQuickReturn(id);
      showToastMessage('Return cancelled');
      load(false);
    } catch (e) {
      showToastMessage(e?.message || 'Cancel failed');
    }
  };

  if (loading && !record) {
    return (
      <SafeAreaView style={styles.container}>
        <NavigationHeader title="Return" onBackPress={() => navigation.goBack()} logo={false} />
        <View style={styles.loaderWrap}>
          <ActivityIndicator size="large" color={RED} />
          <Text style={styles.loaderText}>Loading…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!record) {
    return (
      <SafeAreaView style={styles.container}>
        <NavigationHeader title="Return" onBackPress={() => navigation.goBack()} logo={false} />
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyText}>Return not found.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const state = STATE_STYLE[record.state] || STATE_STYLE.draft;
  const vendor = Array.isArray(record.partner_id) ? record.partner_id[1] : '—';
  const lines = Array.isArray(record.lines) ? record.lines : [];

  return (
    <SafeAreaView style={styles.container}>
      <NavigationHeader title={record.name || 'Return'} onBackPress={() => navigation.goBack()} logo={false} />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 14, paddingBottom: 30 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
      >
        {/* Hero */}
        <View style={styles.heroCard}>
          <View style={styles.heroTopRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.refText}>{record.name || 'New'}</Text>
              <Text style={styles.subText} numberOfLines={1}>{vendor}</Text>
            </View>
            <View style={[styles.statePill, { backgroundColor: state.bg }]}>
              <Text style={[styles.statePillText, { color: state.fg }]}>{state.label}</Text>
            </View>
          </View>
          <View style={styles.heroGrid}>
            <View style={styles.heroCell}>
              <Text style={styles.heroLabel}>RETURN DATE</Text>
              <Text style={styles.heroValue}>{fmtDate(record.date)}</Text>
            </View>
            <View style={styles.heroCell}>
              <Text style={styles.heroLabel}>BILL DATE</Text>
              <Text style={styles.heroValue}>{fmtDate(record.invoice_date)}</Text>
            </View>
          </View>
          <View style={styles.totalsRow}>
            <View style={styles.totalsCell}>
              <Text style={styles.totalsLabel}>Untaxed</Text>
              <Text style={styles.totalsValue}>{formatCurrency(Number(record.amount_untaxed) || 0, currency)}</Text>
            </View>
            <View style={styles.totalsCell}>
              <Text style={styles.totalsLabel}>Taxes</Text>
              <Text style={styles.totalsValue}>{formatCurrency(Number(record.amount_tax) || 0, currency)}</Text>
            </View>
            <View style={[styles.totalsCell, { alignItems: 'flex-end' }]}>
              <Text style={styles.totalsLabel}>Total</Text>
              <Text style={styles.totalsGrand}>{formatCurrency(Number(record.amount_total) || 0, currency)}</Text>
            </View>
          </View>
        </View>

        {/* Lines */}
        <Text style={styles.sectionLabel}>RETURNED ITEMS</Text>
        <View style={styles.linesCard}>
          {lines.length === 0 ? (
            <Text style={styles.lineEmpty}>No lines on this return.</Text>
          ) : lines.map((l) => {
            const prodName = Array.isArray(l.product_id) ? l.product_id[1] : (l.description || '—');
            return (
              <View key={l.id} style={styles.lineRow}>
                <View style={{ flex: 1, marginRight: 10 }}>
                  <Text style={styles.lineProduct} numberOfLines={2}>{prodName}</Text>
                  <Text style={styles.lineMeta}>
                    {`Qty ${l.return_qty || 0}  @  ${formatCurrency(Number(l.price_unit) || 0, currency)}`}
                  </Text>
                </View>
                <Text style={styles.lineTotal}>{formatCurrency(Number(l.total) || 0, currency)}</Text>
              </View>
            );
          })}
        </View>

        {/* Linked records */}
        <Text style={styles.sectionLabel}>LINKED DOCUMENTS</Text>
        <View style={styles.linkedCard}>
          <LinkedRow
            icon="receipt"
            label="Source Vendor Bill"
            value={linked.source?.name || (Array.isArray(record.source_invoice_id) ? record.source_invoice_id[1] : '—')}
            sub={linked.source ? `${linked.source.state || '—'} · ${formatCurrency(Number(linked.source.amount_total) || 0, currency)}` : null}
          />
          <LinkedRow
            icon="undo"
            label="Vendor Credit Note"
            value={linked.creditNote?.name || (Array.isArray(record.credit_note_id) ? record.credit_note_id[1] : '— (not created)')}
            sub={linked.creditNote ? `${linked.creditNote.state || '—'} · ${formatCurrency(Number(linked.creditNote.amount_total) || 0, currency)}` : null}
          />
          <LinkedRow
            icon="local-shipping"
            label="Return Picking"
            value={linked.picking?.name || (Array.isArray(record.return_picking_id) ? record.return_picking_id[1] : '— (not created)')}
            sub={linked.picking ? `${linked.picking.state || '—'} · ${linked.picking.scheduled_date || ''}` : null}
            isLast
          />
        </View>

        {/* Notes */}
        {record.notes ? (
          <>
            <Text style={styles.sectionLabel}>NOTES</Text>
            <View style={styles.notesCard}>
              <Text style={styles.notesText}>{record.notes}</Text>
            </View>
          </>
        ) : null}

        {/* State actions */}
        {record.state === 'cancelled' ? (
          <TouchableOpacity style={[styles.actionBtn, styles.actionBtnGhost]} onPress={handleResetToDraft} activeOpacity={0.85}>
            <MaterialIcons name="refresh" size={18} color={NAVY} />
            <Text style={styles.actionBtnGhostText}>Reset to Draft</Text>
          </TouchableOpacity>
        ) : null}
        {record.state === 'draft' ? (
          <TouchableOpacity style={[styles.actionBtn, styles.actionBtnDanger]} onPress={handleCancel} activeOpacity={0.85}>
            <MaterialIcons name="close" size={18} color="#fff" />
            <Text style={styles.actionBtnDangerText}>Cancel Return</Text>
          </TouchableOpacity>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
};

const LinkedRow = ({ icon, label, value, sub, isLast }) => (
  <View style={[styles.linkedRow, isLast && { borderBottomWidth: 0 }]}>
    <View style={styles.linkedIconWrap}>
      <MaterialIcons name={icon} size={18} color={NAVY} />
    </View>
    <View style={{ flex: 1 }}>
      <Text style={styles.linkedLabel}>{label}</Text>
      <Text style={styles.linkedValue} numberOfLines={1}>{value}</Text>
      {sub ? <Text style={styles.linkedSub} numberOfLines={1}>{sub}</Text> : null}
    </View>
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6' },
  loaderWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loaderText: { marginTop: 10, color: '#6b7280' },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: '#6b7280', fontSize: 13 },

  sectionLabel: {
    fontSize: 11, color: '#6b7280',
    letterSpacing: 0.6, fontWeight: '700',
    marginTop: 14, marginBottom: 8,
  },

  heroCard: {
    backgroundColor: '#fff', borderRadius: 14,
    paddingVertical: 14, paddingHorizontal: 14,
    borderWidth: 1, borderColor: '#e5e7eb',
  },
  heroTopRow: {
    flexDirection: 'row', alignItems: 'center',
    marginBottom: 10,
  },
  refText: { fontSize: 17, fontWeight: '800', color: '#111' },
  subText: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  statePill: { paddingVertical: 5, paddingHorizontal: 12, borderRadius: 999 },
  statePillText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.4 },

  heroGrid: {
    flexDirection: 'row',
    paddingTop: 10, borderTopWidth: 1, borderTopColor: '#f3f4f6',
  },
  heroCell: { flex: 1, paddingHorizontal: 2 },
  heroLabel: { fontSize: 10, color: '#9ca3af', letterSpacing: 0.6, fontWeight: '700' },
  heroValue: { marginTop: 2, fontSize: 12, color: '#111' },

  totalsRow: {
    flexDirection: 'row',
    marginTop: 12, paddingTop: 10,
    borderTopWidth: 1, borderTopColor: '#f3f4f6',
  },
  totalsCell: { flex: 1, paddingHorizontal: 2 },
  totalsLabel: { fontSize: 10, color: '#9ca3af', letterSpacing: 0.6, fontWeight: '700' },
  totalsValue: { marginTop: 2, fontSize: 12, color: '#111', fontWeight: '700' },
  totalsGrand: { marginTop: 2, fontSize: 16, color: NAVY, fontWeight: '800' },

  linesCard: {
    backgroundColor: '#fff', borderRadius: 12,
    paddingHorizontal: 12,
    borderWidth: 1, borderColor: '#e5e7eb',
  },
  lineRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: '#f3f4f6',
  },
  lineProduct: { fontSize: 13, fontWeight: '700', color: '#111' },
  lineMeta: { fontSize: 11, color: '#6b7280', marginTop: 3 },
  lineTotal: { fontSize: 14, fontWeight: '800', color: NAVY },
  lineEmpty: { color: '#6b7280', fontSize: 13, padding: 16, textAlign: 'center' },

  linkedCard: {
    backgroundColor: '#fff', borderRadius: 12,
    paddingHorizontal: 12,
    borderWidth: 1, borderColor: '#e5e7eb',
  },
  linkedRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#f3f4f6',
  },
  linkedIconWrap: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#f1f5f9',
    alignItems: 'center', justifyContent: 'center',
    marginRight: 12,
  },
  linkedLabel: { fontSize: 10, color: '#9ca3af', letterSpacing: 0.6, fontWeight: '700' },
  linkedValue: { marginTop: 2, fontSize: 13, color: '#111', fontWeight: '700' },
  linkedSub: { marginTop: 2, fontSize: 11, color: '#6b7280' },

  notesCard: {
    backgroundColor: '#fff', borderRadius: 12,
    padding: 12,
    borderWidth: 1, borderColor: '#e5e7eb',
  },
  notesText: { fontSize: 13, color: '#111', lineHeight: 19 },

  actionBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 13, borderRadius: 10,
    marginTop: 16,
  },
  actionBtnGhost: {
    backgroundColor: '#fff', borderWidth: 1.5, borderColor: NAVY,
  },
  actionBtnGhostText: { color: NAVY, fontWeight: '800', fontSize: 13, letterSpacing: 0.3 },
  actionBtnDanger: { backgroundColor: RED },
  actionBtnDangerText: { color: '#fff', fontWeight: '800', fontSize: 13, letterSpacing: 0.3 },
});

export default QuickPurchaseReturnDetailScreen;
