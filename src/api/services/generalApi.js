// Full workflow: create invoice, post, pay, and log status
export const processInvoiceWithPaymentOdoo = async ({ partnerId, products = [], journalId, invoiceDate = null, reference = '', paymentAmount = null } = {}) => {
  try {
    console.log('[PROCESS] Starting processInvoiceWithPaymentOdoo with params:', { partnerId, products, journalId, invoiceDate, reference, paymentAmount });

    // Step 0: If journalId is not provided, fetch and select sales journal
    let finalJournalId = journalId;
    if (!finalJournalId) {
      const journals = await fetchPaymentJournalsOdoo();
      const salesJournal = journals.find(j => j.type === 'sale');
      if (!salesJournal) throw new Error('No sales journal found in Odoo.');
      finalJournalId = salesJournal.id;
      console.log('[PROCESS] Auto-selected sales journal:', salesJournal);
    }

    // Step 1: Create and post invoice
    const invoiceResult = await createInvoiceOdoo({ partnerId, products, journalId: finalJournalId, invoiceDate, reference });
    console.log('[PROCESS] Invoice creation result:', invoiceResult);
    if (!invoiceResult.id) {
      throw new Error('Invoice creation failed');
    }
    if (invoiceResult.posted) {
      console.log('[PROCESS] Invoice is posted (ready for payment).');
    } else {
      throw new Error('Invoice was created but not posted. Cannot proceed with payment.');
    }

    // Step 2: Register payment for invoice
    let amount = paymentAmount;
    if (amount === null) {
      amount = products.reduce((sum, p) => sum + (p.price || p.price_unit || p.list_price || 0) * (p.quantity || p.qty || 1), 0);
    }

    const paymentResult = await createAccountPaymentOdoo({ partnerId, journalId: finalJournalId, amount, invoiceId: invoiceResult.id });
    console.log('[PROCESS] Payment creation result:', paymentResult);

    if (!paymentResult.result) {
      throw new Error('Payment creation failed');
    }

    // Step 3: Post the payment
    const paymentId = paymentResult.result;
    const postPaymentResponse = await fetch('http://103.42.198.95:8969/web/dataset/call_kw', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'call',
        params: {
          model: 'account.payment',
          method: 'action_post',
          args: [[paymentId]],
          kwargs: {},
        },
        id: new Date().getTime(),
      }),
    });
    const postPaymentResult = await postPaymentResponse.json();
    console.log('[PROCESS] Payment post result:', postPaymentResult);

    // Step 4: Verify payment reconciliation
    const paymentStatusResponse = await fetch('http://103.42.198.95:8969/web/dataset/call_kw', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'call',
        params: {
          model: 'account.payment',
          method: 'search_read',
          args: [[['id', '=', paymentId]]],
          kwargs: { fields: ['id', 'reconciled', 'state', 'invoice_ids'] },
        },
        id: new Date().getTime(),
      }),
    });
    const paymentStatus = await paymentStatusResponse.json();
    const paymentDetails = paymentStatus.result?.[0];
    console.log('[PROCESS] Payment details after posting:', paymentDetails);

    if (!paymentDetails.reconciled) {
      console.warn('[PROCESS] Payment is not reconciled. Attempting manual reconciliation.');
      const reconcileResponse = await fetch('http://103.42.198.95:8969/web/dataset/call_kw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'call',
          params: {
            model: 'account.payment',
            method: 'reconcile',
            args: [[paymentId]],
            kwargs: {},
          },
          id: new Date().getTime(),
        }),
      });
      const reconcileResult = await reconcileResponse.json();
      console.log('[PROCESS] Manual reconciliation result:', reconcileResult);
    }

    // Step 5: Verify invoice status
    const invoiceStatusResponse = await fetch('http://103.42.198.95:8969/web/dataset/call_kw', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'call',
        params: {
          model: 'account.move',
          method: 'search_read',
          args: [[['id', '=', invoiceResult.id]]],
          kwargs: { fields: ['id', 'payment_state', 'amount_residual'] },
        },
        id: new Date().getTime(),
      }),
    });
    const invoiceStatus = await invoiceStatusResponse.json();
    const updatedInvoice = invoiceStatus.result?.[0];

    if (updatedInvoice.payment_state === 'paid' && updatedInvoice.amount_residual === 0) {
      console.log('[PROCESS] Invoice payment successfully linked and marked as paid.');
    } else {
      throw new Error('[PROCESS] Invoice payment not fully processed. Check payment state or residual amount.');
    }

    return { invoiceResult, paymentResult, invoiceStatus: updatedInvoice };
  } catch (error) {
    console.error('[PROCESS] processInvoiceWithPaymentOdoo error:', error);
    return { error };
  }
};
// Validate POS order in Odoo to trigger name generation
// Update POS order fields (like amount_paid, state)
export const updatePosOrderOdoo = async (orderId, values) => {
  try {
    console.log(`📝 Updating POS order ${orderId} with:`, values);
    const response = await axios.post(`${getOdooUrl()}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'pos.order',
        method: 'write',
        args: [[orderId], values],
        kwargs: {},
      },
    }, { headers: { 'Content-Type': 'application/json' } });
    if (response.data && response.data.error) {
      console.error('Odoo update pos.order error:', response.data.error);
      return { error: response.data.error };
    }
    console.log('✅ Order updated successfully');
    return { result: response.data.result };
  } catch (error) {
    console.error('updatePosOrderOdoo error:', error);
    return { error };
  }
};

// Module-level map of orderId → in-flight location promise. Used so the
// POSPayment screen can kick off capture in the background and the receipt
// screen can subscribe to the same promise without passing a non-serializable
// value through navigation params.
const _locationPromises = new Map();
export const registerLocationPromise = (orderId, promise) => {
  if (!orderId || !promise) return;
  _locationPromises.set(String(orderId), promise);
  // Auto-clean after 60s so the map doesn't grow forever.
  setTimeout(() => _locationPromises.delete(String(orderId)), 60_000);
};
export const getLocationPromise = (orderId) => {
  if (!orderId) return null;
  return _locationPromises.get(String(orderId)) || null;
};

// Capture device GPS + reverse-geocoded place name and write them onto the
// just-validated pos.order. Lazy-loads expo-location so the rest of the API
// module doesn't pay the import cost. Graceful on permission denial / GPS
// timeout — returns null and logs `[POSLocation] denied/failed`. The 3
// fields live in the standalone `pos_order_location` Odoo module.
// Get a fresh device location fix WITHOUT touching Odoo. Returns either
//   { latitude, longitude, locationName }   on success
// or { error: 'expo_missing'|'services_off'|'permission_denied'|'no_fix' }
//
// Position-first ordering (don't trust hasServicesEnabledAsync up front —
// on Android it returns stale `false` right after app launch / focus, which
// is what produced the "popup says unavailable but location is actually on"
// regression). We try permission → position → only then re-check services.
// By the time we re-check, the failed position attempt has refreshed the
// services-enabled cache, so we get the real value.
export const getCurrentDeviceLocation = async () => {
  console.log('[POSLocation] gate start');
  let Location;
  try { Location = require('expo-location'); }
  catch (e) {
    console.warn('[POSLocation] expo-location not available:', e?.message || e);
    return { error: 'expo_missing' };
  }
  try {
    const perm = await Location.requestForegroundPermissionsAsync();
    console.log('[POSLocation] perm status =', perm?.status, 'canAskAgain=', perm?.canAskAgain);
    if (perm?.status !== 'granted') {
      console.log('[POSLocation] → permission_denied');
      return { error: 'permission_denied' };
    }

    // Some Android devices report locationServicesEnabled === true while the
    // user's "Location Mode" sub-setting is still "Device only" (GPS chip
    // only, no Google Play Services network positioning). In that mode,
    // Fused Location Provider rejects getCurrentPositionAsync with
    // "Current location is unavailable" — exactly the failure we see when
    // POSPayment is the first location-using screen of the session.
    // enableNetworkProviderAsync pops a one-tap Google Play Services dialog
    // that nudges the user to switch to High accuracy mode; after one OK,
    // the device stays in that mode permanently and all subsequent calls
    // resolve. Wrapped in try/catch because it throws on iOS (not supported)
    // and on Android devices without Play Services.
    try {
      await Location.enableNetworkProviderAsync();
      console.log('[POSLocation] network provider enabled');
    } catch (e) {
      console.log('[POSLocation] enableNetworkProviderAsync skipped:', e?.message || e);
    }

    // VERBATIM port from employee_attendance/VisitForm.js — single call with
    // no options. expo-location picks the default accuracy and waits as long
    // as the OS needs to deliver a fix. No Promise.race, no timeout cap; that
    // was prematurely failing on cold-start GPS lock on cashier devices.
    let pos = null;
    try {
      pos = await Location.getCurrentPositionAsync({});
    } catch (e) {
      console.warn('[POSLocation] getCurrentPositionAsync failed:', e?.message || e);
    }

    if (pos?.coords?.latitude != null) {
      const lat = pos.coords.latitude;
      const lon = pos.coords.longitude;
      let locationName = '';
      // Cache key by 4-decimal-rounded coordinates (~11m radius) so a
      // cashier ringing receipts from the same store doesn't re-geocode
      // every order. 24h TTL — drops stale data if the device is moved.
      const cacheKey = `posLocationCache:${lat.toFixed(4)},${lon.toFixed(4)}`;
      try {
        const cached = await AsyncStorage.getItem(cacheKey);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (parsed?.locationName && parsed?.savedAt && (Date.now() - parsed.savedAt) < 24 * 60 * 60 * 1000) {
            console.log('[POSLocation] cache hit:', parsed.locationName);
            return { latitude: lat, longitude: lon, locationName: parsed.locationName };
          }
        }
      } catch (cacheErr) {
        console.warn('[POSLocation] cache read failed:', cacheErr?.message || cacheErr);
      }

      // Retry the reverse-geocode up to 4 times. Backoff applies BETWEEN
      // attempts only — the first attempt fires immediately so warm-path
      // cashiers don't eat a 600ms pre-sleep. Backoff exists because
      // Android's Geocoder intermittently returns IOException / "Service
      // not available" for a few seconds after a cold app start; spacing
      // the retries (~400ms, 800ms, 1200ms) lets Google Play Services
      // warm up before each retry.
      for (let attempt = 1; attempt <= 4; attempt++) {
        if (attempt > 1) {
          await new Promise((r) => setTimeout(r, attempt * 400));
        }
        try {
          const places = await Promise.race([
            Location.reverseGeocodeAsync({ latitude: lat, longitude: lon }),
            new Promise((_, rej) => setTimeout(() => rej(new Error('reverse-geocode timeout')), 3000)),
          ]);
          const place = (places && places[0]) || null;
          if (place) {
            locationName = [place.name, place.street, place.city, place.region, place.country]
              .filter(Boolean).join(', ');
            if (!locationName) {
              locationName = [place.subregion, place.district, place.postalCode, place.isoCountryCode, place.country]
                .filter(Boolean).join(', ');
            }
          }
          if (locationName) break;
        } catch (geoError) {
          console.warn(`[POSLocation] reverse-geocode attempt ${attempt} failed:`, geoError?.message || geoError);
        }
      }

      // Fallback to OpenStreetMap Nominatim if Android Geocoder gave us
      // nothing. Free, no API key, requires a User-Agent header per their
      // ToS. Single attempt with a 3s timeout — we don't want to chain
      // failure modes if their server is slow.
      if (!locationName) {
        try {
          console.log('[POSLocation] geocoder empty, falling back to Nominatim');
          const ctrl = new AbortController();
          const tid = setTimeout(() => ctrl.abort(), 3000);
          const resp = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=14&addressdetails=1`,
            {
              method: 'GET',
              headers: { 'User-Agent': 'GroceryShopPOS/1.0', 'Accept-Language': 'en' },
              signal: ctrl.signal,
            }
          ).catch((e) => { console.warn('[POSLocation] Nominatim fetch failed:', e?.message); return null; });
          clearTimeout(tid);
          if (resp && resp.ok) {
            const json = await resp.json().catch(() => null);
            const a = json?.address || {};
            locationName = [
              a.road || a.pedestrian || a.neighbourhood,
              a.suburb || a.village || a.town || a.city,
              a.state_district || a.state,
              a.country,
            ].filter(Boolean).join(', ') || json?.display_name || '';
          }
        } catch (nErr) {
          console.warn('[POSLocation] Nominatim fallback errored:', nErr?.message || nErr);
        }
      }

      if (locationName) {
        try {
          await AsyncStorage.setItem(cacheKey, JSON.stringify({ locationName, savedAt: Date.now() }));
        } catch (cacheWrErr) {
          console.warn('[POSLocation] cache write failed:', cacheWrErr?.message || cacheWrErr);
        }
      }

      console.log('[POSLocation] → success', { lat, lon, locationName });
      return { latitude: lat, longitude: lon, locationName };
    }

    let servicesOn = true;
    try { servicesOn = await Location.hasServicesEnabledAsync(); }
    catch (e) { console.warn('[POSLocation] hasServicesEnabledAsync threw:', e?.message || e); servicesOn = true; }
    console.log('[POSLocation] post-fetch hasServicesEnabledAsync =', servicesOn);
    if (!servicesOn) {
      console.log('[POSLocation] → services_off');
      return { error: 'services_off' };
    }
    console.log('[POSLocation] → no_fix');
    return { error: 'no_fix' };
  } catch (err) {
    console.warn('[POSLocation] gate threw:', err?.message || err);
    return { error: 'no_fix' };
  }
};

// Persist a previously-captured fix onto a pos.order. Called after submit,
// when we finally have the new order id. Returns true on write success.
export const writeOrderLocationOdoo = async (orderId, fix) => {
  if (!orderId || !fix || fix.error) return false;
  try {
    const resp = await axios.post(`${getOdooUrl()}/web/dataset/call_kw`, {
      jsonrpc: '2.0', method: 'call',
      params: {
        model: 'pos.order', method: 'write',
        args: [[Number(orderId)], {
          order_latitude: Number(fix.latitude),
          order_longitude: Number(fix.longitude),
          order_location_name: fix.locationName || '',
        }],
        kwargs: {},
      },
    }, { headers: { 'Content-Type': 'application/json' } });
    if (resp.data?.error) {
      console.warn('[POSLocation] write failed:', resp.data.error?.data?.message || resp.data.error);
      return false;
    }
    return true;
  } catch (e) {
    console.warn('[POSLocation] write threw:', e?.message || e);
    return false;
  }
};

// Cancel a draft pos.order. Just flips state to 'cancel'; no picking is
// created. Used by the Cancel Order button on the draft-resume screen.
export const cancelPosOrderOdoo = async (orderId) => {
  if (!orderId) return { error: { message: 'orderId is required' } };
  try {
    const resp = await axios.post(`${getOdooUrl()}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'pos.order',
        method: 'write',
        args: [[Number(orderId)], { state: 'cancel' }],
        kwargs: {},
      },
    }, { headers: { 'Content-Type': 'application/json' } });
    if (resp.data?.error) return { error: resp.data.error };
    return { result: true };
  } catch (e) {
    console.warn('cancelPosOrderOdoo error:', e?.message || e);
    return { error: { message: e?.message || 'Cancel failed' } };
  }
};

// Read Odoo's freshly-allocated POS reference for an order. Called right
// after submit so the receipt + MyOrders show the real ref (e.g. "Shop/0001")
// instead of the placeholder "/" that exists for a brief window before
// Odoo's sequence fires. Retries once after 500ms when the first read
// still shows "/" — that race window is short but real on slower DBs.
export const fetchPosOrderRefOdoo = async (orderId) => {
  if (!orderId) return null;
  const safe = (s) => (s && s !== '/' ? s : '');
  const readOnce = async () => {
    try {
      const resp = await axios.post(`${getOdooUrl()}/web/dataset/call_kw`, {
        jsonrpc: '2.0', method: 'call',
        params: {
          model: 'pos.order', method: 'read',
          args: [[Number(orderId)], ['name', 'pos_reference']],
          kwargs: {},
        },
      }, { headers: { 'Content-Type': 'application/json' } });
      const r = resp.data?.result?.[0];
      if (!r) return null;
      return {
        name: safe(r.name),
        posReference: safe(r.pos_reference) || safe(r.name),
      };
    } catch (e) {
      console.warn('[POS] ref fetch failed:', e?.message || e);
      return null;
    }
  };

  let result = await readOnce();
  if (!result?.posReference && !result?.name) {
    // Sequence might not have committed yet — give Odoo a tick and re-read.
    await new Promise((r) => setTimeout(r, 500));
    const retry = await readOnce();
    if (retry && (retry.posReference || retry.name)) result = retry;
  }
  return result;
};

export const captureAndStoreOrderLocation = async (orderId) => {
  if (!orderId) return null;
  let Location;
  try {
    Location = require('expo-location');
  } catch (e) {
    console.warn('[POSLocation] expo-location not available:', e?.message || e);
    return null;
  }
  console.log('[POSLocation] capture start orderId=', orderId);
  try {
    const perm = await Location.requestForegroundPermissionsAsync();
    console.log('[POSLocation] permission status =', perm?.status);
    if (perm?.status !== 'granted') {
      console.log('[POSLocation] denied — permission not granted');
      return null;
    }
    // Fast path: try the OS's last-known position first. Returns instantly
    // (no GPS lock) when there's a fix from the last 60s. Falls back to
    // an active fetch only when the cache is stale.
    let pos = null;
    try {
      pos = await Location.getLastKnownPositionAsync({
        maxAge: 60_000,
        requiredAccuracy: 200,
      });
      if (pos) console.log('[POSLocation] fast-path lastKnown OK');
    } catch (lastErr) {
      // Some devices reject getLastKnownPositionAsync without options support.
      console.warn('[POSLocation] lastKnown failed:', lastErr?.message || lastErr);
    }
    if (!pos) {
      // expo-location's `timeout` option is unreliable on some devices —
      // it can hang indefinitely. Wrap with an explicit Promise.race so
      // we ALWAYS resolve within ~3.5s, even if the GPS subsystem stalls.
      console.log('[POSLocation] active fetch (hard timeout 3.5s)');
      pos = await Promise.race([
        Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy?.Low ?? 1,
          timeout: 3000,
        }).catch((e) => {
          console.warn('[POSLocation] getCurrentPositionAsync rejected:', e?.message || e);
          return null;
        }),
        new Promise((resolve) => setTimeout(() => {
          console.warn('[POSLocation] hard timeout — getCurrentPositionAsync did not resolve in 3.5s');
          resolve(null);
        }, 3500)),
      ]);
      if (!pos) {
        console.warn('[POSLocation] no fix available, returning null');
        return null;
      }
      console.log('[POSLocation] active fetch returned pos');
    }
    const latitude = pos?.coords?.latitude;
    const longitude = pos?.coords?.longitude;
    if (latitude == null || longitude == null) {
      console.warn('[POSLocation] failed — no coords from GPS');
      return null;
    }
    console.log('[POSLocation] coords resolved', { latitude, longitude });
    let locationName = '';
    try {
      const places = await Location.reverseGeocodeAsync({ latitude, longitude });
      const p = (places && places[0]) || null;
      if (p) {
        locationName = [p.street, p.name && p.name !== p.street ? p.name : null,
                        p.district, p.city || p.subregion, p.region, p.country]
          .filter(Boolean).join(', ');
      }
    } catch (geoErr) {
      console.warn('[POSLocation] reverse geocode failed:', geoErr?.message || geoErr);
    }
    const writeResp = await axios.post(`${getOdooUrl()}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'pos.order',
        method: 'write',
        args: [[Number(orderId)], {
          order_latitude: Number(latitude),
          order_longitude: Number(longitude),
          order_location_name: locationName || '',
        }],
        kwargs: {},
      },
    }, { headers: { 'Content-Type': 'application/json' } });
    if (writeResp.data?.error) {
      console.warn('[POSLocation] write failed:', writeResp.data.error?.data?.message || writeResp.data.error);
      return null;
    }
    console.log('[POSLocation] captured', { orderId, latitude, longitude, locationName });
    return { latitude, longitude, locationName };
  } catch (err) {
    console.warn('[POSLocation] failed:', err?.message || err);
    return null;
  }
};

// Delete a draft pos.order from Odoo. Used by POSPayment when finalizing a
// pre-existing draft (Place Order → POSPayment): we throw the draft away
// and re-submit via sync_from_ui because the manual create+payment+write
// +action_paid pipeline does not reliably create the stock.picking, so
// stock never decrements. sync_from_ui DOES create the picking, so the
// safest fix is to route every paid order through that single path.
//
// Tries unlink first; if Odoo refuses (record locked, ACL, payments
// already attached), falls back to writing state='cancel' which is also
// allowed and won't conflict with re-submission.
export const deletePosOrderOdoo = async (orderId) => {
  if (!orderId) return { result: true };
  const url = `${getOdooUrl()}/web/dataset/call_kw`;
  try {
    const resp = await axios.post(url, {
      jsonrpc: '2.0',
      method: 'call',
      params: { model: 'pos.order', method: 'unlink', args: [[Number(orderId)]], kwargs: {} },
    }, { headers: { 'Content-Type': 'application/json' } });
    if (!resp.data?.error) return { result: true };
    console.warn('[POS] unlink draft failed, falling back to state=cancel:', resp.data.error?.data?.message || resp.data.error);
  } catch (e) {
    console.warn('[POS] unlink threw, falling back to state=cancel:', e?.message || e);
  }
  try {
    const resp = await axios.post(url, {
      jsonrpc: '2.0',
      method: 'call',
      params: { model: 'pos.order', method: 'write', args: [[Number(orderId)], { state: 'cancel' }], kwargs: {} },
    }, { headers: { 'Content-Type': 'application/json' } });
    if (resp.data?.error) return { error: resp.data.error };
    return { result: true };
  } catch (e) {
    return { error: { message: e?.message || 'Failed to discard draft' } };
  }
};

export const validatePosOrderOdoo = async (orderId) => {
  try {
    const response = await axios.post(`${getOdooUrl()}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'pos.order',
        method: 'action_pos_order_paid',
        args: [[orderId]],
        kwargs: {},
      },
    }, { headers: { 'Content-Type': 'application/json' } });
    if (response.data && response.data.error) {
      console.error('Odoo validate pos.order error:', response.data.error);
      return { error: response.data.error };
    }
    return { result: response.data.result };
  } catch (error) {
    console.error('validatePosOrderOdoo error:', error);
    return { error };
  }
};

// Submit a POS order via Odoo's official UI pipeline — the same entry point
// the web POS uses, and the ONLY supported way to make Odoo create the
// stock.picking that decrements qty_available. The 4-step manual flow
// (create + payment + write + action_paid) does NOT trigger picking creation
// reliably, which is why orders submitted through the app's POS appeared to
// succeed but never actually moved stock.
//
// Odoo renamed the method between versions:
//   - Odoo 18+ (incl. 19): pos.order.sync_from_ui  (flat order dicts, payment_ids)
//   - Odoo 17:             pos.order.create_from_ui  (data-wrapped, payment_ids)
//   - Odoo 13-16:          pos.order.create_from_ui  (data-wrapped, statement_ids)
// We try them in that order and fall through on missing-method / unknown-field.
export const submitPosOrderToOdoo = async ({
  orderUid, sessionId, posConfigId, userId, partnerId,
  lines, payments,
  amountTotal, amountTax = 0, amountPaid, amountReturn = 0,
  pricelistId = false, toInvoice = false,
  creationDate = new Date().toISOString(),
  companyId = 1,
  // When false, override product.taxes_id with an empty set on every line
  // so Odoo books the order with zero tax (receipt / invoice / accounting
  // all align on "no tax"). When true (default), each line's `taxIds`
  // is shipped verbatim (we always set `tax_ids` rather than relying on
  // Odoo's auto-fill, which doesn't fire reliably on sync_from_ui in
  // Odoo 18+).
  withTax = true,
} = {}) => {
  if (!sessionId) return { error: { message: 'sessionId is required' } };
  if (!Array.isArray(lines) || lines.length === 0) return { error: { message: 'lines required' } };
  if (!Array.isArray(payments) || payments.length === 0) return { error: { message: 'payments required' } };

  const baseUrl = getOdooUrl();

  const lineTuples = lines.map((l) => {
    const vals = {
      product_id: l.product_id,
      qty: Number(l.qty) || 0,
      price_unit: Number(l.price_unit) || 0,
      price_subtotal: Number(l.price_subtotal) || 0,
      price_subtotal_incl: Number(l.price_subtotal_incl ?? l.price_subtotal) || 0,
      discount: Number(l.discount) || 0,
      name: l.name || '',
      pack_lot_ids: [],
    };
    if (l.customer_note && String(l.customer_note).trim()) {
      vals.customer_note = String(l.customer_note).trim();
    }
    // Always write tax_ids explicitly. The caller passes the resolved
    // Odoo tax ids per line (empty when "Without Tax" was selected). We
    // never rely on Odoo's auto-fill from product.taxes_id because
    // sync_from_ui in 18+ leaves it empty otherwise.
    const ids = withTax === false
      ? []
      : (Array.isArray(l.taxIds) ? l.taxIds : []);
    vals.tax_ids = [[6, 0, ids]];
    return [0, 0, vals];
  });

  const paymentTuples = payments
    .filter((p) => Number(p.amount) !== 0)
    .map((p) => [0, 0, {
      amount: Number(p.amount) || 0,
      payment_method_id: p.payment_method_id,
      name: p.name || creationDate,
    }]);

  const isMethodMissing = (err) => {
    const msg = err?.payload?.data?.message || err?.payload?.message || '';
    const args = (err?.payload?.data?.arguments || []).join(' ');
    return /does not exist/i.test(msg) || /does not exist/i.test(args);
  };

  // ── Odoo 18+: pos.order.sync_from_ui ───────────────────────────────────
  // Flat order dict in a list. No `data:` wrapper. Order is already paid.
  // Don't pre-set `name` or `pos_reference` — Odoo's POS config sequence
  // assigns them (e.g. "Clothes Shop - 000042"). `config_id` is required
  // so Odoo can look up the right per-config sequence; without it the
  // order ends up with name "/" because no sequence fires.
  const buildSyncFromUiOrder = () => ({
    id: orderUid,
    session_id: sessionId,
    config_id: posConfigId,
    partner_id: partnerId || false,
    user_id: userId || false,
    fiscal_position_id: false,
    pricelist_id: pricelistId || false,
    company_id: companyId,
    amount_paid: Number(amountPaid) || 0,
    amount_total: Number(amountTotal) || 0,
    amount_tax: Number(amountTax) || 0,
    amount_return: Number(amountReturn) || 0,
    // Ship as draft so sync_from_ui creates the order + payments without
    // firing action_pos_order_paid inside the same transaction (Odoo's
    // _is_pos_order_paid check has been failing when state='paid' is set
    // up-front — likely because the amount_paid compute field hasn't
    // settled before the check). We call action_pos_order_paid via a
    // separate RPC right after sync_from_ui returns the id.
    state: 'draft',
    lines: lineTuples,
    payment_ids: paymentTuples,
    // Intentionally disabled — Odoo's sync_from_ui-driven invoice creation
    // is unreliable on this install (the linked account.move sometimes
    // doesn't appear in Accounting → Customers → Invoices). The client
    // calls createInvoiceOdoo + linkInvoiceToPosOrderOdoo manually right
    // after the order is created, which guarantees a posted out_invoice.
    to_invoice: false,
  });

  const callSyncFromUi = async () => {
    const orderPayload = buildSyncFromUiOrder();
    console.log('[SUBMIT PAYLOAD] sync_from_ui order=', JSON.stringify(orderPayload));
    const resp = await axios.post(`${baseUrl}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'pos.order',
        method: 'sync_from_ui',
        args: [[orderPayload]],
        kwargs: {},
      },
    }, { headers: { 'Content-Type': 'application/json' } });
    if (resp.data?.error) {
      console.log('[SUBMIT RESPONSE] sync_from_ui error=', JSON.stringify(resp.data.error));
      const e = new Error('sync_from_ui error');
      e.payload = resp.data.error;
      throw e;
    }
    console.log('[SUBMIT RESPONSE] sync_from_ui result=', JSON.stringify(resp.data?.result));
    return resp.data?.result ?? null;
  };

  // ── Odoo 13-17: pos.order.create_from_ui ───────────────────────────────
  const buildCreateFromUiData = (paymentsKey) => ({
    name: `Order ${orderUid}`,
    amount_paid: Number(amountPaid) || 0,
    amount_total: Number(amountTotal) || 0,
    amount_tax: Number(amountTax) || 0,
    amount_return: Number(amountReturn) || 0,
    lines: lineTuples,
    [paymentsKey]: paymentTuples,
    pos_session_id: sessionId,
    partner_id: partnerId || false,
    user_id: userId || false,
    uid: orderUid,
    sequence_number: 1,
    creation_date: creationDate,
    fiscal_position_id: false,
    pricelist_id: pricelistId || false,
    company_id: companyId,
  });

  const callCreateFromUi = async (paymentsKey) => {
    const orders = [{
      id: orderUid,
      data: buildCreateFromUiData(paymentsKey),
      to_invoice: !!toInvoice,
    }];
    const resp = await axios.post(`${baseUrl}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'pos.order',
        method: 'create_from_ui',
        args: [orders, false],
        kwargs: {},
      },
    }, { headers: { 'Content-Type': 'application/json' } });
    if (resp.data?.error) {
      const e = new Error('create_from_ui error');
      e.payload = resp.data.error;
      throw e;
    }
    return resp.data?.result ?? null;
  };

  // ── Dispatch ───────────────────────────────────────────────────────────
  let result = null;
  try {
    result = await callSyncFromUi();
  } catch (err) {
    if (!isMethodMissing(err)) {
      return { error: err.payload || { message: err.message || 'sync_from_ui failed' } };
    }
    console.warn('sync_from_ui not on this Odoo, falling back to create_from_ui');
    try {
      result = await callCreateFromUi('payment_ids');
    } catch (err2) {
      const msg2 = err2?.payload?.data?.message || err2?.payload?.message || '';
      if (/payment_ids|invalid|unknown field/i.test(msg2)) {
        console.warn('create_from_ui: payment_ids rejected, retrying with statement_ids');
        try {
          result = await callCreateFromUi('statement_ids');
        } catch (err3) {
          return { error: err3.payload || { message: err3.message || 'create_from_ui failed' } };
        }
      } else {
        return { error: err2.payload || { message: err2.message || 'create_from_ui failed' } };
      }
    }
  }

  // ── Result extraction (sync_from_ui vs create_from_ui shapes) ──────────
  let createdId = null;
  if (result && typeof result === 'object' && !Array.isArray(result) && Array.isArray(result['pos.order'])) {
    // sync_from_ui shape: { 'pos.order': [{id, ...}], 'pos.order.line': [...], 'pos.payment': [...] }
    const first = result['pos.order'][0];
    createdId = first?.id || null;
  } else if (Array.isArray(result)) {
    // create_from_ui shape: [{id, pos_reference, ...}] or [id]
    const first = result[0];
    if (typeof first === 'number') createdId = first;
    else if (first && typeof first === 'object') createdId = first.id || first.pos_reference || null;
  }

  if (!createdId) {
    return { error: { message: 'POS submit returned no order id' } };
  }

  // Odoo 18+'s sync_from_ui sometimes leaves `pos.order.name` as the bare
  // "/" placeholder — the Orders list then shows a "/" Order Ref while
  // pos_reference (Receipt Number) renders correctly. Backfill by reading
  // the freshly-created order's name, and if it's still "/", allocate the
  // next value from the POS config's sequence (`pos.config.sequence_id`)
  // and write it on the order. Best-effort: a failure here is logged but
  // doesn't fail the whole submit because the order itself is valid.
  try {
    const nameResp = await axios.post(`${baseUrl}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'pos.order',
        method: 'read',
        args: [[createdId], ['name']],
        kwargs: {},
      },
    }, { headers: { 'Content-Type': 'application/json' } });
    const currentName = nameResp.data?.result?.[0]?.name;
    if (currentName === '/' || !currentName) {
      // Read the POS config's sequence id, then next_by_id, then write
      // the new name onto the order.
      const cfgResp = await axios.post(`${baseUrl}/web/dataset/call_kw`, {
        jsonrpc: '2.0',
        method: 'call',
        params: {
          model: 'pos.config',
          method: 'read',
          args: [[Number(posConfigId)], ['sequence_id']],
          kwargs: {},
        },
      }, { headers: { 'Content-Type': 'application/json' } });
      const seqIdRaw = cfgResp.data?.result?.[0]?.sequence_id;
      const seqId = Array.isArray(seqIdRaw) ? seqIdRaw[0] : seqIdRaw;
      if (seqId) {
        const seqResp = await axios.post(`${baseUrl}/web/dataset/call_kw`, {
          jsonrpc: '2.0',
          method: 'call',
          params: {
            model: 'ir.sequence',
            method: 'next_by_id',
            args: [seqId],
            kwargs: {},
          },
        }, { headers: { 'Content-Type': 'application/json' } });
        const newName = seqResp.data?.result;
        if (newName && typeof newName === 'string') {
          await axios.post(`${baseUrl}/web/dataset/call_kw`, {
            jsonrpc: '2.0',
            method: 'call',
            params: {
              model: 'pos.order',
              method: 'write',
              args: [[createdId], { name: newName }],
              kwargs: {},
            },
          }, { headers: { 'Content-Type': 'application/json' } });
          console.log('[POS submit] allocated pos.order.name=', newName, 'for id=', createdId);
        }
      }
    }
  } catch (nameErr) {
    console.warn('[POS submit] name backfill failed:', nameErr?.message || nameErr);
  }

  // Mark the order paid via a SEPARATE RPC. We ship state='draft' in
  // sync_from_ui so the order + payment rows are created without firing
  // _is_pos_order_paid inside the same transaction (that check was failing
  // because the amount_paid compute hadn't settled). By the time this
  // call runs, all compute fields are up to date and the check evaluates
  // against the actual stored amount_paid (= sum of payment_ids.amount).
  try {
    const paidResp = await axios.post(`${baseUrl}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'pos.order',
        method: 'action_pos_order_paid',
        args: [[createdId]],
        kwargs: {},
      },
    }, { headers: { 'Content-Type': 'application/json' } });
    if (paidResp.data?.error) {
      // Read back the order's state for diagnosis when the check fails.
      try {
        const dbgResp = await axios.post(`${baseUrl}/web/dataset/call_kw`, {
          jsonrpc: '2.0',
          method: 'call',
          params: {
            model: 'pos.order',
            method: 'read',
            args: [[createdId], ['name', 'amount_total', 'amount_paid', 'amount_return', 'amount_tax', 'state', 'payment_ids']],
            kwargs: {},
          },
        }, { headers: { 'Content-Type': 'application/json' } });
        console.log('[POS submit] action_pos_order_paid FAILED. Order read-back=', JSON.stringify(dbgResp.data?.result));
      } catch (dbgErr) {
        console.log('[POS submit] action_pos_order_paid failed AND read-back errored:', dbgErr?.message || dbgErr);
      }
      console.log('[POS submit] action_pos_order_paid error=', JSON.stringify(paidResp.data.error));
      return { error: paidResp.data.error };
    }
    console.log('[POS submit] action_pos_order_paid ok for id=', createdId);
  } catch (paidErr) {
    console.warn('[POS submit] action_pos_order_paid threw:', paidErr?.message || paidErr);
    return { error: { message: paidErr?.message || 'action_pos_order_paid failed' } };
  }

  return { result: createdId, raw: result };
};

// Back-compat alias — keep the old export name pointing at the new function
// so any straggling imports don't break.
export const submitPosOrderViaCreateFromUi = submitPosOrderToOdoo;

// Customer invoices list — feeds the new Accounting → Invoices screen on
// the Home dashboard. Returns posted + draft customer-facing invoices and
// credit notes (i.e. account.move records with move_type in ('out_invoice',
// 'out_refund')) so the cashier can scan/audit invoicing activity without
// opening the Odoo backend. Scoped to the active company.
// Journal Entries list — feeds the new Accounting → Journal Entries
// screen. Returns `account.move` records of every type (sales invoices,
// bills, cash entries, POS journal entries, refunds, etc.) so the screen
// matches Odoo's Accounting → Accounting → Journal Entries view. Defaults
// to state = 'posted' like the Odoo screenshot the user shared, but the
// caller can override via `states`.
export const fetchJournalEntriesOdoo = async ({
  offset = 0,
  limit = 50,
  searchText = '',
  states = ['posted'],
  journalTypes = null,
} = {}) => {
  try {
    const domain = [];
    if (Array.isArray(states) && states.length > 0) {
      domain.push(['state', 'in', states]);
    }
    // Filter by journal type — drives the 4-sub-tile popup from Home:
    // Sales=['sale'], Purchases=['purchase'], Bank&Cash=['bank','cash'],
    // Miscellaneous=['general']. Null/empty = no filter (all journals).
    if (Array.isArray(journalTypes) && journalTypes.length > 0) {
      domain.push(['journal_id.type', 'in', journalTypes]);
    }
    if (searchText && String(searchText).trim()) {
      const term = String(searchText).trim();
      domain.push('|', '|',
        ['name', 'ilike', term],
        ['ref', 'ilike', term],
        ['partner_id.name', 'ilike', term],
      );
    }
    const companyId = getActiveCompanyId();
    const resp = await axios.post(`${getOdooUrl()}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'account.move',
        method: 'search_read',
        args: [domain],
        kwargs: {
          fields: [
            'id', 'name', 'date', 'partner_id', 'ref',
            'journal_id', 'company_id', 'amount_total', 'state', 'move_type',
          ],
          offset,
          limit,
          order: 'date desc, id desc',
          context: { allowed_company_ids: [companyId] },
        },
      },
    }, { headers: { 'Content-Type': 'application/json' } });
    if (resp.data?.error) {
      console.warn('[fetchJournalEntriesOdoo] Odoo error:', resp.data.error);
      return [];
    }
    return resp.data?.result || [];
  } catch (e) {
    console.error('fetchJournalEntriesOdoo exception:', e?.message || e);
    return [];
  }
};

