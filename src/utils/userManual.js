// User-manual PDF helpers. The manual documents now live in the Odoo DB
// (app_user_manual module) instead of a bundled asset: we fetch a chosen
// document's bytes (base64) via the API, write them to a cache file, then
// open or save that file. View/Download UX is unchanged (system "Open with"
// on Android via expo-intent-launcher, Quick Look / share sheet on iOS).
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as IntentLauncher from 'expo-intent-launcher';
import Toast from 'react-native-toast-message';
import { fetchUserManualData } from '@api/services/generalApi';

// AsyncStorage flag (per-device) that controls whether the Profile screen
// shows the User Manual option. Admin-only toggle writes it.
export const SHOW_MANUAL_KEY = 'showUserManual';

const toast = (type, text1, text2) =>
  Toast.show({ type, text1, ...(text2 ? { text2 } : {}), position: 'bottom' });

// Turn a filename into a safe cache path (only [A-Za-z0-9._-], .pdf enforced).
const cachePathFor = (filename) => {
  const base = String(filename || 'user-manual.pdf').replace(/[^A-Za-z0-9._-]/g, '_');
  const named = base.toLowerCase().endsWith('.pdf') ? base : `${base}.pdf`;
  return `${FileSystem.cacheDirectory}${named}`;
};

// Fetch one document from the DB and write it to a cache file. Returns
// { uri, filename, title } or throws 'NO_MANUAL' when it can't be fetched so
// callers can show a friendly message instead of crashing.
const materializePdf = async (doc = {}) => {
  const meta = await fetchUserManualData(doc.id);
  if (!meta || !meta.data) {
    const err = new Error('NO_MANUAL');
    err.code = 'NO_MANUAL';
    throw err;
  }
  const filename = meta.filename || doc.filename || `${meta.name || 'User Manual'}.pdf`;
  const dest = cachePathFor(filename);
  await FileSystem.writeAsStringAsync(dest, meta.data, { encoding: FileSystem.EncodingType.Base64 });
  return { uri: dest, filename, title: meta.name || doc.name || 'User Manual' };
};

const handleNoManual = (e) => {
  if (e?.code === 'NO_MANUAL') {
    toast('info', 'Manual not available', 'Ask your admin to upload it.');
    return true;
  }
  return false;
};

// VIEW — open the PDF in a real viewer. On Android we fire ACTION_VIEW (the
// "Open with" chooser) via expo-intent-launcher; iOS uses Quick Look via
// Sharing. Falls back to the share sheet if no viewer is available.
export const openManualPdf = async (doc = {}) => {
  try {
    const { uri, title } = await materializePdf(doc);

    if (Platform.OS === 'android') {
      try {
        const contentUri = await FileSystem.getContentUriAsync(uri);
        await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
          data: contentUri,
          flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
          type: 'application/pdf',
        });
        return;
      } catch (intentErr) {
        console.log('[Manual] ACTION_VIEW failed, share fallback:', intentErr?.message);
      }
    }

    if (!(await Sharing.isAvailableAsync())) {
      toast('error', 'Cannot open', 'No app available to open the PDF');
      return;
    }
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      UTI: 'com.adobe.pdf',
      dialogTitle: title,
    });
  } catch (e) {
    if (handleNoManual(e)) return;
    console.log('[Manual] open error:', e?.message);
    toast('error', 'Could not open the manual', e?.message || '');
  }
};

// DOWNLOAD — Android: pick a folder (SAF) and write there. iOS: share sheet
// ("Save to Files").
export const downloadManualPdf = async (doc = {}) => {
  try {
    const { uri, filename, title } = await materializePdf(doc);
    if (Platform.OS === 'android') {
      const SAF = FileSystem.StorageAccessFramework;
      const perm = await SAF.requestDirectoryPermissionsAsync();
      if (!perm.granted) {
        toast('info', 'Save cancelled');
        return;
      }
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const target = await SAF.createFileAsync(perm.directoryUri, filename, 'application/pdf');
      await FileSystem.writeAsStringAsync(target, base64, {
        encoding: FileSystem.EncodingType.Base64,
      });
      toast('success', 'Saved', filename);
    } else {
      if (!(await Sharing.isAvailableAsync())) {
        toast('error', 'Save failed', 'Sharing is not available on this device');
        return;
      }
      await Sharing.shareAsync(uri, {
        mimeType: 'application/pdf',
        UTI: 'com.adobe.pdf',
        dialogTitle: `Save ${title}`,
      });
    }
  } catch (e) {
    if (handleNoManual(e)) return;
    console.log('[Manual] download error:', e?.message);
    toast('error', 'Download failed', e?.message || '');
  }
};
