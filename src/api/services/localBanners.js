// Local banner store. Mirrors the API surface of the Odoo `app.banner`
// helpers in generalApi.js, but writes to the device instead of Odoo so
// banners persist across launches without needing the server.
//
// Image bytes go to:    `${FileSystem.documentDirectory}banners/<id>.jpg`
// Metadata index goes:  AsyncStorage key `app.local.banners`
//                       JSON: [{ id, name, sequence, active, filename }]
//
// Exposed API:
//   listBanners()   → [{ id, name, sequence, active, uri, filename }]
//   getBanner(id)   → single record or null
//   createBanner({ name, base64, sequence?, active? }) → { id }
//   updateBanner(id, { name?, base64?, sequence?, active? })
//   deleteBanner(id)
import * as FileSystem from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';

const META_KEY = 'app.local.banners';
const BANNER_DIR = `${FileSystem.documentDirectory}banners/`;

// Build the on-disk path for a given metadata row.
const fileFor = (id, filename) => `${BANNER_DIR}${id}.jpg`;

// Make sure the banners directory exists. Safe to call repeatedly —
// expo-file-system no-ops when the dir already exists.
const ensureBannerDir = async () => {
  try {
    const info = await FileSystem.getInfoAsync(BANNER_DIR);
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(BANNER_DIR, { intermediates: true });
    }
  } catch (e) {
    console.warn('[LOCAL BANNERS] ensureBannerDir failed:', e?.message || e);
  }
};

const readMeta = async () => {
  try {
    const raw = await AsyncStorage.getItem(META_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.warn('[LOCAL BANNERS] readMeta failed:', e?.message || e);
    return [];
  }
};

const writeMeta = async (list) => {
  await AsyncStorage.setItem(META_KEY, JSON.stringify(list || []));
};

const newId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const sortBy = (list) => [...list].sort(
  (a, b) => (a.sequence ?? 0) - (b.sequence ?? 0)
    || String(a.id).localeCompare(String(b.id))
);

// ─── public API ────────────────────────────────────────────────────────────

export const listBanners = async () => {
  await ensureBannerDir();
  const meta = await readMeta();
  return sortBy(meta).map((m) => ({
    id: m.id,
    name: m.name || '',
    sequence: m.sequence ?? 0,
    active: m.active !== false,
    filename: m.filename || `${m.id}.jpg`,
    uri: fileFor(m.id, m.filename),
  }));
};

export const getBanner = async (id) => {
  if (!id) return null;
  const meta = await readMeta();
  const row = meta.find((m) => m.id === id);
  if (!row) return null;
  return {
    id: row.id,
    name: row.name || '',
    sequence: row.sequence ?? 0,
    active: row.active !== false,
    filename: row.filename || `${row.id}.jpg`,
    uri: fileFor(row.id, row.filename),
  };
};

export const createBanner = async ({
  name = '', base64, sequence = 10, active = true,
} = {}) => {
  if (!base64) throw new Error('base64 image data is required');
  await ensureBannerDir();
  const id = newId();
  const filename = `${id}.jpg`;
  await FileSystem.writeAsStringAsync(fileFor(id, filename), base64, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const meta = await readMeta();
  meta.push({ id, name, sequence: Number(sequence) || 10, active: !!active, filename });
  await writeMeta(meta);
  return { id };
};

export const updateBanner = async (id, {
  name, base64, sequence, active,
} = {}) => {
  if (!id) throw new Error('id is required');
  await ensureBannerDir();
  const meta = await readMeta();
  const idx = meta.findIndex((m) => m.id === id);
  if (idx === -1) throw new Error('banner not found');
  const next = { ...meta[idx] };
  if (name !== undefined) next.name = name;
  if (sequence !== undefined) next.sequence = Number(sequence) || 10;
  if (active !== undefined) next.active = !!active;
  if (base64) {
    // Replace the image bytes in place.
    await FileSystem.writeAsStringAsync(fileFor(next.id, next.filename), base64, {
      encoding: FileSystem.EncodingType.Base64,
    });
  }
  meta[idx] = next;
  await writeMeta(meta);
  return { result: true };
};

export const deleteBanner = async (id) => {
  if (!id) throw new Error('id is required');
  const meta = await readMeta();
  const row = meta.find((m) => m.id === id);
  if (row) {
    try {
      await FileSystem.deleteAsync(fileFor(row.id, row.filename), { idempotent: true });
    } catch (e) {
      console.warn('[LOCAL BANNERS] file delete failed:', e?.message || e);
    }
  }
  await writeMeta(meta.filter((m) => m.id !== id));
  return { result: true };
};