// Partner Ledger — `account.move.line` records that have a partner, scoped
// to posted moves. Mirrors Odoo's Accounting → Reporting → Partner Ledger
// view: every debit/credit movement against a partner with the running
// balance the cashier can audit. Returns lines ordered by partner then
// date so the screen can group them client-side.
export const fetchPartnerLedgerOdoo = async ({
  offset = 0,
  limit = 80,
  searchText = '',
  partnerId = null,
} = {}) => {
  try {
    const domain = [
      ['partner_id', '!=', false],
      ['parent_state', '=', 'posted'],
    ];
    if (partnerId) {
      domain.push(['partner_id', '=', Number(partnerId)]);
    }
    if (searchText && String(searchText).trim()) {
      const term = String(searchText).trim();
      domain.push('|', '|',
        ['partner_id.name', 'ilike', term],
        ['move_id.name', 'ilike', term],
        ['account_id.name', 'ilike', term],
      );
    }
    const companyId = getActiveCompanyId();
    const resp = await axios.post(`${getOdooUrl()}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'account.move.line',
        method: 'search_read',
        args: [domain],
        kwargs: {
          fields: [
            'id', 'date', 'move_id', 'account_id', 'name',
            'debit', 'credit', 'balance', 'partner_id', 'date_maturity',
            'matching_number',
          ],
          offset,
          limit,
          order: 'partner_id, date desc, id desc',
          context: { allowed_company_ids: [companyId] },
        },
      },
    }, { headers: { 'Content-Type': 'application/json' } });
    if (resp.data?.error) {
      console.warn('[fetchPartnerLedgerOdoo] Odoo error:', resp.data.error);
      return [];
    }
    return resp.data?.result || [];
  } catch (e) {
    console.error('fetchPartnerLedgerOdoo exception:', e?.message || e);
    return [];
  }
};

export const fetchCustomerInvoicesOdoo = async ({
  offset = 0,
  limit = 50,
  searchText = '',
  states = [],
  moveTypes = null,
  paymentStates = null,
  overdueOnly = false,
} = {}) => {
  try {
    // Move types — default covers both out_invoice and out_refund. Caller
    // can narrow to ['out_invoice'] (Invoices) or ['out_refund']
    // (Credit Notes) via the filter modal.
    const types = Array.isArray(moveTypes) && moveTypes.length > 0
      ? moveTypes
      : ['out_invoice', 'out_refund'];
    const domain = [['move_type', 'in', types]];
    if (searchText && String(searchText).trim()) {
      const term = String(searchText).trim();
      domain.push('|', ['name', 'ilike', term], ['partner_id.name', 'ilike', term]);
    }
    if (Array.isArray(states) && states.length > 0) {
      domain.push(['state', 'in', states]);
    }
    if (Array.isArray(paymentStates) && paymentStates.length > 0) {
      domain.push(['payment_state', 'in', paymentStates]);
    }
    if (overdueOnly) {
      const today = new Date().toISOString().slice(0, 10);
      domain.push(['invoice_date_due', '<', today]);
      domain.push(['payment_state', 'not in', ['paid', 'reversed']]);
    }
    const companyId = getActiveCompanyId();
    const resp = await axios.post(`${getOdooUrl()}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'account.move',
        method: 'search_read',
        args: [domain],
        kwargs: {
          fields: [
            'id', 'name', 'partner_id', 'invoice_date', 'invoice_date_due',
            'amount_untaxed', 'amount_tax', 'amount_total', 'amount_residual',
            'state', 'payment_state', 'move_type', 'currency_id',
          ],
          offset,
          limit,
          order: 'invoice_date desc, id desc',
          context: { allowed_company_ids: [companyId] },
        },
      },
    }, { headers: { 'Content-Type': 'application/json' } });
    if (resp.data?.error) {
      console.warn('[fetchCustomerInvoicesOdoo] Odoo error:', resp.data.error);
      return [];
    }
    return resp.data?.result || [];
  } catch (e) {
    console.error('fetchCustomerInvoicesOdoo exception:', e?.message || e);
    return [];
  }
};

// Read one account.move (Invoice or Journal Entry) with the fields needed
// for the detail screen plus its line items. Used by InvoiceDetailScreen
// and JournalEntryDetailScreen.
export const fetchInvoiceDetailOdoo = async (moveId) => {
  if (!moveId) return { error: { message: 'moveId required' } };
  try {
    const baseUrl = getOdooUrl();
    const moveResp = await axios.post(`${baseUrl}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'account.move',
        method: 'read',
        args: [[Number(moveId)], [
          'id', 'name', 'ref', 'move_type', 'state', 'payment_state',
          'partner_id', 'invoice_date', 'invoice_date_due', 'date',
          'invoice_origin', 'invoice_payment_term_id', 'invoice_user_id',
          'journal_id', 'company_id', 'currency_id',
          'amount_untaxed', 'amount_tax', 'amount_total', 'amount_residual',
          'narration', 'invoice_line_ids', 'line_ids',
        ]],
        kwargs: {},
      },
    }, { headers: { 'Content-Type': 'application/json' } });
    if (moveResp.data?.error) return { error: moveResp.data.error };
    const move = (moveResp.data?.result || [])[0] || null;
    if (!move) return { error: { message: 'Invoice not found' } };

    // Read invoice line items (product / qty / price / subtotal / taxes).
    const lineIds = Array.isArray(move.invoice_line_ids) && move.invoice_line_ids.length > 0
      ? move.invoice_line_ids
      : [];
    let lines = [];
    if (lineIds.length > 0) {
      const linesResp = await axios.post(`${baseUrl}/web/dataset/call_kw`, {
        jsonrpc: '2.0',
        method: 'call',
        params: {
          model: 'account.move.line',
          method: 'read',
          args: [lineIds, [
            'id', 'name', 'product_id', 'quantity',
            'price_unit', 'discount', 'tax_ids',
            'price_subtotal', 'price_total',
          ]],
          kwargs: {},
        },
      }, { headers: { 'Content-Type': 'application/json' } });
      lines = linesResp.data?.result || [];
    }
    return { result: { ...move, lines } };
  } catch (e) {
    return { error: { message: e?.message || String(e) } };
  }
};

// Reset a posted/cancelled account.move back to draft via Odoo's button_draft.
export const resetInvoiceToDraftOdoo = async (moveId) => {
  if (!moveId) return { error: { message: 'moveId required' } };
  try {
    const resp = await axios.post(`${getOdooUrl()}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: { model: 'account.move', method: 'button_draft', args: [[Number(moveId)]], kwargs: {} },
    }, { headers: { 'Content-Type': 'application/json' } });
    if (resp.data?.error) return { error: resp.data.error };
    return { result: true };
  } catch (e) {
    return { error: { message: e?.message || String(e) } };
  }
};

// Post a draft account.move via Odoo's action_post.
export const postInvoiceOdoo = async (moveId) => {
  if (!moveId) return { error: { message: 'moveId required' } };
  try {
    const resp = await axios.post(`${getOdooUrl()}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: { model: 'account.move', method: 'action_post', args: [[Number(moveId)]], kwargs: {} },
    }, { headers: { 'Content-Type': 'application/json' } });
    if (resp.data?.error) return { error: resp.data.error };
    return { result: true };
  } catch (e) {
    return { error: { message: e?.message || String(e) } };
  }
};

// Cancel an account.move via Odoo's button_cancel.
export const cancelInvoiceOdoo = async (moveId) => {
  if (!moveId) return { error: { message: 'moveId required' } };
  try {
    const resp = await axios.post(`${getOdooUrl()}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: { model: 'account.move', method: 'button_cancel', args: [[Number(moveId)]], kwargs: {} },
    }, { headers: { 'Content-Type': 'application/json' } });
    if (resp.data?.error) return { error: resp.data.error };
    return { result: true };
  } catch (e) {
    return { error: { message: e?.message || String(e) } };
  }
};

// Create a Credit Note (reversal invoice) for an existing posted invoice
// via Odoo's account.move.reversal wizard. Returns the new credit-note id.
export const createCreditNoteOdoo = async ({ moveId, reason = '' } = {}) => {
  if (!moveId) return { error: { message: 'moveId required' } };
  try {
    const baseUrl = getOdooUrl();
    const ctx = { active_model: 'account.move', active_ids: [Number(moveId)], active_id: Number(moveId) };
    const createResp = await axios.post(`${baseUrl}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'account.move.reversal',
        method: 'create',
        args: [{ reason: reason || 'Credit Note', journal_id: false }],
        kwargs: { context: ctx },
      },
    }, { headers: { 'Content-Type': 'application/json' } });
    if (createResp.data?.error) return { error: createResp.data.error };
    const wizardId = createResp.data?.result;
    const refundResp = await axios.post(`${baseUrl}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'account.move.reversal',
        method: 'refund_moves',
        args: [[wizardId]],
        kwargs: { context: ctx },
      },
    }, { headers: { 'Content-Type': 'application/json' } });
    if (refundResp.data?.error) return { error: refundResp.data.error };
    // refund_moves returns an action dict with res_id = new credit note id.
    const newMoveId = refundResp.data?.result?.res_id || null;
    return { result: { wizardId, newMoveId } };
  } catch (e) {
    return { error: { message: e?.message || String(e) } };
  }
};

// Fetch per-product sale-tax rate for the products currently in the POS cart.
// Used by the Payment screen's "With Tax" toggle so it can display a real
// tax breakdown above the payment methods. Returns a map keyed by the
// product.product id:
//   { [productId]: { rate, priceInclude } }
// where `rate` is the summed percentage across the product's taxes_id (a
// product can have more than one tax applied) and `priceInclude` is true
// when any of those taxes is price-inclusive (so the caller can decide
// whether to back-out the embedded tax from the displayed price).
// Empty/invalid input → {} so callers can treat it as a safe fallback.
export const fetchProductTaxMap = async (productIds = []) => {
  try {
    const ids = (productIds || [])
      .map((v) => Number(v))
      .filter((n) => Number.isFinite(n) && n > 0);
    console.log('[TAX MAP] input productIds:', ids);
    if (ids.length === 0) return {};

    // 1) Read taxes_id off each product.product. taxes_id is a many2many
    //    of account.tax records (the sales taxes Odoo auto-applies on POS
    //    order lines / invoice lines).
    const prodResp = await axios.post(`${getOdooUrl()}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'product.product',
        method: 'read',
        args: [ids, ['id', 'name', 'taxes_id']],
        kwargs: {},
      },
    }, { headers: { 'Content-Type': 'application/json' } });

    if (prodResp.data?.error) {
      console.warn('[TAX MAP] product.product read error:', prodResp.data.error);
      return {};
    }
    const prodRows = prodResp.data?.result || [];
    console.log('[TAX MAP] product.product rows:', JSON.stringify(prodRows));

    // Flatten every referenced tax id so we only read account.tax once.
    const allTaxIds = Array.from(new Set(
      prodRows.flatMap((r) => Array.isArray(r.taxes_id) ? r.taxes_id : [])
    ));
    console.log('[TAX MAP] referenced account.tax ids:', allTaxIds);
    if (allTaxIds.length === 0) {
      console.warn('[TAX MAP] no taxes_id on any product — products in cart have no sale tax in Odoo');
      return Object.fromEntries(prodRows.map((r) => [r.id, { rate: 0, priceInclude: false, taxIds: [] }]));
    }

    // 2) Read the matching account.tax records. `amount` is the percentage
    //    for amount_type='percent'; for fixed/grouped taxes it's a flat
    //    figure that doesn't translate cleanly to a percent — skip those.
    const taxResp = await axios.post(`${getOdooUrl()}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'account.tax',
        method: 'read',
        args: [allTaxIds, ['id', 'name', 'amount', 'amount_type', 'price_include']],
        kwargs: {},
      },
    }, { headers: { 'Content-Type': 'application/json' } });

    if (taxResp.data?.error) {
      console.warn('[TAX MAP] account.tax read error:', taxResp.data.error);
      return {};
    }
    const taxRows = taxResp.data?.result || [];
    console.log('[TAX MAP] account.tax rows:', JSON.stringify(taxRows));
    const taxById = {};
    for (const t of taxRows) {
      taxById[t.id] = {
        amount: Number(t.amount) || 0,
        priceInclude: !!t.price_include,
        isPercent: t.amount_type === 'percent' || t.amount_type === 'division',
      };
    }

    const out = {};
    for (const r of prodRows) {
      const taxIds = Array.isArray(r.taxes_id) ? r.taxes_id : [];
      let rate = 0;
      let priceInclude = false;
      for (const tid of taxIds) {
        const t = taxById[tid];
        if (!t) continue;
        if (t.isPercent) rate += t.amount;
        if (t.priceInclude) priceInclude = true;
      }
      out[r.id] = { rate, priceInclude, taxIds };
    }
    console.log('[TAX MAP] assembled map:', JSON.stringify(out));
    return out;
  } catch (e) {
    console.warn('[TAX MAP] exception:', e?.message || e);
    return {};
  }
};
// Read all pos.payment records attached to a single pos.order. Used by the
// order detail screen so a split-paid order can show "Cash 500 · Card 500"
// instead of just the aggregate "amount_paid". Returns an array shaped like
//   [{ id, amount, method_id, method_name, journal_id, journal_name }, ...]
// The `method_id` and `journal_id` are stripped to scalars (Odoo returns
// many2one fields as [id, name] tuples) so the UI doesn't have to unwrap.
export const fetchPosOrderPaymentsOdoo = async (orderId) => {
  if (!orderId) return [];
  try {
    const response = await axios.post(`${getOdooUrl()}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'pos.payment',
        method: 'search_read',
        args: [[['pos_order_id', '=', Number(orderId)]]],
        kwargs: {
          fields: ['id', 'amount', 'payment_method_id'],
          order: 'id asc',
        },
      },
    }, { headers: { 'Content-Type': 'application/json' } });

    if (response.data?.error) {
      console.error('fetchPosOrderPaymentsOdoo error:', response.data.error);
      return [];
    }
    const rows = response.data?.result || [];
    return rows.map((p) => {
      const m = p.payment_method_id;
      return {
        id: p.id,
        amount: Number(p.amount) || 0,
        method_id: Array.isArray(m) ? m[0] : m,
        method_name: Array.isArray(m) ? m[1] : '',
      };
    });
  } catch (e) {
    console.error('fetchPosOrderPaymentsOdoo exception:', e);
    return [];
  }
};

// Read pos.payment.method records configured on the active POS register
// (pos.config.payment_method_ids). This is the canonical Odoo way: the cashier
// only sees methods explicitly assigned to that register, and each method
// already carries the journal it should post to. Replaces the older
// "lookup pos.payment.method by journal_id" approach which broke on setups
// where the journal id was guessed wrong (e.g. journal "Point of Sale"
// id=16 with no pos.payment.method record pointing at it).
export const fetchPosConfigPaymentMethods = async (posConfigId) => {
  if (!posConfigId) return [];
  try {
    const baseUrl = getOdooUrl();

    const cfgResp = await axios.post(`${baseUrl}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'pos.config',
        method: 'read',
        args: [[Number(posConfigId)], ['id', 'name', 'payment_method_ids']],
        kwargs: {},
      },
    }, { headers: { 'Content-Type': 'application/json' } });
    if (cfgResp.data?.error) {
      console.error('fetchPosConfigPaymentMethods pos.config error:', cfgResp.data.error);
      return [];
    }
    const cfg = (cfgResp.data?.result || [])[0];
    const methodIds = Array.isArray(cfg?.payment_method_ids) ? cfg.payment_method_ids : [];
    if (methodIds.length === 0) return [];

    const methodsResp = await axios.post(`${baseUrl}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'pos.payment.method',
        method: 'read',
        args: [methodIds, ['id', 'name', 'journal_id', 'is_cash_count', 'split_transactions', 'type']],
        kwargs: {},
      },
    }, { headers: { 'Content-Type': 'application/json' } });
    if (methodsResp.data?.error) {
      console.error('fetchPosConfigPaymentMethods pos.payment.method error:', methodsResp.data.error);
      return [];
    }
    return methodsResp.data?.result || [];
  } catch (e) {
    console.error('fetchPosConfigPaymentMethods error:', e);
    return [];
  }
};

// Fetch POS registers (configurations) from Odoo
export const fetchPOSRegisters = async ({ limit = null, offset = 0 } = {}) => {
  try {
    const kwargs = { fields: ["id", "name"] };
    if (limit && Number(limit) > 0) kwargs.limit = Number(limit);
    if (offset && Number(offset) > 0) kwargs.offset = Number(offset);

    console.log('[fetchPOSRegisters] request kwargs:', kwargs);

    const response = await axios.post(
      `${getOdooUrl()}/web/dataset/call_kw`,
      {
        jsonrpc: "2.0",
        method: "call",
        params: {
          model: "pos.config",
          method: "search_read",
          args: [[]],
          kwargs,
        },
      },
      { headers: { "Content-Type": "application/json" } }
    );
    if (response.data.error) {
      console.log("Odoo JSON-RPC error (pos.config):", response.data.error);
      throw new Error("Odoo JSON-RPC error");
    }

    console.log('[fetchPOSRegisters] fetched:', { count: response.data.result?.length ?? 0 });
    return response.data.result || [];
  } catch (error) {
    console.error("fetchPOSRegisters error:", error);
    throw error;
  }
};
// Fetch POS sessions (registers) from Odoo
// `state` accepts a single string ('opened') or an array. The shorthand
// 'opened' is treated as "anything currently active" — i.e. both
// `opening_control` (cash-control screen pending) and `opened` (in progress) —
// because Odoo 19 may keep a freshly-created session in opening_control if
// the auto-advance step is refused.
export const fetchPOSSessions = async ({ limit = 20, offset = 0, state = '' } = {}) => {
  try {
    let domain = [];
    if (Array.isArray(state) && state.length) {
      domain = [["state", "in", state]];
    } else if (state === 'opened') {
      // Strict match: only fully-opened sessions (state === 'opened').
      // Sessions still in `opening_control` (cash-control pending) should appear
      // as "Available Registers" with an "Open Register" button — matching
      // Odoo's POS UI which only shows "Continue Selling" for `opened`.
      domain = [["state", "=", "opened"]];
    } else if (state) {
      domain = [["state", "=", state]];
    }
    const response = await axios.post(
      `${getOdooUrl()}/web/dataset/call_kw`,
      {
        jsonrpc: "2.0",
        method: "call",
        params: {
          model: "pos.session",
          method: "search_read",
          args: [domain],
          kwargs: {
            fields: [
              "id",
              "name",
              "state",
              "user_id",
              "start_at",
              "stop_at",
              "cash_register_balance_end",
              "cash_register_balance_start",
              "config_id", // Added to allow frontend to extract posConfigId
            ],
            limit,
            offset,
            order: "id desc",
          },
        },
      },
      { headers: { "Content-Type": "application/json" } }
    );
    if (response.data.error) {
      console.log("Odoo JSON-RPC error (pos.session):", response.data.error);
      throw new Error("Odoo JSON-RPC error");
    }
    return response.data.result || [];
  } catch (error) {
    console.error("fetchPOSSessions error:", error);
    throw error;
  }
};

// Fetch draft `pos.order` records for a session — used when close-register
// fails with "There are still orders in draft state" so we can offer the user
// a one-tap clean-up.
export const fetchDraftPosOrders = async (sessionId) => {
  if (!sessionId) return [];
  try {
    const response = await axios.post(`${getOdooUrl()}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'pos.order',
        method: 'search_read',
        args: [[['session_id', '=', Number(sessionId)], ['state', '=', 'draft']]],
        kwargs: { fields: ['id', 'name', 'amount_total', 'state'], limit: 200 },
      },
    }, {
      headers: { 'Content-Type': 'application/json', ...(getOdooDb() ? { 'X-Odoo-Database': getOdooDb() } : {}) },
      withCredentials: true,
    });
    if (response.data?.error) {
      console.error('[fetchDraftPosOrders] Odoo error:', response.data.error);
      return [];
    }
    return response.data?.result || [];
  } catch (e) {
    console.error('[fetchDraftPosOrders] exception:', e?.message || e);
    return [];
  }
};

// Delete (unlink) draft pos.order records — equivalent to Odoo's "Discard"
// on each one. Used to unblock close-register after the user confirms.
export const unlinkPosOrders = async (orderIds = []) => {
  if (!orderIds?.length) return { success: true, count: 0 };
  try {
    const response = await axios.post(`${getOdooUrl()}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'pos.order',
        method: 'unlink',
        args: [orderIds.map(Number)],
        kwargs: {},
      },
    }, {
      headers: { 'Content-Type': 'application/json', ...(getOdooDb() ? { 'X-Odoo-Database': getOdooDb() } : {}) },
      withCredentials: true,
    });
    if (response.data?.error) {
      const msg = response.data.error?.data?.message || response.data.error?.message || 'Failed to delete draft orders';
      console.error('[unlinkPosOrders] Odoo error:', msg);
      return { error: msg };
    }
    return { success: true, count: orderIds.length };
  } catch (e) {
    return { error: e?.message || 'Network error' };
  }
};

// Small helper used by the new close-flow RPCs below. Just a thin JSON-RPC
// call_kw wrapper so each step in the close sequence reads cleanly. Named
// `_closeCallKw` because the file already has a different `_callKw` further
// down (hard-codes its model from a closure — different signature).
const _closeCallKw = async (model, method, args = [], kwargs = {}) => {
  const resp = await axios.post(`${getOdooUrl()}/web/dataset/call_kw`, {
    jsonrpc: '2.0',
    method: 'call',
    params: { model, method, args, kwargs },
    id: new Date().getTime(),
  }, { headers: { 'Content-Type': 'application/json' } });
  if (resp?.data?.error) {
    const detail = resp.data.error?.data?.message || resp.data.error?.message || 'Odoo error';
    const err = new Error(detail);
    err.odoo = resp.data.error;
    throw err;
  }
  return resp?.data?.result;
};

// Fetch everything the "Closing Register" modal needs to render the per-method
// rows: session header, payments collected this session, payment methods on the
// active config, cash in/out moves, plus order count + total. One round-trip
// per resource (kept simple over read_group so we don't depend on Odoo group
// shape differences).
export const fetchSessionClosingDetails = async ({ sessionId }) => {
  try {
    if (!sessionId) throw new Error('sessionId is required');
    const sid = Number(sessionId);

    const [sessionRows, payments, methods, cashMoves, orders] = await Promise.all([
      _closeCallKw('pos.session', 'search_read', [[['id', '=', sid]]], {
        fields: [
          'id', 'name', 'state', 'start_at', 'stop_at',
          'cash_register_balance_start', 'cash_register_balance_end_real',
          'config_id', 'opening_notes', 'closing_notes',
        ],
        limit: 1,
      }),
      _closeCallKw('pos.payment', 'search_read', [[['session_id', '=', sid]]], {
        fields: ['id', 'payment_method_id', 'amount'],
      }),
      _closeCallKw('pos.payment.method', 'search_read', [[]], {
        fields: ['id', 'name', 'is_cash_count', 'type', 'journal_id', 'split_transactions'],
      }),
      _closeCallKw('pos.cash.in.out', 'search_read', [[['session_id', '=', sid]]], {
        fields: ['id', 'name', 'amount', 'type'],
      }).catch(() => []), // older Odoo may not have this model — fall back to []
      _closeCallKw('pos.order', 'search_read', [[['session_id', '=', sid]]], {
        fields: ['id', 'amount_total'],
      }),
    ]);

    const session = sessionRows?.[0] || null;
    const orderCount = orders.length;
    const orderTotal = orders.reduce((sum, o) => sum + (Number(o.amount_total) || 0), 0);

    return { session, payments, methods, cashMoves, orderCount, orderTotal };
  } catch (e) {
    console.error('[CLOSE POS SESSION] fetchSessionClosingDetails failed:', e?.message || e);
    return { error: e?.odoo || { message: e?.message || 'Failed to load closing details' } };
  }
};

// Close a POS session in Odoo — proper 3-step flow that sets stop_at and
// cash_register_balance_end_real. The old code only called
// action_pos_session_close which left stop_at = False, causing Odoo's
// _compute_last_session to crash with "'bool' object has no attribute
// 'astimezone'" the next time the POS config was read.
export const closePOSSesionOdoo = async ({
  sessionId,
  countedCash = 0,
  bankDiffs = {},
  closingNote = '',
} = {}) => {
  try {
    if (!sessionId) throw new Error('sessionId is required');
    const sid = Number(sessionId);
    console.log('[CLOSE POS SESSION] starting close', { sid, countedCash, bankDiffs, closingNote });

    // 1. Move session to 'closing_control' so the rest of the close RPCs run.
    try {
      await _closeCallKw('pos.session', 'action_pos_session_closing_control', [[sid]]);
    } catch (e) {
      // If already in closing_control / closed, Odoo throws "Session not opened".
      // We swallow that and continue — subsequent RPCs handle the real state.
      console.warn('[CLOSE POS SESSION] closing_control step warning:', e?.message);
    }

    // 2. Record the physical cash count — sets cash_register_balance_end_real.
    try {
      await _closeCallKw('pos.session', 'post_closing_cash_details', [[sid]], {
        counted_cash: Number(countedCash) || 0,
      });
    } catch (e) {
      console.warn('[CLOSE POS SESSION] post_closing_cash_details warning:', e?.message);
    }

    // 3. Save closing note (Odoo doesn't expose a public method for this).
    if (closingNote) {
      try {
        await _closeCallKw('pos.session', 'write', [[sid], { closing_notes: String(closingNote) }]);
      } catch (e) {
        console.warn('[CLOSE POS SESSION] closing_notes write warning:', e?.message);
      }
    }

    // 4. close_session_from_ui — finalises and SETS stop_at. The kwarg
    //    `bank_payment_method_diffs` exists in Odoo 17 but was removed in
    //    Odoo 18/19 (causes "got an unexpected keyword argument"). Try the
    //    Odoo-17 form first, fall back to the no-kwarg form on that specific
    //    error.
    let result = null;
    try {
      result = await _closeCallKw('pos.session', 'close_session_from_ui', [[sid]], {
        bank_payment_method_diffs: bankDiffs || {},
      });
    } catch (e) {
      const msg = e?.message || '';
      const isUnknownKwarg = /unexpected keyword argument.*bank_payment_method_diffs/i.test(msg);
      if (isUnknownKwarg) {
        console.warn('[CLOSE POS SESSION] retrying close_session_from_ui without kwarg (Odoo 18/19)');
        try {
          result = await _closeCallKw('pos.session', 'close_session_from_ui', [[sid]]);
        } catch (retryErr) {
          console.warn('[CLOSE POS SESSION] retry also failed:', retryErr?.message);
        }
      } else {
        console.warn('[CLOSE POS SESSION] close_session_from_ui error:', msg);
      }
    }

    // Re-read state to verify the close actually took. Track via a flag so
    // the function doesn't lie about success when the chain stalled.
    let confirmedClosed = false;
    let lastErrName = null;
    let lastErrMessage = null;
    const isoUtcNow = () => {
      const n = new Date();
      const p = (x) => String(x).padStart(2, '0');
      return `${n.getUTCFullYear()}-${p(n.getUTCMonth() + 1)}-${p(n.getUTCDate())} ${p(n.getUTCHours())}:${p(n.getUTCMinutes())}:${p(n.getUTCSeconds())}`;
    };
    try {
      const sessionRows = await _closeCallKw('pos.session', 'read', [[sid], ['state', 'stop_at']]);
      const state = sessionRows?.[0]?.state;
      const stopAt = sessionRows?.[0]?.stop_at;
      console.log('[CLOSE POS SESSION] post-close state =', state, 'stop_at =', stopAt);
      if (state === 'closed') {
        // If stop_at didn't get set (older Odoo edge case), patch it ourselves
        // so _compute_last_session doesn't crash on the next config read.
        if (!stopAt) {
          try { await _closeCallKw('pos.session', 'write', [[sid], { stop_at: isoUtcNow() }]); } catch (_) {}
        }
        console.log('[CLOSE POS SESSION] success (state confirmed closed)');
        confirmedClosed = true;
      }
    } catch (e) {
      console.warn('[CLOSE POS SESSION] post-close state read failed:', e?.message);
    }

    // FORCE-CLOSE FALLBACK — only fires if the standard 4-step chain did not
    // flip the row to state='closed'. We hard-write state and stop_at on the
    // pos.session row directly, bypassing the workflow methods. Some Odoo
    // installs have custom validations on close_session_from_ui (e.g. unpaid
    // orders, bank statement mismatches) that block it; the user has
    // explicitly asked for a force-close path so the register can always
    // exit 'opened' from the mobile app.
    if (!confirmedClosed) {
      console.warn('[CLOSE POS SESSION] standard close did not confirm closed — forcing direct state write');
      try {
        await _closeCallKw('pos.session', 'write', [[sid], { state: 'closed', stop_at: isoUtcNow() }]);
        // Read BOTH fields back — verifying state alone misses the case where
        // a row-level constraint silently drops stop_at while state lands fine.
        const verifyRows = await _closeCallKw('pos.session', 'read', [[sid], ['state', 'stop_at']]);
        const verifiedState = verifyRows?.[0]?.state;
        let verifiedStopAt = verifyRows?.[0]?.stop_at;
        // If the row is now closed but stop_at didn't take, retry the timestamp
        // on its own. Split write dodges any whole-row trigger that may have
        // rejected the combined write. We still treat the close as successful
        // either way — the user's primary goal is exiting state='opened'.
        if (verifiedState === 'closed' && !verifiedStopAt) {
          console.warn('[CLOSE POS SESSION] state=closed but stop_at empty — retrying stop_at-only write');
          try {
            await _closeCallKw('pos.session', 'write', [[sid], { stop_at: isoUtcNow() }]);
            const retryRows = await _closeCallKw('pos.session', 'read', [[sid], ['stop_at']]);
            verifiedStopAt = retryRows?.[0]?.stop_at;
          } catch (e2) {
            console.warn('[CLOSE POS SESSION] stop_at retry failed:', e2?.message);
          }
        }
        if (verifiedState === 'closed') {
          console.log('[CLOSE POS SESSION] force-close succeeded', { stop_at: verifiedStopAt });
          confirmedClosed = true;
        } else {
          console.warn('[CLOSE POS SESSION] force-close write returned but state still', verifiedState);
        }
      } catch (e) {
        lastErrName = e?.odoo?.data?.name || e?.name;
        lastErrMessage = e?.odoo?.data?.message || e?.message;
        console.warn('[CLOSE POS SESSION] force-close write failed:', lastErrMessage);
      }
    }

    if (confirmedClosed) {
      return { success: true, result };
    }
    return {
      error: {
        message: lastErrMessage || 'Session could not be closed — state did not transition to closed even after force-write.',
        name: lastErrName,
      },
    };
  } catch (error) {
    const detail = error?.odoo?.data?.message || error?.message || 'Failed to close session';
    console.error('[CLOSE POS SESSION] error:', detail, error);
    return { error: { message: detail, original: error?.odoo || error } };
  }
};

// Heal pos.session rows that were closed by the old buggy flow (stop_at = False).
// Without this, Odoo's _compute_last_session keeps crashing on the bad rows.
// Fire-and-forget — called once post-login.
export const healStaleClosedSessions = async () => {
  try {
    const stale = await _closeCallKw('pos.session', 'search_read', [
      [['state', '=', 'closed'], ['stop_at', '=', false]],
    ], { fields: ['id'], limit: 50 });
    const ids = (stale || []).map((s) => s.id).filter(Boolean);
    if (ids.length === 0) {
      console.log('[CLOSE POS SESSION] heal: no stale sessions');
      return { healed: 0 };
    }
    const now = new Date();
    const iso = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')} ${String(now.getUTCHours()).padStart(2, '0')}:${String(now.getUTCMinutes()).padStart(2, '0')}:${String(now.getUTCSeconds()).padStart(2, '0')}`;
    await _closeCallKw('pos.session', 'write', [ids, { stop_at: iso }]);
    console.log('[CLOSE POS SESSION] heal: patched stop_at on', ids.length, 'session(s)');
    return { healed: ids.length };
  } catch (e) {
    console.warn('[CLOSE POS SESSION] heal failed (non-fatal):', e?.message || e);
    return { healed: 0, error: e?.message };
  }
};

// Read the `iface_available_categ_ids` + `limit_categories` from a single
// pos.config. POSProducts uses this to scope its category tabs + product grid
// to just the categories this register is configured for, matching Odoo Web.
export const fetchPosConfigCategories = async ({ configId } = {}) => {
  if (!configId) return { limit: false, categoryIds: [] };
  try {
    const rows = await _closeCallKw('pos.config', 'read',
      [[Number(configId)], ['id', 'name', 'limit_categories', 'iface_available_categ_ids']]);
    const cfg = Array.isArray(rows) && rows[0] ? rows[0] : null;
    if (!cfg) return { limit: false, categoryIds: [] };
    return {
      limit: !!cfg.limit_categories,
      categoryIds: Array.isArray(cfg.iface_available_categ_ids) ? cfg.iface_available_categ_ids : [],
    };
  } catch (e) {
    console.warn('[POSProducts] fetchPosConfigCategories failed:', e?.message || e);
    return { limit: false, categoryIds: [] };
  }
};

// All pos.sessions for a specific config — drives the POSConfigSessions screen
// (the in-app equivalent of Odoo's POS Sessions list, scoped to one register).
export const fetchSessionsForConfig = async ({ configId, limit = 50, offset = 0 } = {}) => {
  if (!configId) return [];
  try {
    const result = await _closeCallKw('pos.session', 'search_read', [
      [['config_id', '=', Number(configId)]],
    ], {
      fields: [
        'id', 'name', 'state', 'start_at', 'stop_at',
        'cash_register_balance_start', 'cash_register_balance_end_real',
        'config_id', 'user_id', 'write_date',
      ],
      order: 'id desc',
      limit,
      offset,
    });
    return Array.isArray(result) ? result : [];
  } catch (e) {
    console.warn('[POSRegister] fetchSessionsForConfig failed:', e?.message || e);
    return [];
  }
};

// Live order count + net total for the given open session. Used by the
// open-session cards on POSRegister to render the "Ongoing $X (N orders)"
// line. Counts refunds with their negative sign so a refund-only session
// reads as a negative number — same behaviour as Odoo Web's dashboard.
export const fetchSessionOngoing = async ({ sessionId } = {}) => {
  if (!sessionId) return { orderCount: 0, orderTotal: 0 };
  try {
    const orders = await _closeCallKw('pos.order', 'search_read', [
      [['session_id', '=', Number(sessionId)]],
    ], { fields: ['id', 'amount_total'] });
    const list = Array.isArray(orders) ? orders : [];
    const orderTotal = list.reduce((s, o) => s + (Number(o.amount_total) || 0), 0);
    return { orderCount: list.length, orderTotal };
  } catch (e) {
    console.warn('[POSRegister] fetchSessionOngoing failed:', e?.message || e);
    return { orderCount: 0, orderTotal: 0 };
  }
};

// Create a refund pos.order for the given orderId via Odoo's pos.order.refund
// method. Odoo's action_dict response shape varies by version — we cover both
// the `res_id` and `domain: [['id','in',[...]]]` forms.
export const refundPosOrder = async ({ orderId } = {}) => {
  if (!orderId) return { error: { message: 'orderId required' } };
  try {
    const action = await _closeCallKw('pos.order', 'refund', [[Number(orderId)]]);
    let newOrderId = action?.res_id || null;
    if (!newOrderId && Array.isArray(action?.domain)) {
      const idClause = action.domain.find((d) => Array.isArray(d) && d[0] === 'id');
      if (idClause && Array.isArray(idClause[2])) newOrderId = idClause[2][0];
    }
    return { success: true, newOrderId, action };
  } catch (e) {
    return { error: { message: e?.message || 'Refund failed', original: e?.odoo || e } };
  }
};

// Detect whether a pos.order has any refund children. We check TWO places
// because Odoo's `pos.order.refund()` writes the link differently across
// versions — newer builds set `pos.order.refunded_order_id`, older ones
// only set `pos.order.line.refunded_orderline_id`. We return the larger of
// the two counts so a refund is detected regardless of which field is
// populated. OrderDetailScreen uses this to hide the Return Products
// button on already-refunded orders.
export const countRefundsForOrder = async ({ orderId, lineIds = [] } = {}) => {
  if (!orderId) return 0;
  let orderLevel = 0;
  let lineLevel = 0;
  // Approach A: pos.order.refunded_order_id (Odoo 17+).
  try {
    orderLevel = Number(await _closeCallKw(
      'pos.order', 'search_count',
      [[['refunded_order_id', '=', Number(orderId)], ['state', '!=', 'cancel']]],
    )) || 0;
  } catch (e) {
    console.warn('[Refund] order-level count failed:', e?.message);
  }
  // Approach B: pos.order.line.refunded_orderline_id (older versions). Only
  // fires when we know the original order's line ids to compare against.
  if (Array.isArray(lineIds) && lineIds.length > 0) {
    try {
      lineLevel = Number(await _closeCallKw(
        'pos.order.line', 'search_count',
        [[['refunded_orderline_id', 'in', lineIds.map(Number)]]],
      )) || 0;
    } catch (e) {
      console.warn('[Refund] line-level count failed:', e?.message);
    }
  }
  const total = Math.max(orderLevel, lineLevel);
  console.log('[Refund] count for', orderId, '→ order:', orderLevel, 'line:', lineLevel, 'total:', total);
  return total;
};

// AsyncStorage-backed memory of orders we've refunded from THIS device.
// Used by OrderDetailScreen as an instant truth source — independent of
// whether Odoo's read-back is reliable.
const REFUND_MARKED_KEY = 'pos_refunded_order_ids_v1';

export const markOrderAsRefunded = async (orderId) => {
  if (!orderId) return;
  try {
    const raw = await AsyncStorage.getItem(REFUND_MARKED_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    const next = Array.isArray(arr) ? Array.from(new Set([...arr, Number(orderId)])) : [Number(orderId)];
    await AsyncStorage.setItem(REFUND_MARKED_KEY, JSON.stringify(next));
  } catch (e) {
    console.warn('[Refund] markOrderAsRefunded failed:', e?.message);
  }
};

export const isOrderMarkedRefunded = async (orderId) => {
  if (!orderId) return false;
  try {
    const raw = await AsyncStorage.getItem(REFUND_MARKED_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) && arr.map(Number).includes(Number(orderId));
  } catch (e) {
    return false;
  }
};

// api/services/generalApi.js
import axios from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";
import ODOO_BASE_URL, { getOdooUrl } from '@api/config/odooConfig';


import { get } from "./utils";
import { API_ENDPOINTS } from "@api/endpoints";
import { useAuthStore } from '@stores/auth';
import handleApiError from "../utils/handleApiError";

// Active company id from the auth store. Used to scope multi-company writes
// + reads (POS orders) so a draft created in company A is visible to a list
// fetched in company A — otherwise drafts can land in a company that the
// list query doesn't see and "disappear" from MyOrders.
const getActiveCompanyId = () => {
  try {
    const u = useAuthStore.getState().user || {};
    const raw = u.company_id ?? u.company?.id ?? u.companyId ?? 1;
    const id = Array.isArray(raw) ? raw[0] : raw;
    const n = Number(id);
    return Number.isFinite(n) && n > 0 ? n : 1;
  } catch (_) { return 1; }
};

// Debugging output for useAuthStore
export const fetchProducts = async ({ offset, limit, categoryId, searchText }) => {
  try {
    const queryParams = {
      ...(searchText !== undefined && { product_name: searchText }),
      offset,
      limit,
      ...(categoryId !== undefined && { category_id: categoryId }),
    };
    // Debugging output for queryParams
    const response = await get(API_ENDPOINTS.VIEW_PRODUCTS, queryParams);
    return response.data;
  } catch (error) {
    handleApiError(error);
    throw error;
  }
};



// 🔹 NEW: Fetch products directly from Odoo 19 via JSON-RPC
// Reverted: Fetch products directly from Odoo 19 via JSON-RPC (ice cube shop logic)
export const fetchProductsOdoo = async ({
  offset = 0,
  limit = 50,
  searchText = '',
  posCategoryId = null,
  categoryId = null,
  posOnly = false,
} = {}) => {
  try {
    let domain = [];
    if (searchText && String(searchText).trim()) {
      const term = String(searchText).trim();
      domain = ['|', ['name', 'ilike', term], ['default_code', 'ilike', term]];
    }
    if (posCategoryId) {
      domain = domain.concat([['pos_categ_ids', 'in', [Number(posCategoryId)]]]);
    } else if (categoryId) {
      domain = domain.concat([['categ_id', '=', Number(categoryId)]]);
    }
    if (posOnly) {
      domain = domain.concat([['available_in_pos', '=', true]]);
    }

    const baseUrl = getOdooUrl();
    const response = await axios.post(
      `${baseUrl}/web/dataset/call_kw`,
      {
        jsonrpc: "2.0",
        method: "call",
        params: {
          model: "product.product",
          method: "search_read",
          args: [domain],
          kwargs: {
            fields: [
              "id",
              "name",
              "default_code",
              "list_price",
              "qty_available",
              "categ_id",
              "available_in_pos",
              "product_tmpl_id",
            ],
            offset,
            limit,
            order: "name asc",
          },
        },
      },
      {
        headers: { "Content-Type": "application/json" },
        timeout: 25000,
      }
    );

    if (response.data.error) {
      console.log("Odoo JSON-RPC error (product.product):", response.data.error);
      throw new Error("Odoo JSON-RPC error");
    }

    const results = response.data.result || [];

    // Lazy image fetch via Odoo's authenticated `/web/image` endpoint —
    // RN's <Image> requests each thumbnail only when it scrolls into
    // view. Keeps the JSON-RPC payload small even for 1000+ products.
    results.forEach((p) => {
      p.image_url = `${baseUrl}/web/image?model=product.product&id=${p.id}&field=image_128`;
    });

    return results;
  } catch (error) {
    console.error("fetchProductsOdoo error:", error);
    throw error;
  }
};

// Paginate the Products grid against product.template directly (instead
// of product.product + client-side dedupe). One server row = one tile,
// so onEndReached fires reliably and "Showing X / Y" matches the
// search_count on product.template exactly. Other callers still use
// fetchProductsOdoo when they need variant-level rows.
export const fetchProductsByTemplateOdoo = async ({
  offset = 0,
  limit = 50,
  searchText = '',
  posCategoryId = null,
  categoryId = null,
  posOnly = false,
  // When provided (and non-empty), scope the result to products whose
  // pos_categ_ids intersect this list. Used by POSProducts to honour
  // pos.config.iface_available_categ_ids when the active register has
  // limit_categories = True.
  allowedCategoryIds = null,
} = {}) => {
  try {
    let domain = [];
    if (searchText && String(searchText).trim()) {
      const term = String(searchText).trim();
      domain = ['|', ['name', 'ilike', term], ['default_code', 'ilike', term]];
    }
    if (posCategoryId) {
      domain = domain.concat([['pos_categ_ids', 'in', [Number(posCategoryId)]]]);
    } else if (categoryId) {
      domain = domain.concat([['categ_id', '=', Number(categoryId)]]);
    } else if (Array.isArray(allowedCategoryIds) && allowedCategoryIds.length > 0) {
      // Only apply when not already scoped to a single category — the user
      // tapping a category chip should still see only that one.
      domain = domain.concat([['pos_categ_ids', 'in', allowedCategoryIds.map(Number)]]);
    }
    if (posOnly) {
      domain = domain.concat([['available_in_pos', '=', true]]);
    }

    const baseUrl = getOdooUrl();
    const response = await axios.post(
      `${baseUrl}/web/dataset/call_kw`,
      {
        jsonrpc: '2.0',
        method: 'call',
        params: {
          model: 'product.template',
          method: 'search_read',
          args: [domain],
          kwargs: {
            fields: [
              'id', 'name', 'default_code', 'list_price', 'qty_available',
              'categ_id', 'available_in_pos',
              'product_variant_id',
              'image_128',
            ],
            offset, limit, order: 'name asc',
          },
        },
      },
      { headers: { 'Content-Type': 'application/json' }, timeout: 25000 }
    );

    if (response.data.error) {
      console.log('Odoo JSON-RPC error (product.template):', response.data.error);
      throw new Error('Odoo JSON-RPC error');
    }

    const rows = response.data.result || [];
    return rows.map((t) => {
      const variantId = Array.isArray(t.product_variant_id) ? t.product_variant_id[0] : t.id;
      // Inline base64 from the authenticated JSON-RPC response — RN's <Image>
      // can't reach /web/image without the Odoo session cookie, so we embed.
      const hasBase64 = t.image_128 && typeof t.image_128 === 'string' && t.image_128.length > 0;
      return {
        // `id` is the default variant id so add-to-cart / quick-add
        // (which want a product.product id) keep working unchanged.
        id: variantId,
        name: t.name,
        default_code: t.default_code || '',
        list_price: Number(t.list_price) || 0,
        qty_available: Number(t.qty_available) || 0,
        categ_id: t.categ_id || false,
        available_in_pos: !!t.available_in_pos,
        product_tmpl_id: [t.id, t.name],
        image_url: hasBase64 ? `data:image/png;base64,${t.image_128}` : '',
      };
    });
  } catch (error) {
    console.error('fetchProductsByTemplateOdoo error:', error);
    throw error;
  }
};

// Count distinct product templates matching the same filter the Products
// screen renders (the screen dedupes by product_tmpl_id, so we count
// templates not variants to give the user an accurate "Showing X of Y").
export const fetchProductTemplateCountOdoo = async ({
  searchText = '',
  categoryId = null,
  posCategoryId = null,
  posOnly = false,
  allowedCategoryIds = null,
} = {}) => {
  const baseUrl = getOdooUrl();
  let domain = [];
  if (searchText && String(searchText).trim()) {
    const term = String(searchText).trim();
    domain = ['|', ['name', 'ilike', term], ['default_code', 'ilike', term]];
  }
  if (posCategoryId) {
    domain = domain.concat([['pos_categ_ids', 'in', [Number(posCategoryId)]]]);
  } else if (categoryId) {
    domain = domain.concat([['categ_id', '=', Number(categoryId)]]);
  } else if (Array.isArray(allowedCategoryIds) && allowedCategoryIds.length > 0) {
    // Scope to just the categories this register accepts — same gate as
    // fetchProductsByTemplateOdoo so the "Showing X of Y" footer counts
    // the same population the grid actually displays.
    domain = domain.concat([['pos_categ_ids', 'in', allowedCategoryIds.map(Number)]]);
  }
  if (posOnly) {
    domain = domain.concat([['available_in_pos', '=', true]]);
  }
  try {
    const resp = await axios.post(`${baseUrl}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: { model: 'product.template', method: 'search_count', args: [domain], kwargs: {} },
    }, { headers: { 'Content-Type': 'application/json' }, timeout: 15000 });
    if (resp.data && resp.data.error) return 0;
    return Number(resp.data.result) || 0;
  } catch (e) {
    console.warn('fetchProductTemplateCountOdoo failed:', e?.message);
    return 0;
  }
};

// ─── Product creation helpers ───────────────────────────────────────────────
// Fetch product.category (internal accounting categories) for the form picker.
export const fetchProductCategoriesOdoo = async () => {
  try {
    const response = await axios.post(`${getOdooUrl()}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'product.category',
        method: 'search_read',
        args: [[]],
        kwargs: { fields: ['id', 'name', 'complete_name'], order: 'name asc', limit: 200 },
      },
    }, { headers: { 'Content-Type': 'application/json' } });
    if (response.data && response.data.error) return [];
    return (response.data.result || []).map((c) => ({
      id: c.id,
      name: c.complete_name || c.name || '',
    }));
  } catch (e) {
    console.warn('fetchProductCategoriesOdoo error:', e?.message);
    return [];
  }
};

