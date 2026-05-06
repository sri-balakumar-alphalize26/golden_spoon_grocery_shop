import React, { useState, useEffect } from 'react';
import {
  View, Text, ActivityIndicator, TouchableOpacity, ScrollView, StyleSheet,
  StatusBar, Platform, Dimensions, Alert, Modal,
} from 'react-native';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView } from '@components/containers';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import {
  fetchPaymentJournalsOdoo, createAccountPaymentOdoo, fetchPOSSessions,
  validatePosOrderOdoo, updatePosOrderOdoo, createInvoiceOdoo, linkInvoiceToPosOrderOdoo,
} from '@api/services/generalApi';
import { createPosOrderOdoo, createPosPaymentOdoo } from '@api/services/generalApi';
import axios from 'axios';
import { getOdooUrl, getOdooDb } from '@api/config/odooConfig';
import { useProductStore } from '@stores/product';
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

// Helper to display numbers cleanly without floating point artifacts
const displayNum = (n) => {
  const num = Number(n);
  if (isNaN(num)) return '0';
  return parseFloat(num.toPrecision(12)).toString();
};

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
  const [selectedJournal, setSelectedJournal] = useState(null);
  const [paying, setPaying] = useState(false);
  const { clearProducts } = useProductStore();
  const [inputAmount, setInputAmount] = useState('');

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

  const computeTotal = () => {
    if (totalAmount !== undefined && totalAmount !== null) return totalAmount;
    return (products || []).reduce((s, p) => s + ((p.price || 0) * (p.quantity || p.qty || 0)), 0);
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
        product_id: p.id,
        qty: p.quantity,
        price: p.price,
        name: p.name || p.product_name || '',
      }));
      const partnerId = customer?.id || customer?._id || null;
      const companyId = 1;

      let posConfigId = route?.params?.registerId || route?.params?.posConfigId || null;
      if (!posConfigId && sessionId) {
        try {
          const sessionList = await fetchPOSSessions({ limit: 10, offset: 0, state: '' });
          console.log('[POS CONFIG] Full session list:', sessionList);
          const session = sessionList.find((s) => s.id === sessionId);
          console.log('[POS CONFIG] Session found for sessionId', sessionId, ':', session);
          if (session && session.config_id) {
            if (Array.isArray(session.config_id)) posConfigId = session.config_id[0];
            else posConfigId = session.config_id;
          } else {
            posConfigId = null;
          }
          console.log('[POS CONFIG] Extracted posConfigId:', posConfigId);
        } catch (e) {
          console.warn('Failed to auto-fetch posConfigId from session:', e?.message || e);
        }
      }
      let createdOrderId = orderId || null;
      let invoiceInfo = null;
      if (!createdOrderId) {
        console.log('[STEP 1] No orderId passed to POSPayment. Creating a new order...');
        const posOrderPayload = { partnerId, lines, sessionId, posConfigId, companyId, orderName: '/' };
        console.log('[STEP 1] POS Order Payload:', posOrderPayload);
        const resp = await createPosOrderOdoo(posOrderPayload);
        console.log('[STEP 1] POS Order Response:', resp);
        if (resp && resp.error) {
          console.error('Odoo POS Order Error:', resp.error);
          Toast.show({ type: 'error', text1: 'POS Error', text2: resp.error.message || JSON.stringify(resp.error) || 'Failed to create POS order', position: 'bottom' });
          return;
        }
        createdOrderId = resp && resp.result ? resp.result : null;
        if (!createdOrderId) {
          Toast.show({ type: 'error', text1: 'POS Error', text2: 'No order id returned', position: 'bottom' });
          return;
        }
      }

      if ((paymentMode === 'cash' || paymentMode === 'card') && selectedJournal) {
        try {
          const paymentMethodId = await fetchPaymentMethodId(selectedJournal.id);
          if (!paymentMethodId) {
            Toast.show({ type: 'error', text1: 'Payment Error', text2: 'No payment method found for selected journal', position: 'bottom' });
            return;
          }
          const payments = [];
          if (paymentMode === 'cash') {
            payments.push({ amount: total, paymentMethodId, journalId: selectedJournal.id, paymentMode });
            console.log(`💵 Cash payment: Total=${total}, Received=${paidAmount}, Change=${Math.abs(remaining)}`);
          } else if (paymentMode === 'card') {
            payments.push({ amount: total, paymentMethodId, journalId: selectedJournal.id, paymentMode });
            console.log(`💳 Card payment: Total=${total}`);
          }
          payments.forEach((p, idx) => {
            const type = p.amount > 0 ? 'RECEIVED' : 'CHANGE';
            console.log(`[PAYMENT LOG] #${idx + 1} Type: ${type}, Amount: ${p.amount}, JournalId: ${p.journalId}, PaymentMethodId: ${p.paymentMethodId}`);
          });
          const paymentPayload = { orderId: createdOrderId, payments, partnerId, sessionId, companyId };
          console.log('JSON-RPC payment payload:', paymentPayload);
          const paymentResp = await createPosPaymentOdoo(paymentPayload);
          console.log('Payment API response:', paymentResp);
          if (paymentResp && paymentResp.error) {
            console.error('Payment API error:', paymentResp.error);
            Toast.show({ type: 'error', text1: 'Payment Error', text2: paymentResp.error.message || JSON.stringify(paymentResp.error) || 'Failed to create payment', position: 'bottom' });
            return;
          }

          const totalPaymentAmount = payments.reduce((sum, p) => sum + p.amount, 0);
          console.log('💰 Total payment amount:', totalPaymentAmount, 'Order total:', total);
          if (totalPaymentAmount >= total) {
            console.log('✅ Payments created. Updating order amount_paid before validation');
            // Persist partner_id on the order too — if the user picked the
            // customer on the payment screen (and not on the register), it
            // would otherwise never land on the Odoo pos.order record.
            const updateResp = await updatePosOrderOdoo(createdOrderId, {
              amount_paid: total,
              state: 'paid',
              partner_id: partnerId || false,
            });
            if (updateResp && updateResp.error) {
              console.error('Order update error:', updateResp.error);
              Toast.show({ type: 'error', text1: 'Update Error', text2: 'Failed to update order', position: 'bottom' });
              return;
            }
            console.log('✅ Order updated. Now validating order', createdOrderId);
            const validateResp = await validatePosOrderOdoo(createdOrderId);
            if (validateResp && validateResp.error) {
              console.error('Order validation error:', validateResp.error);
              Toast.show({ type: 'error', text1: 'Validation Error', text2: 'Payment created but order validation failed', position: 'bottom' });
            } else {
              console.log('✅ Order validated successfully');

              const shouldCreateInvoice = invoiceChecked || Boolean(customer && (customer.id || customer._id));
              if (shouldCreateInvoice) {
                try {
                  const actualTotal = Math.round(Number(totalAmount) * 1000) / 1000 || 0;
                  console.log('[INVOICE] Creating invoice for POS order', createdOrderId, 'totalAmount:', actualTotal);

                  const grossTotal = (products || []).reduce((sum, p) => sum + (Number(p.price || p.price_unit || 0) * Number(p.quantity || p.qty || 1)), 0);
                  const ratio = grossTotal > 0 ? actualTotal / grossTotal : 1;

                  const invoiceProducts = (products || []).map((p) => ({
                    id: p.id,
                    name: p.name || p.product_name || '',
                    quantity: Number(p.quantity || p.qty || 1),
                    price: Math.round(Number(p.price || p.price_unit || 0) * ratio * 1000) / 1000,
                    tax_ids: p.tax_ids || [],
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
                      if (selectedJournal && selectedJournal.id && totalPaymentAmount2 >= total) {
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
          } else {
            console.log('⚠️ Payment amount does not cover order total. Order remains in draft state.');
          }
        } catch (e) {
          console.error('Payment API exception:', e);
          Toast.show({ type: 'error', text1: 'Payment Error', text2: e?.message || 'Failed to create payment', position: 'bottom' });
        }
      }

      // Clear the cart now that the order is paid + validated, so the
      // register screen is empty next time the user navigates back.
      try { clearProducts(); } catch (_) {}

      navigation.navigate('POSReceiptScreen', {
        orderId: createdOrderId,
        products,
        customer,
        amount: paidAmount,
        totalAmount: total,
        discount: discountAmount,
        invoiceChecked,
        invoice: invoiceInfo,
        sessionId,
        registerName,
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

  const cashInsufficient = paymentMode === 'cash' && paidAmount < total;

  // Tap handler for the bottom Validate button. Shows a styled popup when the
  // user hasn't entered enough cash, otherwise runs the existing payment flow.
  const onValidateTap = () => {
    if (paying) return;
    if (cashInsufficient) {
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
            {renderModeCard('account', 'Customer\nAccount', 'account-balance-wallet', async () => {
              setPaymentMode('account');
              setTimeout(async () => {
                if (selectedJournal) {
                  console.log('Customer Account card selected, journal id:', selectedJournal.id);
                  await fetchPaymentMethodId(selectedJournal.id);
                } else {
                  console.log('Customer Account card selected, no journal mapped');
                }
              }, 100);
            })}
          </View>

          {/* Amount input panel */}
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

          {/* Keypad — only useful for cash/card */}
          {paymentMode !== 'account' ? (
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
        </ScrollView>

        {/* Validate footer — solid orange, always tappable; popup if cash short */}
        <View style={styles.footer}>
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
              Please enter the cash received. You still need {displayNum(remaining)} to cover the total.
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
});
