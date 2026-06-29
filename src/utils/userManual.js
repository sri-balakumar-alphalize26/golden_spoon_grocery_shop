// User-manual PDF helpers — app-only (no Odoo). Bundled PDF is resolved via
// expo-asset, copied to cache, then opened or saved. Mirrors the proven
// flow from the employee_attendance app, using expo-sharing for "View" on
// both platforms (system "Open with" sheet) so no native rebuild is needed.
import { Platform } from 'react-native';
import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as IntentLauncher from 'expo-intent-launcher';
import Toast from 'react-native-toast-message';

// AsyncStorage flag (per-device) that controls whether the Profile screen
// shows the User Manual option. Admin-only toggle writes it.
export const SHOW_MANUAL_KEY = 'showUserManual';

const MANUAL_PDF = require('@assets/manuals/golden-spoon-manual.pdf');
const MANUAL_TITLE = 'Golden Spoon Vegetables Manual';
const SAVE_FILENAME = 'Golden Spoon Vegetables Manual.pdf';

const toast = (type, text1, text2) =>
  Toast.show({ type, text1, ...(text2 ? { text2 } : {}), position: 'bottom' });

// Resolve the bundled PDF to a real cache file path (with a .pdf name so
// viewers recognise it). Falls back to the raw asset uri if the copy fails.
const materializePdf = async () => {
  const asset = Asset.fromModule(MANUAL_PDF);
  await asset.downloadAsync();
  const src = asset.localUri || asset.uri;
  const dest = `${FileSystem.cacheDirectory}golden-spoon-manual.pdf`;
  try {
    await FileSystem.copyAsync({ from: src, to: dest });
    const info = await FileSystem.getInfoAsync(dest);
    if (info.exists) return dest;
  } catch (e) {
    console.log('[Manual] materialize copy failed:', e?.message);
  }
  return src;
};

// VIEW — open the PDF in a real viewer. On Android we fire ACTION_VIEW
// (the "Open with" chooser of installed PDF apps) via expo-intent-launcher,
// mirroring the employee_attendance app. iOS uses Quick Look via Sharing.
// Falls back to the share sheet if no viewer is available.
export const openManualPdf = async () => {
  try {
    const uri = await materializePdf();

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
      dialogTitle: MANUAL_TITLE,
    });
  } catch (e) {
    console.log('[Manual] open error:', e?.message);
    toast('error', 'Could not open the manual', e?.message || '');
  }
};

// DOWNLOAD — Android: pick a folder (SAF) and write there. iOS: share sheet
// ("Save to Files").
export const downloadManualPdf = async () => {
  try {
    const uri = await materializePdf();
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
      const target = await SAF.createFileAsync(perm.directoryUri, SAVE_FILENAME, 'application/pdf');
      await FileSystem.writeAsStringAsync(target, base64, {
        encoding: FileSystem.EncodingType.Base64,
      });
      toast('success', 'Saved', SAVE_FILENAME);
    } else {
      if (!(await Sharing.isAvailableAsync())) {
        toast('error', 'Save failed', 'Sharing is not available on this device');
        return;
      }
      await Sharing.shareAsync(uri, {
        mimeType: 'application/pdf',
        UTI: 'com.adobe.pdf',
        dialogTitle: `Save ${MANUAL_TITLE}`,
      });
    }
  } catch (e) {
    console.log('[Manual] download error:', e?.message);
    toast('error', 'Download failed', e?.message || '');
  }
};