// Fetch pos.category — the POS cashier-screen grouping. Includes the integer
// `color` field so the Products screen can tint each filter chip with the
// same palette the cashier sees in Odoo. When `allowedCategoryIds` is non-
// empty, scope the result to just those ids (used by POSProducts to honour
// pos.config.iface_available_categ_ids).
export const fetchPosCategoriesOdoo = async ({ allowedCategoryIds = null } = {}) => {
  const baseUrl = getOdooUrl();
  const scopedDomain = Array.isArray(allowedCategoryIds) && allowedCategoryIds.length > 0
    ? [['id', 'in', allowedCategoryIds.map(Number)]]
    : [];
  const callRead = async (model, fields) => {
    const resp = await axios.post(`${baseUrl}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model,
        method: 'search_read',
        args: [scopedDomain],
        kwargs: { fields, order: 'name asc', limit: 200 },
      },
    }, { headers: { 'Content-Type': 'application/json' } });
    if (resp.data && resp.data.error) {
      const e = new Error('Odoo JSON-RPC error');
      e.payload = resp.data.error;
      throw e;
    }
    return resp.data.result || [];
  };

  // 1) Try pos.category with the rich field set (includes `color`).
  // 2) If that fails, try pos.category without `color`.
  // 3) If pos.category is unavailable entirely (e.g. point_of_sale module not
  //    installed on this DB), fall back to product.category so the form
  //    picker / chip filter still has something to render.
  try {
    let raw;
    try {
      raw = await callRead('pos.category', ['id', 'name', 'color']);
    } catch (err) {
      console.warn(
        'fetchPosCategoriesOdoo pos.category[+color] failed, retrying without color:',
        err?.payload?.data?.message || err?.payload?.message || err?.message
      );
      try {
        raw = await callRead('pos.category', ['id', 'name']);
      } catch (err2) {
        console.warn(
          'fetchPosCategoriesOdoo pos.category unavailable, falling back to product.category:',
          err2?.payload?.data?.message || err2?.payload?.message || err2?.message
        );
        raw = await callRead('product.category', ['id', 'name']);
      }
    }
    return raw.map((c) => ({
      id: c.id,
      name: c.name || '',
      color: typeof c.color === 'number' ? c.color : 0,
    }));
  } catch (e) {
    console.warn(
      'fetchPosCategoriesOdoo error (all sources failed):',
      e?.payload?.data?.message || e?.payload?.message || e?.message
    );
    return [];
  }
};

// Create a new pos.category. Returns { result: <newId> } or { error }.
export const createPosCategoryOdoo = async ({ name, color = 0 } = {}) => {
  if (!name || !String(name).trim()) {
    return { error: { message: 'Category name is required' } };
  }
  const baseUrl = getOdooUrl();
  const vals = { name: String(name).trim() };
  if (color !== undefined && color !== null) vals.color = Number(color) || 0;
  try {
    const resp = await axios.post(`${baseUrl}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: { model: 'pos.category', method: 'create', args: [vals], kwargs: {} },
    }, { headers: { 'Content-Type': 'application/json' } });
    if (resp.data && resp.data.error) {
      return { error: resp.data.error };
    }
    return { result: resp.data.result };
  } catch (e) {
    console.error('createPosCategoryOdoo error:', e?.message);
    return { error: { message: e?.message || 'Create failed' } };
  }
};

// Update an existing pos.category. Same shape as create, plus the id.
export const updatePosCategoryOdoo = async (categoryId, { name, color } = {}) => {
  if (!categoryId) return { error: { message: 'categoryId is required' } };
  const baseUrl = getOdooUrl();
  const vals = {};
  if (name !== undefined) vals.name = String(name).trim();
  if (color !== undefined && color !== null) vals.color = Number(color) || 0;
  if (Object.keys(vals).length === 0) return { result: categoryId };
  try {
    const resp = await axios.post(`${baseUrl}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: { model: 'pos.category', method: 'write', args: [[categoryId], vals], kwargs: {} },
    }, { headers: { 'Content-Type': 'application/json' } });
    if (resp.data && resp.data.error) return { error: resp.data.error };
    return { result: categoryId };
  } catch (e) {
    console.error('updatePosCategoryOdoo error:', e?.message);
    return { error: { message: e?.message || 'Update failed' } };
  }
};

// Counts of products per POS category, plus a grand total. Returns
// { all: <int>, [categoryId]: <int>, ... }. Used by the Products screen
// to label each category chip with its count.
//
// Implementation note: previously a loop of per-category search_count calls,
// which undercounted templates whose `pos_categ_ids` only matched the chip
// indirectly. Now a single product.template `read_group` on `pos_categ_ids`
// gives one (template × category) row per pairing, so chips reflect actual
// membership. `All` is a separate distinct-template search_count over the
// same base domain so it always matches the grid total (3+7+27 may be >
// `All` when a template is in 2 POS cats — that's correct semantics).
export const fetchPosCategoryCountsOdoo = async (categoryIds = [], { posOnly = false, allowedCategoryIds = null } = {}) => {
  const baseDomain = [];
  if (posOnly) baseDomain.push(['available_in_pos', '=', true]);
  if (Array.isArray(allowedCategoryIds) && allowedCategoryIds.length > 0) {
    baseDomain.push(['pos_categ_ids', 'in', allowedCategoryIds.map(Number)]);
  }
  const counts = { all: 0 };

  try {
    // read_group with `lazy: false` gives an exact row per `pos_categ_ids`
    // value rather than nesting by group — single round-trip, no per-chip
    // search_count loop required.
    const groups = await _closeCallKw(
      'product.template', 'read_group',
      [baseDomain, ['pos_categ_ids'], ['pos_categ_ids']],
      { lazy: false },
    );
    (groups || []).forEach((g) => {
      const id = Array.isArray(g.pos_categ_ids) ? g.pos_categ_ids[0] : g.pos_categ_ids;
      const n = Number(g.pos_categ_ids_count ?? g.__count) || 0;
      if (id != null) counts[id] = n;
    });
  } catch (e) {
    console.warn('fetchPosCategoryCountsOdoo read_group failed:', e?.message);
  }

  try {
    // Distinct-template count for the "All" chip — narrowed by the same
    // baseDomain so it lines up exactly with the grid total.
    counts.all = await _closeCallKw('product.template', 'search_count', [baseDomain]);
  } catch (e) {
    console.warn('fetchPosCategoryCountsOdoo all failed:', e?.message);
  }

  // Make sure every category caller asked about is present in the result
  // (zero for ones with no products) so the chip strip render is stable.
  (categoryIds || []).forEach((cid) => {
    if (counts[cid] == null) counts[cid] = 0;
  });
  return counts;
};

// Fetch uom.uom for the form unit-of-measure picker.
export const fetchUomsOdoo = async () => {
  try {
    const response = await axios.post(`${getOdooUrl()}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'uom.uom',
        method: 'search_read',
        args: [[]],
        kwargs: { fields: ['id', 'name'], order: 'name asc', limit: 100 },
      },
    }, { headers: { 'Content-Type': 'application/json' } });
    if (response.data && response.data.error) return [];
    return (response.data.result || []).map((u) => ({ id: u.id, name: u.name }));
  } catch (e) {
    console.warn('fetchUomsOdoo error:', e?.message);
    return [];
  }
};

// Create a product.product. Mirrors employee_attendance's payload shape but
// online-only (no offline queue). Each optional field is omitted when empty
// so Odoo applies defaults.
export const createProductOdoo = async ({ name, categId, posCategoryId, listPrice, standardPrice, barcode, defaultCode, uomId, image, descriptionSale, onHandQty } = {}) => {
  if (!name || !String(name).trim()) {
    return { error: { message: 'Product name is required' } };
  }
  const baseUrl = getOdooUrl();

  const vals = {
    name: String(name).trim(),
    sale_ok: true,
    purchase_ok: true,
  };
  if (categId) vals.categ_id = categId;
  if (posCategoryId) {
    vals.pos_categ_ids = [[6, 0, [posCategoryId]]];
    // Setting a POS category implies the product should show on the POS.
    // Auto-tick `available_in_pos` so the cashier screen picks it up.
    vals.available_in_pos = true;
  }
  if (listPrice !== undefined && listPrice !== '' && listPrice !== null) vals.list_price = Number(listPrice) || 0;
  if (standardPrice !== undefined && standardPrice !== '' && standardPrice !== null) vals.standard_price = Number(standardPrice) || 0;
  if (barcode) vals.barcode = String(barcode).trim();
  if (defaultCode) vals.default_code = String(defaultCode).trim();
  if (uomId) { vals.uom_id = uomId; }
  if (descriptionSale) vals.description_sale = String(descriptionSale).trim();
  if (image) vals.image_1920 = image;

  // When the user typed an on-hand qty, the product must be storable in
  // Odoo 17/18/19 for the stock write below to actually persist. Setting
  // is_storable here piggybacks on the same create round-trip.
  const wantsStock =
    onHandQty !== undefined && onHandQty !== '' && onHandQty !== null;
  if (wantsStock) {
    vals.is_storable = true;
  }

  const callCreate = async (payload) => {
    const resp = await axios.post(`${baseUrl}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: { model: 'product.product', method: 'create', args: [payload], kwargs: {} },
    }, { headers: { 'Content-Type': 'application/json' } });
    if (resp.data && resp.data.error) {
      const e = new Error('Odoo JSON-RPC error');
      e.payload = resp.data.error;
      throw e;
    }
    return resp.data.result;
  };

  let productId;
  try {
    productId = await callCreate(vals);
  } catch (err) {
    console.warn('createProductOdoo full create failed, retrying with safe fields:', err?.payload || err?.message);
    const safe = {
      name: vals.name,
      sale_ok: true,
      purchase_ok: true,
    };
    if (vals.is_storable !== undefined) safe.is_storable = vals.is_storable;
    if (vals.list_price !== undefined) safe.list_price = vals.list_price;
    if (vals.standard_price !== undefined) safe.standard_price = vals.standard_price;
    if (vals.default_code) safe.default_code = vals.default_code;
    if (vals.barcode) safe.barcode = vals.barcode;
    if (vals.image_1920) safe.image_1920 = vals.image_1920;
    if (vals.description_sale) safe.description_sale = vals.description_sale;
    try {
      productId = await callCreate(safe);
    } catch (err2) {
      console.error('createProductOdoo safe create also failed:', err2?.payload || err2?.message);
      return { error: err2?.payload || { message: err2?.message || 'Create failed' } };
    }
  }

  // On-hand qty path — modern stock.quant + action_apply_inventory flow.
  // The deprecated stock.change.product.qty wizard we used previously
  // silently returned 0 on this Odoo install (qty saved as 0 even when
  // entered at creation). Mirrors updateProductOdoo's working pattern.
  // qtySaved: null = not attempted, true = saved, false = failed.
  let qtySaved = null;
  if (wantsStock && productId) {
    qtySaved = false;
    try {
      const newQty = Number(onHandQty);
      if (!Number.isFinite(newQty)) throw new Error('Invalid quantity');

      // 1. Find an existing internal-location quant (unlikely for a fresh product).
      const quantSearch = await axios.post(`${baseUrl}/web/dataset/call_kw`, {
        jsonrpc: '2.0',
        method: 'call',
        params: {
          model: 'stock.quant',
          method: 'search_read',
          args: [[['product_id', '=', productId], ['location_id.usage', '=', 'internal']]],
          kwargs: { fields: ['id', 'location_id'], limit: 1 },
        },
      }, { headers: { 'Content-Type': 'application/json' } });
      let quantId = (quantSearch.data?.result || [])[0]?.id || null;

      if (!quantId) {
        // 2. No quant yet — create one in the first available internal location.
        const locResp = await axios.post(`${baseUrl}/web/dataset/call_kw`, {
          jsonrpc: '2.0',
          method: 'call',
          params: {
            model: 'stock.location',
            method: 'search_read',
            args: [[['usage', '=', 'internal']]],
            kwargs: { fields: ['id'], limit: 1, order: 'id' },
          },
        }, { headers: { 'Content-Type': 'application/json' } });
        const locationId = (locResp.data?.result || [])[0]?.id || null;
        if (!locationId) throw new Error('No internal stock location available');
        const createResp = await axios.post(`${baseUrl}/web/dataset/call_kw`, {
          jsonrpc: '2.0',
          method: 'call',
          params: {
            model: 'stock.quant',
            method: 'create',
            args: [{ product_id: productId, location_id: locationId, inventory_quantity: newQty }],
            kwargs: {},
          },
        }, { headers: { 'Content-Type': 'application/json' } });
        if (createResp.data?.error) throw Object.assign(new Error('quant create failed'), { payload: createResp.data.error });
        quantId = createResp.data?.result;
      } else {
        // 3. Quant exists — set inventory_quantity (the count target).
        const writeResp = await axios.post(`${baseUrl}/web/dataset/call_kw`, {
          jsonrpc: '2.0',
          method: 'call',
          params: {
            model: 'stock.quant',
            method: 'write',
            args: [[quantId], { inventory_quantity: newQty }],
            kwargs: {},
          },
        }, { headers: { 'Content-Type': 'application/json' } });
        if (writeResp.data?.error) throw Object.assign(new Error('quant write failed'), { payload: writeResp.data.error });
      }

      // 4. Apply the inventory adjustment so qty_available reflects the count.
      const applyResp = await axios.post(`${baseUrl}/web/dataset/call_kw`, {
        jsonrpc: '2.0',
        method: 'call',
        params: {
          model: 'stock.quant',
          method: 'action_apply_inventory',
          args: [[quantId]],
          kwargs: {},
        },
      }, { headers: { 'Content-Type': 'application/json' } });
      if (applyResp.data?.error) throw Object.assign(new Error('apply inventory failed'), { payload: applyResp.data.error });

      qtySaved = true;
      console.log('[createProductOdoo] on-hand qty saved:', { productId, quantId, newQty });
    } catch (qtyErr) {
      console.warn('createProductOdoo on-hand qty step failed:', qtyErr?.payload || qtyErr?.message);
      qtySaved = false;
    }
  }

  return { result: productId, qtySaved };
};

// Update an existing product. Writes against product.template (so fields like
// categ_id, pos_categ_ids, uom_id propagate reliably across all variants),
// then verifies each field actually persisted. The on-hand qty path uses the
// modern stock.quant + action_apply_inventory flow rather than the deprecated
// stock.change.product.qty wizard. Returns:
//   { result, partial, notSaved: [field,...], qtySaved: true|false|null }
// so the caller can show an honest "some fields didn't save" message instead
// of a blanket green toast.
export const updateProductOdoo = async (arg, opts = {}) => {
  // Accept legacy signature updateProductOdoo(productId, payload) AND the new
  // updateProductOdoo({ productTmplId, productId, ...payload }) form.
  let productId = null;
  let productTmplId = null;
  let payload = opts;
  if (arg && typeof arg === 'object' && !Array.isArray(arg)) {
    productId = arg.productId || null;
    productTmplId = arg.productTmplId || null;
    payload = { ...arg, ...opts };
  } else {
    productId = arg;
  }
  if (!productId && !productTmplId) {
    return { error: { message: 'productId or productTmplId is required' } };
  }
  const baseUrl = getOdooUrl();
  const {
    name, categId, posCategoryId, listPrice, standardPrice,
    barcode, defaultCode, uomId, image, descriptionSale, onHandQty,
  } = payload;

  // Resolve the template id (and the variant id, needed for the qty path).
  let resolvedVariantId = productId;
  if (!productTmplId && productId) {
    try {
      const lookupResp = await axios.post(`${baseUrl}/web/dataset/call_kw`, {
        jsonrpc: '2.0',
        method: 'call',
        params: {
          model: 'product.product',
          method: 'read',
          args: [[productId], ['product_tmpl_id']],
          kwargs: {},
        },
      }, { headers: { 'Content-Type': 'application/json' } });
      const v = (lookupResp.data?.result || [])[0];
      if (v && Array.isArray(v.product_tmpl_id)) productTmplId = v.product_tmpl_id[0];
    } catch (e) {
      console.warn('updateProductOdoo tmpl lookup failed:', e?.payload || e?.message);
    }
  }
  if (!productTmplId) {
    return { error: { message: 'Could not resolve product template' } };
  }
  if (!resolvedVariantId) {
    try {
      const tmplResp = await axios.post(`${baseUrl}/web/dataset/call_kw`, {
        jsonrpc: '2.0',
        method: 'call',
        params: {
          model: 'product.template',
          method: 'read',
          args: [[productTmplId], ['product_variant_ids']],
          kwargs: {},
        },
      }, { headers: { 'Content-Type': 'application/json' } });
      const t = (tmplResp.data?.result || [])[0];
      if (t && Array.isArray(t.product_variant_ids) && t.product_variant_ids.length > 0) {
        resolvedVariantId = t.product_variant_ids[0];
      }
    } catch (e) {
      console.warn('updateProductOdoo variant lookup failed:', e?.payload || e?.message);
    }
  }

  const vals = {};
  if (name !== undefined) vals.name = String(name).trim();
  if (categId !== undefined) vals.categ_id = categId || false;
  if (posCategoryId !== undefined) {
    vals.pos_categ_ids = posCategoryId ? [[6, 0, [posCategoryId]]] : [[5, 0, 0]];
    if (posCategoryId) vals.available_in_pos = true;
  }
  if (listPrice !== undefined && listPrice !== null && listPrice !== '') vals.list_price = Number(listPrice) || 0;
  if (standardPrice !== undefined && standardPrice !== null && standardPrice !== '') vals.standard_price = Number(standardPrice) || 0;
  if (barcode !== undefined) vals.barcode = barcode ? String(barcode).trim() : false;
  if (defaultCode !== undefined) vals.default_code = defaultCode ? String(defaultCode).trim() : false;
  if (uomId !== undefined) { vals.uom_id = uomId; }
  if (descriptionSale !== undefined) vals.description_sale = descriptionSale ? String(descriptionSale).trim() : false;
  if (image) vals.image_1920 = image;

  // Helper: write `payload` to product.template by id.
  const callWrite = async (model, ids, writeVals) => {
    const resp = await axios.post(`${baseUrl}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: { model, method: 'write', args: [ids, writeVals], kwargs: {} },
    }, { headers: { 'Content-Type': 'application/json' } });
    if (resp.data && resp.data.error) {
      const e = new Error('Odoo JSON-RPC error');
      e.payload = resp.data.error;
      throw e;
    }
    return resp.data.result;
  };

  // Most fields live on product.template; barcode is variant-only on
  // multi-variant templates so we split it off if the template write rejects
  // it.
  const tmplVals = { ...vals };
  delete tmplVals.barcode;
  // When the user submitted an on-hand qty, flip the product to storable in
  // the same template write so the stock.quant path below can land. Added to
  // tmplVals (not vals) so it's not in the post-write verification list —
  // Odoo may flip it computed based on `type`, and a verify mismatch would
  // surface a false "is_storable didn't save" toast.
  const wantsStock =
    onHandQty !== undefined && onHandQty !== '' && onHandQty !== null;
  if (wantsStock) tmplVals.is_storable = true;
  let barcodeWriteVal = vals.barcode;

  // Try the template write. If it fails, we don't fall back to a stripped
  // safe-set anymore (that's what was silently losing fields). Instead we
  // surface the failure in `notSaved` via the verify step.
  let writeFatalError = null;
  if (Object.keys(tmplVals).length > 0) {
    try {
      await callWrite('product.template', [productTmplId], tmplVals);
    } catch (err) {
      console.warn('updateProductOdoo template write failed:', err?.payload || err?.message);
      writeFatalError = err?.payload || { message: err?.message || 'Save failed' };
    }
  }

  // Barcode lives on the variant (product.product), NOT on the template.
  // We've already stripped it from `tmplVals` above, so the variant write
  // here is the source of truth. The verify step below reads barcode back
  // from product.product (not product.template) — reading it from the
  // template was the old bug that always reported barcode as "not saved"
  // even when the variant write succeeded.
  let barcodeWriteFailed = false;
  if (barcodeWriteVal !== undefined && resolvedVariantId) {
    try {
      await callWrite('product.product', [resolvedVariantId], { barcode: barcodeWriteVal });
    } catch (err) {
      console.warn('updateProductOdoo barcode write failed:', err?.payload || err?.message);
      barcodeWriteFailed = true;
    }
  }

  // Verify template-level fields. Barcode is excluded here because it lives
  // on the variant and gets its own verify pass below.
  const tmplFieldsToVerify = Object.keys(vals).filter((k) => k !== 'barcode');
  const notSaved = [];
  if (tmplFieldsToVerify.length > 0) {
    try {
      const verifyResp = await axios.post(`${baseUrl}/web/dataset/call_kw`, {
        jsonrpc: '2.0',
        method: 'call',
        params: {
          model: 'product.template',
          method: 'read',
          args: [[productTmplId], tmplFieldsToVerify],
          kwargs: {},
        },
      }, { headers: { 'Content-Type': 'application/json' } });
      const after = (verifyResp.data?.result || [])[0] || {};
      for (const k of tmplFieldsToVerify) {
        if (!fieldEquals(k, vals[k], after[k])) notSaved.push(k);
      }
    } catch (err) {
      console.warn('updateProductOdoo verify read failed:', err?.payload || err?.message);
      if (writeFatalError) notSaved.push(...tmplFieldsToVerify);
    }
  }

  // Variant-level verify for barcode (read from product.product, not template).
  if (barcodeWriteVal !== undefined && resolvedVariantId) {
    if (barcodeWriteFailed) {
      if (!notSaved.includes('barcode')) notSaved.push('barcode');
    } else {
      try {
        const verifyVarResp = await axios.post(`${baseUrl}/web/dataset/call_kw`, {
          jsonrpc: '2.0',
          method: 'call',
          params: {
            model: 'product.product',
            method: 'read',
            args: [[resolvedVariantId], ['barcode']],
            kwargs: {},
          },
        }, { headers: { 'Content-Type': 'application/json' } });
        const after = (verifyVarResp.data?.result || [])[0] || {};
        if (!fieldEquals('barcode', barcodeWriteVal, after.barcode)) {
          notSaved.push('barcode');
        }
      } catch (err) {
        console.warn('updateProductOdoo variant verify failed:', err?.payload || err?.message);
        // Soft-fail: don't flag as notSaved on verify error alone if the
        // write call itself didn't throw.
      }
    }
  }

  // If absolutely nothing went through, surface a hard error so the caller
  // shows the full Odoo message instead of a "some fields not saved" toast.
  const totalFields = tmplFieldsToVerify.length + (barcodeWriteVal !== undefined ? 1 : 0);
  if (writeFatalError && notSaved.length === totalFields && totalFields > 0) {
    return { error: writeFatalError };
  }

  // On-hand qty path — modern stock.quant flow, works on Odoo 13–18.
  // qtySaved: null = not attempted, true = saved, false = failed.
  let qtySaved = null;
  if (onHandQty !== undefined && onHandQty !== '' && onHandQty !== null && resolvedVariantId) {
    qtySaved = false;
    try {
      const newQty = Number(onHandQty);
      if (!Number.isFinite(newQty)) throw new Error('Invalid quantity');

      // 1. Find an existing internal-location quant for this variant.
      const quantSearch = await axios.post(`${baseUrl}/web/dataset/call_kw`, {
        jsonrpc: '2.0',
        method: 'call',
        params: {
          model: 'stock.quant',
          method: 'search_read',
          args: [[['product_id', '=', resolvedVariantId], ['location_id.usage', '=', 'internal']]],
          kwargs: { fields: ['id', 'location_id'], limit: 1 },
        },
      }, { headers: { 'Content-Type': 'application/json' } });
      let quantId = (quantSearch.data?.result || [])[0]?.id || null;

      if (!quantId) {
        // 2. No quant yet — create one in the first available internal location.
        const locResp = await axios.post(`${baseUrl}/web/dataset/call_kw`, {
          jsonrpc: '2.0',
          method: 'call',
          params: {
            model: 'stock.location',
            method: 'search_read',
            args: [[['usage', '=', 'internal']]],
            kwargs: { fields: ['id'], limit: 1, order: 'id' },
          },
        }, { headers: { 'Content-Type': 'application/json' } });
        const locationId = (locResp.data?.result || [])[0]?.id || null;
        if (!locationId) throw new Error('No internal stock location available');
        const createResp = await axios.post(`${baseUrl}/web/dataset/call_kw`, {
          jsonrpc: '2.0',
          method: 'call',
          params: {
            model: 'stock.quant',
            method: 'create',
            args: [{ product_id: resolvedVariantId, location_id: locationId, inventory_quantity: newQty }],
            kwargs: {},
          },
        }, { headers: { 'Content-Type': 'application/json' } });
        if (createResp.data?.error) throw Object.assign(new Error('quant create failed'), { payload: createResp.data.error });
        quantId = createResp.data?.result;
      } else {
        // 3. Quant exists — set inventory_quantity (the count target).
        await callWrite('stock.quant', [quantId], { inventory_quantity: newQty });
      }

      // 4. Apply the inventory adjustment so qty_available actually reflects it.
      const applyResp = await axios.post(`${baseUrl}/web/dataset/call_kw`, {
        jsonrpc: '2.0',
        method: 'call',
        params: {
          model: 'stock.quant',
          method: 'action_apply_inventory',
          args: [[quantId]],
          kwargs: {},
        },
      }, { headers: { 'Content-Type': 'application/json' } });
      if (applyResp.data?.error) throw Object.assign(new Error('apply inventory failed'), { payload: applyResp.data.error });

      qtySaved = true;
    } catch (qtyErr) {
      console.warn('updateProductOdoo qty write failed:', qtyErr?.payload || qtyErr?.message);
      qtySaved = false;
    }
  }

  const partial = notSaved.length > 0 || qtySaved === false;
  return { result: productTmplId, partial, notSaved, qtySaved };
};

// Compare a value we wrote against the value Odoo read back. Handles the
// quirks: Odoo returns false for unset scalars (empty string equivalence),
// many2one comes back as [id, name], x2many `[[6,0,[id]]]` writes come back
// as `[id, ...]`, and floats can drift on round-trip. Only the field names
// updateProductOdoo actually writes need to be supported here.
function fieldEquals(field, wrote, read) {
  // Both null/false/'' considered equal.
  const empty = (v) => v === null || v === undefined || v === false || v === '';
  if (empty(wrote) && empty(read)) return true;

  // many2one fields written as id, read back as [id, name].
  if (field === 'categ_id' || field === 'uom_id') {
    const readId = Array.isArray(read) ? read[0] : read;
    return Number(wrote) === Number(readId);
  }

  // many2many (POS categories) written as [[6,0,[id]]], read back as [id, id, ...].
  if (field === 'pos_categ_ids') {
    let wroteIds = [];
    if (Array.isArray(wrote)) {
      const cmd = wrote[0];
      if (Array.isArray(cmd) && cmd[0] === 6) wroteIds = cmd[2] || [];
      else if (Array.isArray(cmd) && cmd[0] === 5) wroteIds = [];
      else wroteIds = wrote;
    }
    const readIds = Array.isArray(read) ? read.map(Number) : [];
    const a = [...wroteIds].map(Number).sort();
    const b = [...readIds].sort();
    return a.length === b.length && a.every((v, i) => v === b[i]);
  }

  // Booleans
  if (field === 'available_in_pos') return Boolean(wrote) === Boolean(read);

  // Numerics — round to 4 decimals to absorb price/qty rounding.
  if (field === 'list_price' || field === 'standard_price') {
    return Math.round(Number(wrote) * 10000) === Math.round(Number(read) * 10000);
  }

  // image_1920: Odoo returns the resized base64 of whatever we sent. Just
  // checking the field is non-empty after the write is enough — comparing
  // base64 strings is unreliable because Odoo re-encodes.
  if (field === 'image_1920') {
    return typeof read === 'string' && read.length > 0;
  }

  // Strings (name, default_code, barcode, description_sale)
  if (typeof wrote === 'string') return String(wrote).trim() === String(read || '').trim();

  return wrote === read;
}

// ─── Stock / inventory helpers ──────────────────────────────────────────────
// fetch list of products with on-hand qty, supports filter by stock state.
export const fetchStockProductsOdoo = async ({ offset = 0, limit = 50, searchText = '', filter = 'all' } = {}) => {
  const baseUrl = getOdooUrl();
  let domain = [];

  if (searchText && searchText.trim() !== '') {
    const term = searchText.trim();
    domain = ['|', ['name', 'ilike', term], ['default_code', 'ilike', term]];
  }
  if (filter === 'in_stock') {
    domain = domain.concat([['qty_available', '>', 0]]);
  } else if (filter === 'low_stock') {
    domain = domain.concat([['qty_available', '>', 0], ['qty_available', '<=', 5]]);
  } else if (filter === 'out_of_stock') {
    domain = domain.concat([['qty_available', '<=', 0]]);
  }

  const callRead = async (fields) => {
    const response = await axios.post(`${baseUrl}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'product.product',
        method: 'search_read',
        args: [domain],
        kwargs: { fields, offset, limit, order: 'name asc' },
      },
    }, { headers: { 'Content-Type': 'application/json' }, timeout: 25000 });
    if (response.data && response.data.error) {
      const e = new Error('Odoo JSON-RPC error');
      e.payload = response.data.error;
      throw e;
    }
    return response.data.result || [];
  };

  // `product_tmpl_id` is requested so the Stock screen can dedupe variants
  // of the same template (a t-shirt with size S/M/L should render as one
  // row in the stock list, matching Odoo's Inventory → Stock view which
  // groups by product, not variant).
  const richFields = ['id', 'name', 'default_code', 'list_price', 'qty_available', 'virtual_available', 'uom_id', 'categ_id', 'product_tmpl_id'];
  const safeFields = ['id', 'name', 'default_code', 'qty_available', 'product_tmpl_id'];

  let raw = [];
  try {
    raw = await callRead(richFields);
  } catch (err) {
    console.warn('fetchStockProductsOdoo rich fetch failed, falling back:', err?.payload || err?.message);
    try {
      raw = await callRead(safeFields);
    } catch (err2) {
      console.error('fetchStockProductsOdoo safe fetch also failed:', err2?.payload || err2?.message);
      throw err2;
    }
  }

  return raw.map((p) => ({
    id: p.id,
    name: p.name || '',
    default_code: p.default_code || '',
    list_price: Number(p.list_price) || 0,
    qty_available: Number(p.qty_available) || 0,
    virtual_available: typeof p.virtual_available === 'undefined' ? null : Number(p.virtual_available),
    uom: Array.isArray(p.uom_id) ? { id: p.uom_id[0], name: p.uom_id[1] } : null,
    category: Array.isArray(p.categ_id) ? { id: p.categ_id[0], name: p.categ_id[1] } : null,
    // Carry the template id through so the screen can dedupe variants.
    product_tmpl_id: p.product_tmpl_id || null,
    image_url: `${baseUrl}/web/image?model=product.product&id=${p.id}&field=image_128`,
  }));
};

// Paginate the Stock list against product.template so the fetcher unit
// matches the displayed unit. Mirrors fetchStockProductsOdoo's row shape
// (qty/virtual/uom/category/image) so StockScreen renders unchanged.
export const fetchStockProductsByTemplateOdoo = async ({
  offset = 0,
  limit = 50,
  searchText = '',
  filter = 'all',
} = {}) => {
  const baseUrl = getOdooUrl();
  let domain = [];
  if (searchText && searchText.trim()) {
    const term = searchText.trim();
    domain = ['|', ['name', 'ilike', term], ['default_code', 'ilike', term]];
  }
  if (filter === 'in_stock') domain = domain.concat([['qty_available', '>', 0]]);
  else if (filter === 'low_stock') domain = domain.concat([['qty_available', '>', 0], ['qty_available', '<=', 5]]);
  else if (filter === 'out_of_stock') domain = domain.concat([['qty_available', '<=', 0]]);

  const callRead = async (fields) => {
    const resp = await axios.post(`${baseUrl}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'product.template',
        method: 'search_read',
        args: [domain],
        kwargs: { fields, offset, limit, order: 'name asc' },
      },
    }, { headers: { 'Content-Type': 'application/json' }, timeout: 25000 });
    if (resp.data && resp.data.error) {
      const e = new Error('Odoo JSON-RPC error');
      e.payload = resp.data.error;
      throw e;
    }
    return resp.data.result || [];
  };

  const richFields = ['id', 'name', 'default_code', 'list_price', 'qty_available', 'virtual_available', 'uom_id', 'categ_id', 'product_variant_id', 'image_128'];
  const safeFields = ['id', 'name', 'default_code', 'qty_available', 'product_variant_id'];

  let raw = [];
  try {
    raw = await callRead(richFields);
  } catch (err) {
    console.warn('fetchStockProductsByTemplateOdoo rich fetch failed, falling back:', err?.payload || err?.message);
    try { raw = await callRead(safeFields); } catch (err2) { throw err2; }
  }

  return raw.map((t) => {
    const variantId = Array.isArray(t.product_variant_id) ? t.product_variant_id[0] : t.id;
    const hasBase64 = t.image_128 && typeof t.image_128 === 'string' && t.image_128.length > 0;
    return {
      id: variantId,
      name: t.name || '',
      default_code: t.default_code || '',
      list_price: Number(t.list_price) || 0,
      qty_available: Number(t.qty_available) || 0,
      virtual_available: typeof t.virtual_available === 'undefined' ? null : Number(t.virtual_available),
      uom: Array.isArray(t.uom_id) ? { id: t.uom_id[0], name: t.uom_id[1] } : null,
      category: Array.isArray(t.categ_id) ? { id: t.categ_id[0], name: t.categ_id[1] } : null,
      product_tmpl_id: [t.id, t.name],
      image_url: hasBase64 ? `data:image/png;base64,${t.image_128}` : '',
    };
  });
};

