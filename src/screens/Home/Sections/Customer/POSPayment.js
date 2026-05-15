import React, { useState, useEffect } from 'react';
import {
  View, Text, ActivityIndicator, TouchableOpacity, ScrollView, StyleSheet,
  StatusBar, Platform, Dimensions, Alert, Modal, TextInput,
} from 'react-native';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView } from '@components/containers';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import {
  fetchPaymentJournalsOdoo, createAccountPaymentOdoo, fetchPOSSessions,
  createInvoiceOdoo, linkInvoiceToPosOrderOdoo,
  captureAndStoreOrderLocation,
  registerLocationPromise,
  fetchPosConfigPaymentMethods,
  fetchPartnerIdProofOdoo,
  submitPosOrderToOdoo,
} from '@api/services/generalApi';
import { IdProofCards } from '@components/IdProof';
// react-native-modal — used here for the ID-proof popup so it animates
// in like LogoutModal (slide-up + dimmed backdrop) instead of the
// instant fade the built-in `Modal` gives us.
import RNModal from 'react-native-modal';
import axios from 'axios';
import { getOdooUrl, getOdooDb } from '@api/config/odooConfig';
import { useProductStore } from '@stores/product';
import { useAuthStore } from '@stores/auth';
import { formatCurrency } from '@utils/currency';
import Toast from 'react-native-toast-message';

// The default export from odooConfig is an empty string (runtime URL is only
// available via getOdooUrl()). Use a helper so every call below hits the
// authenticated host the user logged into.
const odooHeaders = () => {
  const db = getOdooDb();
  return {
    'Content-Type': 'application/json',
    ...(db ? { 'X-Odoo-Database': db } : {}),
  };
};

const NAVY = COLORS.primaryThemeColor;
const NAVY_LIGHT = '#3d3768';
const ORANGE = '#F47B20';

// Render a money value with the Odoo-configured company currency.
const displayNum = (n) => formatCurrency(n);

// Helper to fetch all payment methods from Odoo
const fetchAllPaymentMethods = async () => {
  try {
    const response = await axios.post(`${getOdooUrl()}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'pos.payment.method',
        method: 'search_read',
        args: [[]],
        kwargs: { fields: ['id', 'name', 'journal_id', 'is_cash_count', 'receivable_account_id', 'split_transactions'], limit: 100 },
      },
    }, { headers: { 'Content-Type': 'application/json' } });
    const methods = response.data?.result || [];
    if (methods.length > 0) {
      console.log('All pos.payment.method records:', methods);
    } else {
      console.log('No pos.payment.method records found');
    }
    return methods;
  } catch (e) {
    console.error('Error fetching all pos.payment.method records:', e);
    return [];
  }
};

// Helper to fetch payment method id for a journal
const fetchPaymentMethodId = async (journalId) => {
  try {
    const response = await axios.post(`${getOdooUrl()}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'pos.payment.method',
        method: 'search_read',
        args: [[['journal_id', '=', journalId]]],
        kwargs: { fields: ['id', 'name', 'journal_id'], limit: 1 },
      },
    }, { headers: { 'Content-Type': 'application/json' } });
    const paymentMethodId = response.data?.result?.[0]?.id;
    if (paymentMethodId) {
      console.log('Fetched payment_method_id for journal', journalId, ':', paymentMethodId);
    } else {
      console.log('No payment_method_id found for journal', journalId);
    }
    return paymentMethodId;
  } catch (e) {
    console.error('Error fetching payment_method_id:', e);
    return null;
  }
};

