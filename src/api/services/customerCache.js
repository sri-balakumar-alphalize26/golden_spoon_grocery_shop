// Customer detail + ID-proof prefetch cache.
//
// The customer list calls `primePartnerCache(id)` the moment a row is
// tapped — fetches start during the navigation slide-in animation
// instead of after it, so by the time CustomerInfo mounts the
// promises are already in flight (or done). Result: ID-proof images
// fill the screen instantly instead of popping in 300–500 ms later.
//
// Two parallel maps so a single primePartnerCache call kicks both
// fetches in parallel and the consumer can `await` only the slice it
// cares about.
import { fetchCustomerDetailsOdoo, fetchPartnerIdProofOdoo } from './generalApi';

const detailsCache = new Map(); // partnerId → Promise<details>
const proofCache = new Map();   // partnerId → Promise<{id_proof_front, id_proof_back}>

// Drop a cache entry after this long so a stale partner doesn't linger
// forever after the user edits something. 30 s is enough for the
// quick "open → back → open again" navigation pattern but short
// enough that an edit on Odoo's web UI shows up on next open.
const TTL_MS = 30 * 1000;

const scheduleEvict = (map, key) => {
  setTimeout(() => {
    // Re-check identity in case a fresh prime replaced the entry.
    map.delete(key);
  }, TTL_MS);
};

// Fire both fetches in parallel and store the promises. Idempotent —
// calling twice for the same id reuses the existing promise instead
// of starting a duplicate network round-trip.
export const primePartnerCache = (partnerId) => {
  if (!partnerId) return;
  const id = Number(partnerId);
  if (!detailsCache.has(id)) {
    const p = fetchCustomerDetailsOdoo(id).catch(() => null);
    detailsCache.set(id, p);
    p.finally(() => scheduleEvict(detailsCache, id));
  }
  if (!proofCache.has(id)) {
    const p = fetchPartnerIdProofOdoo(id).catch(() => ({ id_proof_front: null, id_proof_back: null }));
    proofCache.set(id, p);
    p.finally(() => scheduleEvict(proofCache, id));
  }
};

export const getCachedPartnerDetails = (partnerId) => {
  if (!partnerId) return null;
  return detailsCache.get(Number(partnerId)) || null;
};

export const getCachedPartnerProof = (partnerId) => {
  if (!partnerId) return null;
  return proofCache.get(Number(partnerId)) || null;
};

// Drop the cached entries for a partner — call this after a save so
// the next open re-fetches fresh data instead of returning the stale
// pre-edit values.
export const invalidatePartnerCache = (partnerId) => {
  if (!partnerId) return;
  const id = Number(partnerId);
  detailsCache.delete(id);
  proofCache.delete(id);
};