// Total number of product.template rows matching the Stock screen's
// current filter — used to show "Showing X of Y".
export const fetchStockProductCountOdoo = async ({ searchText = '', filter = 'all' } = {}) => {
  const baseUrl = getOdooUrl();
  let domain = [];
  if (searchText && searchText.trim()) {
    const term = searchText.trim();
    domain = ['|', ['name', 'ilike', term], ['default_code', 'ilike', term]];
  }
  if (filter === 'in_stock') domain = domain.concat([['qty_available', '>', 0]]);
  else if (filter === 'low_stock') domain = domain.concat([['qty_available', '>', 0], ['qty_available', '<=', 5]]);
  else if (filter === 'out_of_stock') domain = domain.concat([['qty_available', '<=', 0]]);

  try {
    const resp = await axios.post(`${baseUrl}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: { model: 'product.template', method: 'search_count', args: [domain], kwargs: {} },
    }, { headers: { 'Content-Type': 'application/json' }, timeout: 15000 });
    if (resp.data && resp.data.error) return 0;
    return Number(resp.data.result) || 0;
  } catch (e) {
    console.warn('fetchStockProductCountOdoo failed:', e?.message);
    return 0;
  }
};

// Detail for a single product: product info + per-location quants + last move.
// Queries product.template so the on-hand value matches the Stock list (which
// also reads template-level qty_available) and Odoo's Inventory > Products
// view. Quants and last-move are widened to all variants of the template so
// stock that lives on a non-default variant still shows up.
export const fetchProductStockDetailOdoo = async (arg) => {
  if (!arg) return null;
  const baseUrl = getOdooUrl();

  // Accept either a positional id (legacy) or { productTmplId, productId }.
  let productTmplId = null;
  let productId = null;
  if (typeof arg === 'object') {
    productTmplId = arg.productTmplId || null;
    productId = arg.productId || null;
  } else {
    productId = arg;
  }

  // Resolve template id from variant id when needed.
  if (!productTmplId && productId) {
    try {
      const lookupResp = await axios.post(`${baseUrl}/web/dataset/call_kw`, {
        jsonrpc: '2.0',
        method: 'call',
        params: {
          model: 'product.product',
          method: 'search_read',
          args: [[['id', '=', productId]]],
          kwargs: { fields: ['id', 'product_tmpl_id'], limit: 1 },
        },
      }, { headers: { 'Content-Type': 'application/json' } });
      const v = (lookupResp.data?.result || [])[0];
      if (v && Array.isArray(v.product_tmpl_id)) productTmplId = v.product_tmpl_id[0];
    } catch (e) {
      console.warn('fetchProductStockDetailOdoo tmpl lookup failed:', e?.payload || e?.message);
    }
  }
  if (!productTmplId) return null;

  // Read the template (matches the Stock list source — qty_available here is
  // the sum across all variants, which is what Odoo's Inventory list shows).
  const tmplResp = await axios.post(`${baseUrl}/web/dataset/call_kw`, {
    jsonrpc: '2.0',
    method: 'call',
    params: {
      model: 'product.template',
      method: 'search_read',
      args: [[['id', '=', productTmplId]]],
      kwargs: {
        fields: ['id', 'name', 'default_code', 'list_price', 'qty_available', 'virtual_available', 'uom_id', 'image_128', 'categ_id', 'product_variant_ids'],
        limit: 1,
      },
    },
  }, { headers: { 'Content-Type': 'application/json' } });
  if (tmplResp.data && tmplResp.data.error) {
    return { error: tmplResp.data.error };
  }
  const t = (tmplResp.data.result || [])[0];
  if (!t) return null;

  const variantIds = Array.isArray(t.product_variant_ids) ? t.product_variant_ids : [];
  const hasBase64 = t.image_128 && typeof t.image_128 === 'string' && t.image_128.length > 0;

  const product = {
    id: t.id,
    name: t.name || '',
    default_code: t.default_code || '',
    list_price: Number(t.list_price) || 0,
    qty_available: Number(t.qty_available) || 0,
    virtual_available: typeof t.virtual_available === 'undefined' ? null : Number(t.virtual_available),
    uom: Array.isArray(t.uom_id) ? { id: t.uom_id[0], name: t.uom_id[1] } : null,
    category: Array.isArray(t.categ_id) ? { id: t.categ_id[0], name: t.categ_id[1] } : null,
    image_url: hasBase64 ? `data:image/png;base64,${t.image_128}` : '',
  };

  // Quants — widened to every variant of this template so we capture stock
  // no matter which variant it sits on. `location_id.usage` lets us sum only
  // internal locations for the on-hand cross-check below.
  let quants = [];
  if (variantIds.length > 0) {
    try {
      const quantResp = await axios.post(`${baseUrl}/web/dataset/call_kw`, {
        jsonrpc: '2.0',
        method: 'call',
        params: {
          model: 'stock.quant',
          method: 'search_read',
          args: [[['product_id', 'in', variantIds]]],
          kwargs: {
            fields: ['id', 'location_id', 'quantity', 'reserved_quantity', 'location_id.usage'],
            order: 'location_id',
          },
        },
      }, { headers: { 'Content-Type': 'application/json' } });
      if (!(quantResp.data && quantResp.data.error)) {
        quants = (quantResp.data.result || []).map((q) => ({
          id: q.id,
          location: Array.isArray(q.location_id)
            ? { id: q.location_id[0], name: q.location_id[1], usage: q['location_id.usage'] || null }
            : null,
          quantity: Number(q.quantity) || 0,
          reserved: Number(q.reserved_quantity) || 0,
          available: (Number(q.quantity) || 0) - (Number(q.reserved_quantity) || 0),
        }));
      }
    } catch (e) {
      console.warn('fetchProductStockDetailOdoo quants fetch failed:', e?.payload || e?.message);
    }
  }

  // Defence-in-depth: if Odoo's stored qty_available drifts from the live
  // sum of internal-location quants, prefer the live sum so the displayed
  // on-hand always matches what Odoo's Inventory screen would compute.
  const internalQuants = quants.filter((q) => q.location?.usage === 'internal');
  const internalQuantSum = internalQuants.reduce((sum, q) => sum + (Number(q.quantity) || 0), 0);
  if (
    internalQuants.length > 0 &&
    Number.isFinite(internalQuantSum) &&
    internalQuantSum !== product.qty_available
  ) {
    console.warn('[Stock] qty_available !== sum(stock.quant); using stock.quant sum', {
      productTmplId,
      qty_available: product.qty_available,
      internalQuantSum,
    });
    product.qty_available = internalQuantSum;
  }

  // Last completed move (best-effort) — also widened to all variants.
  let lastMove = null;
  if (variantIds.length > 0) {
    try {
      const moveResp = await axios.post(`${baseUrl}/web/dataset/call_kw`, {
        jsonrpc: '2.0',
        method: 'call',
        params: {
          model: 'stock.move.line',
          method: 'search_read',
          args: [[['product_id', 'in', variantIds], ['state', '=', 'done']]],
          kwargs: {
            fields: ['id', 'date', 'qty_done', 'quantity', 'location_id', 'location_dest_id'],
            order: 'date desc',
            limit: 1,
          },
        },
      }, { headers: { 'Content-Type': 'application/json' } });
      if (!(moveResp.data && moveResp.data.error)) {
        const m = (moveResp.data.result || [])[0];
        if (m) {
          lastMove = {
            id: m.id,
            date: m.date || null,
            qty: Number(m.qty_done ?? m.quantity ?? 0) || 0,
            from: Array.isArray(m.location_id) ? { id: m.location_id[0], name: m.location_id[1] } : null,
            to: Array.isArray(m.location_dest_id) ? { id: m.location_dest_id[0], name: m.location_dest_id[1] } : null,
          };
        }
      }
    } catch (e) {
      console.warn('fetchProductStockDetailOdoo last-move fetch failed:', e?.payload || e?.message);
    }
  }

  return { product, quants, lastMove };
};

// Ensure this points to your Odoo URL

// Fetch API token(s) and basic user info for an Odoo user id
export const fetchUserApiToken = async (uid) => {
  // The Odoo instance used by this project may not expose API key models.
  // Authentication will rely on basic `res.users` data returned by the login call.
  // Keep this function for backward compatibility but do not call server models.
  try {
    return {};
  } catch (error) {
    console.error('fetchUserApiToken error (no-op):', error);
    return {};
  }
};

// ─── App-feature admin helpers ──────────────────────────────────────────────
// Used by the in-app Admin screen at src/screens/Admin/AppFeaturesScreen.js to
// list the catalog and manage per-user hide rows. None of these are needed by
// regular users — only by privilege managers operating the admin UI.

// Read every record in the app.feature catalog for the admin's picker.
export const fetchAppFeaturesOdoo = async () => {
  try {
    const response = await axios.post(
      `${getOdooUrl()}/web/dataset/call_kw`,
      {
        jsonrpc: '2.0',
        method: 'call',
        params: {
          model: 'app.feature.app',
          method: 'search_read',
          args: [[['active', '=', true]]],
          kwargs: {
            fields: ['id', 'feature_key', 'name', 'description', 'sequence', 'parent_id'],
            order: 'sequence asc, name asc',
          },
        },
      },
      { headers: { 'Content-Type': 'application/json' } },
    );
    if (response.data && response.data.error) {
      console.warn('[FeatureAdmin] fetchAppFeaturesOdoo error:', response.data.error?.data?.message || response.data.error);
      return [];
    }
    const rows = Array.isArray(response.data?.result) ? response.data.result : [];
    console.log('[FeatureAdmin] features fetched:', rows.length,
      rows.map((r) => ({ id: r.id, key: r.feature_key, parent: r.parent_id })));
    return rows;
  } catch (err) {
    console.warn('[FeatureAdmin] fetchAppFeaturesOdoo failed:', err?.message || err);
    return [];
  }
};

// Per-user hide rows ONLY (does NOT merge role-level hides — those are
// configured in the Odoo privilege.role form). Routed through the sudo'd
// `get_user_hides_for_admin` model method so the calling user only needs to
// be allowed to invoke the method, not have direct read ACL on the table —
// the actual security gate is the admin check in AppFeaturesScreen.js.
export const fetchHiddenAppFeaturesAdmin = async (userId) => {
  if (!userId) return [];
  try {
    const response = await axios.post(
      `${getOdooUrl()}/web/dataset/call_kw`,
      {
        jsonrpc: '2.0',
        method: 'call',
        params: {
          model: 'app.feature.visibility.app',
          method: 'get_user_hides_for_admin',
          args: [Number(userId)],
          kwargs: {},
        },
      },
      { headers: { 'Content-Type': 'application/json' } },
    );
    if (response.data && response.data.error) {
      console.warn('[FeatureAdmin] fetchHiddenAppFeaturesAdmin error:', response.data.error?.data?.message || response.data.error);
      return [];
    }
    return Array.isArray(response.data?.result) ? response.data.result : [];
  } catch (err) {
    console.warn('[FeatureAdmin] fetchHiddenAppFeaturesAdmin failed:', err?.message || err);
    return [];
  }
};

// ─── Module Privileges admin helpers ────────────────────────────────────────
// Mirror the OWL dashboard's MODULE-BASED PRIVILEGES section. All route
// through sudo'd methods on `app.feature.visibility`, same pattern as the
// App Features admin RPCs.

const _callKw = async (method, args = [], kwargs = {}) => {
  const response = await axios.post(
    `${getOdooUrl()}/web/dataset/call_kw`,
    {
      jsonrpc: '2.0',
      method: 'call',
      params: { model: 'app.feature.visibility.app', method, args, kwargs },
    },
    { headers: { 'Content-Type': 'application/json' } },
  );
  if (response.data && response.data.error) {
    throw new Error(response.data.error?.data?.message || `${method} failed`);
  }
  return response.data?.result;
};

export const fetchUserModulesAdmin = async (userId) => {
  if (!userId) return [];
  try {
    const result = await _callKw('list_user_modules_admin', [Number(userId)]);
    return Array.isArray(result) ? result : [];
  } catch (err) {
    console.warn('[ModulePriv] fetchUserModulesAdmin failed:', err?.message || err);
    return [];
  }
};

export const fetchInstallableModulesAdmin = async (userId, searchText = '') => {
  if (!userId) return [];
  try {
    const result = await _callKw('list_installable_modules_admin', [Number(userId), String(searchText || '')]);
    return Array.isArray(result) ? result : [];
  } catch (err) {
    console.warn('[ModulePriv] fetchInstallableModulesAdmin failed:', err?.message || err);
    return [];
  }
};

export const setModuleMasterPermAdmin = async (mpId, field, value) => {
  if (!mpId) throw new Error('mpId is required');
  return _callKw('set_module_master_perm_admin', [Number(mpId), String(field), Boolean(value)]);
};

export const grantAllModuleAdmin = async (mpId) => {
  if (!mpId) throw new Error('mpId is required');
  return _callKw('grant_all_module_admin', [Number(mpId)]);
};

export const readOnlyModuleAdmin = async (mpId) => {
  if (!mpId) throw new Error('mpId is required');
  return _callKw('read_only_module_admin', [Number(mpId)]);
};

export const addModuleAdmin = async (userId, moduleId) => {
  if (!userId || !moduleId) throw new Error('userId and moduleId are required');
  return _callKw('add_module_admin', [Number(userId), Number(moduleId)]);
};

export const removeModuleAdmin = async (mpId) => {
  if (!mpId) throw new Error('mpId is required');
  return _callKw('remove_module_admin', [Number(mpId)]);
};

// Privilege summary counts for the in-app admin stat tiles. Wraps the sudo'd
// `get_privilege_stats_for_user` so the calling user doesn't need direct read
// ACL on privilege.role / module.privilege / menu.privilege / module.visibility.
// Returns zeros on any error so the UI just shows 0s instead of breaking.
export const fetchPrivilegeStatsForUser = async (userId) => {
  const ZERO = { groups: 0, modules: 0, hidden_menus: 0, hidden_apps: 0, hidden_features: 0 };
  if (!userId) return ZERO;
  try {
    const response = await axios.post(
      `${getOdooUrl()}/web/dataset/call_kw`,
      {
        jsonrpc: '2.0',
        method: 'call',
        params: {
          model: 'app.feature.visibility.app',
          method: 'get_privilege_stats_for_user',
          args: [Number(userId)],
          kwargs: {},
        },
      },
      { headers: { 'Content-Type': 'application/json' } },
    );
    if (response.data && response.data.error) {
      console.warn('[FeatureAdmin] fetchPrivilegeStatsForUser error:', response.data.error?.data?.message || response.data.error);
      return ZERO;
    }
    return { ...ZERO, ...(response.data?.result || {}) };
  } catch (err) {
    console.warn('[FeatureAdmin] fetchPrivilegeStatsForUser failed:', err?.message || err);
    return ZERO;
  }
};

// Bulk-hide every active app.feature for `userId` (the "Hide All" button
// on the in-app Apps Privileges admin). Returns the count of currently-
// active visibility rows after the bulk write. Throws on error so the
// caller can show a failure toast.
export const hideAllFeaturesForUser = async (userId) => {
  if (!userId) return 0;
  const response = await axios.post(
    `${getOdooUrl()}/web/dataset/call_kw`,
    {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'app.feature.visibility.app',
        method: 'hide_all_features_for_user',
        args: [Number(userId)],
        kwargs: {},
      },
    },
    { headers: { 'Content-Type': 'application/json' } },
  );
  if (response.data && response.data.error) {
    throw new Error(response.data.error?.data?.message || 'Hide all failed');
  }
  return Number(response.data?.result || 0);
};

// Bulk-clear every per-user app.feature.visibility row for `userId` (the
// "Full Permission" button on the in-app Apps Privileges admin). Returns
// the number of rows removed. Throws on error so the caller can show a
// failure toast.
export const clearAllHidesForUser = async (userId) => {
  if (!userId) return 0;
  const response = await axios.post(
    `${getOdooUrl()}/web/dataset/call_kw`,
    {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'app.feature.visibility.app',
        method: 'clear_all_hides_for_user',
        args: [Number(userId)],
        kwargs: {},
      },
    },
    { headers: { 'Content-Type': 'application/json' } },
  );
  if (response.data && response.data.error) {
    throw new Error(response.data.error?.data?.message || 'Clear all failed');
  }
  return Number(response.data?.result || 0);
};

// Toggle a (user_id, feature_id) hide row. hidden=true ensures a row exists,
// hidden=false unlinks. Routed through `toggle_user_hide_admin` on the model —
// one RPC, sudo'd server-side, no ACL dependency. Throws on error so the
// caller can roll back its optimistic UI update.
export const setAppFeatureHiddenForUser = async (userId, featureId, hidden) => {
  if (!userId || !featureId) {
    throw new Error('userId and featureId are required');
  }
  const response = await axios.post(
    `${getOdooUrl()}/web/dataset/call_kw`,
    {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'app.feature.visibility.app',
        method: 'toggle_user_hide_admin',
        args: [Number(userId), Number(featureId), Boolean(hidden)],
        kwargs: {},
      },
    },
    { headers: { 'Content-Type': 'application/json' } },
  );
  if (response.data && response.data.error) {
    throw new Error(response.data.error?.data?.message || 'Toggle failed');
  }
  return true;
};

// Fetch the set of app feature_keys hidden for a given user (per-user records
// + role-level records, merged server-side). The auth store calls this once
// at login and caches the result; downstream UI uses <FeatureGate> to gate
// rendering on that cached set.
export const fetchHiddenAppFeatures = async (userId) => {
  if (!userId) return [];
  try {
    const response = await axios.post(
      `${getOdooUrl()}/web/dataset/call_kw`,
      {
        jsonrpc: '2.0',
        method: 'call',
        params: {
          model: 'app.feature.visibility.app',
          method: 'get_hidden_features_for_user',
          args: [Number(userId)],
          kwargs: {},
        },
      },
      { headers: { 'Content-Type': 'application/json' } },
    );
    if (response.data && response.data.error) {
      // Module not installed / not upgraded yet → no gating, log once and
      // return an empty list so the app renders everything.
      console.warn('[FeatureGate] get_hidden_features_for_user error:', response.data.error?.data?.message || response.data.error);
      return [];
    }
    const result = response.data?.result;
    const keys = Array.isArray(result) ? result.filter((k) => typeof k === 'string') : [];
    console.log(`[FeatureGate] fetchHiddenAppFeatures uid=${userId} → ${JSON.stringify(keys)}`);
    return keys;
  } catch (err) {
    console.warn('[FeatureGate] fetchHiddenAppFeatures failed:', err?.message || err);
    return [];
  }
};

// Fetch categories directly from Odoo using JSON-RPC
// NOTE: older code filtered by a non-existent `is_category` field which caused Odoo to raise
// "Invalid field product.category.is_category". Use a safe domain (empty) and apply
// `name ilike` only when a searchText is provided.
export const fetchCategoriesOdoo = async ({ offset = 0, limit = 50, searchText = "" } = {}) => {
  try {
    // Default to no domain (fetch categories). If you want only top-level categories,
    // you can use `['parent_id', '=', false]` instead.
    let domain = [];

    // If a search term is provided, filter by category name
    if (searchText && searchText.trim() !== "") {
      const term = searchText.trim();
      domain = [["name", "ilike", term]]; // Filter by category name
    }

    // API call to Odoo to fetch the categories
    const response = await axios.post(
      `${getOdooUrl()}/web/dataset/call_kw`, // Odoo API URL
      {
        jsonrpc: "2.0",
        method: "call",
        params: {
          model: "product.category", // Odoo model for categories
          method: "search_read",
          args: [domain], // Domain filter for categories
          kwargs: {
            fields: ["id", "name"], // Fields you want to fetch from Odoo
            offset, // Pagination
            limit, // Pagination
            order: "name asc", // Sorting
          },
        },
      },
      {
        headers: { "Content-Type": "application/json" },
      }
    );

    // Handle any errors from the Odoo API
    if (response.data.error) {
      console.log("Odoo JSON-RPC error (categories):", response.data.error);
      throw new Error("Odoo JSON-RPC error");
    }

    // Map the categories into a usable format
    const categories = response.data.result || [];
    return categories.map(category => ({
      _id: category.id,
      name: category.name || "",
      // keep backward-compatible key expected by CategoryList
      category_name: category.name || "",
    }));
  } catch (error) {
    console.error("Error fetching categories from Odoo:", error);
    throw error; // Ensure errors are thrown to be caught by the calling function
  }
};

// Fetch detailed product information for a single Odoo product id
export const fetchProductDetailsOdoo = async (productId) => {
  try {
    if (!productId) return null;

    // 1. Fetch product details — try a rich field set first, fall back to a
    // safe core set if any field is rejected by this Odoo db (some builds
    // don't have `available_in_pos`, `pos_categ_ids`, etc.).
    const callRead = async (fields) => {
      const resp = await axios.post(
        `${getOdooUrl()}/web/dataset/call_kw`,
        {
          jsonrpc: '2.0',
          method: 'call',
          params: {
            model: 'product.product',
            method: 'search_read',
            args: [[['id', '=', productId]]],
            kwargs: { fields, limit: 1 },
          },
        },
        { headers: { 'Content-Type': 'application/json' } }
      );
      if (resp.data && resp.data.error) {
        const e = new Error('Odoo JSON-RPC error');
        e.payload = resp.data.error;
        throw e;
      }
      return resp.data.result || [];
    };

    const richFields = [
      'id', 'name', 'list_price', 'standard_price', 'default_code', 'barcode',
      'uom_id', 'image_128', 'description_sale', 'categ_id', 'pos_categ_ids',
      'available_in_pos',
      'qty_available', 'virtual_available',
    ];
    const safeFields = [
      'id', 'name', 'list_price', 'default_code',
      'uom_id', 'image_128', 'categ_id', 'qty_available',
    ];

    let productResults;
    try {
      productResults = await callRead(richFields);
    } catch (err) {
      console.warn(
        'fetchProductDetailsOdoo rich fetch failed, retrying with safe fields:',
        err?.payload?.data?.message || err?.payload?.message || err?.message
      );
      productResults = await callRead(safeFields);
    }
    const productResponse = { data: { result: productResults } };
    const results = productResponse.data.result || [];
    const p = results[0];
    if (!p) return null;

    // 2. Fetch warehouse/stock info
    const quantResponse = await axios.post(
      `${getOdooUrl()}/web/dataset/call_kw`,
      {
        jsonrpc: '2.0',
        method: 'call',
        params: {
          model: 'stock.quant',
          method: 'search_read',
          args: [[['product_id', '=', productId]]],
          kwargs: {
            fields: ['location_id', 'quantity'],
          },
        },
      },
      { headers: { 'Content-Type': 'application/json' } }
    );

    let inventory_ledgers = [];
    if (quantResponse.data && quantResponse.data.result) {
      inventory_ledgers = quantResponse.data.result.map(q => ({
        warehouse_id: Array.isArray(q.location_id) ? q.location_id[0] : null,
        warehouse_name: Array.isArray(q.location_id) ? q.location_id[1] : '',
        total_warehouse_quantity: q.quantity,
      }));
    }

    // 3. Shape and return — use inline base64 from the authenticated JSON-RPC
    // response. If the product has no image we leave image_url empty so the
    // detail page shows the "No Image" placeholder instead of a broken URL.
    const hasBase64 = p.image_128 && typeof p.image_128 === 'string' && p.image_128.length > 0;
    const imageUrl = hasBase64 ? `data:image/png;base64,${p.image_128}` : '';

    // Resolve pos.category id → name (search_read of pos_categ_ids returns
    // just an array of ids). Best-effort; ignored on failure.
    let pos_category = null;
    if (Array.isArray(p.pos_categ_ids) && p.pos_categ_ids.length > 0) {
      try {
        const posResp = await axios.post(`${getOdooUrl()}/web/dataset/call_kw`, {
          jsonrpc: '2.0',
          method: 'call',
          params: {
            model: 'pos.category',
            method: 'name_get',
            args: [p.pos_categ_ids],
            kwargs: {},
          },
        }, { headers: { 'Content-Type': 'application/json' } });
        if (posResp.data && Array.isArray(posResp.data.result) && posResp.data.result[0]) {
          const [pid, pname] = posResp.data.result[0];
          pos_category = { id: pid, name: pname };
        }
      } catch (_) {}
    }

    return {
      id: p.id,
      product_name: p.name || '',
      image_url: imageUrl,
      price: p.list_price || 0,
      sale_price: p.list_price || 0,
      cost: Number(p.standard_price) || 0,
      barcode: p.barcode || '',
      minimal_sales_price: p.list_price || null,
      inventory_ledgers,
      total_product_quantity: p.qty_available ?? p.virtual_available ?? 0,
      inventory_box_products_details: [],
      product_code: p.default_code || null,
      uom: p.uom_id ? { uom_id: p.uom_id[0], uom_name: p.uom_id[1] } : null,
      categ_id: p.categ_id || null,
      pos_category,
      available_in_pos: !!p.available_in_pos,
      product_description: p.description_sale || null,
    };
  } catch (error) {
    console.error('fetchProductDetailsOdoo error:', error);
    throw error;
  }
};


export const fetchInventoryBoxRequest = async ({ offset, limit, searchText }) => {
  const currentUser = useAuthStore.getState().user; // Correct usage of useAuthStore
  const salesPersonId = currentUser.related_profile._id;

  // Debugging output for salesPersonId
  try {
    const queryParams = {
      offset,
      limit,
      ...(searchText !== undefined && { name: searchText }),
      ...(salesPersonId !== undefined && { sales_person_id: salesPersonId })
    };
    const response = await get(API_ENDPOINTS.VIEW_INVENTORY_BOX_REQUEST, queryParams);
    return response.data;
  } catch (error) {
    handleApiError(error);
    throw error;
  }
};

export const fetchAuditing = async ({ offset, limit }) => {
  try {
    const queryParams = {
      offset,
      limit,
    };
    const response = await get(API_ENDPOINTS.VIEW_AUDITING, queryParams);
    return response.data;
  } catch (error) {
    handleApiError(error);
    throw error;
  }
};

export const fetchCustomers = async ({ offset, limit, searchText }) => {
  try {
    const queryParams = {
      offset,
      limit,
      ...(searchText !== undefined && { name: searchText }),
    };
    const response = await get(API_ENDPOINTS.VIEW_CUSTOMERS, queryParams);
    return response.data;
  } catch (error) {
    handleApiError(error);
    throw error;
  }
};// 🔹 Fetch customers directly from Odoo 19 via JSON-RPC (no mobile field)
export const fetchCustomersOdoo = async ({ offset = 0, limit = 50, searchText } = {}) => {
  try {
    let domain = [];
    if (searchText && searchText.trim() !== "") {
      const term = searchText.trim();
      domain = [
        "|",
        ["name", "ilike", term],
        ["phone", "ilike", term],
      ];
    }

    // ID-proof binaries live on ir.attachment (not as fields on
    // res.partner), so the list fetch doesn't request them — that's
    // what was producing the constant `Invalid field 'id_proof_front'`
    // warnings on every list load. Per-customer proof presence is
    // checked separately by callers that need it (e.g. the dedicated
    // Customer ID Proofs screen).
    const fields = [
      "id", "name", "email", "phone",
      "street", "street2", "city", "zip", "country_id",
    ];

    const response = await axios.post(
      `${getOdooUrl()}/web/dataset/call_kw`,
      {
        jsonrpc: "2.0",
        method: "call",
        params: {
          model: "res.partner",
          method: "search_read",
          args: [domain],
          kwargs: { fields, offset, limit, order: "name asc" },
        },
      },
      { headers: { "Content-Type": "application/json" } }
    );
    if (response.data && response.data.error) {
      console.log("Odoo JSON-RPC error:", response.data.error);
      throw new Error("Odoo JSON-RPC error");
    }
    const partners = response.data.result || [];

    const baseUrl = getOdooUrl();
    return partners.map((p) => ({
      id: p.id,
      name: p.name || "",
      email: p.email || "",
      phone: p.phone || "",
      image_url: `${baseUrl}/web/image?model=res.partner&id=${p.id}&field=image_128`,
      address: [
        p.street,
        p.street2,
        p.city,
        p.zip,
        p.country_id && Array.isArray(p.country_id) ? p.country_id[1] : ""
      ].filter(Boolean).join(", "),
      // ID-proof presence is fetched separately via ir.attachment when
      // a caller needs it (e.g. the Customer ID Proofs screen).
    }));
  } catch (error) {
    console.error("fetchCustomersOdoo error:", error);
    throw error;
  }
};

// ID-proof storage strategy — `ir.attachment` linked to the partner,
// not a custom field on res.partner. This avoids needing a custom
// Odoo module: the standard `ir.attachment` table is on every Odoo
// install, and Odoo permissions / record rules already gate access
// per-user. The proof "side" (front / back) is encoded in the
// attachment's `name` so the lookup is just a search by partner id +
// known names.
const ID_PROOF_ATTACH_NAMES = {
  front: 'id_proof_front',
  back: 'id_proof_back',
};

// Find the existing id_proof attachments for a partner. Returns a
// dict keyed by side ('front' / 'back') with the attachment id and
// base64 datas, or null if missing.
const _readIdProofAttachments = async (partnerId) => {
  if (!partnerId) return { front: null, back: null };
  const baseUrl = getOdooUrl();
  const resp = await axios.post(`${baseUrl}/web/dataset/call_kw`, {
    jsonrpc: '2.0',
    method: 'call',
    params: {
      model: 'ir.attachment',
      method: 'search_read',
      args: [[
        ['res_model', '=', 'res.partner'],
        ['res_id', '=', Number(partnerId)],
        ['name', 'in', [ID_PROOF_ATTACH_NAMES.front, ID_PROOF_ATTACH_NAMES.back]],
      ]],
      kwargs: { fields: ['id', 'name', 'datas'], order: 'id desc' },
    },
  }, { headers: { 'Content-Type': 'application/json' } });
  if (resp.data?.error) throw new Error(resp.data.error?.data?.message || 'attachment search failed');
  const rows = resp.data?.result || [];
  // If an old custom-module install previously wrote multiple rows per
  // side, the most recent one wins (we ordered desc by id).
  const out = { front: null, back: null };
  for (const r of rows) {
    if (r.name === ID_PROOF_ATTACH_NAMES.front && !out.front) {
      out.front = { id: r.id, datas: r.datas || null };
    } else if (r.name === ID_PROOF_ATTACH_NAMES.back && !out.back) {
      out.back = { id: r.id, datas: r.datas || null };
    }
  }
  return out;
};

// Read both ID-proof binaries for a single partner.
export const fetchPartnerIdProofOdoo = async (partnerId) => {
  if (!partnerId) return { id_proof_front: null, id_proof_back: null };
  try {
    const map = await _readIdProofAttachments(partnerId);
    return {
      id_proof_front: map.front?.datas || null,
      id_proof_back: map.back?.datas || null,
    };
  } catch (e) {
    console.warn('fetchPartnerIdProofOdoo failed:', e?.message);
    return { id_proof_front: null, id_proof_back: null };
  }
};

// Write one or both ID-proof binaries via ir.attachment. Pass `null`
// (not undefined) to clear a side. Behaviour per side:
//   undefined  → unchanged
//   non-empty  → if an attachment with that side's name already exists,
//                write its `datas`; otherwise create a new one.
//   null       → unlink the existing attachment (if any).
export const updatePartnerIdProofOdoo = async (partnerId, { id_proof_front, id_proof_back } = {}) => {
  if (!partnerId) return { error: { message: 'partnerId is required' } };
  if (id_proof_front === undefined && id_proof_back === undefined) {
    return { result: partnerId };
  }
  const baseUrl = getOdooUrl();
  try {
    const existing = await _readIdProofAttachments(partnerId);
    const ops = [];

    const apply = (side, value) => {
      if (value === undefined) return;
      const sideName = ID_PROOF_ATTACH_NAMES[side];
      const existingAtt = existing[side];
      if (value === null) {
        if (existingAtt) {
          ops.push(axios.post(`${baseUrl}/web/dataset/call_kw`, {
            jsonrpc: '2.0',
            method: 'call',
            params: {
              model: 'ir.attachment',
              method: 'unlink',
              args: [[existingAtt.id]],
              kwargs: {},
            },
          }, { headers: { 'Content-Type': 'application/json' } }));
        }
        return;
      }
      if (existingAtt) {
        ops.push(axios.post(`${baseUrl}/web/dataset/call_kw`, {
          jsonrpc: '2.0',
          method: 'call',
          params: {
            model: 'ir.attachment',
            method: 'write',
            args: [[existingAtt.id], { datas: value, mimetype: 'image/jpeg' }],
            kwargs: {},
          },
        }, { headers: { 'Content-Type': 'application/json' } }));
      } else {
        ops.push(axios.post(`${baseUrl}/web/dataset/call_kw`, {
          jsonrpc: '2.0',
          method: 'call',
          params: {
            model: 'ir.attachment',
            method: 'create',
            args: [{
              name: sideName,
              datas: value,
              mimetype: 'image/jpeg',
              res_model: 'res.partner',
              res_id: Number(partnerId),
              type: 'binary',
            }],
            kwargs: {},
          },
        }, { headers: { 'Content-Type': 'application/json' } }));
      }
    };

    apply('front', id_proof_front);
    apply('back', id_proof_back);

    const responses = await Promise.all(ops);
    for (const r of responses) {
      if (r.data?.error) return { error: r.data.error };
    }
    return { result: partnerId };
  } catch (e) {
    return { error: { message: e?.message || 'Update failed' } };
  }
};

// Return an array of partner ids that already have at least one
// id_proof attachment. Used by the Customer ID Proofs screen to
// narrow the customer list to only those with proofs uploaded.
export const fetchPartnersWithIdProofOdoo = async () => {
  const baseUrl = getOdooUrl();
  try {
    const resp = await axios.post(`${baseUrl}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'ir.attachment',
        method: 'search_read',
        args: [[
          ['res_model', '=', 'res.partner'],
          ['name', 'in', [ID_PROOF_ATTACH_NAMES.front, ID_PROOF_ATTACH_NAMES.back]],
        ]],
        kwargs: { fields: ['res_id', 'name'], limit: 5000 },
      },
    }, { headers: { 'Content-Type': 'application/json' } });
    if (resp.data?.error) return new Map();
    const rows = resp.data?.result || [];
    // Map<partnerId, { front: bool, back: bool }>
    const out = new Map();
    for (const r of rows) {
      const pid = r.res_id;
      if (!pid) continue;
      const cur = out.get(pid) || { front: false, back: false };
      if (r.name === ID_PROOF_ATTACH_NAMES.front) cur.front = true;
      if (r.name === ID_PROOF_ATTACH_NAMES.back) cur.back = true;
      out.set(pid, cur);
    }
    return out;
  } catch (e) {
    console.warn('fetchPartnersWithIdProofOdoo failed:', e?.message);
    return new Map();
  }
};


export const fetchPickup = async ({ offset, limit, loginEmployeeId }) => {
  try {
    const queryParams = {
      offset,
      limit,
      ...(loginEmployeeId !== undefined && { login_employee_id: loginEmployeeId }),
    };
    const response = await get(API_ENDPOINTS.VIEW_PICKUP, queryParams);
    return response.data;
  } catch (error) {
    handleApiError(error);
    throw error;
  }
};

export const fetchService = async ({ offset, limit, loginEmployeeId }) => {
  try {
    const queryParams = {
      offset,
      limit,
      ...(loginEmployeeId !== undefined && { login_employee_id: loginEmployeeId }),
    };
    const response = await get(API_ENDPOINTS.VIEW_SERVICE, queryParams);
    return response.data;
  } catch (error) {
    handleApiError(error);
    throw error;
  }
};

export const fetchSpareParts = async ({ offset, limit, loginEmployeeId }) => {
  try {
    const queryParams = {
      offset,
      limit,
      ...(loginEmployeeId !== undefined && { login_employee_id: loginEmployeeId }),
    };
    const response = await get(API_ENDPOINTS.VIEW_SPARE_PARTS, queryParams);
    return response.data;
  } catch (error) {
    handleApiError(error);
    throw error;
  }
};

export const fetchMarketStudy = async ({ offset, limit }) => {
  try {
    const queryParams = {
      offset,
      limit,
    };
    const response = await get(API_ENDPOINTS.VIEW_MARKET_STUDY, queryParams);
    return response.data;
  } catch (error) {
    handleApiError(error);
    throw error;
  }
};

export const fetchCustomerVisitList = async ({ offset, limit, fromDate, toDate, customerId, customerName, employeeName, loginEmployeeId }) => {
  try {
    const queryParams = {
      offset,
      limit,
      ...(loginEmployeeId !== undefined && { login_employee_id: loginEmployeeId }),
      ...(customerName !== undefined && { customer_name: customerName }),
      ...(customerId !== undefined && { customer_id: customerId }),
      ...(employeeName !== undefined && { employee_name: employeeName }),
      ...(fromDate !== undefined && { from_date: fromDate }),
      ...(toDate !== undefined && { to_date: toDate }),
    };
    const response = await get(API_ENDPOINTS.VIEW_CUSTOMER_VISIT_LIST, queryParams);
    return response.data;
  } catch (error) {
    handleApiError(error);
    throw error;
  }
};

export const fetchEnquiryRegister = async ({ offset, limit, loginEmployeeId }) => {
  try {
    const queryParams = {
      offset,
      limit,
      ...(loginEmployeeId !== undefined && { login_employee_id: loginEmployeeId }),
    };
    const response = await get(API_ENDPOINTS.VIEW_ENQUIRY_REGISTER, queryParams);
    return response.data;
  } catch (error) {
    handleApiError(error);
    throw error;
  }
};

export const fetchPurchaseRequisition = async ({ offset, limit,searchText}) => {
  try {
    const queryParams = {
      offset,
      limit,
      ...(searchText !== undefined && { sequence_no: searchText }),
    };
    const response = await get(API_ENDPOINTS.VIEW_PURCHASE_REQUISITION,queryParams);
    return response.data;

  } catch(error){
    handleApiError(error);
    throw error;
  }
}

export const fetchPriceEnquiry = async ({ offset, limit,searchText}) => {
  try {
    const queryParams = {
      offset,
      limit,
      ...(searchText !== undefined && { sequence_no: searchText }),
    };
    const response = await get(API_ENDPOINTS.VIEW_PRICE,queryParams);
    return response.data;

  } catch(error){
    handleApiError(error);
    throw error;
  }
}