const POSPayment = ({ navigation, route }) => {
  // Subscribe so the screen re-renders when the currency hydrates / changes.
  useAuthStore((s) => s.currency);
  // Pre-warm the OS location cache on mount so by the time the cashier
  // taps Validate Payment a few seconds later, getLastKnownPositionAsync
  // returns a fresh fix synchronously (no GPS lock delay). Fire-and-
  // forget; permission failures and offline are swallowed.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const Location = require('expo-location');
        const perm = await Location.requestForegroundPermissionsAsync();
        if (cancelled || perm?.status !== 'granted') return;
        await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy?.Low ?? 1,
        });
        console.log('[POSLocation] pre-warm done');
      } catch (e) {
        // Pre-warm is best-effort; suppress.
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const [invoiceChecked, setInvoiceChecked] = useState(false);
  const [amountModalVisible, setAmountModalVisible] = useState(false);
  const [customerModalVisible, setCustomerModalVisible] = useState(false);
  const {
    products = [],
    customer: initialCustomer,
    sessionId,
    registerName,
    totalAmount,
    orderId,
    discountAmount = 0,
  } = route?.params || {};
  const [customer, setCustomer] = useState(initialCustomer);

  // ID-proof verification state for the selected customer. Loaded the
  // moment a customer is picked so the chip can flip from "Add" to
  // "Verified" without an extra fetch round-trip when the cashier taps
  // it. `loaded` flips true after at least one fetch attempt so we can
  // distinguish "still loading" from "definitely missing".
  const [idProof, setIdProof] = useState({ front: null, back: null, loaded: false });
  const [idProofModalVisible, setIdProofModalVisible] = useState(false);

  const openCustomerSelector = () => {
    navigation.navigate('CustomerScreen', {
      selectMode: true,
      onSelect: (selected) => {
        setCustomer(selected);
      },
    });
  };
  const [journals, setJournals] = useState([]);
  const [paymentMode, setPaymentMode] = useState('cash');
  useEffect(() => {
    if (paymentMode === 'account') {
      console.log('Journals available for account payment:', journals);
    }
  }, [paymentMode, journals]);

  // Pull the selected customer's ID-proof binaries the moment they're
  // picked. The chip below the customer card uses these to flip
  // between "ID Proof on file" (green) and "Add ID Proof" (amber).
  useEffect(() => {
    let alive = true;
    const partnerId = customer?.id || customer?._id;
    if (!partnerId) {
      setIdProof({ front: null, back: null, loaded: false });
      return undefined;
    }
    setIdProof({ front: null, back: null, loaded: false });
    fetchPartnerIdProofOdoo(partnerId)
      .then((res) => {
        if (!alive) return;
        setIdProof({
          front: res?.id_proof_front || null,
          back: res?.id_proof_back || null,
          loaded: true,
        });
      })
      .catch(() => {
        if (alive) setIdProof({ front: null, back: null, loaded: true });
      });
    return () => { alive = false; };
  }, [customer?.id, customer?._id]);
  const [selectedJournal, setSelectedJournal] = useState(null);
  const [paying, setPaying] = useState(false);

  // Discount popup state. Two segmented toggles — Type (Total / Items)
  // and Format (Percentage / Amount) — drive the same underlying
  // "computedDiscountAmount" so every downstream calc reads one number.
  // discountType is currently visual-only (both modes ship the same
  // uniform per-line % to Odoo); the toggle is wired so a future
  // per-item-picking flow can drop in without state changes here.
  const [discountModalVisible, setDiscountModalVisible] = useState(false);
  const [discountType, setDiscountType] = useState('total');          // 'total' | 'items'
  const [discountFormat, setDiscountFormat] = useState('percentage'); // 'percentage' | 'amount'
  const [discountPercent, setDiscountPercent] = useState(0);          // 0-100, when format='percentage'
  const [discountAmountValue, setDiscountAmountValue] = useState(0);  // OMR, when format='amount'
  const [customDiscountInput, setCustomDiscountInput] = useState('');
  const { clearProducts } = useProductStore();
  const [inputAmount, setInputAmount] = useState('');

  // Split (partial) payment state — popup with two slots; each slot picks
  // ANY pos.payment.method configured on the active register (cash, card,
  // customer-account/credit, etc.). `splitConfirmed` flips true once the
  // cashier confirms a valid split, gating the orange Validate button.
  const [splitModalVisible, setSplitModalVisible] = useState(false);
  const [splitSlot1, setSplitSlot1] = useState({ methodId: null, amount: '' });
  const [splitSlot2, setSplitSlot2] = useState({ methodId: null, amount: '' });
  const [splitConfirmed, setSplitConfirmed] = useState(false);

  // Active POS config + its configured payment methods. Resolved once on
  // mount so the partial-payment popup can render its method chips before
  // the user taps Validate. Also reused by handlePay so it doesn't have to
  // re-resolve the config from the session list on each pay.
  const [posConfigId, setPosConfigId] = useState(
    route?.params?.registerId || route?.params?.posConfigId || null
  );
  const [posPaymentMethods, setPosPaymentMethods] = useState([]);

  // Map journals to Odoo-style payment modes (cash / card / customer account)
  const getJournalForMode = (mode) => {
    if (!journals || journals.length === 0) return null;
    const byName = (name) => journals.find((j) => j.name && j.name.toLowerCase().includes(name));
    if (mode === 'cash') {
      return journals.find((j) => j.id === 16) || journals.find((j) => j.type === 'cash') || byName('cash') || journals.find((j) => j.type === 'cashbox');
    }
    if (mode === 'card') {
      return journals.find((j) => j.type === 'bank') || byName('card') || byName('visa') || byName('master');
    }
    if (mode === 'account') {
      return journals.find((j) => j.type === 'sale') || journals.find((j) => j.type === 'receivable') || byName('account') || journals[0];
    }
    return null;
  };

  // When payment mode or journals change, automatically pick the corresponding journal
  useEffect(() => {
    const j = getJournalForMode(paymentMode);
    console.log('Mapping result for mode', paymentMode, j);
    setSelectedJournal(j);
  }, [paymentMode, journals]);

  // Resolve posConfigId once on mount: prefer route params, fall back to
  // looking up the session's config_id. Done here (not inside handlePay) so
  // the partial-payment popup can pre-fetch payment-method chips.
  useEffect(() => {
    let mounted = true;
    if (posConfigId || !sessionId) return;
    (async () => {
      try {
        const sessionList = await fetchPOSSessions({ limit: 10, offset: 0, state: '' });
        const session = sessionList.find((s) => s.id === sessionId);
        const cid = session?.config_id
          ? (Array.isArray(session.config_id) ? session.config_id[0] : session.config_id)
          : null;
        if (mounted && cid) setPosConfigId(cid);
      } catch (e) {
        console.warn('Failed to resolve posConfigId from session:', e?.message || e);
      }
    })();
    return () => { mounted = false; };
  }, [sessionId]);

  // Pull pos.payment.method records configured on the active register, so
  // the split-payment popup can render one chip per method.
  useEffect(() => {
    let mounted = true;
    if (!posConfigId) return;
    (async () => {
      try {
        const methods = await fetchPosConfigPaymentMethods(posConfigId);
        if (!mounted) return;
        setPosPaymentMethods(methods || []);
        // Seed the two split slots with the first two methods so the cashier
        // sees sensible defaults the first time the popup opens.
        if (methods && methods.length > 0) {
          setSplitSlot1((s) => (s.methodId ? s : { ...s, methodId: methods[0].id }));
          if (methods.length > 1) {
            setSplitSlot2((s) => (s.methodId ? s : { ...s, methodId: methods[1].id }));
          } else {
            setSplitSlot2((s) => (s.methodId ? s : { ...s, methodId: methods[0].id }));
          }
        }
      } catch (e) {
        console.warn('Failed to load pos.payment.method records:', e?.message || e);
      }
    })();
    return () => { mounted = false; };
  }, [posConfigId]);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const list = await fetchPaymentJournalsOdoo();
        console.log('Fetched journals from Odoo:', list);
        if (mounted) setJournals(list);
      } catch (e) {
        console.warn('Failed to load journals', e?.message || e);
      }
    };
    load();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    console.log('POSPayment params:', route?.params);
  }, []);

  // Subtotal = naive sum of price × qty across cart. The `total`
  // (after discount) is what every downstream calculation reads.
  const subtotal = (products || []).reduce((s, p) => s + ((p.price || 0) * (p.quantity || p.qty || 0)), 0);
  // Only apply the local discount when we're creating a fresh order.
  // If `totalAmount` arrives from a prior screen it's already the
  // authoritative number — don't double-apply.
  const totalIsExternal = totalAmount !== undefined && totalAmount !== null;
  // Resolve the discount amount from whichever format is active.
  // Amount mode is clamped to subtotal so the cashier can't push the
  // total negative.
  const computedDiscountAmount = totalIsExternal
    ? 0
    : discountFormat === 'amount'
      ? Math.min(subtotal, Math.round(Number(discountAmountValue || 0) * 1000) / 1000)
      : Math.round((subtotal * discountPercent / 100) * 1000) / 1000;
  // Effective per-line % we ship to Odoo regardless of which UI format
  // the cashier used. Always derived from the resolved amount so % and
  // amount paths converge.
  const effectiveDiscountPercent = subtotal > 0
    ? Math.round((computedDiscountAmount / subtotal) * 1000000) / 10000  // 4-decimal precision
    : 0;
  const computeTotal = () => {
    if (totalIsExternal) return totalAmount;
    return Math.max(0, subtotal - computedDiscountAmount);
  };
  const paidAmount = parseFloat(inputAmount) || 0;
  const total = computeTotal();
  const remaining = total - paidAmount;

  const handleKeypad = (val) => {
    if (val === 'C') return setInputAmount('');
    if (val === '⌫') return setInputAmount(inputAmount.slice(0, -1));
    if (val === '+10') return setInputAmount((parseFloat(inputAmount) || 0 + 10).toString());
    if (val === '+20') return setInputAmount((parseFloat(inputAmount) || 0 + 20).toString());
    if (val === '+50') return setInputAmount((parseFloat(inputAmount) || 0 + 50).toString());
    if (val === '+/-') {
      if (inputAmount.startsWith('-')) setInputAmount(inputAmount.slice(1));
      else setInputAmount('-' + inputAmount);
      return;
    }
    if (val === '.') {
      if (!inputAmount.includes('.')) setInputAmount(inputAmount + '.');
      return;
    }
    setInputAmount(inputAmount + val);
  };

  const keypadRows = [
    ['1', '2', '3', '+10'],
    ['4', '5', '6', '+20'],
    ['7', '8', '9', '+50'],
    ['+/-', '0', '.', '⌫'],
  ];

  const handlePay = async () => {
    console.log('Customer before payment:', customer);
    console.log('Journal before payment:', selectedJournal);
    setPaying(true);
    try {
      const lines = products.map((p) => ({
        // remoteId is the raw Odoo product id; `p.id` can be a prefixed cart
        // key like 'prod_74' from POSProducts.mapToStoreProduct. Postgres
        // rejects strings here because product_id is INTEGER.
        product_id: p.remoteId || p.id,
        qty: p.quantity,
        price: p.price,
        name: p.name || p.product_name || '',
        // Always ship as a flat per-line percentage — Odoo's
        // pos.order.line.discount is a percent. effectiveDiscountPercent
        // is derived from the resolved amount, so percentage and
        // amount input modes converge to the same payload here.
        discount: effectiveDiscountPercent || 0,
      }));
      const partnerId = customer?.id || customer?._id || null;
      const companyId = 1;

      // posConfigId is resolved on mount (see useEffect above). Re-resolve
      // here only as a fallback in case the mount-time lookup was still in
      // flight or failed.
      let resolvedConfigId = posConfigId || route?.params?.registerId || route?.params?.posConfigId || null;
      if (!resolvedConfigId && sessionId) {
        try {
          const sessionList = await fetchPOSSessions({ limit: 10, offset: 0, state: '' });
          const session = sessionList.find((s) => s.id === sessionId);
          if (session && session.config_id) {
            resolvedConfigId = Array.isArray(session.config_id) ? session.config_id[0] : session.config_id;
          }
          console.log('[POS CONFIG] Fallback-resolved posConfigId:', resolvedConfigId);
        } catch (e) {
          console.warn('Failed to auto-fetch posConfigId from session:', e?.message || e);
        }
      }
      let createdOrderId = orderId || null;
      let invoiceInfo = null;
      let capturedLocation = null;
      let locationPromise = null;
      // NOTE: the order is now submitted atomically inside the payment block
      // via submitPosOrderToOdoo (sync_from_ui on Odoo 18+, create_from_ui on 13-17),
      // which is the only entry point that reliably creates the stock.picking
      // that decrements qty_available. We no longer create a draft order up
      // front and then try to mark it paid — that path bypassed picking
      // creation on several Odoo versions and silently failed to move stock.

      if (paymentMode === 'cash' || paymentMode === 'card' || paymentMode === 'split') {
        try {
          // Resolve the payment method via the active pos.config rather than
          // the previously hard-coded journal id. The cashier-side Odoo POS
          // always picks payment methods from pos.config.payment_method_ids,
          // and each method already carries the correct journal — so this
          // works regardless of how journals are numbered in the user's DB.
          // Reuse the methods cached at mount time when available so we don't
          // hit the JSON-RPC endpoint twice in a row on Validate.
          const posMethods = posPaymentMethods.length > 0
            ? posPaymentMethods
            : await fetchPosConfigPaymentMethods(resolvedConfigId);
          console.log('[PAYMENT] pos.config payment methods:', posMethods);

          const cashMethod = posMethods.find((m) => m.is_cash_count === true);
          const cardMethod = posMethods.find(
            (m) => m.is_cash_count === false && m.split_transactions !== true
          );

          const payments = [];

          if (paymentMode === 'split') {
            // Look up each slot's chosen pos.payment.method by id from the
            // register's configured methods. The chips in the popup were
            // sourced from the same list, so this lookup is just a sanity
            // check — we still guard against missing ids in case the
            // register configuration changed mid-session.
            const slot1Method = posMethods.find((m) => m.id === splitSlot1.methodId);
            const slot2Method = posMethods.find((m) => m.id === splitSlot2.methodId);
            if (!slot1Method || !slot2Method) {
              Toast.show({
                type: 'error',
                text1: 'Payment Error',
                text2: 'A selected payment method is no longer available on this POS register.',
                position: 'bottom',
              });
              return;
            }
            const slot1JournalId = Array.isArray(slot1Method.journal_id) ? slot1Method.journal_id[0] : slot1Method.journal_id;
            const slot2JournalId = Array.isArray(slot2Method.journal_id) ? slot2Method.journal_id[0] : slot2Method.journal_id;
            payments.push({
              amount: parseFloat(splitSlot1.amount) || 0,
              paymentMethodId: slot1Method.id,
              journalId: slot1JournalId,
              paymentMode: 'split',
            });
            payments.push({
              amount: parseFloat(splitSlot2.amount) || 0,
              paymentMethodId: slot2Method.id,
              journalId: slot2JournalId,
              paymentMode: 'split',
            });
            console.log(`🪓 Split payment: ${slot1Method.name} ${payments[0].amount} + ${slot2Method.name} ${payments[1].amount} = ${total}`);
          } else {
            // Single-method (cash or card) — existing flow.
            let method = paymentMode === 'cash' ? cashMethod : cardMethod;
            if (!method && posMethods.length > 0) {
              method = posMethods.find((m) => m.split_transactions !== true) || posMethods[0];
            }
            if (!method) {
              Toast.show({
                type: 'error',
                text1: 'Payment Error',
                text2: 'No payment method is configured on this POS register. Add one in Odoo: Point of Sale → Configuration → Payment Methods.',
                position: 'bottom',
              });
              return;
            }
            const paymentMethodId = method.id;
            const journalId = Array.isArray(method.journal_id) ? method.journal_id[0] : method.journal_id;
            console.log('[PAYMENT] selected method:', { paymentMethodId, journalId, name: method.name });
            if (paymentMode === 'cash') {
              payments.push({ amount: total, paymentMethodId, journalId, paymentMode });
              console.log(`💵 Cash payment: Total=${total}, Received=${paidAmount}, Change=${Math.abs(remaining)}`);
            } else if (paymentMode === 'card') {
              payments.push({ amount: total, paymentMethodId, journalId, paymentMode });
              console.log(`💳 Card payment: Total=${total}`);
            }
          }
          payments.forEach((p, idx) => {
            const type = p.amount > 0 ? 'RECEIVED' : 'CHANGE';
            console.log(`[PAYMENT LOG] #${idx + 1} Type: ${type}, Amount: ${p.amount}, JournalId: ${p.journalId}, PaymentMethodId: ${p.paymentMethodId}`);
          });
          const totalPaymentAmount = payments.reduce((sum, p) => sum + p.amount, 0);
          console.log('💰 Total payment amount:', totalPaymentAmount, 'Order total:', total);
          if (totalPaymentAmount < total) {
            console.log('⚠️ Payment amount does not cover order total. Skipping submit.');
            Toast.show({
              type: 'error',
              text1: 'Payment Error',
              text2: 'Payment amount does not cover the order total',
              position: 'bottom',
            });
            return;
          }

          if (!createdOrderId) {
            // Cashier id comes from the auth store, not route params — older
            // navigate calls didn't reliably pass it, and we don't want this
            // to crash if a future caller forgets. `false` is Odoo's "no
            // user" sentinel, which makes the server fall back to the
            // JSON-RPC session user.
            const authUser = useAuthStore.getState().user;
            const cashierUserId = (authUser && (authUser.id || authUser.uid)) || false;
            const orderUid = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
            const submitResp = await submitPosOrderToOdoo({
              orderUid,
              sessionId,
              posConfigId: resolvedConfigId,
              userId: cashierUserId,
              partnerId,
              lines: lines.map((l) => {
                const lineSubtotal = (typeof l.price_subtotal !== 'undefined' && l.price_subtotal !== null)
                  ? Number(l.price_subtotal)
                  : Number(l.price) * Number(l.qty) * (1 - (Number(l.discount) || 0) / 100);
                return {
                  product_id: l.product_id,
                  qty: l.qty,
                  price_unit: l.price,
                  price_subtotal: lineSubtotal,
                  price_subtotal_incl: lineSubtotal,
                  discount: l.discount || 0,
                  name: l.name,
                };
              }),
              payments: payments.map((p) => ({
                amount: p.amount,
                payment_method_id: p.paymentMethodId,
                name: p.paymentMode || 'payment',
              })),
              amountTotal: total,
              amountPaid: totalPaymentAmount,
              amountReturn: Math.max(0, paidAmount - total),
              toInvoice: invoiceChecked || Boolean(customer && (customer.id || customer._id)),
              companyId,
            });
            if (submitResp?.error) {
              console.error('POS submit error:', submitResp.error);
              Toast.show({
                type: 'error',
                text1: 'Could not submit order',
                text2: submitResp.error?.data?.message || submitResp.error?.message || 'Unknown error',
                position: 'bottom',
              });
              return;
            }
            createdOrderId = submitResp.result;
            console.log('✅ POS Order submitted, id:', createdOrderId);
          } else {
            // A caller pre-created a pos.order via the legacy createPosOrderOdoo
            // path and handed us its id. That path can NOT be completed with
            // submitPosOrderToOdoo (it would create a duplicate), and the
            // legacy payment+write+validate sequence does not generate a
            // stock.picking reliably across Odoo versions — so the order
            // would silently stay in draft with no stock movement. Fail
            // loudly so the upstream caller is forced to migrate (drop the
            // pre-create and let POSPayment own creation).
            console.error(
              '[POSPayment] Refusing to validate a pre-existing orderId. ' +
              'POSPayment must be the sole creator of pos.order via submitPosOrderToOdoo — ' +
              'remove the upstream createPosOrderOdoo call.',
              { createdOrderId }
            );
            Toast.show({
              type: 'error',
              text1: 'Order submit error',
              text2: 'Internal: order was pre-created. Please report this.',
              position: 'bottom',
            });
            return;
          }

          {
            // Fire location capture in the background — the receipt screen
            // doesn't need GPS to render, so don't block invoice creation
            // on the GPS fix. Race for 1.2s so a fresh lastKnown fix lands
            // immediately; otherwise the receipt opens with "Capturing…"
            // and updates when locationPromise eventually settles.
            locationPromise = captureAndStoreOrderLocation(createdOrderId).catch((e) => {
              console.warn('[POSLocation] background capture failed:', e?.message || e);
              return null;
            });
            registerLocationPromise(createdOrderId, locationPromise);
            capturedLocation = await Promise.race([
              locationPromise,
              new Promise((resolve) => setTimeout(() => resolve(null), 1200)),
            ]);

            const shouldCreateInvoice = invoiceChecked || Boolean(customer && (customer.id || customer._id));
              if (shouldCreateInvoice) {
                try {
                  const actualTotal = Math.round(Number(totalAmount) * 1000) / 1000 || 0;
                  console.log('[INVOICE] Creating invoice for POS order', createdOrderId, 'totalAmount:', actualTotal);

                  const grossTotal = (products || []).reduce((sum, p) => sum + (Number(p.price || p.price_unit || 0) * Number(p.quantity || p.qty || 1)), 0);
                  const ratio = grossTotal > 0 ? actualTotal / grossTotal : 1;

                  const invoiceProducts = (products || []).map((p) => ({
                    // Same remoteId fallback as the POS lines builder above —
                    // Odoo rejects 'prod_<n>' as an integer product_id.
                    id: p.remoteId || p.id,
                    name: p.name || p.product_name || '',
                    quantity: Number(p.quantity || p.qty || 1),
                    price: Math.round(Number(p.price || p.price_unit || 0) * ratio * 1000) / 1000,
                  }));

                  const currentTotal = Math.round(invoiceProducts.reduce((sum, p) => sum + (p.price * p.quantity), 0) * 1000000) / 1000000;
                  const diff = actualTotal - currentTotal;
                  console.log('[INVOICE] currentTotal:', currentTotal, 'actualTotal:', actualTotal, 'diff:', diff);
                  if (Math.abs(diff) > 0.0000001 && invoiceProducts.length > 0) {
                    const last = invoiceProducts[invoiceProducts.length - 1];
                    const adjustedPrice = Math.round((last.price + diff / last.quantity) * 1000000) / 1000000;
                    console.log('[INVOICE] Adjusting last item price from', last.price, 'to', adjustedPrice);
                    last.price = adjustedPrice;
                  }
                  const finalTotal = Math.round(invoiceProducts.reduce((sum, p) => sum + (p.price * p.quantity), 0) * 1000000) / 1000000;
                  console.log('[INVOICE] Final invoice total:', finalTotal, 'Expected:', actualTotal, 'Match:', Math.abs(finalTotal - actualTotal) < 0.0001);

                  const invoiceDate = new Date().toISOString().slice(0, 10);
                  const invResp = await createInvoiceOdoo({ partnerId, products: invoiceProducts, invoiceDate, journalId: selectedJournal?.id || null });
                  console.log('[INVOICE] createInvoiceOdoo response:', invResp);
                  if (invResp && invResp.id) {
                    const invoiceId = invResp.id;
                    const invoiceNumber = invResp.invoiceStatus?.name || invResp.name || null;
                    invoiceInfo = { id: invoiceId, number: invoiceNumber };

                    try {
                      await linkInvoiceToPosOrderOdoo({ orderId: createdOrderId, invoiceId, setState: true, state: 'invoiced' });
                      console.log('[INVOICE] Linked invoice', invoiceId, 'to POS order', createdOrderId);
                    } catch (linkErr) {
                      console.warn('[INVOICE] Failed to link invoice to POS order:', linkErr);
                    }

                    try {
                      const totalPaymentAmount2 = (payments || []).reduce((s, p) => s + (p.amount || 0), 0);
                      if (paymentMode === 'split') {
                        // Skip the single-shot account.payment for split mode.
                        // The two pos.payment records on the order already
                        // cover the full amount, and linkInvoiceToPosOrderOdoo
                        // (called above) lets Odoo reconcile them against the
                        // invoice. Posting another account.payment here would
                        // double-count the total on the invoice.
                        console.log('[INVOICE PAYMENT] split mode — relying on pos.payment reconciliation, no extra account.payment posted');
                      } else if (selectedJournal && selectedJournal.id && totalPaymentAmount2 >= total) {
                        try {
                          const payResp = await createAccountPaymentOdoo({ partnerId, journalId: selectedJournal.id, amount: total, invoiceId });
                          console.log('[INVOICE PAYMENT] createAccountPaymentOdoo response:', payResp);
                        } catch (payErr) {
                          console.warn('[INVOICE PAYMENT] Failed to create invoice payment:', payErr);
                        }
                      }
                    } catch (outerPayErr) {
                      console.warn('[INVOICE PAYMENT] Error checking/creating payment:', outerPayErr);
                    }

                    Toast.show({ type: 'success', text1: 'Invoice created', text2: invoiceNumber || `#${invoiceId}`, position: 'bottom' });
                  } else {
                    Toast.show({ type: 'error', text1: 'Invoice Error', text2: 'Invoice creation failed', position: 'bottom' });
                  }
                } catch (invErr) {
                  console.error('[INVOICE] Exception creating invoice:', invErr);
                  Toast.show({ type: 'error', text1: 'Invoice Error', text2: invErr?.message || 'Failed to create invoice', position: 'bottom' });
                }
              }
          }
        } catch (e) {
          console.error('Payment API exception:', e);
          Toast.show({ type: 'error', text1: 'Payment Error', text2: e?.message || 'Failed to create payment', position: 'bottom' });
        }
      }

      // Clear the cart now that the order is paid + validated, so the
      // register screen is empty next time the user navigates back.
      try { clearProducts(); } catch (_) {}

      // Tax is computed server-side by Odoo (account.move.line auto-fills
      // tax_ids from product.taxes_id). The receipt no longer renders a Tax
      // row, so we ship 0 here and the receipt's grand total stays equal to
      // `subtotal + service - discount`.
      const taxAmount = 0;

      navigation.navigate('POSReceiptScreen', {
        orderId: createdOrderId,
        products,
        customer,
        amount: paidAmount,
        totalAmount: total,
        // Prefer the locally computed discount; fall back to the
        // route-level value if this screen was opened mid-flow. Ship
        // the effective percent (derived) so the receipt can label
        // the discount line consistently regardless of format.
        discount: computedDiscountAmount || discountAmount,
        discountPercent: effectiveDiscountPercent,
        subtotal,
        tax: taxAmount,
        invoiceChecked,
        invoice: invoiceInfo,
        sessionId,
        registerName,
        // GPS coordinates + place name. We may already have a fast-path
        // fix (capturedLocation set) or just the in-flight promise — the
        // promise itself is stored in the module registry (keyed by
        // orderId) so navigation params stay serializable.
        capturedLocation,
      });
    } catch (e) {
      Toast.show({ type: 'error', text1: 'POS Error', text2: e?.message || 'Failed to create POS order', position: 'bottom' });
    } finally {
      setPaying(false);
    }
  };

  // Mode → display config (kept inside render to access onPress closures cleanly)
  const renderModeCard = (mode, label, icon, onPress) => {
    const active = paymentMode === mode;
    return (
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.85}
        style={[styles.modeCard, active && styles.modeCardActive]}
      >
        <View style={[styles.modeIconDisk, active && styles.modeIconDiskActive]}>
          <MaterialIcons name={icon} size={22} color={active ? '#fff' : NAVY} />
        </View>
        <Text
          style={[styles.modeLabel, active && styles.modeLabelActive]}
          numberOfLines={1}
        >
          {label}
        </Text>
      </TouchableOpacity>
    );
  };

  const renderKey = (key) => {
    const isQuickAdd = key.startsWith('+') && key !== '+/-';
    const isAction = key === '⌫' || key === '+/-' || key === '.';
    let style = styles.keyNumber;
    let textStyle = styles.keyNumberText;
    if (isQuickAdd) {
      style = styles.keyQuickAdd;
      textStyle = styles.keyQuickAddText;
    } else if (isAction) {
      style = styles.keyAction;
      textStyle = styles.keyActionText;
    }
    return (
      <TouchableOpacity
        key={key}
        onPress={() => handleKeypad(key)}
        activeOpacity={0.7}
        style={[styles.keyBase, style]}
      >
        <Text style={textStyle}>{key}</Text>
      </TouchableOpacity>
    );
  };

  const amountInsufficient =
    (paymentMode === 'cash' || paymentMode === 'card') && paidAmount < total;

  // Split-payment validity — both amounts > 0, sum matches the total within
  // 0.01 tolerance, and the two slots reference different pos.payment.method
  // records (same method twice is just a single payment, not a split).
  const splitSlot1Amt = parseFloat(splitSlot1.amount) || 0;
  const splitSlot2Amt = parseFloat(splitSlot2.amount) || 0;
  const splitSum = splitSlot1Amt + splitSlot2Amt;
  const splitValid =
    splitSlot1.methodId != null &&
    splitSlot2.methodId != null &&
    splitSlot1Amt > 0 &&
    splitSlot2Amt > 0 &&
    Math.abs(splitSum - total) < 0.01 &&
    splitSlot1.methodId !== splitSlot2.methodId;

  // Helper: lookup a method record by id, plus pick a sensible icon for it.
  const getSplitMethod = (id) => posPaymentMethods.find((m) => m.id === id) || null;
  // Methods eligible for the Partial Payment popup — excludes pay-later
  // (customer-account, flagged by split_transactions=true) and Bank methods.
  const splitMethods = posPaymentMethods.filter(
    (m) =>
      m.split_transactions !== true &&
      !(m.name || '').toLowerCase().includes('bank')
  );
  const iconForMethod = (m) => {
    if (!m) return 'help-outline';
    if (m.is_cash_count === true) return 'payments';
    if (m.split_transactions === true) return 'account-balance-wallet';
    return 'credit-card';
  };

  // Tap handler for the bottom Validate button. Shows a styled popup when the
  // user hasn't entered enough cash, otherwise runs the existing payment flow.
  const onValidateTap = () => {
    if (paying) return;
    if (paymentMode === 'split') {
      if (!splitConfirmed || !splitValid) {
        // Reopen the popup so the cashier can finish entering the split.
        setSplitModalVisible(true);
        return;
      }
    } else if (amountInsufficient) {
      setAmountModalVisible(true);
      return;
    }
    if (!customer) {
      setCustomerModalVisible(true);
      return;
    }
    handlePay();
  };

  return (
    <SafeAreaView backgroundColor={NAVY}>
      <StatusBar barStyle="light-content" backgroundColor={NAVY} />

      {/* Hero header — flat navy, no gloss/two-tone */}
      <View style={styles.hero}>
        <View style={styles.heroTopRow}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.heroIconBtn}
            activeOpacity={0.7}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <MaterialIcons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={styles.heroTitle}>Payment</Text>
            {registerName ? <Text style={styles.heroSubtitle} numberOfLines={1}>{registerName}</Text> : null}
          </View>
          {/* Transparent spacer — same width as the back button so the title stays centered */}
          <View style={styles.heroSpacer} />
        </View>

        <Text style={styles.totalLabel}>TOTAL</Text>
        <Text style={styles.totalValue}>{displayNum(total)}</Text>
        {computedDiscountAmount > 0 && !totalIsExternal ? (
          <View style={styles.totalBreakdown}>
            <View style={styles.totalBreakdownRow}>
              <Text style={styles.totalBreakdownLabel}>Subtotal</Text>
              <Text style={styles.totalBreakdownValue}>{displayNum(subtotal)}</Text>
            </View>
            <View style={styles.totalBreakdownRow}>
              <Text style={[styles.totalBreakdownLabel, styles.totalBreakdownDiscount]}>
                Discount {discountFormat === 'amount' ? '(amount)' : `(${discountPercent}%)`}
              </Text>
              <Text style={[styles.totalBreakdownValue, styles.totalBreakdownDiscount]}>−{displayNum(computedDiscountAmount)}</Text>
            </View>
          </View>
        ) : null}
      </View>

      <View style={styles.surface}>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 110 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Payment Mode segmented control */}
          <View style={styles.modeRow}>
            {renderModeCard('cash', 'Cash', 'payments', async () => {
              setPaymentMode('cash');
              const cashJournal = journals.find((j) => j.id === 16) || journals.find((j) => j.type === 'cash') || { id: 16, name: 'Cash', type: 'cash' };
              setSelectedJournal(cashJournal);
              setTimeout(async () => {
                console.log('Cash card selected, journal id:', cashJournal.id);
                try {
                  const response = await axios.post(`${getOdooUrl()}/web/dataset/call_kw`, {
                    jsonrpc: '2.0',
                    method: 'call',
                    params: {
                      model: 'pos.payment.method',
                      method: 'search_read',
                      args: [[['journal_id', '=', cashJournal.id]]],
                      kwargs: { fields: ['id', 'name', 'journal_id', 'is_cash_count', 'receivable_account_id', 'split_transactions'], limit: 10 },
                    },
                  }, { headers: { 'Content-Type': 'application/json' } });
                  const methods = response.data?.result || [];
                  if (methods.length > 0) console.log('Payment method(s) for journal', cashJournal.id, ':', methods);
                  else console.log('No payment method found for journal', cashJournal.id);
                  await fetchAllPaymentMethods();
                } catch (e) { console.error('Error fetching payment method details:', e); }
              }, 100);
            })}
            {renderModeCard('card', 'Card', 'credit-card', async () => {
              setPaymentMode('card');
              const cardJournal = journals.find((j) => j.id === 6) || journals.find((j) => j.type === 'bank');
              setSelectedJournal(cardJournal);
              setTimeout(async () => {
                if (cardJournal) {
                  console.log('Card payment selected, journal id:', cardJournal.id);
                  await fetchPaymentMethodId(cardJournal.id);
                } else {
                  console.log('Card payment selected, no journal mapped');
                }
              }, 100);
            })}
            {renderModeCard('split', 'Partial\nPayment', 'call-split', () => {
              setPaymentMode('split');
              // Default slot 2 amount to (total - slot1) on first open so the
              // common 50/50 case takes one less tap.
              setSplitSlot1((s) => ({ ...s, amount: s.amount || '' }));
              setSplitSlot2((s) => ({ ...s, amount: s.amount || '' }));
              setSplitModalVisible(true);
            })}
          </View>

          {/* Split-payment summary — visible only after the user confirms a
              valid split in the popup. Tapping Edit reopens the popup so the
              cashier can adjust before tapping the orange Validate button. */}
          {paymentMode === 'split' && splitConfirmed ? (
            <View style={styles.splitSummaryCard}>
              <View style={{ flex: 1 }}>
                <Text style={styles.splitSummaryLabel}>SPLIT PAYMENT</Text>
                <Text style={styles.splitSummaryValue}>
                  {(() => {
                    const m1 = getSplitMethod(splitSlot1.methodId);
                    const m2 = getSplitMethod(splitSlot2.methodId);
                    const a1 = displayNum(parseFloat(splitSlot1.amount) || 0);
                    const a2 = displayNum(parseFloat(splitSlot2.amount) || 0);
                    return `${m1?.name || 'Method 1'} ${a1} · ${m2?.name || 'Method 2'} ${a2}`;
                  })()}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setSplitModalVisible(true)}
                activeOpacity={0.85}
                style={styles.splitEditBtn}
              >
                <MaterialIcons name="edit" size={14} color="#fff" />
                <Text style={styles.splitEditText}>Edit</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {/* Amount input panel — hidden in split mode because the amounts
              live inside the partial-payment popup instead. */}
          {paymentMode !== 'split' ? (
            <View style={styles.inputCard}>
              <Text style={styles.inputModeLabel}>
                {paymentMode === 'account' ? 'CHARGED TO ACCOUNT' : (paymentMode === 'card' ? 'CARD' : 'CASH')}
              </Text>

              {paymentMode === 'account' ? (
                <Text style={styles.inputAmount}>{displayNum(total)}</Text>
              ) : (
                <View style={styles.inputRow}>
                  <Text style={styles.inputAmount}>
                    {inputAmount ? displayNum(parseFloat(inputAmount)) : '0'}
                  </Text>
                  {inputAmount ? (
                    <TouchableOpacity onPress={() => setInputAmount('')} style={styles.clearBtn}>
                      <MaterialIcons name="close" size={20} color="#dc2626" />
                    </TouchableOpacity>
                  ) : null}
                </View>
              )}

              {paymentMode !== 'account' ? (
                <View style={styles.statusPillRow}>
                  {remaining > 0 ? (
                    <View style={[styles.statusPill, { backgroundColor: '#fee2e2', borderColor: '#fecaca' }]}>
                      <MaterialIcons name="error-outline" size={14} color="#b91c1c" />
                      <Text style={[styles.statusPillText, { color: '#b91c1c' }]}>
                        Remaining {displayNum(remaining)}
                      </Text>
                    </View>
                  ) : remaining < 0 ? (
                    <View style={[styles.statusPill, { backgroundColor: '#dcfce7', borderColor: '#bbf7d0' }]}>
                      <MaterialCommunityIcons name="cash-multiple" size={14} color="#15803d" />
                      <Text style={[styles.statusPillText, { color: '#15803d' }]}>
                        Change {displayNum(Math.abs(remaining))}
                      </Text>
                    </View>
                  ) : (
                    <View style={[styles.statusPill, { backgroundColor: '#eff6ff', borderColor: '#bfdbfe' }]}>
                      <MaterialIcons name="check-circle" size={14} color="#1d4ed8" />
                      <Text style={[styles.statusPillText, { color: '#1d4ed8' }]}>Exact amount</Text>
                    </View>
                  )}
                </View>
              ) : null}
            </View>
          ) : null}

          {/* Keypad — only useful for cash/card. Split mode has its own
              amount inputs inside the popup. */}
          {paymentMode !== 'account' && paymentMode !== 'split' ? (
            <View style={styles.keypadCard}>
              {keypadRows.map((row, i) => (
                <View key={i} style={styles.keyRow}>
                  {row.map((k) => renderKey(k))}
                </View>
              ))}
            </View>
          ) : null}

          {/* Customer option — colored highlight matching the cart-screen chip */}
          <TouchableOpacity
            onPress={openCustomerSelector}
            activeOpacity={0.85}
            style={[
              styles.customerOptionCard,
              customer ? styles.customerOptionCardActive : styles.customerOptionCardEmpty,
            ]}
          >
            <View
              style={[
                styles.customerOptionIcon,
                { backgroundColor: customer ? '#dcfce7' : '#FFEDD5' },
              ]}
            >
              <MaterialIcons
                name={customer ? 'person-pin' : 'person-add-alt-1'}
                size={20}
                color={customer ? '#166534' : '#9A3412'}
              />
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text
                style={[
                  styles.customerOptionLabel,
                  { color: customer ? '#166534' : '#9A3412' },
                ]}
              >
                CUSTOMER
              </Text>
              <Text
                numberOfLines={1}
                style={[
                  styles.customerOptionValue,
                  { color: customer ? '#166534' : '#9A3412' },
                ]}
              >
                {customer?.name || 'No customer selected'}
              </Text>
            </View>
            <View
              style={[
                styles.customerOptionAction,
                { backgroundColor: customer ? '#22c55e' : '#F47B20' },
              ]}
            >
              <MaterialIcons name={customer ? 'edit' : 'add'} size={16} color="#fff" />
            </View>
          </TouchableOpacity>

          {/* ID-proof chip — only relevant when a customer is selected.
              Green ✓ when at least the Front photo is on file, amber
              warning when missing. Tap to open the view modal. */}
          {customer ? (
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => setIdProofModalVisible(true)}
              style={[
                styles.idProofChip,
                idProof.front
                  ? { backgroundColor: '#DCFCE7', borderColor: '#86EFAC' }
                  : { backgroundColor: '#FEF3C7', borderColor: '#FDE68A' },
              ]}
            >
              <MaterialIcons
                name={idProof.front ? 'verified' : 'badge'}
                size={16}
                color={idProof.front ? '#166534' : '#9A3412'}
              />
              <Text
                style={[
                  styles.idProofChipText,
                  { color: idProof.front ? '#166534' : '#9A3412' },
                ]}
              >
                {!idProof.loaded
                  ? 'Loading ID proof…'
                  : idProof.front
                    ? (idProof.back ? 'ID Proof on file (Front + Back)' : 'ID Proof on file (Front only)')
                    : 'No ID proof — tap to add'}
              </Text>
              <MaterialIcons name="chevron-right" size={18} color={idProof.front ? '#166534' : '#9A3412'} />
            </TouchableOpacity>
          ) : null}
        </ScrollView>

        {/* Validate footer — solid orange, always tappable; popup if cash short */}
        <View style={styles.footer}>
          {!totalIsExternal ? (
            <TouchableOpacity
              style={[styles.discountChip, computedDiscountAmount > 0 && styles.discountChipActive]}
              onPress={() => {
                // Pre-fill the custom-input box with whichever value
                // matches the current format so the cashier can tweak it.
                setCustomDiscountInput(
                  discountFormat === 'amount'
                    ? (discountAmountValue ? String(discountAmountValue) : '')
                    : (discountPercent ? String(discountPercent) : ''),
                );
                setDiscountModalVisible(true);
              }}
              activeOpacity={0.85}
            >
              <MaterialIcons
                name="percent"
                size={16}
                color={computedDiscountAmount > 0 ? '#fff' : NAVY}
              />
              <Text
                style={[
                  styles.discountChipText,
                  computedDiscountAmount > 0 && styles.discountChipTextActive,
                ]}
                numberOfLines={1}
              >
                {computedDiscountAmount <= 0
                  ? 'Apply discount'
                  : discountFormat === 'amount'
                    ? `−${displayNum(computedDiscountAmount)} off`
                    : `${discountPercent}% off  −${displayNum(computedDiscountAmount)}`}
              </Text>
              {computedDiscountAmount > 0 ? (
                <MaterialIcons name="edit" size={14} color="#fff" />
              ) : null}
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            onPress={onValidateTap}
            activeOpacity={0.85}
            style={styles.validateBtn}
          >
            <View style={styles.validateInner}>
              {paying ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <MaterialIcons name="check-circle" size={20} color="#fff" />
                  <Text style={styles.validateText}>Validate Payment</Text>
                </>
              )}
            </View>
          </TouchableOpacity>
        </View>
      </View>

      {/* Amount Required popup — styled like LogoutModal */}
      <Modal
        visible={amountModalVisible}
        animationType="fade"
        transparent
        onRequestClose={() => setAmountModalVisible(false)}
      >
        <View style={styles.alertBg}>
          <View style={styles.alertCard}>
            <View style={styles.alertIconDisk}>
              <MaterialCommunityIcons name="cash-multiple" size={28} color={ORANGE} />
            </View>
            <Text style={styles.alertTitle}>Amount Required</Text>
            <Text style={styles.alertText}>
              {`Please enter the full ${paymentMode === 'card' ? 'card' : 'cash'} amount. You still need ${displayNum(remaining)} to cover the total.`}
            </Text>
            <TouchableOpacity
              onPress={() => setAmountModalVisible(false)}
              style={styles.alertOkBtn}
              activeOpacity={0.85}
            >
              <Text style={styles.alertOkText}>OK</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Split (partial) payment popup — two slots, each with a method
          chip pair (Cash / Card) and an amount field. Confirm validates
          that the two amounts sum to the order total. */}
      <Modal
        visible={splitModalVisible}
        animationType="fade"
        transparent
        onRequestClose={() => setSplitModalVisible(false)}
      >
        <View style={styles.alertBg}>
          <View style={styles.splitCard}>
            <View style={styles.alertIconDisk}>
              <MaterialIcons name="call-split" size={28} color={ORANGE} />
            </View>
            <Text style={styles.alertTitle}>Split Payment</Text>
            <Text style={styles.alertText}>
              {`Total to collect: ${displayNum(total)}`}
            </Text>

            {splitMethods.length === 0 ? (
              <Text style={[styles.alertText, { marginTop: 14 }]}>
                No payment methods are configured on this POS register.{'\n'}
                Add some in Odoo: Point of Sale → Configuration → Payment Methods.
              </Text>
            ) : splitMethods.length < 2 ? (
              <Text style={[styles.alertText, { marginTop: 14 }]}>
                Split payment needs at least two payment methods on this register.{'\n'}
                Currently configured: {splitMethods.map((m) => m.name).join(', ')}.
              </Text>
            ) : (
              [
                { slot: splitSlot1, setSlot: setSplitSlot1, label: 'Method 1' },
                { slot: splitSlot2, setSlot: setSplitSlot2, label: 'Method 2' },
              ].map(({ slot, setSlot, label }, idx) => (
                <View key={idx} style={styles.splitSlotCard}>
                  <Text style={styles.splitSlotLabel}>{label}</Text>
                  <View style={styles.splitChipRow}>
                    {splitMethods.map((m) => {
                      const active = slot.methodId === m.id;
                      return (
                        <TouchableOpacity
                          key={m.id}
                          onPress={() => setSlot((s) => ({ ...s, methodId: m.id }))}
                          activeOpacity={0.85}
                          style={[
                            styles.splitChip,
                            active && styles.splitChipActive,
                          ]}
                        >
                          <MaterialIcons
                            name={iconForMethod(m)}
                            size={16}
                            color={active ? '#fff' : NAVY}
                          />
                          <Text
                            style={[
                              styles.splitChipText,
                              active && styles.splitChipTextActive,
                            ]}
                            numberOfLines={1}
                          >
                            {m.name}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  <TextInput
                    value={slot.amount}
                    onChangeText={(t) => setSlot((s) => ({ ...s, amount: t.replace(/[^0-9.]/g, '') }))}
                    keyboardType="decimal-pad"
                    placeholder="0.00"
                    placeholderTextColor="#9ca3af"
                    style={styles.splitAmountInput}
                  />
                  {(() => {
                    const otherAmt = parseFloat(idx === 0 ? splitSlot2.amount : splitSlot1.amount) || 0;
                    const remaining = Math.max(0, total - otherAmt);
                    return (
                      <Text style={styles.splitRemainingHint}>
                        {`Remaining ${displayNum(remaining)}`}
                      </Text>
                    );
                  })()}
                </View>
              ))
            )}

            {/* Live sum indicator */}
            <View
              style={[
                styles.splitSumPill,
                splitValid
                  ? { backgroundColor: '#dcfce7', borderColor: '#bbf7d0' }
                  : { backgroundColor: '#fee2e2', borderColor: '#fecaca' },
              ]}
            >
              <MaterialIcons
                name={splitValid ? 'check-circle' : 'error-outline'}
                size={14}
                color={splitValid ? '#15803d' : '#b91c1c'}
              />
              <Text
                style={[
                  styles.splitSumText,
                  { color: splitValid ? '#15803d' : '#b91c1c' },
                ]}
              >
                {`Entered ${displayNum(splitSum)} / ${displayNum(total)}`}
              </Text>
            </View>

            <View style={styles.splitActionsRow}>
              <TouchableOpacity
                style={styles.customerEnterBtn}
                activeOpacity={0.85}
                onPress={() => {
                  // Cancel: close the popup without flipping the confirmed
                  // flag. If nothing was confirmed yet, also bounce the user
                  // back to cash mode so they aren't stranded with split
                  // selected and no values.
                  setSplitModalVisible(false);
                  if (!splitConfirmed) setPaymentMode('cash');
                }}
              >
                <Text style={styles.customerEnterText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.customerSkipBtn,
                  !splitValid && { opacity: 0.55 },
                ]}
                activeOpacity={splitValid ? 0.85 : 1}
                onPress={() => {
                  if (!splitValid) {
                    let msg = 'Both amounts must be greater than zero';
                    if (splitSlot1.methodId == null || splitSlot2.methodId == null) {
                      msg = 'Pick a payment method for each slot';
                    } else if (splitSlot1.methodId === splitSlot2.methodId) {
                      msg = 'Pick two different payment methods';
                    } else if (Math.abs(splitSum - total) >= 0.01) {
                      msg = `Amounts must add up to ${displayNum(total)}`;
                    }
                    Toast.show({
                      type: 'error',
                      text1: 'Split Payment',
                      text2: msg,
                      position: 'bottom',
                    });
                    return;
                  }
                  setSplitConfirmed(true);
                  setSplitModalVisible(false);
                }}
              >
                <Text style={styles.customerSkipText}>Confirm</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Customer Required popup — shown when validate is tapped with no customer selected */}
      <Modal
        visible={customerModalVisible}
        animationType="fade"
        transparent
        onRequestClose={() => setCustomerModalVisible(false)}
      >
        <View style={styles.alertBg}>
          <View style={styles.alertCard}>
            <View style={styles.alertIconDisk}>
              <MaterialIcons name="person-outline" size={28} color={ORANGE} />
            </View>
            <Text style={styles.alertTitle}>Customer Required</Text>
            <Text style={styles.alertText}>
              No customer is selected for this order. Enter a customer or skip to continue.
            </Text>
            <View style={styles.customerActionsRow}>
              <TouchableOpacity
                style={styles.customerEnterBtn}
                activeOpacity={0.85}
                onPress={() => {
                  setCustomerModalVisible(false);
                  openCustomerSelector();
                }}
              >
                <Text style={styles.customerEnterText}>Enter Customer</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.customerSkipBtn}
                activeOpacity={0.85}
                onPress={() => {
                  setCustomerModalVisible(false);
                  handlePay();
                }}
              >
                <Text style={styles.customerSkipText}>Skip & Validate</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ID Proof view modal — same shape as LogoutModal: slide-up via
          react-native-modal, white card with navy 2px border, navy
          primary buttons in a row. Read-only quick check; tap
          "Open contact" to jump to CustomerInfo for edits. */}
      <RNModal
        isVisible={idProofModalVisible}
        animationIn="slideInUp"
        animationOut="slideOutDown"
        backdropOpacity={0.7}
        animationInTiming={400}
        animationOutTiming={300}
        backdropTransitionInTiming={400}
        backdropTransitionOutTiming={300}
        onBackButtonPress={() => setIdProofModalVisible(false)}
        onBackdropPress={() => setIdProofModalVisible(false)}
      >
        <View style={styles.idProofPopupContainer}>
          <Text style={styles.idProofPopupTitle}>
            {`ID Proof — ${customer?.name || ''}`}
          </Text>
          <View style={{ alignSelf: 'stretch', marginTop: 14 }}>
            <IdProofCards
              front={idProof.front}
              back={idProof.back}
              onChange={() => {}}
              readOnly
            />
          </View>
          <View style={styles.idProofPopupBtnRow}>
            <TouchableOpacity
              style={[styles.idProofPopupBtn, { flex: 1 }]}
              onPress={() => setIdProofModalVisible(false)}
            >
              <Text style={styles.idProofPopupBtnText}>CLOSE</Text>
            </TouchableOpacity>
            {customer?.id ? (
              <TouchableOpacity
                style={[styles.idProofPopupBtn, { flex: 1 }]}
                onPress={() => {
                  setIdProofModalVisible(false);
                  navigation.navigate('CustomerInfo', { partnerId: customer.id, mode: 'edit' });
                }}
              >
                <Text style={styles.idProofPopupBtnText}>OPEN CONTACT</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      </RNModal>

      {/* Total-discount popup — preset percentages + custom input + remove */}
      <Modal
        visible={discountModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setDiscountModalVisible(false)}
      >
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => setDiscountModalVisible(false)}
          style={styles.discountOverlay}
        >
          <TouchableOpacity activeOpacity={1} onPress={() => {}} style={styles.discountCard}>
            <View style={styles.discountHeader}>
              <View style={styles.discountTitleRow}>
                <MaterialIcons name="percent" size={22} color={NAVY} />
                <Text style={styles.discountTitle}>Select Discount</Text>
              </View>
              <TouchableOpacity onPress={() => setDiscountModalVisible(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <MaterialIcons name="close" size={22} color={NAVY} />
              </TouchableOpacity>
            </View>
            <Text style={styles.discountSubtitle}>Subtotal {displayNum(subtotal)}</Text>

            {/* DISCOUNT TYPE — Total / Items */}
            <View style={styles.discountSegmentWrap}>
              <Text style={styles.discountSegmentLabel}>DISCOUNT TYPE</Text>
              <View style={styles.discountSegmentRow}>
                <TouchableOpacity
                  style={[styles.discountSegmentBtn, discountType === 'total' && styles.discountSegmentBtnActive]}
                  onPress={() => setDiscountType('total')}
                  activeOpacity={0.85}
                >
                  <MaterialIcons name="shopping-cart" size={16} color={discountType === 'total' ? '#fff' : NAVY} />
                  <Text style={[styles.discountSegmentText, discountType === 'total' && styles.discountSegmentTextActive]}>
                    Total Discount
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.discountSegmentBtn, discountType === 'items' && styles.discountSegmentBtnActive]}
                  onPress={() => setDiscountType('items')}
                  activeOpacity={0.85}
                >
                  <MaterialIcons name="format-list-bulleted" size={16} color={discountType === 'items' ? '#fff' : NAVY} />
                  <Text style={[styles.discountSegmentText, discountType === 'items' && styles.discountSegmentTextActive]}>
                    Items Discount
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* DISCOUNT FORMAT — Percentage / Amount */}
            <View style={styles.discountSegmentWrap}>
              <Text style={styles.discountSegmentLabel}>DISCOUNT FORMAT</Text>
              <View style={styles.discountSegmentRow}>
                <TouchableOpacity
                  style={[styles.discountSegmentBtn, discountFormat === 'percentage' && styles.discountSegmentBtnActive]}
                  onPress={() => {
                    setDiscountFormat('percentage');
                    setCustomDiscountInput('');
                  }}
                  activeOpacity={0.85}
                >
                  <MaterialIcons name="percent" size={16} color={discountFormat === 'percentage' ? '#fff' : NAVY} />
                  <Text style={[styles.discountSegmentText, discountFormat === 'percentage' && styles.discountSegmentTextActive]}>
                    Percentage
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.discountSegmentBtn, discountFormat === 'amount' && styles.discountSegmentBtnActive]}
                  onPress={() => {
                    setDiscountFormat('amount');
                    setCustomDiscountInput('');
                  }}
                  activeOpacity={0.85}
                >
                  <MaterialCommunityIcons name="cash" size={16} color={discountFormat === 'amount' ? '#fff' : NAVY} />
                  <Text style={[styles.discountSegmentText, discountFormat === 'amount' && styles.discountSegmentTextActive]}>
                    Amount
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Preset grid — values switch with format */}
            <View style={styles.discountGrid}>
              {(discountFormat === 'amount' ? [1, 2, 5, 10, 20] : [10, 20, 30, 40, 50]).map((val) => {
                const active = discountFormat === 'amount'
                  ? Number(discountAmountValue) === val
                  : Number(discountPercent) === val;
                return (
                  <TouchableOpacity
                    key={`disc-${discountFormat}-${val}`}
                    style={[styles.discountOption, active && styles.discountOptionActive]}
                    onPress={() => {
                      if (discountFormat === 'amount') {
                        setDiscountAmountValue(val);
                        setDiscountPercent(0);
                      } else {
                        setDiscountPercent(val);
                        setDiscountAmountValue(0);
                      }
                      setCustomDiscountInput('');
                      setDiscountModalVisible(false);
                    }}
                    activeOpacity={0.85}
                  >
                    <Text style={[styles.discountOptionText, active && styles.discountOptionTextActive]}>
                      {discountFormat === 'amount' ? displayNum(val) : `${val}%`}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Custom input row */}
            <View style={styles.discountCustomRow}>
              <TextInput
                style={styles.discountCustomInput}
                placeholder={discountFormat === 'amount' ? 'Custom amount' : 'Custom %'}
                placeholderTextColor="#9CA3AF"
                keyboardType={discountFormat === 'amount' ? 'decimal-pad' : 'number-pad'}
                value={customDiscountInput}
                onChangeText={(t) => setCustomDiscountInput(t.replace(/[^0-9.]/g, ''))}
                maxLength={8}
              />
              <TouchableOpacity
                style={styles.discountApplyBtn}
                onPress={() => {
                  const raw = parseFloat(customDiscountInput) || 0;
                  if (discountFormat === 'amount') {
                    const val = Math.max(0, Math.round(raw * 1000) / 1000);
                    setDiscountAmountValue(val);
                    setDiscountPercent(0);
                  } else {
                    const val = Math.max(0, Math.min(100, raw));
                    setDiscountPercent(val);
                    setDiscountAmountValue(0);
                  }
                  setDiscountModalVisible(false);
                }}
                activeOpacity={0.85}
              >
                <Text style={styles.discountApplyText}>Apply</Text>
              </TouchableOpacity>
            </View>

            {/* Remove — only when something is applied */}
            {computedDiscountAmount > 0 ? (
              <TouchableOpacity
                style={styles.discountRemoveBtn}
                onPress={() => {
                  setDiscountPercent(0);
                  setDiscountAmountValue(0);
                  setCustomDiscountInput('');
                  setDiscountModalVisible(false);
                }}
                activeOpacity={0.85}
              >
                <MaterialIcons name="close" size={16} color="#DC2626" />
                <Text style={styles.discountRemoveText}>Remove discount</Text>
              </TouchableOpacity>
            ) : null}

            <TouchableOpacity
              style={styles.discountCancelBtn}
              onPress={() => setDiscountModalVisible(false)}
              activeOpacity={0.85}
            >
              <Text style={styles.discountCancelText}>Cancel</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
};

export default POSPayment;

const ctaShadow = (color) => Platform.select({
  ios: { shadowColor: color, shadowOpacity: 0.32, shadowRadius: 10, shadowOffset: { width: 0, height: 6 } },
  android: { elevation: 7 },
});

const cardShadow = Platform.select({
  ios: { shadowColor: '#1a1a2e', shadowOpacity: 0.08, shadowRadius: 14, shadowOffset: { width: 0, height: 6 } },
  android: { elevation: 4 },
});

const styles = StyleSheet.create({
  // Hero — compact
  hero: {
    backgroundColor: NAVY,
    paddingHorizontal: 14,
    paddingTop: 6,
    paddingBottom: 38,
  },
  heroTopRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  heroIconBtn: {
    width: 32, height: 32, borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', justifyContent: 'center',
  },
  // Same-size transparent spacer so the title stays centred without showing
  // a tinted empty square on the right.
  heroSpacer: {
    width: 32, height: 32,
    backgroundColor: 'transparent',
  },
  heroTitle: {
    color: '#fff', fontSize: 15, fontWeight: '800', letterSpacing: 0.3,
    fontFamily: FONT_FAMILY.urbanistBold,
  },
  heroSubtitle: {
    color: 'rgba(255,255,255,0.65)', fontSize: 11, fontWeight: '500',
    marginTop: 1, fontFamily: FONT_FAMILY.urbanistMedium,
  },
  totalLabel: {
    color: 'rgba(255,255,255,0.65)', fontSize: 10,
    fontFamily: FONT_FAMILY.urbanistSemiBold,
    letterSpacing: 1, textAlign: 'center', marginBottom: 4,
  },
  totalValue: {
    color: '#fff', fontSize: 30,
    fontFamily: FONT_FAMILY.urbanistBold,
    textAlign: 'center', letterSpacing: 0.4,
  },

  // Surface
  surface: {
    flex: 1,
    backgroundColor: '#f6f7fb',
    borderTopLeftRadius: 22, borderTopRightRadius: 22,
    marginTop: -22,
  },

  // Payment mode segmented control — smaller cards
  modeRow: {
    flexDirection: 'row', gap: 8,
    paddingHorizontal: 12, paddingTop: 12, paddingBottom: 6,
  },
  modeCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 6,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#eef0f5',
    ...cardShadow,
  },
  modeCardActive: {
    backgroundColor: NAVY, borderColor: NAVY, ...ctaShadow(NAVY),
  },
  modeIconDisk: {
    width: 34, height: 34, borderRadius: 11,
    backgroundColor: '#eef0f5',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 5,
  },
  modeIconDiskActive: { backgroundColor: 'rgba(255,255,255,0.18)' },
  modeLabel: {
    fontSize: 11, color: NAVY,
    fontFamily: FONT_FAMILY.urbanistBold,
    textAlign: 'center', letterSpacing: 0.2,
  },
  modeLabelActive: { color: '#fff' },

  // Input card — tighter
  inputCard: {
    marginHorizontal: 12, marginTop: 6, marginBottom: 6,
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 12, paddingHorizontal: 14,
    ...cardShadow,
  },
  inputModeLabel: {
    fontSize: 10, color: '#8896ab',
    fontFamily: FONT_FAMILY.urbanistSemiBold,
    letterSpacing: 1, marginBottom: 4, textAlign: 'center',
  },
  inputRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  inputAmount: {
    flex: 1,
    fontSize: 26, color: NAVY,
    fontFamily: FONT_FAMILY.urbanistBold,
    textAlign: 'center', letterSpacing: 0.3,
  },
  clearBtn: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: '#fee2e2',
    alignItems: 'center', justifyContent: 'center',
    marginLeft: 4,
  },
  statusPillRow: {
    flexDirection: 'row', justifyContent: 'center', marginTop: 6,
  },
  statusPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 999, borderWidth: 1,
  },
  statusPillText: {
    fontSize: 11, fontFamily: FONT_FAMILY.urbanistBold, marginLeft: 3,
  },

  // Keypad — compact
  keypadCard: {
    marginHorizontal: 12, marginTop: 6,
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 8, paddingHorizontal: 8,
    ...cardShadow,
  },
  keyRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  keyBase: {
    flex: 1, aspectRatio: 1.7, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    marginHorizontal: 3,
  },
  keyNumber: {
    backgroundColor: '#f8f9fc', borderWidth: 1, borderColor: '#eef0f5',
  },
  keyNumberText: {
    fontSize: 17, color: NAVY, fontFamily: FONT_FAMILY.urbanistBold,
  },
  keyQuickAdd: {
    backgroundColor: ORANGE,
    ...ctaShadow(ORANGE),
  },
  keyQuickAddText: {
    fontSize: 13, color: '#fff', fontFamily: FONT_FAMILY.urbanistBold,
    letterSpacing: 0.2,
  },
  keyAction: {
    backgroundColor: '#eef0f5',
  },
  keyActionText: {
    fontSize: 15, color: NAVY, fontFamily: FONT_FAMILY.urbanistBold,
  },

  // Options card — tighter
  optionsCard: {
    marginHorizontal: 12, marginTop: 6,
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 2, paddingHorizontal: 12,
    ...cardShadow,
  },
  optionRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 9,
  },
  optionRowActive: {},
  optionIcon: {
    width: 30, height: 30, borderRadius: 10,
    backgroundColor: '#eef0f5',
    alignItems: 'center', justifyContent: 'center',
  },
  optionLabel: {
    fontSize: 10, color: '#8896ab',
    fontFamily: FONT_FAMILY.urbanistSemiBold,
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  optionValue: {
    fontSize: 12, color: NAVY,
    fontFamily: FONT_FAMILY.urbanistBold, marginTop: 1,
  },
  optionDivider: { height: 1, backgroundColor: '#f1f2f6' },

  // Customer option card — colored highlight, matches the cart-screen chip styling
  customerOptionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 12,
    marginTop: 8,
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1.5,
  },
  customerOptionCardEmpty: {
    backgroundColor: '#FFEDD5',
    borderColor: '#F47B20',
    ...Platform.select({
      ios: { shadowColor: '#F47B20', shadowOpacity: 0.22, shadowRadius: 6, shadowOffset: { width: 0, height: 3 } },
      android: { elevation: 3 },
    }),
  },
  customerOptionCardActive: {
    backgroundColor: '#dcfce7',
    borderColor: '#22c55e',
    ...Platform.select({
      ios: { shadowColor: '#22c55e', shadowOpacity: 0.22, shadowRadius: 6, shadowOffset: { width: 0, height: 3 } },
      android: { elevation: 3 },
    }),
  },
  customerOptionIcon: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center',
  },
  customerOptionLabel: {
    fontSize: 10,
    fontFamily: FONT_FAMILY.urbanistBold,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  customerOptionValue: {
    fontSize: 14,
    fontFamily: FONT_FAMILY.urbanistBold,
    marginTop: 2,
    letterSpacing: 0.2,
  },
  customerOptionAction: {
    width: 30, height: 30, borderRadius: 15,
    alignItems: 'center', justifyContent: 'center',
    marginLeft: 8,
  },
  // ID-proof chip — shows under the customer card on POSPayment.
  idProofChip: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 14,
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1.5,
    gap: 8,
  },
  idProofChipText: {
    flex: 1,
    fontSize: 12,
    fontFamily: FONT_FAMILY.urbanistBold,
    letterSpacing: 0.3,
  },
