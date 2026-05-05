import React, { useState, useEffect } from 'react';
import { View, Text, ActivityIndicator, TouchableOpacity, ScrollView, StyleSheet, Modal, FlatList } from 'react-native';
import { SafeAreaView } from '@components/containers';
import { COLORS } from '@constants/theme';
import { NavigationHeader } from '@components/Header';
import { Button } from '@components/common/Button';
import { fetchPaymentJournalsOdoo, createAccountPaymentOdoo, fetchPOSSessions, validatePosOrderOdoo, updatePosOrderOdoo, createInvoiceOdoo, linkInvoiceToPosOrderOdoo } from '@api/services/generalApi';
import { createPosOrderOdoo, createPosPaymentOdoo } from '@api/services/generalApi';
import axios from 'axios';
import ODOO_BASE_URL from '@api/config/odooConfig';
// Helper to display numbers cleanly without floating point artifacts
const displayNum = (n) => {
  const num = Number(n);
  if (isNaN(num)) return '0';
  return parseFloat(num.toPrecision(12)).toString();
};

// Helper to fetch all payment methods from Odoo
const fetchAllPaymentMethods = async () => {
  try {
    const response = await axios.post(`${ODOO_BASE_URL}/web/dataset/call_kw`, {
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
      const response = await axios.post(`${ODOO_BASE_URL}/web/dataset/call_kw`, {
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
import { useProductStore } from '@stores/product';
import Toast from 'react-native-toast-message';

const POSPayment = ({ navigation, route }) => {
    const [invoiceChecked, setInvoiceChecked] = useState(false);
  const {
    products = [],
    customer: initialCustomer,
    sessionId,
    registerName,
    totalAmount,
    orderId,
    discountAmount = 0
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
    const byName = (name) => journals.find(j => j.name && j.name.toLowerCase().includes(name));
    if (mode === 'cash') {
      // Use journal id 16 (Cash) for cash payments
      return journals.find(j => j.id === 16) || journals.find(j => j.type === 'cash') || byName('cash') || journals.find(j => j.type === 'cashbox');
    }
    if (mode === 'card') {
      return journals.find(j => j.type === 'bank') || byName('card') || byName('visa') || byName('master');
    }
    if (mode === 'account') {
      // Prefer receivable/sale journals or ones with 'account' wording
      return journals.find(j => j.type === 'sale') || journals.find(j => j.type === 'receivable') || byName('account') || journals[0];
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
    // Use totalAmount from params if available, otherwise compute from products
    if (totalAmount !== undefined && totalAmount !== null) {
      return totalAmount;
    }
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
    try {
      // Build order lines
      const lines = products.map(p => ({
        product_id: p.id,
        qty: p.quantity,
        price: p.price,
        name: p.name || p.product_name || ''
      }));
      const partnerId = customer?.id || customer?._id || null;
      // Use companyId from session, user, or default to 1
      const companyId = 1; // Replace with dynamic value if available

      // Automatically get posConfigId: prefer passed registerId, fallback to lookup by sessionId
      let posConfigId = route?.params?.registerId || route?.params?.posConfigId || null;
      if (!posConfigId && sessionId) {
        try {
          const sessionList = await fetchPOSSessions({ limit: 10, offset: 0, state: '', });
          console.log('[POS CONFIG] Full session list:', sessionList);
          const session = sessionList.find(s => s.id === sessionId);
          console.log('[POS CONFIG] Session found for sessionId', sessionId, ':', session);
          if (session && session.config_id) {
            // Odoo often returns many2one as [id, name]
            if (Array.isArray(session.config_id)) {
              posConfigId = session.config_id[0];
            } else {
              posConfigId = session.config_id;
            }
          } else {
            posConfigId = null;
          }
          console.log('[POS CONFIG] Extracted posConfigId:', posConfigId);
        } catch (e) {
          console.warn('Failed to auto-fetch posConfigId from session:', e?.message || e);
        }
      }
      // Use existing order if provided; only create if missing
      let createdOrderId = orderId || null;
      let invoiceInfo = null; // will be populated if invoice is created
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

      // Create payment in Odoo for cash or card mode
      if ((paymentMode === 'cash' || paymentMode === 'card') && selectedJournal) {
        try {
          // Fetch payment method id for selected journal
          const paymentMethodId = await fetchPaymentMethodId(selectedJournal.id);
          if (!paymentMethodId) {
            Toast.show({ type: 'error', text1: 'Payment Error', text2: 'No payment method found for selected journal', position: 'bottom' });
            return;
          }
          const payments = [];
          // Only create payment for the order total, not the amount received
          // Change is calculated separately but not recorded as a negative payment
          if (paymentMode === 'cash') {
            // For cash, create ONE payment for the order total
            payments.push({
              amount: total,
              paymentMethodId,
              journalId: selectedJournal.id,
              paymentMode,
            });
            console.log(`💵 Cash payment: Total=${total}, Received=${paidAmount}, Change=${Math.abs(remaining)}`);
          } else if (paymentMode === 'card') {
            // For card, create payment for the order total
            payments.push({
              amount: total,
              paymentMethodId,
              journalId: selectedJournal.id,
              paymentMode,
            });
            console.log(`💳 Card payment: Total=${total}`);
          }
          // Log each payment record for diagnostics
          payments.forEach((p, idx) => {
            const type = p.amount > 0 ? 'RECEIVED' : 'CHANGE';
            console.log(`[PAYMENT LOG] #${idx + 1} Type: ${type}, Amount: ${p.amount}, JournalId: ${p.journalId}, PaymentMethodId: ${p.paymentMethodId}`);
          });
          const paymentPayload = {
            orderId: createdOrderId,
            payments,
            partnerId,
            sessionId,
            companyId
          };
          console.log('JSON-RPC payment payload:', paymentPayload);
          const paymentResp = await createPosPaymentOdoo(paymentPayload);
          console.log('Payment API response:', paymentResp);
          if (paymentResp && paymentResp.error) {
            console.error('Payment API error:', paymentResp.error);
            Toast.show({ type: 'error', text1: 'Payment Error', text2: paymentResp.error.message || JSON.stringify(paymentResp.error) || 'Failed to create payment', position: 'bottom' });
            return;
          }
          
          // Validate/finalize the order after successful payment (only if fully paid)
          const totalPaymentAmount = payments.reduce((sum, p) => sum + p.amount, 0);
          console.log('💰 Total payment amount:', totalPaymentAmount, 'Order total:', total);
          if (totalPaymentAmount >= total) {
            console.log('✅ Payments created. Updating order amount_paid before validation');
            // Update order's amount_paid field
            const updateResp = await updatePosOrderOdoo(createdOrderId, { 
              amount_paid: total,
              state: 'paid'
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

              // Decide whether to create an invoice: user explicitly checked or a customer is present
              const shouldCreateInvoice = invoiceChecked || Boolean(customer && (customer.id || customer._id));
              if (shouldCreateInvoice) {
                try {
                  const actualTotal = Math.round(Number(totalAmount) * 1000) / 1000 || 0;
                  console.log('[INVOICE] Creating invoice for POS order', createdOrderId, 'totalAmount:', actualTotal);

                  // Calculate gross total and ratio
                  const grossTotal = (products || []).reduce((sum, p) => sum + (Number(p.price || p.price_unit || 0) * Number(p.quantity || p.qty || 1)), 0);
                  const ratio = grossTotal > 0 ? actualTotal / grossTotal : 1;

                  // Adjust prices proportionally
                  const invoiceProducts = (products || []).map(p => ({
                    id: p.id,
                    name: p.name || p.product_name || '',
                    quantity: Number(p.quantity || p.qty || 1),
                    price: Math.round(Number(p.price || p.price_unit || 0) * ratio * 1000) / 1000,
                    tax_ids: p.tax_ids || []
                  }));

                  // Adjust last item to ensure exact total match using 6 decimal precision
                  const currentTotal = Math.round(invoiceProducts.reduce((sum, p) => sum + (p.price * p.quantity), 0) * 1000000) / 1000000;
                  const diff = actualTotal - currentTotal;
                  console.log('[INVOICE] currentTotal:', currentTotal, 'actualTotal:', actualTotal, 'diff:', diff);
                  if (Math.abs(diff) > 0.0000001 && invoiceProducts.length > 0) {
                    const last = invoiceProducts[invoiceProducts.length - 1];
                    // Use 6 decimal places for precision, Odoo will handle display rounding
                    const adjustedPrice = Math.round((last.price + diff / last.quantity) * 1000000) / 1000000;
                    console.log('[INVOICE] Adjusting last item price from', last.price, 'to', adjustedPrice);
                    last.price = adjustedPrice;
                  }
                  // Final verification
                  const finalTotal = Math.round(invoiceProducts.reduce((sum, p) => sum + (p.price * p.quantity), 0) * 1000000) / 1000000;
                  console.log('[INVOICE] Final invoice total:', finalTotal, 'Expected:', actualTotal, 'Match:', Math.abs(finalTotal - actualTotal) < 0.0001);

                  const invoiceDate = new Date().toISOString().slice(0,10);
                  const invResp = await createInvoiceOdoo({ partnerId, products: invoiceProducts, invoiceDate, journalId: selectedJournal?.id || null });
                  console.log('[INVOICE] createInvoiceOdoo response:', invResp);
                  if (invResp && invResp.id) {
                    const invoiceId = invResp.id;
                    const invoiceNumber = invResp.invoiceStatus?.name || invResp.name || null;
                    invoiceInfo = { id: invoiceId, number: invoiceNumber };

                    // Link invoice to POS order
                    try {
                      await linkInvoiceToPosOrderOdoo({ orderId: createdOrderId, invoiceId, setState: true, state: 'invoiced' });
                      console.log('[INVOICE] Linked invoice', invoiceId, 'to POS order', createdOrderId);
                    } catch (linkErr) {
                      console.warn('[INVOICE] Failed to link invoice to POS order:', linkErr);
                    }

                    // Optionally create account payment to mark invoice paid if full payment present
                    try {
                      const totalPaymentAmount = (payments || []).reduce((s, p) => s + (p.amount || 0), 0);
                      if (selectedJournal && selectedJournal.id && totalPaymentAmount >= total) {
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

      // Proceed to receipt screen
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
        registerName
      });
    } catch (e) {
      Toast.show({ type: 'error', text1: 'POS Error', text2: e?.message || 'Failed to create POS order', position: 'bottom' });
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.white }}>
      <NavigationHeader title="Payment" onBackPress={() => navigation.goBack()} />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Journal info removed — mapping remains internal */}
        {/* Large Amount Display */}
        <View style={{ alignItems: 'center', marginTop: 32, marginBottom: 12 }}>
          <View style={{ backgroundColor: '#111827', paddingVertical: 16, paddingHorizontal: 28, borderRadius: 12 }}>
            <Text style={{ fontSize: 60, fontWeight: 'bold', color: '#fff' }}>{displayNum(computeTotal())}</Text>
          </View>
        </View>

        {/* Payment Mode Cards */}
        <View style={{ flexDirection: 'row', justifyContent: 'center', marginBottom: 18 }}>
          <TouchableOpacity onPress={async () => {
            setPaymentMode('cash');
            // Use journal id 16 for cash
            const cashJournal = journals.find(j => j.id === 16) || journals.find(j => j.type === 'cash') || { id: 16, name: 'Cash', type: 'cash' };
            setSelectedJournal(cashJournal);
            setTimeout(async () => {
              console.log('Cash card selected, journal id:', cashJournal.id);
              // Fetch and log full payment method details for journal id 9
              try {
                const response = await axios.post(`${ODOO_BASE_URL}/web/dataset/call_kw`, {
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
                if (methods.length > 0) {
                  console.log('Payment method(s) for journal', cashJournal.id, ':', methods);
                } else {
                  console.log('No payment method found for journal', cashJournal.id);
                }
                  // Also fetch and log all payment methods for diagnostics
                  await fetchAllPaymentMethods();
              } catch (e) {
                console.error('Error fetching payment method details:', e);
              }
            }, 100);
          }} style={[styles.modeCard, paymentMode === 'cash' && styles.modeCardSelected]}>
            <Text style={styles.modeCardIcon}>💵</Text>
            <Text style={[styles.modeCardText, paymentMode === 'cash' && styles.modeCardTextSelected]}>Cash</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={async () => {
            setPaymentMode('card');
            // Always use journal id 6 for card
            const cardJournal = journals.find(j => j.id === 6) || journals.find(j => j.type === 'bank');
            setSelectedJournal(cardJournal);
            setTimeout(async () => {
              if (cardJournal) {
                console.log('Card payment selected, journal id:', cardJournal.id);
                const paymentMethodId = await fetchPaymentMethodId(cardJournal.id);
                // This will log: Fetched payment_method_id for journal ...
              } else {
                console.log('Card payment selected, no journal mapped');
              }
            }, 100);
          }} style={[styles.modeCard, paymentMode === 'card' && styles.modeCardSelected]}>
              <Text style={styles.modeCardIcon}>💳</Text>
              <Text style={[styles.modeCardText, paymentMode === 'card' && styles.modeCardTextSelected]}>Card</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={async () => {
                setPaymentMode('card');
                setTimeout(async () => {
                  if (selectedJournal) {
                    console.log('Card payment selected, journal id:', selectedJournal.id);
                    try {
                      const response = await axios.post(`${ODOO_BASE_URL}/web/dataset/call_kw`, {
                        jsonrpc: '2.0',
                        method: 'call',
                        params: {
                          model: 'pos.payment.method',
                          method: 'search_read',
                          args: [[['journal_id', '=', selectedJournal.id]]],
                          kwargs: { fields: ['id', 'name', 'journal_id', 'is_cash_count', 'receivable_account_id', 'split_transactions'], limit: 10 },
                        },
                      }, { headers: { 'Content-Type': 'application/json' } });
                      const methods = response.data?.result || [];
                      if (methods.length > 0) {
                        console.log('Payment method(s) for journal', selectedJournal.id, ':', methods);
                      } else {
                        console.log('No payment method found for journal', selectedJournal.id);
                      }
                      await fetchAllPaymentMethods();
                    } catch (e) {
                      console.error('Error fetching payment method details:', e);
                    }
                  } else {
                    console.log('Card payment selected, no journal mapped');
                  }
                }, 100);
              }}
              style={{ display: 'none' }}
            />
          <TouchableOpacity onPress={async () => {
            setPaymentMode('account');
            setTimeout(async () => {
              if (selectedJournal) {
                console.log('Customer Account card selected, journal id:', selectedJournal.id);
                await fetchPaymentMethodId(selectedJournal.id);
              } else {
                console.log('Customer Account card selected, no journal mapped');
              }
            }, 100);
          }} style={[styles.modeCard, paymentMode === 'account' && styles.modeCardSelected]}>
            <Text style={styles.modeCardIcon}>🏦</Text>
            <Text style={[styles.modeCardText, paymentMode === 'account' && styles.modeCardTextSelected]}>Customer Account</Text>
          </TouchableOpacity>
        </View>

        {/* Payment Input and Keypad */}
        <View style={{ alignItems: 'center', marginBottom: 18 }}>
          <View style={{
            width: '80%',
            backgroundColor: '#f6f8fa',
            borderRadius: 18,
            padding: 20,
            alignItems: 'center',
            marginBottom: 12,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.12,
            shadowRadius: 8,
            elevation: 4,
          }}>
            {paymentMode === 'account' ? (
              <>
                <Text style={{ color: '#2b6cb0', fontSize: 22, marginTop: 6 }}>Amount to be charged to account</Text>
                <Text style={{ color: '#2b6cb0', fontSize: 26, fontWeight: 'bold', marginBottom: 8 }}>{displayNum(total)}</Text>
              </>
            ) : (
              <>
                <Text style={{ fontSize: 26, color: '#222', marginBottom: 8, fontWeight: 'bold' }}>
                  {paymentMode === 'card' ? 'Card' : 'Cash'}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', width: '100%' }}>
                  <Text style={{ fontSize: 36, color: '#222', textAlign: 'center', flex: 1, fontWeight: 'bold' }}>{inputAmount ? displayNum(parseFloat(inputAmount)) : '0'}</Text>
                  {inputAmount ? (
                    <TouchableOpacity onPress={() => setInputAmount('')} style={{ marginLeft: 8 }}>
                      <Text style={{ fontSize: 28, color: '#c00', fontWeight: 'bold' }}>✕</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
                {remaining < 0 ? (
                  <>
                    <Text style={{ color: 'green', fontSize: 22, marginTop: 6 }}>Change</Text>
                    <Text style={{ color: 'green', fontSize: 26, fontWeight: 'bold', marginBottom: 8 }}>{displayNum(Math.abs(remaining))}</Text>
                  </>
                ) : (
                  <>
                    <Text style={{ color: '#c00', fontSize: 22, marginTop: 6 }}>Remaining</Text>
                    <Text style={{ color: '#c00', fontSize: 26, fontWeight: 'bold', marginBottom: 8 }}>{displayNum(remaining)}</Text>
                  </>
                )}
              </>
            )}
          </View>

          {/* Keypad */}
          <View style={{
            backgroundColor: '#f6f8fa',
            borderRadius: 18,
            padding: 18,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.10,
            shadowRadius: 6,
            elevation: 3,
            marginTop: 4,
          }}>
            {keypadRows.map((row, i) => (
              <View key={i} style={{ flexDirection: 'row', justifyContent: 'center', marginBottom: 12 }}>
                {row.map((key) => {
                  const isAction = key === 'C' || key === '⌫' || key.startsWith('+');
                  return (
                    <TouchableOpacity
                      key={key}
                      onPress={() => handleKeypad(key)}
                      style={{
                        width: 80,
                        height: 64,
                        backgroundColor: isAction ? '#2b6cb0' : '#fff',
                        borderRadius: 14,
                        marginHorizontal: 10,
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderWidth: 1,
                        borderColor: isAction ? '#255a95' : '#eee',
                        shadowColor: isAction ? '#2b6cb0' : '#000',
                        shadowOffset: { width: 0, height: 1 },
                        shadowOpacity: isAction ? 0.18 : 0.08,
                        shadowRadius: 4,
                        elevation: isAction ? 2 : 1,
                      }}
                    >
                      <Text style={{ fontSize: 28, color: isAction ? '#fff' : '#222', fontWeight: key.startsWith('+') || isAction ? 'bold' : 'normal' }}>{key}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
          </View>
        </View>

        {/* Customer/Validate */}
          <View style={{ marginHorizontal: 18, marginTop: 10 }}>
            <TouchableOpacity onPress={openCustomerSelector} style={{
              backgroundColor: '#f6f8fa',
              borderRadius: 16,
              paddingVertical: 24,
              alignItems: 'center',
              borderWidth: 1,
              borderColor: '#eee',
              elevation: 2,
              flexDirection: 'column',
              justifyContent: 'center',
            }}>
              <Text style={{ fontSize: 24, fontWeight: 'bold', color: '#222' }}>Customer</Text>
              <Text style={{ fontSize: 22, color: '#444', marginTop: 4 }}>{customer?.name || 'Select'}</Text>
            </TouchableOpacity>
          </View>
        <View style={{ alignItems: 'center', marginTop: 18, marginBottom: 20 }}>
          <Button title="Validate" onPress={handlePay} style={{ width: '90%', paddingVertical: 16, borderRadius: 10 }} textStyle={{ fontSize: 20 }} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

export default POSPayment;

const styles = StyleSheet.create({
  modeCard: { flex: 1, marginHorizontal: 6, backgroundColor: '#f6f8fa', borderRadius: 12, paddingVertical: 18, alignItems: 'center', borderWidth: 2, borderColor: '#eee', elevation: 2 },
  modeCardSelected: { backgroundColor: '#2b6cb0', borderColor: '#255a95' },
  modeCardIcon: { fontSize: 28, marginBottom: 8 },
  modeCardText: { color: '#222', fontWeight: '700', fontSize: 18 },
  modeCardTextSelected: { color: '#fff' },
});