export const fetchPurchaseOrder = async ({ offset, limit,searchText}) => {
  try {
    const queryParams = {
      offset,
      limit,
      ...(searchText !== undefined && { sequence_no: searchText }),
    };
    const response = await get(API_ENDPOINTS.VIEW_PURCHASE_ORDER,queryParams);
    return response.data;

  } catch(error){
    handleApiError(error);
    throw error;
  }
}

export const fetchDeliveryNote = async ({ offset, limit,searchText}) => {
  try {
    const queryParams = {
      offset,
      limit,
      ...(searchText !== undefined && { sequence_no: searchText }),
    };
    const response = await get(API_ENDPOINTS.VIEW_DELIVERY_NOTE,queryParams);
    return response.data;

  } catch(error){
    handleApiError(error);
    throw error;
  }
}

export const fetchVendorBill = async ({ offset, limit,searchText}) => {
  try {
    const queryParams = {
      offset,
      limit,
      ...(searchText !== undefined && { sequence_no: searchText }),
    };
    const response = await get(API_ENDPOINTS.VIEW_VENDOR_BILL,queryParams);
    return response.data;

  } catch(error){
    handleApiError(error);
    throw error;
  }
}

export const fetchPaymentMade = async ({ offset, limit,searchText}) => {
  try {
    const queryParams = {
      offset,
      limit,
      ...(searchText !== undefined && { sequence_no: searchText }),
    };
    const response = await get(API_ENDPOINTS.VIEW_PAYMENT_MADE,queryParams);
    return response.data;

  } catch(error){
    handleApiError(error);
    throw error;
  }
}

// viewPaymentMade

export const fetchLead = async ({ offset, limit, loginEmployeeId }) => {
  try {
    const queryParams = {
      offset,
      limit,
      ...(loginEmployeeId !== undefined && { login_employee_id: loginEmployeeId }),
      // ...(sequenceNo !== undefined && { sequence_no: sequenceNo }),
    };
    const response = await get(API_ENDPOINTS.VIEW_LEAD, queryParams);
    return response.data;
  } catch (error) {
    handleApiError(error);
    throw error;
  }
};

export const fetchPipeline = async ({ offset, limit, date, source, opportunity, customer, loginEmployeeId }) => {
  try {
    const queryParams = {
      offset,
      limit,
      ...(date !== undefined && { date: date }),
      ...(source !== undefined && { source_name: source }),
      ...(opportunity !== undefined && { opportunity_name: opportunity }),
      ...(customer !== undefined && { customer_name: customer }),
      ...(loginEmployeeId !== undefined && { login_employee_id: loginEmployeeId }),
    };
    const response = await get(API_ENDPOINTS.VIEW_PIPELINE, queryParams);
    return response.data;
  } catch (error) {
    handleApiError(error);
    throw error;
  }
};

export const fetchVisitPlan = async ({ offset, limit, date, employeeId }) => {
  try {
    const queryParams = {
      offset,
      limit,
      date: date,
      ...(employeeId !== undefined && { employee_id: employeeId }),
    };
    const response = await get(API_ENDPOINTS.VIEW_VISIT_PLAN, queryParams);
    return response.data;
  } catch (error) {
    handleApiError(error);
    throw error;
  }
};

export const fetchBoxInspectionReport = async ({ offset, limit }) => {
  try {
    const queryParams = {
      offset,
      limit,
    };
    const response = await get(API_ENDPOINTS.VIEW_BOX_INSPECTION_REPORT, queryParams);
    return response.data;
  } catch (error) {
    handleApiError(error);
    throw error;
  }
};

export const fetchAttendance = async ({ userId, date }) => {
  try {
    const queryParams = {
      user_id: userId,
      date,
    };
    const response = await get(API_ENDPOINTS.VIEW_ATTENDANCE, queryParams);
    return response.data;
  } catch (error) {
    handleApiError(error);
    throw error;
  }
};

export const fetchKPIDashboard = async ({ userId }) => {
  try {
    const queryParams = { login_employee_id: userId };
    const response = await get(API_ENDPOINTS.VIEW_KPI, queryParams);
    return response.data;
  } catch (error) {
    handleApiError(error);
    throw error;
  }
}

export const fetchVehicles = async ({ offset, limit, searchText }) => {
  try {
    const queryParams = {
      offset,
      limit,
      ...(searchText !== undefined && { name: searchText }),
    };
    const response = await get(API_ENDPOINTS.VIEW_VEHICLES, queryParams);
    return response.data;
  } catch (error) {
    handleApiError(error);
    throw error;
  }
};

// Fetch full customer/partner details (address fields) by id from Odoo
export const fetchCustomerDetailsOdoo = async (partnerId) => {
  if (!partnerId) return null;
  const baseUrl = getOdooUrl();

  // ID-proof binaries are stored as ir.attachment, not on res.partner,
  // so we don't ask for them here. Two-step fetch keeps email/phone/etc
  // even on stripped Odoo installs that reject one of the standard fields.
  const richFields = [
    'id', 'name', 'email', 'phone',
    'is_company', 'company_name',
    'street', 'street2', 'city', 'zip',
    'state_id', 'country_id',
    'vat', 'website', 'function',
    'category_id',
  ];
  const safeFields = ['id', 'name', 'street', 'street2', 'city', 'zip', 'country_id'];

  const callRead = async (fields) => {
    const response = await axios.post(
      `${baseUrl}/web/dataset/call_kw`,
      {
        jsonrpc: '2.0',
        method: 'call',
        params: {
          model: 'res.partner',
          method: 'search_read',
          args: [[['id', '=', partnerId]]],
          kwargs: { fields, limit: 1 },
        },
      },
      { headers: { 'Content-Type': 'application/json' } }
    );
    if (response.data && response.data.error) {
      const e = new Error('Odoo JSON-RPC error');
      e.payload = response.data.error;
      throw e;
    }
    const results = response.data.result || [];
    return results[0] || null;
  };

  let p = null;
  try {
    p = await callRead(richFields);
  } catch (err) {
    console.warn(
      'fetchCustomerDetailsOdoo rich fetch failed, retrying with safe fields:',
      err?.payload?.data?.message || err?.message
    );
    try {
      p = await callRead(safeFields);
    } catch (err2) {
      console.error('fetchCustomerDetailsOdoo safe fetch also failed:', err2?.payload?.data?.message || err2?.message);
      throw err2;
    }
  }
  if (!p) return null;

  // Fetch tag (category) labels via name_get if we received only ids.
  let categories = [];
  if (Array.isArray(p.category_id) && p.category_id.length > 0) {
    try {
      const tagResp = await axios.post(
        `${baseUrl}/web/dataset/call_kw`,
        {
          jsonrpc: '2.0',
          method: 'call',
          params: {
            model: 'res.partner.category',
            method: 'name_get',
            args: [p.category_id],
            kwargs: {},
          },
        },
        { headers: { 'Content-Type': 'application/json' } }
      );
      if (tagResp.data && !tagResp.data.error && Array.isArray(tagResp.data.result)) {
        categories = tagResp.data.result.map(([id, name]) => ({ id, name }));
      }
    } catch (e) {
      // ignore — tags are optional
    }
  }

  const m2oName = (v) => (Array.isArray(v) && v.length > 1 ? v[1] : '');

  const address = [
    p.street, p.street2, p.city, p.zip, m2oName(p.country_id),
  ].filter(Boolean).join(', ');

  return {
    id: p.id,
    name: p.name || '',
    email: p.email || '',
    phone: p.phone || '',
    image_url: `${baseUrl}/web/image?model=res.partner&id=${p.id}&field=image_128`,
    is_company: !!p.is_company,
    company_name: p.company_name || '',
    street: p.street || '',
    street2: p.street2 || '',
    city: p.city || '',
    zip: p.zip || '',
    state_id: Array.isArray(p.state_id) ? { id: p.state_id[0], name: p.state_id[1] } : null,
    country_id: Array.isArray(p.country_id) ? { id: p.country_id[0], name: p.country_id[1] } : null,
    vat: p.vat || '',
    website: p.website || '',
    function: p.function || '',
    categories,
    address: address || null,
  };
};

// Create a new res.partner. Same fallback strategy as updatePartnerOdoo —
// if Odoo rejects a field name, retries with the safe core set.
export const createPartnerOdoo = async (values) => {
  const baseUrl = getOdooUrl();

  const callCreate = async (vals) => {
    const response = await axios.post(
      `${baseUrl}/web/dataset/call_kw`,
      {
        jsonrpc: '2.0',
        method: 'call',
        params: {
          model: 'res.partner',
          method: 'create',
          args: [vals],
          kwargs: {},
        },
      },
      { headers: { 'Content-Type': 'application/json' } }
    );
    if (response.data && response.data.error) {
      const e = new Error('Odoo JSON-RPC error');
      e.payload = response.data.error;
      throw e;
    }
    return response.data.result;
  };

  try {
    const result = await callCreate(values);
    return { result };
  } catch (err) {
    console.warn('createPartnerOdoo full create failed, retrying with safe fields:', err?.payload || err?.message);
    const safe = {
      name: values.name,
      email: values.email,
      phone: values.phone,
      street: values.street,
      street2: values.street2,
      city: values.city,
      zip: values.zip,
    };
    Object.keys(safe).forEach((k) => safe[k] === undefined && delete safe[k]);
    try {
      const result = await callCreate(safe);
      return { result, partial: true };
    } catch (err2) {
      console.error('createPartnerOdoo safe create also failed:', err2?.payload || err2?.message);
      return { error: err2?.payload || { message: err2?.message || 'Save failed' } };
    }
  }
};

// Write back to res.partner. Tries the full payload first; if Odoo rejects an
// unknown field, retries with only the safe core set so the user still gets
// most of their edits saved.
export const updatePartnerOdoo = async (partnerId, values) => {
  if (!partnerId) return { error: { message: 'partnerId is required' } };
  const baseUrl = getOdooUrl();

  const callWrite = async (vals) => {
    const response = await axios.post(
      `${baseUrl}/web/dataset/call_kw`,
      {
        jsonrpc: '2.0',
        method: 'call',
        params: {
          model: 'res.partner',
          method: 'write',
          args: [[partnerId], vals],
          kwargs: {},
        },
      },
      { headers: { 'Content-Type': 'application/json' } }
    );
    if (response.data && response.data.error) {
      const e = new Error('Odoo JSON-RPC error');
      e.payload = response.data.error;
      throw e;
    }
    return response.data.result;
  };

  try {
    const result = await callWrite(values);
    return { result };
  } catch (err) {
    console.warn('updatePartnerOdoo full write failed, retrying with safe fields:', err?.payload || err?.message);
    const safe = {
      name: values.name,
      email: values.email,
      phone: values.phone,
      street: values.street,
      street2: values.street2,
      city: values.city,
      zip: values.zip,
    };
    Object.keys(safe).forEach((k) => safe[k] === undefined && delete safe[k]);
    try {
      const result = await callWrite(safe);
      return { result, partial: true };
    } catch (err2) {
      console.error('updatePartnerOdoo safe write also failed:', err2?.payload || err2?.message);
      return { error: err2?.payload || { message: err2?.message || 'Save failed' } };
    }
  }
};

// Register + reconcile a payment against a posted customer invoice using
// Odoo's `account.payment.register` wizard. This is what Odoo's invoice
// "Pay" button calls under the hood — it creates the account.payment AND
// reconciles it against the invoice's receivable line in one transaction.
// Use this instead of createAccountPaymentOdoo when you want the payment
// to actually reduce the invoice's Amount Due (vs. sitting as an orphan
// Outstanding Credit on the customer).
//
// Returns `{ wizardId, amount_total, amount_residual, payment_state }` on
// success, `{ error: {...} }` on failure. amount_residual lets the caller
// verify the invoice's outstanding balance dropped as expected.
export const registerPaymentForInvoiceOdoo = async ({
  invoiceId,
  amount,
  journalId,
  partnerId = null,
  paymentDate = null,
} = {}) => {
  if (!invoiceId || !amount || !journalId) {
    return { error: { message: 'invoiceId, amount, journalId required' } };
  }
  try {
    const baseUrl = getOdooUrl();
    // The wizard reads the invoice off the active_model/active_ids context
    // — without it the wizard won't know which move to reconcile against.
    const ctx = { active_model: 'account.move', active_ids: [Number(invoiceId)] };

    const wizardVals = {
      amount: Number(amount),
      journal_id: Number(journalId),
      ...(partnerId ? { partner_id: Number(partnerId) } : {}),
      ...(paymentDate ? { payment_date: paymentDate } : {}),
    };
    const createResp = await axios.post(`${baseUrl}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'account.payment.register',
        method: 'create',
        args: [wizardVals],
        kwargs: { context: ctx },
      },
    }, { headers: { 'Content-Type': 'application/json' } });
    if (createResp.data?.error) {
      console.warn('[registerPaymentForInvoiceOdoo] wizard create error:', createResp.data.error);
      return { error: createResp.data.error };
    }
    const wizardId = createResp.data?.result;
    if (!wizardId) return { error: { message: 'wizard create returned no id' } };

    // action_create_payments creates the account.payment AND reconciles it
    // against the invoice's open receivable line. This is the step bare
    // account.payment.create skipped, which is why Outstanding Credits had
    // an orphan [Add] button before.
    const postResp = await axios.post(`${baseUrl}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'account.payment.register',
        method: 'action_create_payments',
        args: [[wizardId]],
        kwargs: { context: ctx },
      },
    }, { headers: { 'Content-Type': 'application/json' } });
    if (postResp.data?.error) {
      console.warn('[registerPaymentForInvoiceOdoo] action_create_payments error:', postResp.data.error);
      return { error: postResp.data.error };
    }

    // Read the invoice's residual + payment_state so the caller (and the
    // Flow trace) can confirm the reconciliation actually took effect.
    const invResp = await axios.post(`${baseUrl}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'account.move',
        method: 'read',
        args: [[Number(invoiceId)], ['amount_total', 'amount_residual', 'payment_state']],
        kwargs: {},
      },
    }, { headers: { 'Content-Type': 'application/json' } });
    const inv = invResp.data?.result?.[0] || {};
    return {
      wizardId,
      amount_total: inv.amount_total,
      amount_residual: inv.amount_residual,
      payment_state: inv.payment_state,
    };
  } catch (e) {
    console.error('registerPaymentForInvoiceOdoo exception:', e);
    return { error: { message: e?.message || String(e) } };
  }
};

// Create Account Payment for Odoo
export const createAccountPaymentOdoo = async ({ partnerId, journalId, amount, invoiceId = null } = {}) => {
  try {
    const params = {
      partner_id: partnerId,
      journal_id: journalId,
      amount,
      payment_type: 'inbound', // Customer payment
      partner_type: 'customer', // Payment from a customer
    };

    // Include invoice_ids to link the payment to the invoice
    if (invoiceId) {
      params.invoice_ids = [[6, 0, [invoiceId]]];
    }

    const payload = {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'account.payment',
        method: 'create',
        args: [params],
        kwargs: {},
      },
      id: new Date().getTime(),
    };

    console.log('[PAYMENT] Creating payment with payload:', payload);

    const response = await fetch(`${getOdooUrl()}/web/dataset/call_kw`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const result = await response.json();
    console.log('[PAYMENT] Payment creation response:', result);

    // Post the payment to finalize it
    if (result.result) {
      const paymentId = result.result;
      await fetch(`${getOdooUrl()}/web/dataset/call_kw`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'call',
          params: {
            model: 'account.payment',
            method: 'action_post',
            args: [[paymentId]],
            kwargs: {},
          },
          id: new Date().getTime(),
        }),
      });
      console.log('[PAYMENT] Payment posted successfully.');
    }

    return result;
  } catch (error) {
    console.error('[PAYMENT] Error creating payment:', error);
    return { error };
  }
};

// Fetch Payment Journals for Odoo
export const fetchPaymentJournalsOdoo = async () => {
  try {
    const response = await axios.post(
      `${getOdooUrl()}/web/dataset/call_kw`,
      {
        jsonrpc: "2.0",
        method: "call",
        params: {
          model: "account.journal",
          method: "search_read",
          args: [[]],
          kwargs: {
            fields: ["id", "name", "type"],
            limit: 20,
          },
        },
      },
      { headers: { "Content-Type": "application/json" } }
    );
    if (response.data && response.data.result) return response.data.result;
    return [];
  } catch (error) {
    console.error("fetchPaymentJournalsOdoo error:", error);
    return [];
  }
};

// Create invoice (account.move) in Odoo
// Module-level cache for the sales journal id. The user's configured sales
// journal doesn't change mid-session, so re-querying account.journal on every
// invoice is wasted latency (~200-400ms per call). Cleared on logout if needed.
let _cachedSaleJournalId = null;
export const _resetSaleJournalCache = () => { _cachedSaleJournalId = null; };

export const createInvoiceOdoo = async ({ partnerId, products = [], journalId = null, invoiceDate = null, reference = '' } = {}) => {
  try {
    if (!partnerId) throw new Error('partnerId is required');

    // Ensure we have a valid journal_id. If a journalId was provided, validate it is a sales journal.
    let finalJournalId = journalId;

    // Helper: fetch a specific journal by id and return its record
    const fetchJournalById = async (jid) => {
      try {
        const resp = await axios.post(`${getOdooUrl()}/web/dataset/call_kw`, {
          jsonrpc: '2.0',
          method: 'call',
          params: {
            model: 'account.journal',
            method: 'search_read',
            args: [[['id', '=', jid]]],
            kwargs: { fields: ['id', 'name', 'type', 'code'], limit: 1 },
          },
        }, { headers: { 'Content-Type': 'application/json' } });
        return resp.data && resp.data.result && resp.data.result[0];
      } catch (e) {
        console.warn('[INVOICE] Failed to fetch journal by id', jid, e?.message || e);
        return null;
      }
    };

    // If a journalId was supplied, ensure it's of type 'sale'. If not, fall back to finding a sale journal.
    if (finalJournalId) {
      try {
        const provided = await fetchJournalById(finalJournalId);
        if (provided && provided.type !== 'sale') {
          console.warn(`[INVOICE] Provided journal ${finalJournalId} is not a sale journal (type=${provided.type}), ignoring it and trying to auto-select a sale journal`);
          finalJournalId = null;
        } else if (provided) {
          console.log('[INVOICE] Using provided journal:', provided);
          // keep finalJournalId
        }
      } catch (e) {
        console.warn('[INVOICE] Could not validate provided journal:', e);
        finalJournalId = null;
      }
    }

    // When we still don't have a sales journal, try to auto-select one
    if (!finalJournalId && _cachedSaleJournalId) {
      finalJournalId = _cachedSaleJournalId;
      console.log('[INVOICE:JOURNAL] cache hit id=', finalJournalId);
    }
    if (!finalJournalId) {
      try {
        // First try the existing helper which returns payment journals
        console.log('[INVOICE:JOURNAL] cache miss, fetching from Odoo');
        const journals = await fetchPaymentJournalsOdoo();
        console.log('[INVOICE] Fetched journals from Odoo:', JSON.stringify(journals));
        // Prefer explicit type 'sale' or names/codes indicating sales/invoice
        let salesJournal = journals.find(j => j.type === 'sale');
        if (!salesJournal) {
          salesJournal = journals.find(j => /sale|sales|invoice/i.test(String(j.name || j.code || '')));
        }
        if (salesJournal) {
          finalJournalId = salesJournal.id;
          _cachedSaleJournalId = finalJournalId;
          console.log('[INVOICE:JOURNAL] cached id=', finalJournalId, 'from payment list');
        } else {
          // Fallback: explicitly query account.journal for type='sale'
          try {
            const resp = await axios.post(`${getOdooUrl()}/web/dataset/call_kw`, {
              jsonrpc: '2.0',
              method: 'call',
              params: {
                model: 'account.journal',
                method: 'search_read',
                args: [[['type', '=', 'sale']]],
                kwargs: { fields: ['id', 'name', 'type', 'code'], limit: 5 },
              },
            }, { headers: { 'Content-Type': 'application/json' } });
            const found = resp.data && resp.data.result || [];
            if (found.length > 0) {
              finalJournalId = found[0].id;
              _cachedSaleJournalId = finalJournalId;
              console.log('[INVOICE:JOURNAL] cached id=', finalJournalId, 'via explicit account.journal search');
            } else {
              console.error('[INVOICE] No sale journal found in Odoo. Cannot create invoice without a sales journal.');
              throw new Error('No sale journal found in Odoo. Please configure at least one sales journal or pass a valid sales journal id to createInvoiceOdoo.');
            }
          } catch (fallbackErr) {
            console.error('[INVOICE] Fallback search for sale journal failed:', fallbackErr);
            throw fallbackErr;
          }
        }
      } catch (err) {
        console.warn('[INVOICE] Failed to auto-select sales journal:', err);
        // rethrow to let the caller handle this as a fatal configuration issue
        throw err;
      }
    }

    // Build invoice lines and log each line's price
    let totalUntaxed = 0;
    const invoice_lines = products.map((p) => {
      const price_unit = p.price || p.price_unit || p.list_price || 0;
      const quantity = p.quantity || p.qty || 1;
      // Resolve a numeric Odoo product id if available; accept common aliases
      let resolvedProductId = p.product_odoo_id ?? p.product_id ?? p.id;
      if (typeof resolvedProductId === 'string') {
        // If purely numeric string, convert to number
        if (/^\d+$/.test(resolvedProductId)) {
          resolvedProductId = Number(resolvedProductId);
        } else {
          // Try to extract first numeric sequence (best-effort)
          const m = String(resolvedProductId).match(/(\d+)/);
          if (m) {
            resolvedProductId = Number(m[1]);
            console.warn(`[INVOICE LINE] Parsed numeric id ${resolvedProductId} from string id '${p.id}'`);
          } else {
            // Not a numeric id - omit product_id to avoid Odoo integer errors
            resolvedProductId = null;
          }
        }
      }

      // Get discount percentage from product
      const discount_pct = Number(p.discount || p.discount_percent || 0);

      // Compose the line description. Odoo renders this as the line's
      // text on the printed invoice. If the cashier attached an order
      // note, append it on a new line below the product name — Odoo's
      // invoice template preserves the newline, so the note appears as
      // small secondary text right under the product name.
      const productName = p.name || p.product_name || '';
      const lineNote = p.customer_note || p.note || '';
      const composedName = lineNote
        ? `${productName}\n${String(lineNote).trim()}`
        : productName;

      const vals = {
        name: composedName,
        quantity,
        price_unit,
        discount: discount_pct, // Include discount percentage on invoice line
      };

      if (Number.isInteger(resolvedProductId)) {
        vals.product_id = resolvedProductId;
      } else {
        console.warn(`[INVOICE LINE] Skipping product_id for product '${p.name || p.product_name || ''}' (id: ${String(p.id)}) - not a numeric Odoo id`);
      }

      // tax_ids intentionally omitted — Odoo's account.move.line.create
      // auto-fills it from product_id.taxes_id (the current value), so the
      // invoice always reflects the product's live tax setup in Odoo.
      const lineSubtotal = price_unit * quantity * (1 - discount_pct / 100);
      console.log(`[INVOICE LINE] Product ${p.id} price_unit:`, price_unit, 'quantity:', quantity, 'discount:', discount_pct + '%', 'line_subtotal:', lineSubtotal, 'resolved_product_id:', vals.product_id || 'none');
      totalUntaxed += lineSubtotal;
      return [0, 0, vals];
    });

    // Include journal_id only if we have a valid id (avoid sending null)
    const moveVals = {
      partner_id: partnerId,
      move_type: 'out_invoice',
      invoice_line_ids: invoice_lines,
    };
    if (finalJournalId) moveVals.journal_id = finalJournalId;
    if (invoiceDate) moveVals.invoice_date = invoiceDate;
    if (reference) moveVals.ref = reference;

    // Log computed totals before sending
    console.log('[INVOICE] Computed untaxed total:', totalUntaxed);
    console.log('[STEP 2] Invoice Payload:', moveVals);

    // Create the account.move record
    const createResp = await axios.post(`${getOdooUrl()}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'account.move',
        method: 'create',
        args: [moveVals],
        kwargs: {},
      },
    }, { headers: { 'Content-Type': 'application/json' } });
    console.log('[STEP 2] Invoice Creation Response:', createResp.data);
    if (createResp.data && createResp.data.error) {
      console.error('[INVOICE] Odoo error response:', createResp.data.error);
    }
    const createdId = createResp.data && createResp.data.result;
    // Fetch and log the created move record and its lines for diagnosis
    if (createdId) {
      try {
        const moveResp = await axios.post(`${getOdooUrl()}/web/dataset/call_kw`, {
          jsonrpc: '2.0',
          method: 'call',
          params: {
            model: 'account.move',
            method: 'search_read',
            args: [[['id', '=', createdId]]],
            kwargs: { fields: ['id', 'state', 'move_type', 'journal_id', 'invoice_date', 'payment_state', 'amount_total', 'amount_residual', 'company_id', 'partner_id', 'invoice_line_ids'] },
          },
          id: new Date().getTime(),
        }, { headers: { 'Content-Type': 'application/json' } });
        console.log('[INVOICE DIAG] Created move (search_read):', moveResp.data);
      } catch (moveFetchErr) {
        console.warn('[INVOICE DIAG] Failed to fetch created move:', moveFetchErr);
      }
      try {
        const linesResp = await axios.post(`${getOdooUrl()}/web/dataset/call_kw`, {
          jsonrpc: '2.0',
          method: 'call',
          params: {
            model: 'account.move.line',
            method: 'search_read',
            args: [[['move_id', '=', createdId]]],
            kwargs: { fields: ['id', 'move_id', 'product_id', 'name', 'quantity', 'price_unit', 'account_id', 'tax_ids'] },
          },
          id: new Date().getTime(),
        }, { headers: { 'Content-Type': 'application/json' } });
        console.log('[INVOICE DIAG] Created move lines (search_read):', linesResp.data);
      } catch (linesFetchErr) {
        console.warn('[INVOICE DIAG] Failed to fetch created move lines:', linesFetchErr);
      }
    }
    // Post the invoice immediately after creation
    let posted = false;
    if (createdId) {
      try {
        console.log(`📮 Posting invoice ${createdId}...`);
        const postResp = await axios.post(`${getOdooUrl()}/web/dataset/call_kw`, {
          jsonrpc: '2.0',
          method: 'call',
          params: {
            model: 'account.move',
            method: 'action_post',
            args: [[createdId]],
            kwargs: {},
          },
        }, { headers: { 'Content-Type': 'application/json' } });
        
        if (postResp.data && postResp.data.error) {
          console.error('[INVOICE POST] Error posting invoice:', postResp.data.error);
        } else {
          posted = true;
          console.log('✅ Invoice posted successfully');
        }
      } catch (postErr) {
        console.error('[INVOICE POST] Failed to post invoice:', postErr);
      }
    }
    
    // Fetch final invoice status (payment_state, state, amount_residual, amount_total) for diagnostics
    let invoiceStatus = null;
    if (createdId) {
      try {
        const statusResp = await axios.post(`${getOdooUrl()}/web/dataset/call_kw`, {
          jsonrpc: '2.0',
          method: 'call',
          params: {
            model: 'account.move',
            method: 'search_read',
            args: [[['id', '=', createdId]]],
            kwargs: { fields: ['id', 'state', 'move_type', 'payment_state', 'amount_residual', 'amount_total', 'invoice_date'] },
          },
        }, { headers: { 'Content-Type': 'application/json' } });
        invoiceStatus = statusResp.data && statusResp.data.result && statusResp.data.result[0];
        console.log(`[INVOICE STATUS] fetched for invoice id (${createdId}) :`, invoiceStatus);
      } catch (statusErr) {
        console.warn('[INVOICE STATUS] Failed to fetch invoice status:', statusErr);
      }
    }

    return { id: createdId, posted, invoiceStatus };
  } catch (error) {
    console.error('createInvoiceOdoo error:', error);
    throw error;
  }
};

// Link an account.move (invoice) to a pos.order and optionally set its state to a specific value
export const linkInvoiceToPosOrderOdoo = async ({ orderId, invoiceId, setState = true, state = null } = {}) => {
  try {
    if (!orderId) throw new Error('orderId is required');
    if (!invoiceId) throw new Error('invoiceId is required');

    // Only link the invoice, do not change the order state
    const vals = { account_move: invoiceId };

    console.log('[POS LINK] Linking invoice to POS order:', { orderId, invoiceId, vals });

    const resp = await axios.post(`${getOdooUrl()}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'pos.order',
        method: 'write',
        args: [[orderId], vals],
        kwargs: {},
      },
    }, { headers: { 'Content-Type': 'application/json' } });

    console.log('[POS LINK] write response:', resp.data);

    // Verify update by reading the order
    try {
      const verify = await axios.post(`${getOdooUrl()}/web/dataset/call_kw`, {
        jsonrpc: '2.0',
        method: 'call',
        params: {
          model: 'pos.order',
          method: 'search_read',
          args: [[['id', '=', orderId]]],
          kwargs: { fields: ['id', 'state', 'account_move'] },
        },
      }, { headers: { 'Content-Type': 'application/json' } });
      console.log('[POS LINK] verify response:', verify.data);
    } catch (verifyErr) {
      console.warn('[POS LINK] verify read failed:', verifyErr);
    }

    return resp.data;
  } catch (error) {
    console.error('linkInvoiceToPosOrderOdoo error:', error);
    return { error };
  }
};

// Create POS order in Odoo via JSON-RPC
export const createPosOrderOdoo = async ({ partnerId = null, lines = [], sessionId = null, posConfigId = null, companyId = null, orderName = null, preset_id = null, amount_total: override_amount_total = null, discount = 0 } = {}) => {
  try {
    if (!lines || !Array.isArray(lines) || lines.length === 0) {
      throw new Error('lines are required to create pos order');
    }

    // Build lines entries for Odoo POS order
    const line_items = lines.map(l => {
      const price_unit = l.price || l.price_unit || l.list_price || 0;
      const qty = l.qty || l.quantity || 1;
      // prefer client-provided subtotal (already discounted) if present
      const subtotal = (typeof l.price_subtotal !== 'undefined' && l.price_subtotal !== null) ? Number(l.price_subtotal) : (price_unit * qty);
      const discount_pct = Number(l.discount || l.discount_percent || 0);
      const lineVals = {
        product_id: l.product_id || l.id,
        qty,
        price_unit,
        name: l.name || l.product_name || '',
        discount: discount_pct,
        price_subtotal: subtotal,
        price_subtotal_incl: subtotal,
      };
      if (l.customer_note && String(l.customer_note).trim()) {
        lineVals.customer_note = String(l.customer_note).trim();
      }
      return [0, 0, lineVals];
    });

    // Calculate total (allow override when discount applied by client)
    const calculated_total = lines.reduce((sum, l) => sum + (l.price || l.price_unit || l.list_price || 0) * (l.qty || l.quantity || 1), 0);
    const amount_total = (override_amount_total !== null && override_amount_total !== undefined) ? Number(override_amount_total) : calculated_total;
    const vals = {
      company_id: companyId || 1, // Default to 1 if not provided
      name: orderName || '/', // Use '/' for auto-generated name if not provided
      partner_id: partnerId || false,
      lines: line_items,
      amount_tax: 0,
      amount_total,
      amount_paid: 0, // Start with 0, will be updated when payment is made
      amount_return: 0,
      state: 'draft', // Start in draft state, will be paid after payment
    };
    // Note: do not set a top-level `discount` on pos.order — not a valid field on the model
    if (sessionId) vals.session_id = sessionId;
    if (posConfigId) vals.config_id = posConfigId;
    if (preset_id !== null && preset_id !== undefined) vals.preset_id = preset_id;

    console.log('📦 Creating POS Order with payload:', JSON.stringify(vals, null, 2));
    console.log('📊 Order summary:', {
      total_items: lines.length,
      amount_total: vals.amount_total,
      partner_id: vals.partner_id,
      session_id: vals.session_id,
      config_id: vals.config_id,
      preset_id: vals.preset_id,
    });

    const response = await axios.post(`${getOdooUrl()}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'pos.order',
        method: 'create',
        args: [vals],
        // Multi-company: pin the create to the requested company so the
        // draft lands somewhere MyOrders' fetch (using the same context)
        // can see it. Without this, the draft can disappear into a
        // company the active session isn't switched to.
        kwargs: { context: { allowed_company_ids: [vals.company_id] } },
      },
    }, { headers: { 'Content-Type': 'application/json' } });

    if (response.data && response.data.error) {
      console.error('[PlaceOrder] Odoo create.pos.order error:', JSON.stringify(response.data.error, null, 2));
      return { error: response.data.error };
    }

    const createdId = response.data.result;
    console.log('[PlaceOrder] ✅ pos.order created id=', createdId, 'company_id=', vals.company_id);
    // Don't validate immediately - order will be validated after payment
    return { result: createdId };
  } catch (error) {
    console.error('createPosOrderOdoo error:', error);
    return { error };
  }
};

// Create sale.order in Odoo via JSON-RPC (used by Cart checkout flow)
export const createSaleOrderOdoo = async ({ partnerId = null, lines = [], companyId = null, orderName = null, pricelist_id = null, note = '' } = {}) => {
  try {
    if (!lines || !Array.isArray(lines) || lines.length === 0) {
      throw new Error('lines are required to create sale order');
    }

    const order_lines = lines.map(l => {
      const qty = Number(l.qty || l.quantity || l.product_uom_qty || 1);
      const price_unit = Number(l.price || l.price_unit || l.list_price || 0);
      return [0, 0, {
        product_id: l.product_id || l.id || false,
        name: l.name || l.product_name || '',
        product_uom_qty: qty,
        price_unit,
      }];
    });

    // attempt to resolve partner/company from auth store if not provided
    try {
      const authUser = useAuthStore.getState().user || {};
      if (!partnerId) {
        const p = authUser.partner_id;
        partnerId = Array.isArray(p) ? p[0] : p || null;
      }
      if (!companyId) {
        const c = authUser.company_id;
        companyId = Array.isArray(c) ? c[0] : c || null;
      }
    } catch (e) {
      /* ignore */
    }

    const vals = {
      partner_id: partnerId || 1,
      company_id: companyId || 1,
      name: orderName || '/',
      order_line: order_lines,
      note: note || '',
    };
    if (pricelist_id) vals.pricelist_id = pricelist_id;

    const response = await axios.post(`${getOdooUrl()}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'sale.order',
        method: 'create',
        args: [vals],
        kwargs: {},
      },
    }, { headers: { 'Content-Type': 'application/json' } });

    if (response.data && response.data.error) {
      console.error('Odoo create sale.order error:', response.data.error);
      return { error: response.data.error };
    }

    const createdId = response.data.result;
    console.log('✅ Sale Order created successfully with ID:', createdId);
    return { result: createdId };
  } catch (error) {
    console.error('createSaleOrderOdoo error:', error);
    return { error };
  }
};

// Confirm (action_confirm) a sale.order in Odoo via JSON-RPC
export const confirmSaleOrderOdoo = async (orderId, options = {}) => {
  try {
    if (!orderId) throw new Error('orderId is required');
    const rpcPayload = {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'sale.order',
        method: 'action_confirm',
        args: [[orderId]],
        kwargs: {},
      },
    };
    const response = await axios.post(`${getOdooUrl()}/web/dataset/call_kw`, rpcPayload, { headers: { 'Content-Type': 'application/json' } });
    if (response.data && response.data.error) {
      console.error('Odoo confirm sale.order error:', response.data.error);
      return { error: response.data.error };
    }
    console.log(`✅ sale.order ${orderId} confirmed`);
    return { result: response.data.result };
  } catch (error) {
    console.error('confirmSaleOrderOdoo error:', error);
    return { error };
  }
};

// Link an account.move (invoice) to a sale.order by setting invoice_ids
export const linkInvoiceToSaleOrderOdoo = async ({ orderId, invoiceId } = {}) => {
  try {
    if (!orderId) throw new Error('orderId is required');
    if (!invoiceId) throw new Error('invoiceId is required');

    const vals = { invoice_ids: [[6, 0, [invoiceId]]] };
    console.log('[SALE LINK] Linking invoice to sale.order:', { orderId, invoiceId, vals });

    const resp = await axios.post(`${getOdooUrl()}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'sale.order',
        method: 'write',
        args: [[orderId], vals],
        kwargs: {},
      },
    }, { headers: { 'Content-Type': 'application/json' } });

    if (resp.data && resp.data.error) {
      console.error('linkInvoiceToSaleOrderOdoo error:', resp.data.error);
      return { error: resp.data.error };
    }
    return { result: resp.data.result };
  } catch (error) {
    console.error('linkInvoiceToSaleOrderOdoo error:', error);
    return { error };
  }
};

// Create POS payment(s) in Odoo via JSON-RPC
// Accepts either a single payment or an array of payments
export const createPosPaymentOdoo = async ({ orderId, payments, amount, journalId, paymentMethodId, paymentMode = 'cash', partnerId = null, sessionId = null, companyId = null } = {}) => {
  try {
    if (!orderId) throw new Error('orderId is required');

    // Support both legacy (amount) and new (payments array) API
    let paymentRecords = [];
    if (Array.isArray(payments) && payments.length > 0) {
      paymentRecords = payments;
    } else if (typeof amount !== 'undefined') {
      paymentRecords = [{ amount: Number(amount), journalId, paymentMethodId, paymentMode }];
    } else {
      throw new Error('No payment(s) provided');
    }

    const results = [];
    for (const payment of paymentRecords) {
      const amt = Number(payment.amount) || 0;
      if (amt === 0) continue; // Skip zero payments

      let finalPaymentMethodId = payment.paymentMethodId || paymentMethodId;
      let finalJournalId = payment.journalId || journalId;
      let finalPaymentMode = payment.paymentMode || paymentMode;

      // If paymentMethodId is not provided, fetch it using journalId
      if (!finalPaymentMethodId) {
        if (!finalJournalId) throw new Error('paymentMethodId or journalId is required');
        const pmResp = await axios.post(`${getOdooUrl()}/web/dataset/call_kw`, {
          jsonrpc: '2.0',
          method: 'call',
          params: {
            model: 'pos.payment.method',
            method: 'search_read',
            args: [[['journal_id', '=', finalJournalId]]],
            kwargs: { fields: ['id', 'name', 'journal_id'], limit: 1 },
          },
        }, { headers: { 'Content-Type': 'application/json' } });
        finalPaymentMethodId = pmResp.data?.result?.[0]?.id;
        if (!finalPaymentMethodId) {
          console.error('No payment_method_id found for journalId', finalJournalId);
          return { error: { message: 'No payment_method_id found for journalId ' + finalJournalId } };
        }
      }

      const paymentVals = {
        pos_order_id: orderId,
        amount: amt,
        payment_method_id: finalPaymentMethodId,
        partner_id: partnerId || false,
        session_id: sessionId || false,
        company_id: companyId || 1, // Corrected `CompanyId` to `companyId`
      };

      console.log('💳 Creating POS Payment with payload:', JSON.stringify(paymentVals, null, 2));
      console.log('💰 Payment summary:', {
        order_id: paymentVals.pos_order_id,
        amount: paymentVals.amount,
        payment_method_id: paymentVals.payment_method_id,
        payment_mode: finalPaymentMode,
      });

      const response = await axios.post(`${getOdooUrl()}/web/dataset/call_kw`, {
        jsonrpc: '2.0',
        method: 'call',
        params: {
          model: 'pos.payment',
          method: 'create',
          args: [paymentVals],
          kwargs: {},
        },
      }, { headers: { 'Content-Type': 'application/json' } });

      if (response.data && response.data.error) {
        console.error('Odoo create pos.payment error:', response.data.error);
        results.push({ error: response.data.error });
      } else {
        results.push({ result: response.data.result });
      }
    }
    return { results };
  } catch (error) {
    console.error('createPosPaymentOdoo error:', error);
    return { error };
  }
};