// ID-proof popup — mirrors LogoutModal (white card, navy 2px border,
// navy primary buttons in a row).
idProofPopupContainer: {
backgroundColor: '#fff',
borderRadius: 10,
borderColor: NAVY,
borderWidth: 2,
paddingVertical: 22,
paddingHorizontal: 12,
alignItems: 'center',
},
idProofPopupTitle: {
marginVertical: 8,
fontSize: 16,
color: NAVY,
fontFamily: FONT_FAMILY.urbanistBold,
textAlign: 'center',
},
idProofPopupBtnRow: {
flexDirection: 'row',
justifyContent: 'space-between',
alignSelf: 'stretch',
marginTop: 18,
gap: 10,
},
idProofPopupBtn: {
backgroundColor: NAVY,
borderRadius: 10,
padding: 15,
justifyContent: 'center',
alignItems: 'center',
},
idProofPopupBtnText: {
color: '#fff',
fontFamily: FONT_FAMILY.urbanistBold,
letterSpacing: 0.4,
},
  toggleTrack: {
    width: 36, height: 20, borderRadius: 10,
    backgroundColor: '#e5e7eb', justifyContent: 'center', paddingHorizontal: 2,
  },
  toggleTrackOn: { backgroundColor: ORANGE },
  toggleThumb: {
    width: 16, height: 16, borderRadius: 8,
    backgroundColor: '#fff',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 2, shadowOffset: { width: 0, height: 1 } },
      android: { elevation: 2 },
    }),
  },
  toggleThumbOn: { transform: [{ translateX: 16 }] },

  // Footer — slimmer
  footer: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    paddingHorizontal: 12, paddingTop: 8, paddingBottom: 10,
    backgroundColor: '#fff',
    borderTopLeftRadius: 18, borderTopRightRadius: 18,
    ...Platform.select({
      ios: { shadowColor: '#1a1a2e', shadowOpacity: 0.08, shadowRadius: 14, shadowOffset: { width: 0, height: -4 } },
      android: { elevation: 12 },
    }),
  },
  validateBtn: {
    backgroundColor: ORANGE,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center', justifyContent: 'center',
    ...ctaShadow(ORANGE),
  },
  validateInner: { flexDirection: 'row', alignItems: 'center', gap: 6 },

  // Amount-required alert — same look as the LogoutModal-style close popup
  alertBg: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center', alignItems: 'center', padding: 18,
  },
  alertCard: {
    width: '100%', maxWidth: 380,
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 2, borderColor: NAVY,
    paddingVertical: 22, paddingHorizontal: 18,
    alignItems: 'center',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 18, shadowOffset: { width: 0, height: 8 } },
      android: { elevation: 14 },
    }),
  },
  alertIconDisk: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: '#fff7ed',
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
  alertOkBtn: {
    alignSelf: 'stretch',
    paddingVertical: 14, borderRadius: 10,
    backgroundColor: NAVY,
    alignItems: 'center', justifyContent: 'center',
    ...Platform.select({
      ios: { shadowColor: NAVY, shadowOpacity: 0.32, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
      android: { elevation: 5 },
    }),
  },
  alertOkText: { color: '#fff', fontWeight: '800', fontSize: 13, letterSpacing: 0.4 },
  customerActionsRow: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    gap: 10,
  },
  customerEnterBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 10,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: NAVY,
    alignItems: 'center',
    justifyContent: 'center',
  },
  customerEnterText: {
    color: NAVY, fontWeight: '800', fontSize: 13, letterSpacing: 0.3,
  },
  customerSkipBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 10,
    backgroundColor: ORANGE,
    alignItems: 'center',
    justifyContent: 'center',
    ...ctaShadow(ORANGE),
  },
  customerSkipText: {
    color: '#fff', fontWeight: '800', fontSize: 13, letterSpacing: 0.4,
  },
  validateText: {
    color: '#fff', fontSize: 14,
    fontFamily: FONT_FAMILY.urbanistBold,
    letterSpacing: 0.3, marginLeft: 4,
  },

  // Split (partial) payment styles ───────────────────────────────────
  splitSummaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 14,
    marginTop: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#FFF7ED',
    borderWidth: 1.5,
    borderColor: '#FED7AA',
  },
  splitSummaryLabel: {
    fontSize: 11,
    color: '#9A3412',
    fontFamily: FONT_FAMILY.urbanistBold,
    letterSpacing: 0.6,
    marginBottom: 2,
  },
  splitSummaryValue: {
    fontSize: 14,
    color: '#9A3412',
    fontFamily: FONT_FAMILY.urbanistBold,
  },
  splitEditBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: ORANGE,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    marginLeft: 10,
  },
  splitEditText: {
    color: '#fff',
    fontFamily: FONT_FAMILY.urbanistBold,
    fontSize: 12,
    marginLeft: 4,
    letterSpacing: 0.3,
  },
  splitCard: {
    width: '88%',
    maxWidth: 420,
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingVertical: 22,
    paddingHorizontal: 20,
    alignItems: 'stretch',
    borderWidth: 2,
    borderColor: NAVY,
    ...cardShadow,
  },
  splitSlotCard: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  splitSlotLabel: {
    fontSize: 11,
    color: NAVY,
    fontFamily: FONT_FAMILY.urbanistBold,
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  splitChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  splitChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: NAVY,
  },
  splitChipActive: {
    backgroundColor: NAVY,
    borderColor: NAVY,
  },
  splitChipText: {
    color: NAVY,
    fontFamily: FONT_FAMILY.urbanistBold,
    fontSize: 13,
    marginLeft: 6,
    letterSpacing: 0.3,
  },
  splitChipTextActive: {
    color: '#fff',
  },
  splitAmountInput: {
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#D1D5DB',
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 12 : 8,
    fontSize: 18,
    color: NAVY,
    fontFamily: FONT_FAMILY.urbanistBold,
    textAlign: 'center',
  },
  splitRemainingHint: {
    marginTop: 6,
    fontSize: 12,
    color: '#6b7280',
    fontFamily: FONT_FAMILY.urbanistSemiBold,
    textAlign: 'right',
  },
  splitSumPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    marginTop: 14,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  splitSumText: {
    fontSize: 12,
    fontFamily: FONT_FAMILY.urbanistBold,
    marginLeft: 6,
    letterSpacing: 0.3,
  },
  splitActionsRow: {
    flexDirection: 'row',
    marginTop: 16,
    gap: 10,
  },
  // Subtotal / Discount mini-rows shown under the hero TOTAL when a
  // discount is active. Compact, white-on-navy text against the hero.
  totalBreakdown: {
    marginTop: 8,
    alignSelf: 'center',
    minWidth: '60%',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  totalBreakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 2,
  },
  totalBreakdownLabel: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 12,
    fontFamily: FONT_FAMILY.urbanistMedium,
  },
  totalBreakdownValue: {
    color: '#fff',
    fontSize: 12,
    fontFamily: FONT_FAMILY.urbanistBold,
  },
  totalBreakdownDiscount: {
    color: '#fde68a',
  },
  // Discount chip in the footer above the Validate button.
  discountChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1.2,
    borderColor: NAVY,
    backgroundColor: '#fff',
    marginBottom: 10,
    alignSelf: 'stretch',
  },
  discountChipActive: {
    backgroundColor: '#16a34a',
    borderColor: '#16a34a',
  },
  discountChipText: {
    color: NAVY,
    fontSize: 13,
    fontFamily: FONT_FAMILY.urbanistBold,
    letterSpacing: 0.4,
  },
  discountChipTextActive: {
    color: '#fff',
  },
  // Discount popup — backdrop + centered card, mirrors the LogoutModal
  // / IdProof popup pattern used elsewhere on this screen.
  discountOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  discountCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: NAVY,
    padding: 18,
    width: '100%',
    maxWidth: 420,
  },
  discountHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  discountTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  discountTitle: {
    fontSize: 18,
    color: NAVY,
    fontFamily: FONT_FAMILY.urbanistBold,
    letterSpacing: 0.4,
  },
  discountSubtitle: {
    fontSize: 12,
    color: '#6b7a90',
    fontFamily: FONT_FAMILY.urbanistMedium,
    marginBottom: 14,
  },
  // Segmented-control wrapper — soft grey card with the section label
  // above and the two flex:1 buttons inside.
  discountSegmentWrap: {
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    padding: 10,
    marginBottom: 12,
  },
  discountSegmentLabel: {
    fontSize: 10,
    color: '#6b7a90',
    fontFamily: FONT_FAMILY.urbanistBold,
    letterSpacing: 0.8,
    marginBottom: 8,
    marginLeft: 2,
  },
  discountSegmentRow: {
    flexDirection: 'row',
    gap: 6,
  },
  discountSegmentBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1.2,
    borderColor: NAVY,
    backgroundColor: '#fff',
  },
  discountSegmentBtnActive: {
    backgroundColor: NAVY,
    borderColor: NAVY,
  },
  discountSegmentText: {
    color: NAVY,
    fontSize: 12,
    fontFamily: FONT_FAMILY.urbanistBold,
    letterSpacing: 0.3,
  },
  discountSegmentTextActive: {
    color: '#fff',
  },
  discountGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
    justifyContent: 'flex-start',
  },
  discountOption: {
    width: '23%',
    paddingVertical: 14,
    backgroundColor: '#f6f8fa',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#eef0f5',
    alignItems: 'center',
  },
  discountOptionActive: {
    backgroundColor: '#16a34a',
    borderColor: '#16a34a',
  },
  discountOptionText: {
    fontSize: 16,
    color: NAVY,
    fontFamily: FONT_FAMILY.urbanistBold,
  },
  discountOptionTextActive: {
    color: '#fff',
  },
  discountCustomRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    marginBottom: 12,
  },
  discountCustomInput: {
    flex: 1,
    borderWidth: 1.2,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: NAVY,
    fontFamily: FONT_FAMILY.urbanistMedium,
  },
  discountApplyBtn: {
    backgroundColor: NAVY,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 10,
  },
  discountApplyText: {
    color: '#fff',
    fontFamily: FONT_FAMILY.urbanistBold,
    fontSize: 13,
    letterSpacing: 0.4,
  },
  discountRemoveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1.2,
    borderColor: '#FCA5A5',
    backgroundColor: '#FEE2E2',
    marginBottom: 8,
  },
  discountRemoveText: {
    color: '#DC2626',
    fontFamily: FONT_FAMILY.urbanistBold,
    fontSize: 13,
    letterSpacing: 0.3,
  },
  discountCancelBtn: {
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 10,
    backgroundColor: '#f3f4f6',
  },
  discountCancelText: {
    color: '#374151',
    fontFamily: FONT_FAMILY.urbanistBold,
    fontSize: 13,
  },
});