// Open a POS session in Odoo. Odoo 19 dropped `open_session_cb`, so we use
// `pos.config.open_ui` (the canonical method since Odoo 15) which creates a
// `pos.session` record for the config if one isn't already open. After it
// returns, we look up the just-opened session id by searching `pos.session`
// for this config in an open state.
export const createPOSSesionOdoo = async ({ configId, userId, openingCash = 0, openingNote = '' }) => {
  const buildPayload = (model, method, args, kwargs = {}) => ({
    jsonrpc: '2.0',
    method: 'call',
    params: { model, method, args, kwargs },
    id: new Date().getTime(),
  });

  try {
    if (!configId) throw new Error('configId is required');

    const { getOdooDb } = require('../config/odooConfig');
    const db = getOdooDb();
    const url = `${getOdooUrl()}/web/dataset/call_kw`;
    const headers = {
      'Content-Type': 'application/json',
      ...(db ? { 'X-Odoo-Database': db } : {}),
    };

    const cfgId = Number(configId);
    const openUiPayload = buildPayload('pos.config', 'open_ui', [[cfgId]]);

    console.log('[OPEN POS SESSION] open_ui request', { url, db, configId: cfgId, userId, payload: openUiPayload });

    const openResp = await axios.post(url, openUiPayload, { headers, withCredentials: true });
    console.log('[OPEN POS SESSION] open_ui raw response', openResp?.data);

    if (openResp.data && openResp.data.error) {
      const err = openResp.data.error;
      const detail = err?.data?.message || err?.data?.name || err?.message || 'Odoo server error';
      console.error('[OPEN POS SESSION] open_ui error:', detail, err);
      return { error: { ...err, message: detail } };
    }

    // open_ui returns a client action dict; the session itself isn't in the
    // payload. Look it up by searching for an open session for this config.
    const lookupPayload = buildPayload('pos.session', 'search_read', [
      [['config_id', '=', cfgId], ['state', 'in', ['opening_control', 'opened']]],
    ], { fields: ['id', 'name', 'state', 'user_id'], limit: 1, order: 'id desc' });

    console.log('[OPEN POS SESSION] looking up freshly opened session', lookupPayload);
    const lookupResp = await axios.post(url, lookupPayload, { headers, withCredentials: true });
    console.log('[OPEN POS SESSION] lookup raw response', lookupResp?.data);

    if (lookupResp.data && lookupResp.data.error) {
      const err = lookupResp.data.error;
      const detail = err?.data?.message || err?.data?.name || err?.message || 'Odoo server error';
      console.error('[OPEN POS SESSION] lookup error:', detail, err);
      return { error: { ...err, message: detail } };
    }

    const sessions = lookupResp.data?.result || [];
    let session = sessions[0] || null;
    const sessionId = session?.id || null;

    // Advance opening_control → opened so the session shows up under "Open
    // Registers" (which filters by state='opened'). Odoo 17/18/19 expose
    // `pos.session.set_opening_control(cash_register_balance_start, notes)`
    // as the public method for this. We pass 0 / '' (no opening cash, no
    // note) so the user doesn't have to validate cash control manually.
    if (session && session.state === 'opening_control' && sessionId) {
      const cashAmount = Number(openingCash) || 0;
      const noteText = String(openingNote || '');
      const advancePayload = buildPayload('pos.session', 'set_opening_control', [[sessionId], cashAmount, noteText]);
      console.log('[OPEN POS SESSION] advancing opening_control → opened via set_opening_control', advancePayload);
      try {
        const advanceResp = await axios.post(url, advancePayload, { headers, withCredentials: true });
        console.log('[OPEN POS SESSION] set_opening_control raw response', advanceResp?.data);

        if (advanceResp.data?.error) {
          // Method missing or refused — fall back to a direct write on `state`.
          console.warn('[OPEN POS SESSION] set_opening_control failed, attempting direct write fallback:', advanceResp.data.error?.data?.message || advanceResp.data.error?.message);
          const writePayload = buildPayload('pos.session', 'write', [[sessionId], { state: 'opened', cash_register_balance_start: cashAmount, opening_notes: noteText || false }]);
          console.log('[OPEN POS SESSION] direct write fallback payload', writePayload);
          const writeResp = await axios.post(url, writePayload, { headers, withCredentials: true });
          console.log('[OPEN POS SESSION] direct write raw response', writeResp?.data);
        }

        // Re-read to see the post-advance state.
        const refetchResp = await axios.post(url, lookupPayload, { headers, withCredentials: true });
        const refreshed = refetchResp.data?.result?.[0];
        if (refreshed) {
          console.log('[OPEN POS SESSION] refreshed session after advance:', refreshed);
          session = refreshed;
        }
      } catch (e) {
        console.warn('[OPEN POS SESSION] advance step threw, returning session as-is:', e?.message);
      }
    }

    console.log('[OPEN POS SESSION] success', { sessionId, session });
    return { result: openResp.data?.result, sessionId, session };
  } catch (error) {
    const detail = error?.response?.data?.error?.data?.message
      || error?.response?.data?.error?.message
      || error?.message
      || 'Network error';
    console.error('[OPEN POS SESSION] exception:', detail, error);
    return { error: { message: detail, original: error } };
  }
};

// Fetch restaurant tables from Odoo using JSON-RPC

export const fetchRestaurantTablesOdoo = async () => {
  try {
    // Resolve runtime URL + DB (set by the login screen from what the user entered).
    const { getOdooUrl, getOdooDb } = require('../config/odooConfig');
    const base = getOdooUrl();
    const db = getOdooDb();
    const response = await fetch(`${base}/web/dataset/call_kw`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Odoo-Database': db,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'call',
        params: {
          model: 'restaurant.table',
          method: 'search_read',
          args: [[]], // No filter, fetch all tables
          kwargs: { fields: [
            'id', 'table_number', 'display_name', 'floor_id', 'seats', 'shape',
            'position_h', 'position_v', 'width', 'height', 'color', 'active'
          ] }
        },
        id: new Date().getTime(),
      }),
    });
    const rawText = await response.text();
    console.log('[fetchRestaurantTablesOdoo] Response status:', response.status);
    console.log('[fetchRestaurantTablesOdoo] Response headers:', JSON.stringify([...response.headers]));
    console.log('[fetchRestaurantTablesOdoo] Raw response text:', rawText);
    let data;
    try {
      data = JSON.parse(rawText);
    } catch (parseErr) {
      console.error('fetchRestaurantTablesOdoo JSON parse error:', parseErr, 'Raw text:', rawText);
      return { error: parseErr, raw: rawText };
    }
    if (data.error) {
      console.error('Odoo fetchRestaurantTablesOdoo error:', data.error);
      return { error: data.error };
    }
    return { result: data.result };
  } catch (error) {
    console.error('fetchRestaurantTablesOdoo error:', error);
    return { error };
  }
};

// Fetch open POS orders for a given table id
export const fetchOpenOrdersByTable = async (tableId) => {
  try {
    if (!tableId) return { result: [] };
    // Exclude orders that are 'done' or 'cancel' so only active/draft orders are returned
    const response = await axios.post(`${getOdooUrl()}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'pos.order',
        method: 'search_read',
        args: [[['table_id', '=', tableId], ['state', 'not in', ['done', 'cancel']]]],
        kwargs: { fields: ['id', 'name', 'state', 'amount_total', 'table_id', 'lines'] },
      },
      id: new Date().getTime(),
    }, { headers: { 'Content-Type': 'application/json' } });
    if (response.data && response.data.error) {
      console.error('Odoo fetchOpenOrdersByTable error:', response.data.error);
      return { error: response.data.error };
    }
    return { result: response.data.result };
  } catch (error) {
    console.error('fetchOpenOrdersByTable error:', error);
    return { error };
  }
};

// Create a draft pos.order assigned to a table
export const createDraftPosOrderOdoo = async ({ sessionId, userId, tableId, partnerId = false, note = '', preset_id = 10 } = {}) => {
  try {
    const vals = {
      session_id: sessionId,
      user_id: userId || false,
      partner_id: partnerId || false,
      table_id: tableId || false,
      lines: [],
      internal_note: note,
      amount_tax: 0,
      amount_total: 0,
      amount_paid: 0,
      amount_return: 0,
      state: 'draft',
      preset_id: preset_id,
    };
    const response = await axios.post(`${getOdooUrl()}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'pos.order',
        method: 'create',
        args: [vals],
        kwargs: {},
      },
      id: new Date().getTime(),
    }, { headers: { 'Content-Type': 'application/json' } });
    if (response.data && response.data.error) {
      console.error('Odoo createPosOrderOdoo error:', response.data.error);
      return { error: response.data.error };
    }
    // response.data.result is the new record id
    const createdId = response.data.result;
    console.log('[createDraftPosOrderOdoo] Created draft pos.order id:', createdId);
    // Try to fetch the full created order record for logging (non-blocking for callers)
    try {
      const full = await fetchPosOrderById(createdId);
      if (full && full.result) {
        console.log('[createDraftPosOrderOdoo] Created order details:', full.result);
      } else {
        console.log('[createDraftPosOrderOdoo] Could not fetch created order details for id', createdId);
      }
    } catch (fetchErr) {
      console.warn('[createDraftPosOrderOdoo] Failed to fetch created order details:', fetchErr);
    }
    return { result: createdId };
  } catch (error) {
    console.error('createDraftPosOrderOdoo error:', error);
    return { error };
  }
};

// Add a line to an existing pos.order using the correct 'lines' field
export const addLineToOrderOdoo = async ({ orderId, productId, qty = 1, price_unit = 0, name = '', taxes = [] } = {}) => {
  try {
    if (!orderId) throw new Error('orderId is required');
    if (!productId) throw new Error('productId is required');

    const lineVals = {
      product_id: productId,
      qty: Number(qty) || 1,
      price_unit: Number(price_unit) || 0,
      name: name || '',
      price_subtotal: (Number(qty) || 1) * (Number(price_unit) || 0),
      price_subtotal_incl: (Number(qty) || 1) * (Number(price_unit) || 0),
    };
    if (Array.isArray(taxes) && taxes.length > 0) {
      lineVals.tax_ids = taxes.map(t => typeof t === 'number' ? t : (t.id || t[0] || null)).filter(Boolean);
    }

    const rpcPayload = {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'pos.order',
        method: 'write',
        args: [[orderId], { lines: [[0, 0, lineVals]] }],
        kwargs: {},
      },
      id: new Date().getTime(),
    };
    console.log('[addLineToOrderOdoo] RPC payload:', { orderId, lineVals });
    const response = await axios.post(`${getOdooUrl()}/web/dataset/call_kw`, rpcPayload, { headers: { 'Content-Type': 'application/json' } });

    if (response.data && response.data.error) {
      console.error('Odoo addLineToOrderOdoo error:', response.data.error);
      return { error: response.data.error };
    }

    return { result: response.data.result };
  } catch (error) {
    console.error('addLineToOrderOdoo error:', error);
    return { error };
  }
};

// Fetch all open POS orders (not done) optionally filtered by session or limit
export const fetchOpenOrders = async ({ sessionId = null, limit = 100 } = {}) => {
  try {
    const domain = [['state', '!=', 'done']];
    if (sessionId) domain.push(['session_id', '=', sessionId]);
    const response = await axios.post(`${getOdooUrl()}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'pos.order',
        method: 'search_read',
        args: [domain],
        kwargs: { fields: ['id', 'name', 'state', 'amount_total', 'table_id', 'create_date'], limit, order: 'create_date desc' },
      },
      id: new Date().getTime(),
    }, { headers: { 'Content-Type': 'application/json' } });
    if (response.data && response.data.error) {
      console.error('Odoo fetchOpenOrders error:', response.data.error);
      return { error: response.data.error };
    }
    return { result: response.data.result };
  } catch (error) {
    console.error('fetchOpenOrders error:', error);
    return { error };
  }
};

// Fetch orders without filtering out done orders (flexible fetch)
export const fetchOrders = async ({ sessionId = null, limit = 100, order = 'create_date desc' } = {}) => {
  try {
    const domain = [];
    if (sessionId) domain.push(['session_id', '=', sessionId]);

    const response = await axios.post(`${getOdooUrl()}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'pos.order',
        method: 'search_read',
        args: [domain],
        kwargs: { fields: ['id', 'name', 'state', 'amount_total', 'table_id', 'create_date'], limit, order },
      },
      id: new Date().getTime(),
    }, { headers: { 'Content-Type': 'application/json' } });

    if (response.data && response.data.error) {
      console.error('Odoo fetchOrders error:', response.data.error);
      return { error: response.data.error };
    }
    return { result: response.data.result };
  } catch (error) {
    console.error('fetchOrders error:', error);
    return { error };
  }
};

// Fetch a single pos.order by id (includes `lines` which are line ids)
export const fetchPosOrderById = async (orderId) => {
  try {
    if (!orderId) return { result: null };
    const response = await axios.post(`${getOdooUrl()}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'pos.order',
        method: 'search_read',
        args: [[['id', '=', orderId]]],
        // include preset_id so clients can read the selected preset on the order
        kwargs: { fields: ['id','name','state','amount_total','table_id','lines','create_date','user_id','partner_id','preset_id'] },
      },
      id: new Date().getTime(),
    }, { headers: { 'Content-Type': 'application/json' } });

    if (response.data && response.data.error) {
      console.error('Odoo fetchPosOrderById error:', response.data.error);
      return { error: response.data.error };
    }
    const result = (response.data.result && response.data.result[0]) || null;
    return { result };
  } catch (error) {
    console.error('fetchPosOrderById error:', error);
    return { error };
  }
};

// Fetch pos.order.line records for given line ids
export const fetchOrderLinesByIds = async (lineIds = []) => {
  try {
    if (!Array.isArray(lineIds) || lineIds.length === 0) return { result: [] };
    const response = await axios.post(`${getOdooUrl()}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'pos.order.line',
        method: 'search_read',
        args: [[['id', 'in', lineIds]]],
        kwargs: { fields: ['id','product_id','qty','price_unit','price_subtotal','price_subtotal_incl','tax_ids','discount','name'] },
      },
      id: new Date().getTime(),
    }, { headers: { 'Content-Type': 'application/json' } });

    if (response.data && response.data.error) {
      console.error('Odoo fetchOrderLinesByIds error:', response.data.error);
      return { error: response.data.error };
    }
    return { result: response.data.result || [] };
  } catch (error) {
    console.error('fetchOrderLinesByIds error:', error);
    return { error };
  }
};

// Fetch pos.preset records (POS presets like Dine In / Takeaway)
export const fetchPosPresets = async ({ limit = 200 } = {}) => {
  try {
    const response = await axios.post(`${getOdooUrl()}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'pos.preset',
        method: 'search_read',
        args: [[]],
        kwargs: { fields: ['id','name','available_in_self','use_guest','pricelist_id','color','image_128'], limit, order: 'id asc' },
      },
      id: new Date().getTime(),
    }, { headers: { 'Content-Type': 'application/json' } });

    if (response.data && response.data.error) {
      console.error('Odoo fetchPosPresets error:', response.data.error);
      return { error: response.data.error };
    }
    return { result: response.data.result };
  } catch (error) {
    console.error('fetchPosPresets error:', error);
    return { error };
  }
};

// Update an existing pos.order.line (qty, price_unit, name, etc.)
export const updateOrderLineOdoo = async ({ lineId, qty, price_unit, name } = {}) => {
  try {
    if (!lineId) throw new Error('lineId is required');
    const vals = {};
    if (typeof qty !== 'undefined') vals.qty = Number(qty);
    if (typeof price_unit !== 'undefined') vals.price_unit = Number(price_unit);
    if (typeof name !== 'undefined') vals.name = name;

    const rpcPayload = {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'pos.order.line',
        method: 'write',
        args: [[lineId], vals],
        kwargs: {},
      },
      id: new Date().getTime(),
    };
    console.log('[updateOrderLineOdoo] RPC payload:', { lineId, vals });
    const response = await axios.post(`${getOdooUrl()}/web/dataset/call_kw`, rpcPayload, { headers: { 'Content-Type': 'application/json' } });

    if (response.data && response.data.error) {
      console.error('Odoo updateOrderLineOdoo error:', response.data.error);
      return { error: response.data.error };
    }
    return { result: response.data.result };
  } catch (error) {
    console.error('updateOrderLineOdoo error:', error);
    return { error };
  }
};

// Remove (unlink) a pos.order.line by id
export const removeOrderLineOdoo = async ({ lineId } = {}) => {
  try {
    if (!lineId) throw new Error('lineId is required');
    const rpcPayload = {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'pos.order.line',
        method: 'unlink',
        args: [[lineId]],
        kwargs: {},
      },
      id: new Date().getTime(),
    };
    console.log('[removeOrderLineOdoo] RPC payload:', { lineId });
    const response = await axios.post(`${getOdooUrl()}/web/dataset/call_kw`, rpcPayload, { headers: { 'Content-Type': 'application/json' } });

    if (response.data && response.data.error) {
      console.error('Odoo removeOrderLineOdoo error:', response.data.error);
      return { error: response.data.error };
    }
    return { result: response.data.result };
  } catch (error) {
    console.error('removeOrderLineOdoo error:', error);
    return { error };
  }
};

// Fetch selection values for a given model field (e.g., pos.order state selection)
export const fetchFieldSelectionOdoo = async ({ model = '', field = '' } = {}) => {
  try {
    if (!model || !field) throw new Error('model and field are required');
    const response = await axios.post(`${getOdooUrl()}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model,
        method: 'fields_get',
        args: [[field]],
        kwargs: { attributes: ['selection'] },
      },
    }, { headers: { 'Content-Type': 'application/json' } });

    if (response.data && response.data.error) {
      console.error(`[FIELDS_GET] Odoo error for ${model}.${field}:`, response.data.error);
      return [];
    }

    const fieldDef = response.data && response.data.result && response.data.result[field];
    if (!fieldDef) return [];
    return fieldDef.selection || [];
  } catch (error) {
    console.error('fetchFieldSelectionOdoo error:', error);
    return [];
  }
};

// Fetch base64 product image for a single product id
export const fetchProductImageBase64 = async (productId) => {
  try {
    if (!productId) return null;
    const resp = await axios.post(
      `${getOdooUrl()}/web/dataset/call_kw`,
      {
        jsonrpc: '2.0',
        method: 'call',
        params: {
          model: 'product.product',
          method: 'search_read',
          args: [[['id', '=', productId]]],
          kwargs: { fields: ['id', 'image_128'], limit: 1 },
        },
      },
      { headers: { 'Content-Type': 'application/json' } }
    );

    if (resp.data && resp.data.result && Array.isArray(resp.data.result) && resp.data.result[0]) {
      return resp.data.result[0].image_128 || null;
    }
    return null;
  } catch (err) {
    console.error('fetchProductImageBase64 error:', err?.message || err);
    return null;
  }
};

// Fetch discount presets from Odoo (attempts common POS discount model)
export const fetchDiscountsOdoo = async () => {
  try {
    const response = await axios.post(`${getOdooUrl()}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'pos.discount',
        method: 'search_read',
        args: [[]],
        kwargs: { fields: ['id', 'name', 'amount', 'is_percentage'], limit: 50 },
      },
    }, { headers: { 'Content-Type': 'application/json' } });

    const results = response.data?.result || [];
    if (results.length === 0) {
      // If pos.discount not present, return empty — caller may fallback to presets
      console.log('fetchDiscountsOdoo: no pos.discount records found');
    }
    return results;
  } catch (error) {
    console.warn('fetchDiscountsOdoo error:', error?.message || error);
    return [];
  }
};

// Create a discount record in Odoo (pos.discount)
export const createDiscountOdoo = async ({ name, amount = 0, is_percentage = false } = {}) => {
  try {
    const payload = {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'pos.discount',
        method: 'create',
        args: [{ name, amount, is_percentage }],
        kwargs: {},
      },
      id: new Date().getTime(),
    };

    const response = await axios.post(`${getOdooUrl()}/web/dataset/call_kw`, payload, { headers: { 'Content-Type': 'application/json' } });
    return response.data?.result ? { id: response.data.result } : { error: 'no_result' };
  } catch (error) {
    console.error('createDiscountOdoo error:', error);
    return { error };
  }
};

// Update a discount record in Odoo
export const updateDiscountOdoo = async ({ id, values = {} } = {}) => {
  try {
    if (!id) throw new Error('id required');
    const payload = {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'pos.discount',
        method: 'write',
        args: [[id], values],
        kwargs: {},
      },
      id: new Date().getTime(),
    };

    const response = await axios.post(`${getOdooUrl()}/web/dataset/call_kw`, payload, { headers: { 'Content-Type': 'application/json' } });
    return response.data?.result ? { success: true } : { error: 'no_result' };
  } catch (error) {
    console.error('updateDiscountOdoo error:', error);
    return { error };
  }
};

// Delete a discount record in Odoo
export const deleteDiscountOdoo = async ({ id } = {}) => {
  try {
    if (!id) throw new Error('id required');
    const payload = {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'pos.discount',
        method: 'unlink',
        args: [[id]],
        kwargs: {},
      },
      id: new Date().getTime(),
    };

    const response = await axios.post(`${getOdooUrl()}/web/dataset/call_kw`, payload, { headers: { 'Content-Type': 'application/json' } });
    return response.data?.result ? { success: true } : { error: 'no_result' };
  } catch (error) {
    console.error('deleteDiscountOdoo error:', error);
    return { error };
  }
};

// Discover which field on res.users holds the user's groups m2m. Odoo
// 17 used `groups_id`; Odoo 19 renamed it (likely to `group_ids`). The
// helper probes `fields_get` once on first use and caches the result
// for the rest of the session — every create/read/write of a user
// goes through this so a single rename propagates everywhere.
let _cachedUserGroupsField = null;
const _resolveUserGroupsField = async () => {
  if (_cachedUserGroupsField) return _cachedUserGroupsField;
  try {
    const probe = await axios.post(`${getOdooUrl()}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'res.users',
        method: 'fields_get',
        args: [['groups_id', 'group_ids', 'all_group_ids', 'direct_group_ids']],
        kwargs: { attributes: ['type', 'relation'] },
      },
      id: new Date().getTime(),
    }, { headers: { 'Content-Type': 'application/json' } });
    const fields = probe.data?.result || {};
    // Try in priority order. Match by `type === 'many2many'` rather than
    // `relation === 'res.groups'` — in Odoo 19 `group_ids` is a computed
    // m2m and some builds omit `relation` from fields_get when only a
    // narrow attribute set is requested.
    const candidates = ['group_ids', 'groups_id', 'direct_group_ids', 'all_group_ids'];
    let resolved = candidates.find(
      (n) => fields[n] && (fields[n].type === 'many2many' || fields[n].relation === 'res.groups')
    );
    if (!resolved) {
      // Last-ditch fallback — fetch every field and pick anything that
      // relates to res.groups. Costlier but only runs once per session.
      const all = await axios.post(`${getOdooUrl()}/web/dataset/call_kw`, {
        jsonrpc: '2.0',
        method: 'call',
        params: {
          model: 'res.users',
          method: 'fields_get',
          args: [[]],
          kwargs: { attributes: ['type', 'relation'] },
        },
        id: new Date().getTime(),
      }, { headers: { 'Content-Type': 'application/json' } });
      const allFields = all.data?.result || {};
      resolved = Object.keys(allFields).find(
        (n) => allFields[n].relation === 'res.groups' && allFields[n].type === 'many2many'
      ) || 'group_ids';
    }
    console.log(`[USERS] resolved groups field: ${resolved}`);
    _cachedUserGroupsField = resolved;
    return resolved;
  } catch (e) {
    console.warn('[USERS] fields_get probe failed, falling back to group_ids:', e?.message || e);
    _cachedUserGroupsField = 'group_ids';
    return 'group_ids';
  }
};

// Detect "Invalid field 'X' on 'res.users'" errors from Odoo and, if X
// is the groups field we just used, swap to the next candidate and
// retry. Caches the corrected name for the rest of the session so a
// stale or wrong probe result self-heals on first real call.
const USER_GROUPS_FIELD_CANDIDATES = ['group_ids', 'groups_id', 'direct_group_ids', 'all_group_ids'];

const _isInvalidGroupsFieldError = (errorObj, field) => {
  const msg = errorObj?.data?.message || errorObj?.message || '';
  const m = /Invalid field '([^']+)' on 'res\.users'/.exec(String(msg));
  return !!(m && m[1] === field);
};

const _nextGroupsFieldCandidate = (used) => {
  const tried = new Set(used);
  return USER_GROUPS_FIELD_CANDIDATES.find((c) => !tried.has(c)) || null;
};

// Run a JSON-RPC call against res.users where `payload(field)` builds
// the request body using the discovered groups field name. Retries
// once with the next candidate if Odoo rejects the field.
const _callUsersWithGroupsField = async (payloadBuilder) => {
  const tried = [];
  let field = await _resolveUserGroupsField();
  for (let attempt = 0; attempt < 2; attempt++) {
    tried.push(field);
    const response = await axios.post(
      `${getOdooUrl()}/web/dataset/call_kw`,
      payloadBuilder(field),
      { headers: { 'Content-Type': 'application/json' } },
    );
    const err = response.data?.error;
    if (err && _isInvalidGroupsFieldError(err, field)) {
      const next = _nextGroupsFieldCandidate(tried);
      if (next) {
        console.warn(`[USERS] field '${field}' rejected by server, retrying with '${next}'`);
        _cachedUserGroupsField = next;
        field = next;
        continue;
      }
    }
    return { response, field };
  }
  // Should be unreachable — loop exits via return above.
  return { response: null, field };
};

// Cached id of base.group_user — the "Internal User" group. We add it
// to every res.users.create payload so new users land as Internal Users.
// Without this, Odoo computes share=True for the new user (no Internal
// group) and the record only appears under the backend's "Portal Users"
// filter, not "Internal Users" — which is exactly what the user saw.
let _cachedInternalGroupId = null;
const _resolveInternalGroupId = async () => {
  if (_cachedInternalGroupId) return _cachedInternalGroupId;
  try {
    const res = await axios.post(`${getOdooUrl()}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'ir.model.data',
        method: 'search_read',
        args: [[['module', '=', 'base'], ['name', '=', 'group_user']]],
        kwargs: { fields: ['res_id'], limit: 1 },
      },
    }, { headers: { 'Content-Type': 'application/json' } });
    const rid = res.data?.result?.[0]?.res_id;
    if (rid) _cachedInternalGroupId = Number(rid);
    return _cachedInternalGroupId;
  } catch (_) {
    return null;
  }
};

// Create a new user in Odoo
export const createUserOdoo = async ({
  name, login, password, email = '', phone = '',
  groups = [], companyIds, defaultCompanyId,
} = {}) => {
  try {
    if (!name) throw new Error('name is required');
    if (!login) throw new Error('login is required');
    if (!password) throw new Error('password is required');

    const baseVals = {
      name,
      login,
      password,
      email: email || '',
      phone: phone || '',
    };
    if (Array.isArray(companyIds) && companyIds.length > 0) {
      baseVals.company_ids = [[6, 0, companyIds]];
    }
    if (defaultCompanyId !== undefined && defaultCompanyId !== null) {
      baseVals.company_id = Number(defaultCompanyId);
    }

    // Resolve base.group_user (the Internal User group) once and merge it
    // with the admin-selected groups so the new user always lands under
    // "Internal Users", never under "Portal Users" by default.
    const internalGroupId = await _resolveInternalGroupId();
    console.log('[CREATE USER] base.group_user id =', internalGroupId);

    const { response } = await _callUsersWithGroupsField((field) => {
      const userVals = { ...baseVals };
      const groupSet = new Set(Array.isArray(groups) ? groups.map(Number).filter(Number.isFinite) : []);
      if (internalGroupId) groupSet.add(internalGroupId);
      if (groupSet.size > 0) {
        userVals[field] = [[6, 0, Array.from(groupSet)]];
      }
      console.log('[CREATE USER] Creating user with payload:', userVals);
      return {
        jsonrpc: '2.0',
        method: 'call',
        params: {
          model: 'res.users',
          method: 'create',
          args: [userVals],
          kwargs: {},
        },
        id: new Date().getTime(),
      };
    });

    if (response.data && response.data.error) {
      console.error('[CREATE USER] Odoo error:', response.data.error);
      return { error: response.data.error };
    }

    const userId = response.data.result;
    console.log('[CREATE USER] User created successfully with ID:', userId);
    return { result: userId };
  } catch (error) {
    console.error('createUserOdoo error:', error);
    return { error };
  }
};

// Cached id of the base.group_system (Settings) group — used to tag
// each user as admin/non-admin in the list. Resolved once via
// ir.model.data; the lookup is identical to the one used for the
// Role radio in UserDetailsScreen.
let _cachedAdminGroupId = null;
const _resolveAdminGroupId = async () => {
  if (_cachedAdminGroupId) return _cachedAdminGroupId;
  try {
    const res = await axios.post(`${getOdooUrl()}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'ir.model.data',
        method: 'search_read',
        args: [[['module', '=', 'base'], ['name', '=', 'group_system']]],
        kwargs: { fields: ['res_id'], limit: 1 },
      },
      id: new Date().getTime(),
    }, { headers: { 'Content-Type': 'application/json' } });
    const id = res.data?.result?.[0]?.res_id || null;
    _cachedAdminGroupId = id;
    return id;
  } catch (e) {
    console.warn('[USERS] admin group lookup failed:', e?.message || e);
    return null;
  }
};

// Fetch users from Odoo. Each row is tagged with `_isAdmin` based on
// membership in the Settings group (base.group_system) so the list
// screen can render admins and regular users in separate sections.
export const fetchUsersOdoo = async ({ offset = 0, limit = 50, searchText = '' } = {}) => {
  try {
    let domain = [];

    if (searchText && searchText.trim() !== '') {
      const term = searchText.trim();
      domain = [
        '|',
        ['name', 'ilike', term],
        ['login', 'ilike', term],
      ];
    }

    const adminGroupId = await _resolveAdminGroupId();

    const { response, field: groupsField } = await _callUsersWithGroupsField((field) => ({
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'res.users',
        method: 'search_read',
        args: [domain],
        kwargs: {
          fields: ['id', 'name', 'login', 'email', 'phone', 'active', field],
          offset,
          limit,
          order: 'name asc',
        },
      },
      id: new Date().getTime(),
    }));

    if (response.data && response.data.error) {
      console.error('[FETCH USERS] Odoo error:', response.data.error);
      return [];
    }

    const users = (response.data.result || []).map((u) => {
      const groupIds = Array.isArray(u[groupsField]) ? u[groupsField] : [];
      return {
        ...u,
        _isAdmin: !!(adminGroupId && groupIds.includes(adminGroupId)),
      };
    });
    console.log(`[FETCH USERS] Retrieved ${users.length} users (${users.filter(u => u._isAdmin).length} admins)`);
    return users;
  } catch (error) {
    console.error('fetchUsersOdoo error:', error);
    throw error;
  }
};

// Read a single user with the fields the edit form needs.
export const fetchUserDetailsOdoo = async (userId) => {
  try {
    const id = Number(userId);
    if (!id) return null;
    const { response, field: groupsField } = await _callUsersWithGroupsField((field) => ({
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'res.users',
        method: 'read',
        args: [[id]],
        kwargs: {
          fields: ['id', 'name', 'login', 'email', 'phone', 'active',
                   'company_id', 'company_ids', field, 'share'],
        },
      },
      id: new Date().getTime(),
    }));
    if (response.data?.error) {
      console.error('[FETCH USER] Odoo error:', response.data.error);
      return null;
    }
    const row = response.data.result?.[0] || null;
    // Normalise to a stable `groups_id` key so callers don't have to
    // care which field name the server actually uses.
    if (row && groupsField !== 'groups_id') {
      row.groups_id = row[groupsField] || [];
    }
    return row;
  } catch (error) {
    console.error('fetchUserDetailsOdoo error:', error);
    return null;
  }
};

// Build the Access Rights tree for the user form across Odoo versions.
//
// Odoo 18+ refactored access-rights into a new pivot model
// `res.groups.privilege` (each privilege = one row in the user form,
// e.g. Accounting / Bank / Point of Sale). Odoo 19 also DELETED
// `res.groups.category_id`, so the legacy approach can't work there.
//
// Strategy:
//   1) Probe `res.groups.privilege.fields_get` — if the model exists,
//      it's Odoo 18/19 and we use the privilege pivot.
//   2) If the probe fails ("Object … doesn't exist"), fall back to the
//      legacy `ir.module.category.group_ids` path so older Odoos
//      keep working unchanged.
//
// In both cases we return the same shape:
//   { sections: [{ id, name, leaves: [{ id, name, groups: [...] }, ...] }],
//     adminCategory: { id, settingsGroupId } | null }
// The screen (UserDetailsScreen.js) is unaware of which path produced it.
const _rpc = async ({ model, method, args = [], kwargs = {} }) => {
  return axios.post(`${getOdooUrl()}/web/dataset/call_kw`, {
    jsonrpc: '2.0',
    method: 'call',
    params: { model, method, args, kwargs },
    id: new Date().getTime(),
  }, { headers: { 'Content-Type': 'application/json' } });
};

const _buildSections = (leaves) => {
  const sectionsMap = new Map();
  for (const lf of leaves) {
    const sectionName = lf.parentName || lf.name;
    const sectionKey = lf.parentId ? `parent-${lf.parentId}` : `solo-${lf.id}`;
    if (!sectionsMap.has(sectionKey)) {
      sectionsMap.set(sectionKey, {
        id: sectionKey,
        name: sectionName,
        sequence: lf.parentSequence ?? lf.sequence ?? 0,
        leaves: [],
      });
    }
    sectionsMap.get(sectionKey).leaves.push(lf);
  }
  return Array.from(sectionsMap.values())
    .sort((a, b) => (a.sequence - b.sequence) || a.name.localeCompare(b.name))
    .map((s) => ({
      ...s,
      leaves: s.leaves.sort(
        (a, b) => (a.sequence - b.sequence) || a.name.localeCompare(b.name)
      ),
    }));
};

const _findAdminCategory = (leaves) => {
  for (const lf of leaves) {
    const settings = lf.groups.find((g) => /^settings$/i.test(g.name));
    if (settings) return { id: lf.id, settingsGroupId: settings.id };
  }
  return null;
};

export const fetchGroupCategoriesOdoo = async () => {
  // ─── Path A: Odoo 18/19 — res.groups.privilege ──────────────────────────
  try {
    const probe = await _rpc({
      model: 'res.groups.privilege',
      method: 'fields_get',
      args: [[]],
      kwargs: { attributes: ['type', 'relation', 'string'] },
    });
    if (!probe.data?.error) {
      const fields = probe.data.result || {};
      console.log('[FETCH GROUP CATS] privilege.fields =', Object.keys(fields).join(','));

      // Pick the relation field that points to res.groups. Try a few
      // likely names first, then any field whose `relation` is res.groups.
      const candidates = ['implied_ids', 'group_ids', 'res_groups_ids', 'groups_ids'];
      let groupsField = candidates.find((n) => fields[n]?.relation === 'res.groups');
      if (!groupsField) {
        groupsField = Object.keys(fields).find((n) => fields[n]?.relation === 'res.groups');
      }
      console.log(`[FETCH GROUP CATS] using groupsField=${groupsField || '<none>'}`);

      if (groupsField) {
        const privRes = await _rpc({
          model: 'res.groups.privilege',
          method: 'search_read',
          args: [[]],
          kwargs: {
            fields: ['id', 'name', 'sequence', 'category_id', groupsField],
            order: 'sequence asc, id asc',
          },
        });
        if (privRes.data?.error) {
          console.error('[FETCH GROUP CATS] privilege search_read error:', privRes.data.error);
        } else {
          const privileges = privRes.data.result || [];

          // Bulk-read every referenced group for [id, name].
          const allGroupIds = new Set();
          for (const p of privileges) {
            const ids = Array.isArray(p[groupsField]) ? p[groupsField] : [];
            for (const gid of ids) allGroupIds.add(gid);
          }
          const groupsById = new Map();
          if (allGroupIds.size > 0) {
            const grpRes = await _rpc({
              model: 'res.groups',
              method: 'read',
              args: [Array.from(allGroupIds)],
              kwargs: { fields: ['id', 'name'] },
            });
            if (!grpRes.data?.error) {
              for (const g of grpRes.data.result || []) {
                groupsById.set(g.id, { id: g.id, name: g.name });
              }
            }
          }

          // Each privilege = one leaf. category_id is the section header.
          const leaves = [];
          for (const p of privileges) {
            const ids = Array.isArray(p[groupsField]) ? p[groupsField] : [];
            const groups = ids.map((gid) => groupsById.get(gid)).filter(Boolean);
            if (groups.length === 0) continue;
            const catTuple = Array.isArray(p.category_id) ? p.category_id : null;
            leaves.push({
              id: p.id,
              name: p.name || `Privilege ${p.id}`,
              sequence: p.sequence ?? 0,
              parentId: catTuple ? catTuple[0] : null,
              parentName: catTuple ? catTuple[1] : null,
              groups,
            });
          }
          const sections = _buildSections(leaves);
          let adminCategory = _findAdminCategory(leaves);

          // Odoo 18/19 dropped Administration from the privilege list,
          // so the User/Administrator radio is no longer derivable from
          // privilege groups. Look up base.group_system directly via
          // ir.model.data and synthesise an adminCategory whose `id` is
          // a synthetic key — the screen's groupByCategory map happily
          // tracks it alongside real privilege ids and includes the
          // group_system id in groups_id at save time.
          if (!adminCategory) {
            try {
              const xmlRes = await _rpc({
                model: 'ir.model.data',
                method: 'search_read',
                args: [[['module', '=', 'base'], ['name', '=', 'group_system']]],
                kwargs: { fields: ['res_id'], limit: 1 },
              });
              const settingsId = xmlRes.data?.result?.[0]?.res_id || null;
              if (settingsId) {
                adminCategory = { id: 'admin-pseudo', settingsGroupId: settingsId };
              }
            } catch (e) {
              console.warn('[FETCH GROUP CATS] group_system lookup failed:', e?.message || e);
            }
          }
          console.log(`[FETCH GROUP CATS] (privilege) ${leaves.length} leaves, ${sections.length} sections, admin=${!!adminCategory}`);
          return { sections, adminCategory };
        }
      }
    } else {
      const msg = probe.data.error?.data?.message || probe.data.error?.message || '';
      // "doesn't exist" / "not found" → model missing → use legacy path.
      // Anything else also falls through to legacy as a last resort.
      console.log('[FETCH GROUP CATS] privilege probe error, trying legacy:', msg);
    }
  } catch (error) {
    console.warn('[FETCH GROUP CATS] privilege path threw, falling back:', error?.message || error);
  }

  // ─── Path B: legacy Odoo 17 — ir.module.category.group_ids ──────────────
  try {
    const groupIdsField = 'group_ids';
    const catRes = await _rpc({
      model: 'ir.module.category',
      method: 'search_read',
      args: [[]],
      kwargs: { fields: ['id', 'name', 'sequence', 'parent_id', groupIdsField] },
    });
    if (catRes.data?.error) {
      console.error('[FETCH GROUP CATS] (legacy) category error:', catRes.data.error);
      return { sections: [], adminCategory: null };
    }
    const categories = catRes.data.result || [];

    const allGroupIds = new Set();
    for (const c of categories) {
      const ids = Array.isArray(c[groupIdsField]) ? c[groupIdsField] : [];
      for (const gid of ids) allGroupIds.add(gid);
    }
    const groupsById = new Map();
    if (allGroupIds.size > 0) {
      const grpRes = await _rpc({
        model: 'res.groups',
        method: 'read',
        args: [Array.from(allGroupIds)],
        kwargs: { fields: ['id', 'name'] },
      });
      if (!grpRes.data?.error) {
        for (const g of grpRes.data.result || []) {
          groupsById.set(g.id, { id: g.id, name: g.name });
        }
      }
    }

    const catById = new Map();
    categories.forEach((c) => catById.set(c.id, c));
    const leaves = [];
    for (const c of categories) {
      const ids = Array.isArray(c[groupIdsField]) ? c[groupIdsField] : [];
      if (ids.length === 0) continue;
      const groups = ids.map((gid) => groupsById.get(gid)).filter(Boolean);
      if (groups.length === 0) continue;
      leaves.push({
        id: c.id,
        name: c.name,
        sequence: c.sequence ?? 0,
        parentId: Array.isArray(c.parent_id) ? c.parent_id[0] : null,
        parentName: Array.isArray(c.parent_id) ? c.parent_id[1] : null,
        parentSequence: Array.isArray(c.parent_id)
          ? (catById.get(c.parent_id[0])?.sequence ?? c.sequence)
          : c.sequence,
        groups,
      });
    }
    const sections = _buildSections(leaves);
    const adminCategory = _findAdminCategory(leaves);
    console.log(`[FETCH GROUP CATS] (legacy) ${leaves.length} leaves, ${sections.length} sections, admin=${!!adminCategory}`);
    return { sections, adminCategory };
  } catch (error) {
    console.error('fetchGroupCategoriesOdoo error:', error);
    return { sections: [], adminCategory: null };
  }
};

// All companies — feeds the Companies (multi) and Default Company dropdowns.
export const fetchCompaniesOdoo = async () => {
  try {
    const response = await axios.post(`${getOdooUrl()}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'res.company',
        method: 'search_read',
        args: [[]],
        kwargs: { fields: ['id', 'name'], order: 'name asc' },
      },
      id: new Date().getTime(),
    }, { headers: { 'Content-Type': 'application/json' } });
    if (response.data?.error) {
      console.error('[FETCH COMPANIES] error:', response.data.error);
      return [];
    }
    return response.data.result || [];
  } catch (error) {
    console.error('fetchCompaniesOdoo error:', error);
    return [];
  }
};

// Update an existing user. groupIds is the FULL set of group ids the user
// should belong to after the write — Odoo's [[6, 0, ids]] command replaces
// the whole many2many.
export const updateUserOdoo = async ({
  userId,
  name,
  login,
  email,
  phone,
  active,
  companyIds,
  defaultCompanyId,
  groupIds,
} = {}) => {
  try {
    const id = Number(userId);
    if (!id) throw new Error('userId is required');
    const baseVals = {};
    if (name !== undefined) baseVals.name = name;
    if (login !== undefined) baseVals.login = login;
    if (email !== undefined) baseVals.email = email;
    if (phone !== undefined) baseVals.phone = phone;
    if (active !== undefined) baseVals.active = !!active;
    if (Array.isArray(companyIds)) baseVals.company_ids = [[6, 0, companyIds]];
    if (defaultCompanyId !== undefined && defaultCompanyId !== null) {
      baseVals.company_id = Number(defaultCompanyId);
    }

    const { response } = await _callUsersWithGroupsField((field) => {
      const vals = { ...baseVals };
      if (Array.isArray(groupIds)) vals[field] = [[6, 0, groupIds]];
      return {
        jsonrpc: '2.0',
        method: 'call',
        params: {
          model: 'res.users',
          method: 'write',
          args: [[id], vals],
          kwargs: {},
        },
        id: new Date().getTime(),
      };
    });
    if (response.data?.error) {
      console.error('[UPDATE USER] Odoo error:', response.data.error);
      return { error: response.data.error };
    }
    return { result: !!response.data.result };
  } catch (error) {
    console.error('updateUserOdoo error:', error);
    return { error };
  }
};

// Change a user's password (admin path; Odoo enforces ACL server-side).
export const updateUserPasswordOdoo = async (userId, newPassword) => {
  try {
    const id = Number(userId);
    if (!id) throw new Error('userId is required');
    if (!newPassword) throw new Error('newPassword is required');
    const response = await axios.post(`${getOdooUrl()}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'res.users',
        method: 'write',
        args: [[id], { password: newPassword }],
        kwargs: {},
      },
      id: new Date().getTime(),
    }, { headers: { 'Content-Type': 'application/json' } });
    if (response.data?.error) {
      console.error('[UPDATE PASSWORD] Odoo error:', response.data.error);
      return { error: response.data.error };
    }
    return { result: !!response.data.result };
  } catch (error) {
    console.error('updateUserPasswordOdoo error:', error);
    return { error };
  }
};

// Fetch POS orders from Odoo
export const fetchOrdersOdoo = async ({
  offset = 0, limit = 50, searchText = '', configId = null, sessionId = null,
  states = null, stateFilter = null,
} = {}) => {
  try {
    let domain = [];

    if (searchText && searchText.trim() !== '') {
      const term = searchText.trim();
      domain = [
        '|',
        '|',
        ['name', 'ilike', term],
        ['partner_id', 'ilike', term],
        ['user_id', 'ilike', term],
      ];
    }

    // Scope filters used by the new kebab→Orders shortcut (configId) and the
    // POSConfigSessions row tap (sessionId). Both are appended as additional
    // AND-leaves so they combine cleanly with the search-text domain above.
    if (sessionId) domain.push(['session_id', '=', Number(sessionId)]);
    if (configId) domain.push(['config_id', '=', Number(configId)]);
    // Normalize the state filter — accept either `states: string[]` (the new
    // multi-state OR form used by the chip strip) or a single `stateFilter`
    // string (legacy callers like POSRegister's Continue Selling shortcut).
    let stateList = [];
    if (Array.isArray(states)) {
      stateList = states.filter((s) => typeof s === 'string' && s.length > 0);
    } else if (stateFilter && typeof stateFilter === 'string') {
      stateList = [stateFilter];
    }
    if (stateList.length === 1) {
      domain.push(['state', '=', stateList[0]]);
    } else if (stateList.length > 1) {
      domain.push(['state', 'in', stateList]);
    }

    const companyId = getActiveCompanyId();
    const response = await axios.post(`${getOdooUrl()}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'pos.order',
        method: 'search_read',
        args: [domain],
        kwargs: {
          fields: [
            'id', 'name', 'pos_reference',
            'partner_id', 'user_id', 'date_order',
            'amount_total', 'amount_paid', 'amount_tax', 'state',
            'session_id', 'config_id',
          ],
          offset,
          limit,
          order: 'date_order desc',
          // Match the company context createPosOrderOdoo uses so just-
          // created drafts are visible here.
          context: { allowed_company_ids: [companyId] },
        },
      },
      id: new Date().getTime(),
    }, { headers: { 'Content-Type': 'application/json' } });

    // Throw (don't silently return an envelope) so useDataFetching's catch
    // surfaces the "Could not load" toast. Previously the envelope was coerced
    // to [] by Array.isArray, leaving the user staring at a blank list with no
    // signal until they logged out and back in.
    if (response.data && response.data.error) {
      console.error('[FETCH POS ORDERS] Odoo error:', response.data.error);
      const msg =
        response.data.error?.data?.message ||
        response.data.error?.message ||
        'Could not load orders';
      const err = new Error(msg);
      err.odoo = response.data.error;
      throw err;
    }

    // Hermes (production build) strict-iterates `for...of` and throws "iterator
    // method is not callable" if response.data.result is not actually an array
    // (e.g. when Odoo returns an error envelope object). Guard before passing
    // to the FlashList pipeline so the prod build behaves like dev.
    const orders = Array.isArray(response.data?.result) ? response.data.result : [];
    console.log('[FETCH POS ORDERS] Retrieved orders count:', orders.length);
    return orders;
  } catch (error) {
    console.error('fetchOrdersOdoo error:', error);
    throw error;
  }
};

// Fetch a single pos.order with its lines (and image_url for each product) so
// we can show a full receipt detail view, or reload a draft order back into
// the cart for editing.
export const fetchPosOrderDetailOdoo = async (orderId) => {
  if (!orderId) return null;
  const baseUrl = getOdooUrl();

  const orderResp = await axios.post(`${baseUrl}/web/dataset/call_kw`, {
    jsonrpc: '2.0',
    method: 'call',
    params: {
      model: 'pos.order',
      method: 'search_read',
      args: [[['id', '=', orderId]]],
      kwargs: {
        fields: [
          'id', 'name', 'pos_reference',
          'partner_id', 'user_id', 'date_order',
          'amount_total', 'amount_tax', 'amount_paid', 'amount_return',
          'state', 'session_id', 'config_id', 'lines',
          // Location fields populated by the RN app at Validate Payment
          // time via the standalone pos_order_location module.
          'order_latitude', 'order_longitude', 'order_location_name',
          // Refund linkage — `refunded_order_id` is set when THIS order is a
          // refund of another; `refund_orders_count` is the number of refund
          // children of THIS order. Used to disable the Return Products
          // button when the order is already a refund or fully refunded.
          'refunded_order_id', 'refund_orders_count',
        ],
        limit: 1,
      },
    },
  }, { headers: { 'Content-Type': 'application/json' } });

  if (orderResp.data && orderResp.data.error) {
    console.error('[FETCH POS ORDER DETAIL] error:', orderResp.data.error);
    return { error: orderResp.data.error };
  }
  const order = (orderResp.data.result || [])[0];
  if (!order) return null;

  let lines = [];
  if (Array.isArray(order.lines) && order.lines.length > 0) {
    const linesResp = await axios.post(`${baseUrl}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'pos.order.line',
        method: 'read',
        args: [order.lines],
        kwargs: {
          fields: ['id', 'product_id', 'qty', 'price_unit', 'discount', 'price_subtotal', 'price_subtotal_incl', 'name'],
        },
      },
    }, { headers: { 'Content-Type': 'application/json' } });

    if (!(linesResp.data && linesResp.data.error)) {
      const rawLines = linesResp.data.result || [];
      // Pull image_128 base64 in one extra round-trip keyed by the line's
      // product_ids. The naive Web URL fallback below is unreliable from
      // a mobile context (auth/cache), so embedding base64 like the POS
      // register and Products list do is more reliable.
      const productIds = Array.from(new Set(
        rawLines
          .map((l) => (Array.isArray(l.product_id) ? l.product_id[0] : null))
          .filter((x) => x != null)
      ));
      const imageByProductId = new Map();
      if (productIds.length > 0) {
        try {
          const prodResp = await axios.post(`${baseUrl}/web/dataset/call_kw`, {
            jsonrpc: '2.0',
            method: 'call',
            params: {
              model: 'product.product',
              method: 'read',
              args: [productIds],
              kwargs: { fields: ['id', 'image_128'] },
            },
          }, { headers: { 'Content-Type': 'application/json' } });
          if (!prodResp.data?.error) {
            for (const p of (prodResp.data.result || [])) {
              if (p.image_128 && typeof p.image_128 === 'string' && p.image_128.length > 0) {
                imageByProductId.set(p.id, `data:image/png;base64,${p.image_128}`);
              }
            }
          }
        } catch (e) {
          console.warn('[FETCH POS ORDER DETAIL] image fetch failed:', e?.message || e);
        }
      }
      lines = rawLines.map((l) => {
        const pid = Array.isArray(l.product_id) ? l.product_id[0] : null;
        const pname = Array.isArray(l.product_id) ? l.product_id[1] : (l.name || 'Product');
        const base64Url = pid ? imageByProductId.get(pid) : null;
        return {
          id: l.id,
          product_id: pid,
          name: pname,
          qty: Number(l.qty) || 0,
          price_unit: Number(l.price_unit) || 0,
          discount: Number(l.discount) || 0,
          price_subtotal: Number(l.price_subtotal) || 0,
          price_subtotal_incl: Number(l.price_subtotal_incl) || 0,
          // Prefer the embedded base64 (works offline / no auth header issues);
          // fall back to the Web URL if image_128 wasn't returned for this product.
          image_url: base64Url || (pid ? `${baseUrl}/web/image?model=product.product&id=${pid}&field=image_128` : null),
        };
      });
    }
  }

  const result = {
    id: order.id,
    name: order.name || '',
    pos_reference: order.pos_reference || '',
    partner: Array.isArray(order.partner_id) ? { id: order.partner_id[0], name: order.partner_id[1] } : null,
    user: Array.isArray(order.user_id) ? { id: order.user_id[0], name: order.user_id[1] } : null,
    session: Array.isArray(order.session_id) ? { id: order.session_id[0], name: order.session_id[1] } : null,
    config: Array.isArray(order.config_id) ? { id: order.config_id[0], name: order.config_id[1] } : null,
    date_order: order.date_order || null,
    amount_total: Number(order.amount_total) || 0,
    amount_tax: Number(order.amount_tax) || 0,
    amount_paid: Number(order.amount_paid) || 0,
    amount_return: Number(order.amount_return) || 0,
    state: order.state || 'draft',
    lines,
    // Location fields from the pos_order_location module. null/empty when
    // the order didn't capture GPS (placed before the feature shipped or
    // the cashier denied permission).
    order_latitude: order.order_latitude == null || order.order_latitude === false ? null : Number(order.order_latitude),
    order_longitude: order.order_longitude == null || order.order_longitude === false ? null : Number(order.order_longitude),
    order_location_name: order.order_location_name || '',
  };
  console.log('[POSLocation] fetchPosOrderDetailOdoo returned', {
    id: result.id,
    location_name: result.order_location_name,
    latitude: result.order_latitude,
    longitude: result.order_longitude,
    rawKeysReturned: Object.keys(order).filter((k) => k.startsWith('order_')),
  });
  return result;
};

// Fetch sales report data from Odoo
export const fetchSalesReportData = async ({ startDate = null, endDate = null, filters = [] } = {}) => {
  try {
    // Match Odoo's Orders Analysis default filter ("Not Cancelled") so the
    // app's totals line up with what staff see in Odoo. This includes draft
    // (open / unpaid) orders the same way Odoo does.
    let domain = [];

    if (startDate && endDate) {
      domain = [
        ['date_order', '>=', startDate],
        ['date_order', '<=', endDate],
        ['state', '!=', 'cancel'],
      ];
    } else {
      domain = [['state', '!=', 'cancel']];
    }

    // Apply Odoo-style filters from the Sales Report's Filters menu.
    // not_cancelled is implicit in the PAID_STATES list, so it's a no-op here.
    if (Array.isArray(filters) && filters.length) {
      if (filters.includes('invoiced')) {
        domain.push(['account_move', '!=', false]);
      }
      if (filters.includes('not_invoiced')) {
        domain.push(['account_move', '=', false]);
      }
    }

    const response = await axios.post(`${getOdooUrl()}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'pos.order',
        method: 'search_read',
        args: [domain],
        kwargs: {
          fields: ['id', 'name', 'partner_id', 'user_id', 'date_order', 'amount_total', 'amount_tax', 'state', 'lines', 'session_id', 'payment_ids', 'config_id', 'employee_id', 'account_move'],
          order: 'date_order desc',
        },
      },
      id: new Date().getTime(),
    }, { headers: { 'Content-Type': 'application/json' } });

    if (response.data && response.data.error) {
      console.error('[FETCH SALES REPORT] Odoo error:', response.data.error);
      return { error: response.data.error };
    }

    const orders = response.data.result || [];
    console.log('[FETCH SALES REPORT] Retrieved orders count:', orders.length);
    console.log('[FETCH SALES REPORT] Orders with states:', orders.map(o => ({ name: o.name, state: o.state, amount: o.amount_total })));

    // Calculate summary statistics
    const totalSales = orders.reduce((sum, order) => sum + (order.amount_total || 0), 0);
    const totalOrders = orders.length;
    const averageOrder = totalOrders > 0 ? totalSales / totalOrders : 0;
    const totalTax = orders.reduce((sum, order) => sum + (order.amount_tax || 0), 0);

    return {
      orders,
      summary: {
        totalSales,
        totalOrders,
        averageOrder,
        totalTax,
      }
    };
  } catch (error) {
    console.error('fetchSalesReportData error:', error);
    throw error;
  }
};

// Fetch top selling products. When `full` is true, returns every product that
// had at least one line in the date range (no top-N slice) — used by the
// Sales Report pivot. Default behaviour stays a top-N slice for the dashboard.
// State filter aligned with fetchSalesReportData (paid/done/invoiced) so the
// per-product breakdown matches the overall totals.
export const fetchTopProducts = async ({ startDate = null, endDate = null, limit = 10, full = false } = {}) => {
  try {
    // Aligned with fetchSalesReportData: "Not Cancelled" filter to mirror
    // Odoo's Orders Analysis default. Includes draft / paid / done / invoiced.
    let domain = [];

    if (startDate && endDate) {
      domain = [
        ['order_id.date_order', '>=', startDate],
        ['order_id.date_order', '<=', endDate],
        ['order_id.state', '!=', 'cancel'],
      ];
    } else {
      domain = [['order_id.state', '!=', 'cancel']];
    }

    const response = await axios.post(`${getOdooUrl()}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'pos.order.line',
        method: 'search_read',
        args: [domain],
        kwargs: {
          fields: ['product_id', 'order_id', 'qty', 'price_subtotal', 'price_subtotal_incl'],
          limit: full ? 100000 : 1000,
        },
      },
      id: new Date().getTime(),
    }, { headers: { 'Content-Type': 'application/json' } });

    if (response.data && response.data.error) {
      console.error('[FETCH TOP PRODUCTS] Odoo error:', response.data.error);
      return { error: response.data.error };
    }

    const orderLines = response.data.result || [];

    // Aggregate by product, tracking distinct order_id count alongside qty/revenue.
    const productMap = {};
    orderLines.forEach(line => {
      const productId = Array.isArray(line.product_id) ? line.product_id[0] : line.product_id;
      const productName = Array.isArray(line.product_id) ? line.product_id[1] : 'Unknown Product';
      const orderId = Array.isArray(line.order_id) ? line.order_id[0] : line.order_id;

      if (!productMap[productId]) {
        productMap[productId] = {
          id: productId,
          name: productName,
          quantity: 0,
          revenue: 0,
          _orderIds: new Set(),
        };
      }

      productMap[productId].quantity += line.qty || 0;
      productMap[productId].revenue += line.price_subtotal_incl || 0;
      if (orderId != null) productMap[productId]._orderIds.add(orderId);
    });

    // Materialise distinct-order count and shed the Set before returning.
    const aggregated = Object.values(productMap)
      .map((p) => ({
        id: p.id,
        name: p.name,
        quantity: p.quantity,
        revenue: p.revenue,
        order_count: p._orderIds.size,
      }))
      .sort((a, b) => b.revenue - a.revenue);

    const topProducts = full ? aggregated : aggregated.slice(0, limit);

    console.log('[FETCH TOP PRODUCTS] Top products count:', topProducts.length, full ? '(full)' : `(top ${limit})`);
    return topProducts;
  } catch (error) {
    console.error('fetchTopProducts error:', error);
    throw error;
  }
};

// Fetch the order lines for a single product within a date range. Used by the
// Sales Report pivot's drill-down Modal — tap an Order count cell → see the
// underlying order lines. Includes related pos.order fields via dot-notation.
export const fetchOrderLinesForProduct = async ({ startDate = null, endDate = null, productId } = {}) => {
  if (!productId) return [];
  try {
    // Aligned with fetchSalesReportData / fetchTopProducts: "Not Cancelled".
    let domain = [['product_id', '=', productId]];
    if (startDate && endDate) {
      domain.push(['order_id.date_order', '>=', startDate]);
      domain.push(['order_id.date_order', '<=', endDate]);
    }
    domain.push(['order_id.state', '!=', 'cancel']);

    const response = await axios.post(`${getOdooUrl()}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'pos.order.line',
        method: 'search_read',
        args: [domain],
        kwargs: {
          fields: ['order_id', 'qty', 'price_subtotal_incl'],
          limit: 10000,
        },
      },
      id: new Date().getTime(),
    }, { headers: { 'Content-Type': 'application/json' } });

    if (response.data && response.data.error) {
      console.error('[FETCH ORDER LINES FOR PRODUCT] Odoo error:', response.data.error);
      return [];
    }
    const lines = response.data.result || [];

    // Collect distinct order_ids and fetch their summary fields in one read.
    const orderIds = Array.from(new Set(
      lines.map((l) => (Array.isArray(l.order_id) ? l.order_id[0] : l.order_id)).filter((x) => x != null)
    ));
    if (orderIds.length === 0) return [];

    const ordersResp = await axios.post(`${getOdooUrl()}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'pos.order',
        method: 'read',
        args: [orderIds, ['name', 'date_order', 'state', 'partner_id', 'amount_total']],
        kwargs: {},
      },
      id: new Date().getTime(),
    }, { headers: { 'Content-Type': 'application/json' } });

    const orderMeta = {};
    (ordersResp.data?.result || []).forEach((o) => { orderMeta[o.id] = o; });

    return lines.map((l) => {
      const oid = Array.isArray(l.order_id) ? l.order_id[0] : l.order_id;
      const meta = orderMeta[oid] || {};
      return {
        order_id: oid,
        order_name: meta.name || '',
        date_order: meta.date_order || '',
        state: meta.state || '',
        partner_id: meta.partner_id || null,
        qty: l.qty || 0,
        line_total: l.price_subtotal_incl || 0,
        order_total: meta.amount_total || 0,
      };
    }).sort((a, b) => (a.date_order < b.date_order ? 1 : -1));
  } catch (error) {
    console.error('fetchOrderLinesForProduct error:', error);
    return [];
  }
};

// Fetch sales by salesperson
export const fetchSalesByUser = async ({ startDate = null, endDate = null } = {}) => {
  try {
    let domain = [];

    if (startDate && endDate) {
      domain = [
        ['date_order', '>=', startDate],
        ['date_order', '<=', endDate],
        ['state', '!=', 'cancel']
      ];
    } else {
      domain = [['state', '!=', 'cancel']];
    }

    const response = await axios.post(`${getOdooUrl()}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'pos.order',
        method: 'search_read',
        args: [domain],
        kwargs: {
          fields: ['user_id', 'amount_total'],
        },
      },
      id: new Date().getTime(),
    }, { headers: { 'Content-Type': 'application/json' } });

    if (response.data && response.data.error) {
      console.error('[FETCH SALES BY USER] Odoo error:', response.data.error);
      return { error: response.data.error };
    }

    const orders = response.data.result || [];

    // Aggregate by user
    const userMap = {};
    orders.forEach(order => {
      const userId = Array.isArray(order.user_id) ? order.user_id[0] : order.user_id;
      const userName = Array.isArray(order.user_id) ? order.user_id[1] : 'Unknown User';

      if (!userMap[userId]) {
        userMap[userId] = {
          id: userId,
          name: userName,
          totalSales: 0,
          orderCount: 0,
        };
      }

      userMap[userId].totalSales += order.amount_total || 0;
      userMap[userId].orderCount += 1;
    });

    // Convert to array and sort by sales
    const salesByUser = Object.values(userMap)
      .sort((a, b) => b.totalSales - a.totalSales);

    console.log('[FETCH SALES BY USER] Users count:', salesByUser.length);
    return salesByUser;
  } catch (error) {
    console.error('fetchSalesByUser error:', error);
    throw error;
  }
};

// Fetch sales by category (like Odoo 19 Category Report)
export const fetchSalesByCategory = async ({ startDate = null, endDate = null } = {}) => {
  try {
    let domain = [];

    if (startDate && endDate) {
      domain = [
        ['order_id.date_order', '>=', startDate],
        ['order_id.date_order', '<=', endDate],
        ['order_id.state', '!=', 'cancel']
      ];
    } else {
      domain = [['order_id.state', '!=', 'cancel']];
    }

    const response = await axios.post(`${getOdooUrl()}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'pos.order.line',
        method: 'search_read',
        args: [domain],
        kwargs: {
          fields: ['product_id', 'qty', 'price_subtotal', 'price_subtotal_incl'],
          limit: 2000,
        },
      },
      id: new Date().getTime(),
    }, { headers: { 'Content-Type': 'application/json' } });

    if (response.data && response.data.error) {
      console.error('[FETCH SALES BY CATEGORY] Odoo error:', response.data.error);
      return { error: response.data.error };
    }

    const orderLines = response.data.result || [];

    // For now, we'll group by product since category requires additional API call
    // In a full implementation, you'd fetch product.template with categ_id
    const categoryMap = {
      'All Products': {
        name: 'All Products',
        quantity: 0,
        revenue: 0,
      }
    };

    orderLines.forEach(line => {
      categoryMap['All Products'].quantity += line.qty || 0;
      categoryMap['All Products'].revenue += line.price_subtotal_incl || 0;
    });

    const categorySales = Object.values(categoryMap);
    console.log('[FETCH SALES BY CATEGORY] Categories:', categorySales.length);
    return categorySales;
  } catch (error) {
    console.error('fetchSalesByCategory error:', error);
    throw error;
  }
};

// Fetch payment methods breakdown (like Odoo 19 Payment Report)
export const fetchPaymentMethods = async ({ startDate = null, endDate = null } = {}) => {
  try {
    let domain = [];

    if (startDate && endDate) {
      domain = [
        ['payment_date', '>=', startDate],
        ['payment_date', '<=', endDate],
      ];
    }

    const response = await axios.post(`${getOdooUrl()}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'pos.payment',
        method: 'search_read',
        args: [domain],
        kwargs: {
          fields: ['payment_method_id', 'amount'],
          limit: 1000,
        },
      },
      id: new Date().getTime(),
    }, { headers: { 'Content-Type': 'application/json' } });

    if (response.data && response.data.error) {
      console.error('[FETCH PAYMENT METHODS] Odoo error:', response.data.error);
      return { error: response.data.error };
    }

    const payments = response.data.result || [];

    // Aggregate by payment method
    const paymentMap = {};
    payments.forEach(payment => {
      const methodId = Array.isArray(payment.payment_method_id) ? payment.payment_method_id[0] : payment.payment_method_id;
      const methodName = Array.isArray(payment.payment_method_id) ? payment.payment_method_id[1] : 'Unknown Method';

      if (!paymentMap[methodId]) {
        paymentMap[methodId] = {
          id: methodId,
          name: methodName,
          total: 0,
          count: 0,
        };
      }

      paymentMap[methodId].total += payment.amount || 0;
      paymentMap[methodId].count += 1;
    });

    const paymentMethods = Object.values(paymentMap)
      .sort((a, b) => b.total - a.total);

    console.log('[FETCH PAYMENT METHODS] Methods count:', paymentMethods.length);
    return paymentMethods;
  } catch (error) {
    console.error('fetchPaymentMethods error:', error);
    throw error;
  }
};

// Fetch company currency symbol
export const fetchCompanyCurrency = async () => {
  try {
    console.log('[FETCH CURRENCY] Fetching company currency...');

    // Get the main company (usually ID 1, but we'll fetch it properly)
    const response = await axios.post(`${getOdooUrl()}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'res.company',
        method: 'search_read',
        args: [[]],
        kwargs: {
          fields: ['currency_id'],
          limit: 1,
        },
      },
      id: new Date().getTime(),
    }, { headers: { 'Content-Type': 'application/json' } });

    if (response.data && response.data.error) {
      console.error('[FETCH CURRENCY] Odoo error:', response.data.error);
      return { symbol: '', name: '', position: 'before' }; // Fallback
    }

    const companies = response.data.result || [];
    if (companies.length === 0) {
      console.warn('[FETCH CURRENCY] No company found, using fallback');
      return { symbol: '', name: '', position: 'before' };
    }

    const currencyId = Array.isArray(companies[0].currency_id)
      ? companies[0].currency_id[0]
      : companies[0].currency_id;

    // Now fetch currency details
    const currencyResponse = await axios.post(`${getOdooUrl()}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'res.currency',
        method: 'read',
        args: [[currencyId]],
        kwargs: {
          fields: ['symbol', 'name', 'position'],
        },
      },
      id: new Date().getTime(),
    }, { headers: { 'Content-Type': 'application/json' } });

    if (currencyResponse.data && currencyResponse.data.error) {
      console.error('[FETCH CURRENCY] Currency read error:', currencyResponse.data.error);
      return { symbol: '', name: '', position: 'before' };
    }

    const currencyData = currencyResponse.data.result[0];
    const currencyInfo = {
      symbol: currencyData.symbol || currencyData.name || '',
      name: currencyData.name || '',
      position: currencyData.position || 'before', // 'before' or 'after'
    };

    console.log('[FETCH CURRENCY] Currency fetched:', currencyInfo);
    return currencyInfo;
  } catch (error) {
    console.error('fetchCompanyCurrency error:', error);
    return { symbol: '', name: '', position: 'before' }; // Fallback
  }
};

// Letterhead fields from res.company — used by the receipt viewer header
// (Expense screens) so attached receipts show the company name + address
// instead of the auto-generated filename. Cached at login; refreshed on
// next login if the admin edits the company record.
export const fetchCompanyProfileOdoo = async (companyId) => {
  if (!companyId) return null;
  try {
    const resp = await axios.post(`${getOdooUrl()}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'res.company',
        method: 'read',
        args: [[Number(companyId)], [
          'name', 'street', 'street2', 'city',
          'state_id', 'zip', 'country_id', 'phone', 'email',
        ]],
        kwargs: {},
      },
    }, { headers: { 'Content-Type': 'application/json' }, timeout: 15000 });
    if (resp.data?.error) {
      console.warn('fetchCompanyProfileOdoo error:', resp.data.error?.data?.message);
      return null;
    }
    const c = resp.data?.result?.[0];
    if (!c) return null;
    return {
      name: c.name || '',
      street: c.street || '',
      street2: c.street2 || '',
      city: c.city || '',
      state: Array.isArray(c.state_id) ? c.state_id[1] : '',
      zip: c.zip || '',
      country: Array.isArray(c.country_id) ? c.country_id[1] : '',
      phone: c.phone || '',
      email: c.email || '',
    };
  } catch (e) {
    console.warn('fetchCompanyProfileOdoo failed:', e?.message);
    return null;
  }
};

// Fresh display name + login for the currently-logged-in Odoo user. Used by
// useAuthStore.refreshUserProfile() so an admin rename in Odoo reflects on
// the receipt's "Cashier: …" line without requiring a logout.
export const fetchUserProfileOdoo = async (uid) => {
  if (!uid) return null;
  try {
    const resp = await axios.post(`${getOdooUrl()}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'res.users',
        method: 'read',
        args: [[Number(uid)], ['name', 'login']],
        kwargs: {},
      },
    }, { headers: { 'Content-Type': 'application/json' }, timeout: 10000 });
    if (resp.data?.error) {
      console.warn('fetchUserProfileOdoo error:', resp.data.error?.data?.message);
      return null;
    }
    const u = resp.data?.result?.[0];
    if (!u) return null;
    return { name: u.name || '', login: u.login || '' };
  } catch (e) {
    console.warn('fetchUserProfileOdoo failed:', e?.message);
    return null;
  }
};

// Banner CRUD against the custom `app.banner` Odoo module
// ([odoo modules/app_banner/]). Mirrors the working pattern from
// employee_attendance — every call has an explicit axios timeout so a
// stalled Odoo doesn't leave the Save button hanging on "Saving…"
// forever, and every call logs entry / success / error with an
// [AppBanner] prefix so failures are obvious in the JS console.

// One central error log so all six helpers surface failures the same way.
// `url` is appended so a Network Error explicitly tells you which host the
// request was aimed at — catches the http/https typo at login.
const _logBannerError = (op, error) => {
  const odooMsg = error?.response?.data?.error?.data?.message;
  const status = error?.response?.status;
  console.error(`[AppBanner] ${op} error:`, error?.message || error, {
    code: error?.code,
    status,
    odooMessage: odooMsg,
    url: getOdooUrl(),
  });
};

// Fetch active home-screen banners. Returns:
//   [{ id, name, sequence, image }]  — image is raw base64, no `data:` prefix
// Returns [] on any failure so the carousel falls back to bundled images.
export const fetchAppBannersOdoo = async () => {
  try {
    console.log(`[AppBanner] fetchActive calling, url=${getOdooUrl()}`);
    const response = await axios.post(`${getOdooUrl()}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'app.banner',
        method: 'search_read',
        args: [[['active', '=', true]]],
        kwargs: {
          fields: ['id', 'name', 'sequence', 'image'],
          order: 'sequence asc, id asc',
        },
      },
      id: new Date().getTime(),
    }, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 15000,
    });
    if (response.data?.error) {
      const msg = response.data.error?.data?.message || response.data.error?.message || '';
      console.warn('[AppBanner] fetchActive Odoo error:', msg);
      return [];
    }
    const rows = (response.data.result || [])
      .filter((r) => !!r.image)
      .map((r) => ({
        id: r.id,
        name: r.name || '',
        sequence: r.sequence ?? 0,
        image: r.image,
      }));
    console.log(`[AppBanner] fetchActive ok, rows=${rows.length}`);
    return rows;
  } catch (error) {
    _logBannerError('fetchActive', error);
    return [];
  }
};

// Admin-list variant: returns ALL banners (active + inactive), keeps
// rows even if no image yet so the admin can see and fix incomplete
// records.
export const fetchAllAppBannersOdoo = async () => {
  try {
    console.log(`[AppBanner] fetchAll calling, url=${getOdooUrl()}`);
    const response = await axios.post(`${getOdooUrl()}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'app.banner',
        method: 'search_read',
        args: [[]],
        kwargs: {
          fields: ['id', 'name', 'sequence', 'active', 'image'],
          order: 'sequence asc, id asc',
          // active_test:false disables Odoo's implicit `active=True`
          // filter so deactivated banners still show up in the in-app
          // admin list (greyed). Without this, the carousel and admin
          // list would behave identically and admins would think
          // deactivation deleted the row.
          context: { active_test: false },
        },
      },
      id: new Date().getTime(),
    }, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 15000,
    });
    if (response.data?.error) {
      console.warn('[AppBanner] fetchAll Odoo error:', response.data.error);
      return { error: response.data.error };
    }
    const rows = (response.data.result || []).map((r) => ({
      id: r.id,
      name: r.name || '',
      sequence: r.sequence ?? 0,
      active: !!r.active,
      image: r.image || null,
    }));
    console.log(`[AppBanner] fetchAll ok, rows=${rows.length}`);
    return rows;
  } catch (error) {
    _logBannerError('fetchAll', error);
    throw error;
  }
};

// Single-banner read used by the edit form to pre-fill state.
export const fetchAppBannerByIdOdoo = async (bannerId) => {
  try {
    const id = Number(bannerId);
    if (!id) return null;
    console.log(`[AppBanner] readById calling, id=${id}, url=${getOdooUrl()}`);
    const response = await axios.post(`${getOdooUrl()}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'app.banner',
        method: 'read',
        args: [[id]],
        kwargs: { fields: ['id', 'name', 'sequence', 'active', 'image', 'image_filename'] },
      },
      id: new Date().getTime(),
    }, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 15000,
    });
    if (response.data?.error) {
      console.error('[AppBanner] readById Odoo error:', response.data.error);
      return null;
    }
    const row = response.data.result?.[0] || null;
    const imgKB = row?.image ? Math.round(row.image.length / 1024) : 0;
    console.log(`[AppBanner] readById ok, id=${id}, imageKB=${imgKB}, name="${row?.name || ''}"`);
    return row;
  } catch (error) {
    _logBannerError('readById', error);
    return null;
  }
};

export const createAppBannerOdoo = async ({
  name = '', image, image_filename = '', sequence = 10, active = true,
} = {}) => {
  try {
    if (!image) throw new Error('image is required');
    const vals = { name, image, image_filename, sequence: Number(sequence) || 10, active: !!active };
    const imgKB = Math.round(image.length / 1024);
    console.log(`[AppBanner] create calling, name="${name}", sequence=${vals.sequence}, active=${vals.active}, imageKB=${imgKB}, url=${getOdooUrl()}`);
    const response = await axios.post(`${getOdooUrl()}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'app.banner',
        method: 'create',
        args: [vals],
        kwargs: {},
      },
      id: new Date().getTime(),
    }, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000,
    });
    if (response.data?.error) {
      console.error('[AppBanner] create Odoo error:', response.data.error);
      return { error: response.data.error };
    }
    console.log(`[AppBanner] create ok, id=${response.data.result}`);
    return { result: response.data.result };
  } catch (error) {
    _logBannerError('create', error);
    return { error };
  }
};

// Partial update — only the fields actually passed get written, so the
// admin can toggle `active` without re-uploading the image.
export const updateAppBannerOdoo = async ({
  id, name, image, image_filename, sequence, active,
} = {}) => {
  try {
    const bid = Number(id);
    if (!bid) throw new Error('id is required');
    const vals = {};
    if (name !== undefined) vals.name = name;
    if (image !== undefined) vals.image = image;
    if (image_filename !== undefined) vals.image_filename = image_filename;
    if (sequence !== undefined) vals.sequence = Number(sequence) || 10;
    if (active !== undefined) vals.active = !!active;
    const imgKB = image !== undefined ? Math.round((image || '').length / 1024) : null;
    console.log(`[AppBanner] update calling, id=${bid}, keys=[${Object.keys(vals).join(',')}], imageKB=${imgKB ?? 'unchanged'}, url=${getOdooUrl()}`);
    const response = await axios.post(`${getOdooUrl()}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'app.banner',
        method: 'write',
        args: [[bid], vals],
        kwargs: {},
      },
      id: new Date().getTime(),
    }, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000,
    });
    if (response.data?.error) {
      console.error('[AppBanner] update Odoo error:', response.data.error);
      return { error: response.data.error };
    }
    console.log(`[AppBanner] update ok, id=${bid}, result=${!!response.data.result}`);
    return { result: !!response.data.result };
  } catch (error) {
    _logBannerError('update', error);
    return { error };
  }
};

export const deleteAppBannerOdoo = async (bannerId) => {
  try {
    const id = Number(bannerId);
    if (!id) throw new Error('id is required');
    console.log(`[AppBanner] delete calling, id=${id}, url=${getOdooUrl()}`);
    const response = await axios.post(`${getOdooUrl()}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'app.banner',
        method: 'unlink',
        args: [[id]],
        kwargs: {},
      },
      id: new Date().getTime(),
    }, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 15000,
    });
    if (response.data?.error) {
      console.error('[AppBanner] delete Odoo error:', response.data.error);
      return { error: response.data.error };
    }
    console.log(`[AppBanner] delete ok, id=${id}`);
    return { result: !!response.data.result };
  } catch (error) {
    _logBannerError('delete', error);
    return { error };
  }
};

// ─── hr.expense helpers ─────────────────────────────────────────────────────

// Resolve the logged-in res.users to its hr.employee id. Returns null if the
// user has no linked employee record (which means hr.expense filing won't
// work — the caller should surface a helpful toast).
export const fetchCurrentEmployeeIdOdoo = async (uid) => {
  if (!uid) return null;
  try {
    const resp = await axios.post(`${getOdooUrl()}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'hr.employee',
        method: 'search_read',
        args: [[['user_id', '=', Number(uid)]]],
        kwargs: { fields: ['id', 'name'], limit: 1 },
      },
    }, { headers: { 'Content-Type': 'application/json' } });
    if (resp.data && resp.data.error) {
      console.warn('fetchCurrentEmployeeIdOdoo error:', resp.data.error?.data?.message);
      return null;
    }
    const row = (resp.data.result || [])[0];
    return row ? { id: row.id, name: row.name } : null;
  } catch (e) {
    console.warn('fetchCurrentEmployeeIdOdoo failed:', e?.message);
    return null;
  }
};

// product.product rows that can be picked as an expense category.
export const fetchExpenseCategoriesOdoo = async () => {
  try {
    const resp = await axios.post(`${getOdooUrl()}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'product.product',
        method: 'search_read',
        args: [[['can_be_expensed', '=', true]]],
        kwargs: { fields: ['id', 'name', 'default_code', 'list_price'], order: 'name asc', limit: 200 },
      },
    }, { headers: { 'Content-Type': 'application/json' } });
    if (resp.data && resp.data.error) return [];
    return (resp.data.result || []).map((p) => ({
      id: p.id,
      name: p.default_code ? `[${p.default_code}] ${p.name}` : p.name,
      list_price: Number(p.list_price) || 0,
    }));
  } catch (e) {
    console.warn('fetchExpenseCategoriesOdoo failed:', e?.message);
    return [];
  }
};

// hr.expense.payment.method rows for the company-scoped dropdown on the
// New Expense form. Mirrors the configurable payment methods exposed in
// Odoo under Expenses > Configuration > Payment Methods (hr_expense_payment_method module).
export const fetchExpensePaymentMethodsOdoo = async () => {
  try {
    const resp = await axios.post(`${getOdooUrl()}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'hr.expense.payment.method',
        method: 'search_read',
        args: [[['active', '=', true]]],
        kwargs: { fields: ['id', 'name', 'is_default'], order: 'sequence asc, id asc', limit: 200 },
      },
    }, { headers: { 'Content-Type': 'application/json' } });
    if (resp.data && resp.data.error) {
      console.warn('fetchExpensePaymentMethodsOdoo error:', resp.data.error?.data?.message);
      return [];
    }
    return (resp.data.result || []).map((m) => ({
      id: m.id,
      name: m.name,
      is_default: !!m.is_default,
    }));
  } catch (e) {
    console.warn('fetchExpensePaymentMethodsOdoo failed:', e?.message);
    return [];
  }
};

// Odoo's hr.expense.state values shifted in newer versions: legacy DBs use
// 'reported' for submitted-but-not-approved expenses and 'done' for the
// reimbursed/paid state, while Odoo 17+ uses 'submitted' and 'paid'. Map
// each canonical chip key to BOTH so the same code works on either schema
// without forcing the operator to configure a flag. Used by both the list
// fetcher and the totals fetcher.
const HR_EXPENSE_STATE_ALIASES = {
  reported:  ['reported', 'submitted'],
  submitted: ['reported', 'submitted'],
  done:      ['done', 'paid'],
  paid:      ['done', 'paid'],
};

// List of hr.expense rows for the current employee. Optional state filter
// ('draft' | 'reported'/'submitted' | 'approved' | 'done'/'paid' | 'refused')
// and a free-text search across the description.
export const fetchExpensesOdoo = async ({ employeeId, searchText = '', state = null, startDate = null, endDate = null, offset = 0, limit = 50 } = {}) => {
  const baseUrl = getOdooUrl();
  // No explicit employee filter by default — let Odoo's own access rules
  // decide what the logged-in user can see. Admins/managers see every
  // employee's expenses (matching Odoo's "My Expenses" admin view); regular
  // employees see only their own because of Odoo's record-rule on
  // hr.expense. Pass `employeeId` only when the screen explicitly wants to
  // narrow further.
  let domain = [];
  if (employeeId) {
    domain = domain.concat([['employee_id', '=', Number(employeeId)]]);
  }
  if (searchText && String(searchText).trim()) {
    const term = String(searchText).trim();
    domain = domain.concat([['name', 'ilike', term]]);
  }
  if (state) {
    const states = HR_EXPENSE_STATE_ALIASES[state] || [state];
    domain = domain.concat([['state', 'in', states]]);
  }
  // Date-range narrowing on hr.expense.date (the expense date — same field
  // the row meta + list view show). Drives the All Time / 7 Days / 30 Days
  // / Custom chip row on the Expenses screen.
  if (startDate) domain = domain.concat([['date', '>=', startDate]]);
  if (endDate)   domain = domain.concat([['date', '<=', endDate]]);
  // Three-step fetch:
  //   1. richFields  — everything (works on Odoo 14–17 with sheets)
  //   2. midFields   — drops `sheet_id` (Odoo 18+ removed it) but keeps
  //                    duplicate_expense_ids + message_attachment_count
  //                    so the paperclip + duplicate banner still work
  //   3. safeFields  — bare minimum, used only when a third field is
  //                    rejected (e.g. duplicate_expense_ids on a tiny
  //                    custom Odoo)
  // Without the middle step, an Odoo 19 server rejecting `sheet_id`
  // would fall straight to safeFields and the attachment-count chip on
  // the list would disappear.
  const baseFields = [
    'id', 'name', 'date', 'product_id', 'employee_id',
    'total_amount', 'payment_mode', 'state', 'description',
  ];
  const richFields = [
    ...baseFields,
    'sheet_id',
    'duplicate_expense_ids',
    'message_attachment_count',
    'payment_method_id',
  ];
  const midFields = [
    ...baseFields,
    'duplicate_expense_ids',
    'message_attachment_count',
    'payment_method_id',
  ];
  const safeFields = baseFields;

  const callRead = async (fields) => {
    const resp = await axios.post(`${baseUrl}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'hr.expense',
        method: 'search_read',
        args: [domain],
        kwargs: { fields, order: 'date desc, id desc', offset, limit },
      },
    }, { headers: { 'Content-Type': 'application/json' } });
    if (resp.data && resp.data.error) {
      const e = new Error('Odoo JSON-RPC error');
      e.payload = resp.data.error;
      throw e;
    }
    return resp.data.result || [];
  };

  let raw = [];
  try {
    raw = await callRead(richFields);
  } catch (err) {
    // Odoo 18+ rejects `sheet_id`. Retry with midFields, which keeps
    // duplicate_expense_ids and message_attachment_count so the
    // paperclip chip and duplicate banner still work.
    console.warn(
      'fetchExpensesOdoo rich fetch failed, retrying without sheet_id:',
      err?.payload?.data?.message || err?.message
    );
    try {
      raw = await callRead(midFields);
    } catch (err2) {
      // A third field is rejected too (rare — e.g. duplicate_expense_ids
      // missing on a stripped Odoo). Drop everything beyond the base
      // shape; the list still renders, just without paperclip + banner.
      console.warn(
        'fetchExpensesOdoo mid fetch failed, retrying without optional fields:',
        err2?.payload?.data?.message || err2?.message
      );
      try {
        raw = await callRead(safeFields);
      } catch (err3) {
        console.error('fetchExpensesOdoo safe fetch also failed:', err3?.payload?.data?.message || err3?.message);
        return [];
      }
    }
  }

  // Diagnostic: tells us whether `payment_method_id` is even a key in the
  // server response (vs missing because rich tier was rejected and we fell
  // through to safe fields). Remove once the flow is verified.
  console.log('[EXPENSE:LIST] sample row keys=' + (raw[0] ? Object.keys(raw[0]).join(',') : '<empty>'));
  console.log('[EXPENSE:LIST] sample row payment_method_id =', raw[0]?.payment_method_id);
  try {
    return raw.map((e) => ({
      id: e.id,
      name: e.name || '',
      date: e.date || null,
      category: Array.isArray(e.product_id) ? { id: e.product_id[0], name: e.product_id[1] } : null,
      employee: Array.isArray(e.employee_id) ? { id: e.employee_id[0], name: e.employee_id[1] } : null,
      total_amount: Number(e.total_amount) || 0,
      payment_mode: e.payment_mode || 'own_account',
      state: e.state || 'draft',
      description: e.description || '',
      // [id, name] tuple when the expense has been submitted (creates a
      // sheet); false otherwise. Used by the detail screen to dispatch
      // approve/refuse/reset against the right sheet.
      sheet_id: Array.isArray(e.sheet_id) ? e.sheet_id[0] : null,
      // Other expenses sharing this receipt — drives the yellow
      // "An expense with the same receipt already exists" banner.
      duplicate_expense_ids: Array.isArray(e.duplicate_expense_ids) ? e.duplicate_expense_ids : [],
      // Number of attached files; rendered as a paperclip + count on
      // the list row (matches Odoo's web list view).
      message_attachment_count: Number(e.message_attachment_count) || 0,
      // Many2one to hr.expense.payment.method (hr_expense_payment_method
      // module). Odoo returns [id, name] or false; pass through as-is so
      // callers can do Array.isArray(...) ? ...[1] : null.
      payment_method_id: e.payment_method_id || false,
    }));
  } catch (e) {
    console.warn('fetchExpensesOdoo failed:', e?.message);
    return [];
  }
};

// Read a single hr.expense by id with the same shape fetchExpensesOdoo
// returns. Used to refresh the detail screen instantly after a workflow
// action (Approve/Refuse/Reset/Post) without paging the whole list.
// Same defensive richFields → safeFields fallback so it survives field
// removals across Odoo versions.
export const fetchExpenseByIdOdoo = async (expenseId) => {
  if (!expenseId) return null;
  const baseUrl = getOdooUrl();
  const richFields = [
    'id', 'name', 'date', 'product_id', 'employee_id',
    'total_amount', 'payment_mode', 'state', 'description',
    'sheet_id', 'duplicate_expense_ids', 'message_attachment_count',
    'payment_method_id',
  ];
  // Odoo 19 dropped `sheet_id` from hr.expense, so the rich tier always
  // throws "Invalid field 'sheet_id'" on that server. Mid keeps every
  // other useful field — most importantly `payment_method_id` — so the
  // detail screen still has it after a workflow-action refresh. Matches
  // the same three-tier ladder fetchExpensesOdoo uses.
  const midFields = [
    'id', 'name', 'date', 'product_id', 'employee_id',
    'total_amount', 'payment_mode', 'state', 'description',
    'duplicate_expense_ids', 'message_attachment_count',
    'payment_method_id',
  ];
  const safeFields = [
    'id', 'name', 'date', 'product_id', 'employee_id',
    'total_amount', 'payment_mode', 'state', 'description',
  ];
  const callRead = async (fields) => {
    const resp = await axios.post(`${baseUrl}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'hr.expense',
        method: 'read',
        args: [[Number(expenseId)], fields],
        kwargs: {},
      },
    }, { headers: { 'Content-Type': 'application/json' } });
    if (resp.data && resp.data.error) {
      const e = new Error('Odoo JSON-RPC error');
      e.payload = resp.data.error;
      throw e;
    }
    return resp.data.result || [];
  };

  let raw = [];
  let tier = 'rich';
  try {
    raw = await callRead(richFields);
  } catch (richErr) {
    // Was swallowed before — surface so we can see WHY rich failed and we
    // dropped tiers. Odoo 19 reliably trips here on `sheet_id`.
    console.warn('[EXPENSE:DETAIL] rich read failed:', {
      message: richErr?.payload?.data?.message || richErr?.message,
      name: richErr?.payload?.data?.name,
    });
    tier = 'mid';
    try {
      raw = await callRead(midFields);
    } catch (midErr) {
      // Rare — only if a field beyond sheet_id is also rejected (e.g.
      // stripped Odoo missing duplicate_expense_ids).
      console.warn('[EXPENSE:DETAIL] mid read failed:', {
        message: midErr?.payload?.data?.message || midErr?.message,
        name: midErr?.payload?.data?.name,
      });
      tier = 'safe';
      try {
        raw = await callRead(safeFields);
      } catch (safeErr) {
        console.warn('[EXPENSE:DETAIL] safe read also failed:', safeErr?.message);
        return null;
      }
    }
  }
  const e = raw[0];
  if (!e) return null;
  // Diagnostic: distinguishes "row genuinely has no value" (false) from
  // "field missing from response — module not installed / safeFields fallback"
  // (undefined). Remove once the payment_method_id flow is verified end-to-end.
  console.log('[EXPENSE:DETAIL] tier=' + tier + ' keys=' + Object.keys(e).join(','));
  console.log('[EXPENSE:DETAIL] raw payment_method_id =', e?.payment_method_id);
  return {
    id: e.id,
    name: e.name || '',
    date: e.date || null,
    category: Array.isArray(e.product_id) ? { id: e.product_id[0], name: e.product_id[1] } : null,
    employee: Array.isArray(e.employee_id) ? { id: e.employee_id[0], name: e.employee_id[1] } : null,
    total_amount: Number(e.total_amount) || 0,
    payment_mode: e.payment_mode || 'own_account',
    state: e.state || 'draft',
    description: e.description || '',
    sheet_id: Array.isArray(e.sheet_id) ? e.sheet_id[0] : null,
    duplicate_expense_ids: Array.isArray(e.duplicate_expense_ids) ? e.duplicate_expense_ids : [],
    message_attachment_count: Number(e.message_attachment_count) || 0,
    payment_method_id: e.payment_method_id || false,
  };
};

// Returns { to_submit, waiting_approval, waiting_reimbursement } as numeric totals.
export const fetchExpenseTotalsOdoo = async ({ employeeId } = {}) => {
  const empty = { to_submit: 0, waiting_approval: 0, waiting_reimbursement: 0 };
  const baseUrl = getOdooUrl();
  // Same access-rule story as fetchExpensesOdoo — when no employeeId is
  // provided, let Odoo's record rules decide what the user can sum.
  // Accepts either a string (looked up in HR_EXPENSE_STATE_ALIASES) or
  // an array of literal state values (bypassing the alias map). The
  // literal form is needed for "Waiting Reimbursement" which must be
  // ONLY 'done' (posted, awaiting payment) and NOT 'paid' (final).
  //
  // The optional `options.ownAccountOnly` controls whether we narrow to
  // employee-paid (`own_account`) rows. Odoo's dashboard does this for
  // To Submit / Waiting Reimbursement (employee-side counters) but NOT
  // for Waiting Approval, which is a manager-side counter that includes
  // company-card expenses too.
  const sumFor = async (stateOrStates, options = {}) => {
    const states = Array.isArray(stateOrStates)
      ? stateOrStates
      : (HR_EXPENSE_STATE_ALIASES[stateOrStates] || [stateOrStates]);
    const domain = [['state', 'in', states]];
    if (options.ownAccountOnly !== false) {
      domain.push(['payment_mode', '=', 'own_account']);
    }
    if (employeeId) domain.unshift(['employee_id', '=', Number(employeeId)]);
    const resp = await axios.post(`${baseUrl}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'hr.expense',
        method: 'search_read',
        args: [domain],
        kwargs: { fields: ['total_amount'], limit: 5000 },
      },
    }, { headers: { 'Content-Type': 'application/json' } });
    if (resp.data && resp.data.error) return 0;
    return (resp.data.result || []).reduce((s, r) => s + (Number(r.total_amount) || 0), 0);
  };
  try {
    const [draft, reported, approved] = await Promise.all([
      sumFor('draft'),
      // Waiting Approval is a manager-side counter: it shows every
      // submitted expense regardless of payment_mode (employee-paid +
      // company-card). Odoo's web dashboard sums them all here.
      sumFor('reported', { ownAccountOnly: false }),
      // Odoo's "Waiting Reimbursement" totals own-account expenses in
      // state='approved' — manager approved, accountant has yet to post
      // and pay. Match what the user sees in Odoo's web dashboard.
      sumFor(['approved']),
    ]);
    return {
      to_submit: draft,
      waiting_approval: reported,
      waiting_reimbursement: approved,
    };
  } catch (e) {
    console.warn('fetchExpenseTotalsOdoo failed:', e?.message);
    return empty;
  }
};

// Create an hr.expense row (state stays 'draft' until submitted).
export const createExpenseOdoo = async ({ name, date, productId, totalAmount, paymentMode, description, employeeId, paymentMethodId } = {}) => {
  if (!name || !String(name).trim()) {
    return { error: { message: 'Description is required' } };
  }
  if (!employeeId) return { error: { message: 'No employee linked to your user' } };
  const baseUrl = getOdooUrl();
  const vals = {
    name: String(name).trim(),
    employee_id: Number(employeeId),
    payment_mode: paymentMode === 'company_account' ? 'company_account' : 'own_account',
  };
  if (date) vals.date = date;
  if (productId) vals.product_id = Number(productId);
  if (totalAmount !== undefined && totalAmount !== '' && totalAmount !== null) {
    vals.total_amount = Number(totalAmount) || 0;
  }
  if (description) vals.description = String(description).trim();
  if (paymentMethodId) vals.payment_method_id = Number(paymentMethodId);

  // Diagnostic: confirms the picker's selection made it into the create
  // payload. `undefined` here means the form submitted with a null picker.
  // Remove once the payment_method_id flow is verified end-to-end.
  console.log('[EXPENSE:CREATE] writing vals payment_method_id =', vals.payment_method_id);
  try {
    const resp = await axios.post(`${baseUrl}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: { model: 'hr.expense', method: 'create', args: [vals], kwargs: {} },
    }, { headers: { 'Content-Type': 'application/json' } });
    // Diagnostic: did Odoo accept the create? If errorName is set, the field
    // (or some other val) was rejected. If result is a number, the new id.
    console.log('[EXPENSE:CREATE] response =', JSON.stringify({
      result: resp?.data?.result,
      errorName: resp?.data?.error?.data?.name,
      errorMessage: resp?.data?.error?.data?.message || resp?.data?.error?.message,
    }));
    if (resp.data && resp.data.error) {
      return { error: resp.data.error };
    }
    return { result: resp.data.result };
  } catch (e) {
    console.error('createExpenseOdoo error:', e?.message);
    return { error: { message: e?.message || 'Create failed' } };
  }
};

// Update an existing hr.expense (only valid while state is 'draft').
export const updateExpenseOdoo = async (expenseId, { name, date, productId, totalAmount, paymentMode, description, paymentMethodId } = {}) => {
  if (!expenseId) return { error: { message: 'expenseId is required' } };
  const baseUrl = getOdooUrl();
  const vals = {};
  if (name !== undefined) vals.name = String(name).trim();
  if (date !== undefined) vals.date = date || false;
  if (productId !== undefined) vals.product_id = productId || false;
  if (totalAmount !== undefined && totalAmount !== '' && totalAmount !== null) {
    vals.total_amount = Number(totalAmount) || 0;
  }
  if (paymentMode !== undefined) {
    vals.payment_mode = paymentMode === 'company_account' ? 'company_account' : 'own_account';
  }
  if (description !== undefined) vals.description = description ? String(description).trim() : false;
  if (paymentMethodId !== undefined) vals.payment_method_id = paymentMethodId ? Number(paymentMethodId) : false;

  const writeOnce = async (payload) => {
    const resp = await axios.post(`${baseUrl}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: { model: 'hr.expense', method: 'write', args: [[expenseId], payload], kwargs: {} },
    }, { headers: { 'Content-Type': 'application/json' } });
    return resp.data;
  };

  try {
    const data = await writeOnce(vals);
    if (data && data.error) {
      const msg = data.error?.data?.message || data.error?.message || '';
      // Odoo 18+ renamed `total_amount` → `total_amount_currency` in some
      // configurations. If the write was rejected because of that field,
      // retry once with the alternate name. Same idea for `payment_mode`
      // which a few private modules rename to `payment_method`.
      const retryVals = { ...vals };
      let retryNeeded = false;
      if (/Invalid field 'total_amount'/i.test(msg) && 'total_amount' in retryVals) {
        retryVals.total_amount_currency = retryVals.total_amount;
        delete retryVals.total_amount;
        retryNeeded = true;
      }
      if (/Invalid field 'payment_mode'/i.test(msg) && 'payment_mode' in retryVals) {
        delete retryVals.payment_mode;
        retryNeeded = true;
      }
      if (retryNeeded) {
        const data2 = await writeOnce(retryVals);
        if (data2 && data2.error) return { error: data2.error };
        return { result: expenseId };
      }
      return { error: data.error };
    }
    return { result: expenseId };
  } catch (e) {
    console.error('updateExpenseOdoo error:', e?.message);
    return { error: { message: e?.message || 'Update failed' } };
  }
};

// Sum hr.expense for the period (shop-wide, NOT scoped by employee). Used by
// the Sales Report's P&L card to compute Net Profit.
export const fetchOperatingExpensesOdoo = async ({ startDate = null, endDate = null } = {}) => {
  const baseUrl = getOdooUrl();
  let domain = [];
  if (startDate) domain.push(['date', '>=', String(startDate).slice(0, 10)]);
  if (endDate) domain.push(['date', '<=', String(endDate).slice(0, 10)]);
  try {
    const resp = await axios.post(`${baseUrl}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'hr.expense',
        method: 'search_read',
        args: [domain],
        kwargs: { fields: ['total_amount'], limit: 5000 },
      },
    }, { headers: { 'Content-Type': 'application/json' } });
    if (resp.data && resp.data.error) {
      console.warn('fetchOperatingExpensesOdoo error:', resp.data.error?.data?.message);
      return { total: 0 };
    }
    const total = (resp.data.result || []).reduce((s, r) => s + (Number(r.total_amount) || 0), 0);
    return { total };
  } catch (e) {
    console.warn('fetchOperatingExpensesOdoo failed:', e?.message);
    return { total: 0 };
  }
};

// Compute revenue, COGS, gross profit, gross margin for paid/done/invoiced
// pos.order rows in the period.
export const fetchSalesProfitOdoo = async ({ startDate = null, endDate = null } = {}) => {
  const baseUrl = getOdooUrl();
  let domain = [['state', 'in', ['paid', 'done', 'invoiced']]];
  if (startDate) domain.push(['date_order', '>=', startDate]);
  if (endDate) domain.push(['date_order', '<=', endDate]);
  try {
    // 1) orders + their line refs + revenue
    const ordersResp = await axios.post(`${baseUrl}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'pos.order',
        method: 'search_read',
        args: [domain],
        kwargs: { fields: ['id', 'amount_total', 'lines'], limit: 5000 },
      },
    }, { headers: { 'Content-Type': 'application/json' } });
    if (ordersResp.data && ordersResp.data.error) {
      console.warn('fetchSalesProfitOdoo orders error:', ordersResp.data.error?.data?.message);
      return { revenue: 0, cogs: 0, gross_profit: 0, gross_margin_pct: 0 };
    }
    const orders = ordersResp.data.result || [];
    const revenue = orders.reduce((s, o) => s + (Number(o.amount_total) || 0), 0);
    const allLineIds = [];
    orders.forEach((o) => {
      if (Array.isArray(o.lines)) o.lines.forEach((id) => allLineIds.push(id));
    });
    if (allLineIds.length === 0) {
      return { revenue, cogs: 0, gross_profit: revenue, gross_margin_pct: revenue ? 100 : 0 };
    }

    // 2) read all lines (qty + product_id)
    const linesResp = await axios.post(`${baseUrl}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'pos.order.line',
        method: 'read',
        args: [allLineIds],
        kwargs: { fields: ['id', 'product_id', 'qty'] },
      },
    }, { headers: { 'Content-Type': 'application/json' } });
    if (linesResp.data && linesResp.data.error) {
      console.warn('fetchSalesProfitOdoo lines error:', linesResp.data.error?.data?.message);
      return { revenue, cogs: 0, gross_profit: revenue, gross_margin_pct: revenue ? 100 : 0 };
    }
    const lines = linesResp.data.result || [];
    const productIds = [...new Set(
      lines.map((l) => Array.isArray(l.product_id) ? l.product_id[0] : null).filter(Boolean)
    )];

    // 3) read product cost (standard_price); fall back to list_price if rejected
    let priceById = {};
    const callRead = async (fields) => {
      const r = await axios.post(`${baseUrl}/web/dataset/call_kw`, {
        jsonrpc: '2.0',
        method: 'call',
        params: {
          model: 'product.product',
          method: 'read',
          args: [productIds],
          kwargs: { fields },
        },
      }, { headers: { 'Content-Type': 'application/json' } });
      if (r.data && r.data.error) {
        const e = new Error('Odoo JSON-RPC error');
        e.payload = r.data.error;
        throw e;
      }
      return r.data.result || [];
    };
    let prodRows = [];
    try {
      prodRows = await callRead(['id', 'standard_price']);
    } catch (err) {
      console.warn('fetchSalesProfitOdoo standard_price rejected, falling back to list_price:',
        err?.payload?.data?.message || err?.message);
      try {
        prodRows = await callRead(['id', 'list_price']);
      } catch (err2) {
        prodRows = [];
      }
    }
    prodRows.forEach((p) => {
      priceById[p.id] = Number(p.standard_price ?? p.list_price ?? 0);
    });

    // 4) COGS = sum(line.qty * priceById[line.product_id])
    let cogs = 0;
    lines.forEach((l) => {
      const pid = Array.isArray(l.product_id) ? l.product_id[0] : null;
      const cost = priceById[pid] || 0;
      cogs += (Number(l.qty) || 0) * cost;
    });
    const gross_profit = revenue - cogs;
    const gross_margin_pct = revenue > 0 ? (gross_profit / revenue) * 100 : 0;
    return { revenue, cogs, gross_profit, gross_margin_pct };
  } catch (e) {
    console.warn('fetchSalesProfitOdoo failed:', e?.message);
    return { revenue: 0, cogs: 0, gross_profit: 0, gross_margin_pct: 0 };
  }
};

// Submit a draft expense → bundles into an hr.expense.sheet via the standard
// Odoo action. After this the expense moves to state='reported'.
// Tries multiple model/method candidates because Odoo renamed these between
// versions (17/18 → action_submit_expenses, 19 → action_submit, pre-18 sheet
// flow); same pattern as approve/refuse below.
export const submitExpenseOdoo = async (expenseId, sheetId = null) => {
  if (!expenseId) return { error: { message: 'expenseId is required' } };
  console.log(`[EXPENSE:SUBMIT] start id=${expenseId} sheetId=${sheetId ?? 'null'}`);
  const resp = await tryExpenseAction({
    expenseId,
    sheetId,
    candidates: [
      { model: 'hr.expense', method: 'action_submit_expenses' },
      { model: 'hr.expense', method: 'action_submit' },
      { model: 'hr.expense.sheet', method: 'action_submit_sheet' },
    ],
    // Odoo 19 renamed the submitted-state from 'reported' to 'submitted'.
    // Try the new name first, fall back to the old one for ≤18.
    fallbackState: ['submitted', 'reported'],
  });
  if (resp?.error) {
    console.error('[EXPENSE:SUBMIT] failed', {
      message: resp.error.message,
      name: resp.error.data?.name,
      odooMessage: resp.error.data?.message,
      debug: typeof resp.error.data?.debug === 'string'
        ? resp.error.data.debug.slice(0, 500)
        : undefined,
    });
  } else {
    console.log('[EXPENSE:SUBMIT] success result=', resp?.result);
  }
  return resp;
};

// Workflow-action dispatcher: tries each (model, method) candidate in
// order and returns the first one that succeeds. Older Odoo (≤17) puts
// the workflow methods on `hr.expense.sheet`; Odoo 18+ removed sheets
// and put them on `hr.expense`; Odoo 19 renamed several of those again.
// Encoding multiple candidates lets the same app code work against any
// of those schemas without a hard-coded version flag.
//
// Final fallback: when every named method 404s (Odoo 19 renamed enough
// of them that none of the names we know about work), fall back to
// writing the target state directly via `hr.expense.write({state: …})`.
// This skips the side-effects an action method would do (chatter
// messages, sheet creation, journal moves), but for plain state
// transitions it's a reasonable last resort that keeps the UI working.
// Odoo signals "the action method succeeded-but-rejected this record" via
// exceptions in the odoo.exceptions.* namespace (ValidationError, UserError,
// AccessError, MissingError). Those are real business outcomes and the
// caller needs to see them — falling through to the next candidate or the
// state-write fallback would mask the message with a confusing follow-on
// error (e.g. "Wrong value for hr.expense.state: 'reported'"). Everything
// else — AttributeError, KeyError, TypeError, RPC 404, etc. — means the
// method literally doesn't exist on this Odoo version and we should keep
// trying alternatives.
const isBusinessError = (err) => {
  const name = err?.data?.name || '';
  return typeof name === 'string' && name.startsWith('odoo.exceptions.');
};

const tryExpenseAction = async ({ expenseId, sheetId, candidates, kwargs = {}, fallbackState = null }) => {
  const baseUrl = getOdooUrl();
  let lastErr = null;
  for (const c of candidates) {
    const targetId = c.model === 'hr.expense.sheet' ? sheetId : expenseId;
    if (!targetId) {
      console.warn(`[EXPENSE:ACTION] skip ${c.model}.${c.method} — no ${c.model === 'hr.expense.sheet' ? 'sheetId' : 'expenseId'}`);
      continue;
    }
    console.log(`[EXPENSE:ACTION] trying ${c.model}.${c.method} id=${targetId}`);
    try {
      const resp = await axios.post(`${baseUrl}/web/dataset/call_kw`, {
        jsonrpc: '2.0',
        method: 'call',
        params: {
          model: c.model,
          method: c.method,
          args: [[targetId]],
          kwargs,
        },
      }, { headers: { 'Content-Type': 'application/json' } });
      if (resp.data && resp.data.error) {
        lastErr = resp.data.error;
        const errName = resp.data.error.data?.name;
        const errMsg = resp.data.error.data?.message || resp.data.error.message;
        console.warn(`[EXPENSE:ACTION] ${c.model}.${c.method} returned error`, {
          name: errName,
          message: errMsg,
        });
        // Real business-rule rejection — surface immediately so the user sees
        // why the action was refused instead of a misleading downstream error.
        if (isBusinessError(resp.data.error)) {
          console.warn(`[EXPENSE:ACTION] business error — not trying further candidates`);
          return { error: resp.data.error };
        }
        // "Method does not exist" / "Invalid field" — try the next candidate.
        continue;
      }
      console.log(`[EXPENSE:ACTION] ${c.model}.${c.method} ok`);
      return { result: resp.data.result };
    } catch (e) {
      lastErr = { message: e?.message || `${c.method} failed`, status: e?.response?.status };
      console.warn(`[EXPENSE:ACTION] ${c.model}.${c.method} threw`, {
        message: e?.message,
        status: e?.response?.status,
      });
      continue;
    }
  }

  // All method candidates failed (none of them existed on this Odoo).
  // Last-ditch: write state directly. The fallback accepts a list of state
  // values so we can try Odoo 19's renames first (e.g. 'submitted') and
  // fall back to older synonyms ('reported') when the Selection rejects.
  const fallbackStates = Array.isArray(fallbackState)
    ? fallbackState
    : (fallbackState ? [fallbackState] : []);
  for (const stateVal of fallbackStates) {
    if (!expenseId) break;
    try {
      console.log(`[EXPENSE:ACTION] fallback hr.expense.write({state: '${stateVal}'})`);
      const resp = await axios.post(`${baseUrl}/web/dataset/call_kw`, {
        jsonrpc: '2.0',
        method: 'call',
        params: {
          model: 'hr.expense',
          method: 'write',
          args: [[expenseId], { state: stateVal }],
          kwargs: {},
        },
      }, { headers: { 'Content-Type': 'application/json' } });
      if (resp.data && resp.data.error) {
        lastErr = resp.data.error;
        const errMsg = resp.data.error.data?.message || resp.data.error.message || '';
        // "Wrong value for hr.expense.state: '…'" → this Odoo doesn't accept
        // this state synonym; try the next one. Other errors (business rule,
        // permission) should surface to the caller.
        if (/Wrong value for hr\.expense\.state/i.test(errMsg)) {
          console.warn(`[EXPENSE:ACTION] state '${stateVal}' not accepted, trying next`);
          continue;
        }
        if (isBusinessError(resp.data.error)) {
          return { error: resp.data.error };
        }
      } else {
        return { result: resp.data.result };
      }
    } catch (e) {
      lastErr = { message: e?.message || 'state write failed' };
    }
  }

  console.error('All expense action candidates failed:', lastErr);
  return { error: lastErr || { message: 'No matching workflow method on this Odoo' } };
};

export const approveExpenseSheetOdoo = (sheetId, expenseId) =>
  tryExpenseAction({
    expenseId,
    sheetId,
    candidates: [
      { model: 'hr.expense', method: 'action_approve' },
      { model: 'hr.expense.sheet', method: 'approve_expense_sheets' },
      { model: 'hr.expense.sheet', method: 'action_approve_expense_sheets' },
    ],
    fallbackState: 'approved',
  });

export const refuseExpenseSheetOdoo = (sheetId, reason = '', expenseId) =>
  tryExpenseAction({
    expenseId,
    sheetId,
    kwargs: { reason: String(reason || '') },
    candidates: [
      { model: 'hr.expense', method: 'action_refuse' },
      { model: 'hr.expense', method: 'refuse_expense' },
      { model: 'hr.expense.sheet', method: 'refuse_sheet' },
    ],
    fallbackState: 'refused',
  });

export const resetExpenseSheetOdoo = (sheetId, expenseId) =>
  tryExpenseAction({
    expenseId,
    sheetId,
    candidates: [
      { model: 'hr.expense', method: 'action_reset_to_draft' },
      { model: 'hr.expense', method: 'action_reset_expense' },
      { model: 'hr.expense.sheet', method: 'action_reset_expense_sheets' },
    ],
    fallbackState: 'draft',
  });

// List every ir.attachment row linked to an hr.expense, in upload order.
// Returned shape: [{ id, name, mimetype, datas, url }, ...] where `datas`
// is the base64 payload (may be missing for very large files where Odoo
// returns just the URL) and `url` is the authenticated download endpoint
// the WebView/PDF viewer can load when base64 isn't usable.
export const fetchExpenseAttachmentsOdoo = async (expenseId) => {
  if (!expenseId) return [];
  const baseUrl = getOdooUrl();
  try {
    const resp = await axios.post(`${baseUrl}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'ir.attachment',
        method: 'search_read',
        args: [[
          ['res_model', '=', 'hr.expense'],
          ['res_id', '=', Number(expenseId)],
        ]],
        kwargs: {
          fields: ['id', 'name', 'mimetype', 'datas', 'file_size'],
          order: 'id asc',
        },
      },
    }, { headers: { 'Content-Type': 'application/json' } });
    if (resp.data && resp.data.error) {
      console.warn('fetchExpenseAttachmentsOdoo error:', resp.data.error?.data?.message);
      return [];
    }
    const rows = resp.data?.result || [];
    return rows.map((a) => ({
      id: a.id,
      name: a.name || `Attachment ${a.id}`,
      mimetype: a.mimetype || 'application/octet-stream',
      datas: a.datas || null,
      url: `${baseUrl}/web/content/${a.id}?download=true`,
      file_size: a.file_size || 0,
    }));
  } catch (e) {
    console.warn('fetchExpenseAttachmentsOdoo failed:', e?.message);
    return [];
  }
};

// Upload a base64 image as an `ir.attachment` linked to an hr.expense
// row. Mirrors Odoo's "Attach Receipt" button which creates an
// ir.attachment with res_model='hr.expense' and res_id pointing at the
// expense — and (for the first attachment) writes back to the expense's
// `message_main_attachment_id` so it shows as the receipt thumbnail.
export const attachReceiptToExpenseOdoo = async ({ expenseId, base64, mimetype = 'image/jpeg', filename = 'receipt.jpg' } = {}) => {
  if (!expenseId) return { error: { message: 'expenseId is required' } };
  if (!base64) return { error: { message: 'no file selected' } };
  const baseUrl = getOdooUrl();
  try {
    const resp = await axios.post(`${baseUrl}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'ir.attachment',
        method: 'create',
        args: [{
          name: filename,
          datas: base64,
          mimetype,
          res_model: 'hr.expense',
          res_id: Number(expenseId),
          type: 'binary',
        }],
        kwargs: {},
      },
    }, { headers: { 'Content-Type': 'application/json' } });
    if (resp.data && resp.data.error) return { error: resp.data.error };
    return { result: resp.data.result };
  } catch (e) {
    console.error('attachReceiptToExpenseOdoo error:', e?.message);
    return { error: { message: e?.message || 'Attach failed' } };
  }
};

// Post journal entries — accountant action that flips state from approved
// to done/posted. Different across Odoo versions, so we probe candidates.
export const postExpenseEntriesOdoo = (sheetId, expenseId) =>
  tryExpenseAction({
    expenseId,
    sheetId,
    candidates: [
      { model: 'hr.expense', method: 'action_post' },
      { model: 'hr.expense.sheet', method: 'action_sheet_move_post' },
      { model: 'hr.expense.sheet', method: 'action_sheet_move_create' },
    ],
    fallbackState: 'done',
  });

// Barcode lookup mirroring the employee_attendance Sales Order pattern that
// the user pointed at as the known-working reference. Hits product.product
// search_read directly (no detail-API round trip) so the scanner can push
// straight to the cart store without losing fields in translation.
// Look up a product by barcode. When `allowedCategoryIds` is a non-empty
// array, the search is restricted to products whose pos_categ_ids overlaps
// that set — used so a barcode scanned in one POS register doesn't return a
// product that lives only in a different POS config's category whitelist.
export const fetchProductByBarcodeOdoo = async (barcode, { allowedCategoryIds } = {}) => {
  if (!barcode) return [];
  const baseUrl = getOdooUrl();
  try {
    let domain = [['barcode', '=', String(barcode)]];
    if (Array.isArray(allowedCategoryIds) && allowedCategoryIds.length > 0) {
      domain = domain.concat([['pos_categ_ids', 'in', allowedCategoryIds.map(Number)]]);
    }
    const resp = await axios.post(`${baseUrl}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'product.product',
        method: 'search_read',
        args: [domain],
        kwargs: {
          fields: [
            'id', 'name', 'list_price', 'lst_price', 'standard_price',
            'default_code', 'barcode', 'uom_id', 'image_128', 'categ_id',
          ],
          limit: 1,
        },
      },
    }, { headers: { 'Content-Type': 'application/json' }, timeout: 15000 });
    if (resp.data && resp.data.error) {
      console.warn('[fetchProductByBarcodeOdoo] Odoo error:', resp.data.error);
      return [];
    }
    const rows = Array.isArray(resp.data?.result) ? resp.data.result : [];
    return rows.map((p) => ({
      id: p.id,
      product_name: p.name || '',
      price: Number(p.list_price ?? p.lst_price ?? 0),
      standard_price: Number(p.standard_price || 0),
      code: p.default_code || '',
      barcode: p.barcode || '',
      uom: Array.isArray(p.uom_id) ? { id: p.uom_id[0], name: p.uom_id[1] } : null,
      category: Array.isArray(p.categ_id) ? { id: p.categ_id[0], name: p.categ_id[1] } : null,
      image_url: `${baseUrl}/web/image?model=product.product&id=${p.id}&field=image_128`,
    }));
  } catch (e) {
    console.error('[fetchProductByBarcodeOdoo] request failed:', e?.message || e);
    return [];
  }
};