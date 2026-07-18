// Thin wrapper around expo-screen-orientation. No-ops if the native module
// isn't linked yet (e.g. a JS reload on a build made before it was added), so
// the app never crashes — the editor just won't rotate until the next rebuild.
let ScreenOrientation = null;
try { ScreenOrientation = require('expo-screen-orientation'); } catch (_) { ScreenOrientation = null; }

export const lockPortrait = async () => {
  try {
    if (ScreenOrientation) await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
  } catch (_) {}
};

export const lockLandscape = async () => {
  try {
    if (ScreenOrientation) await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
  } catch (_) {}
};

export const isOrientationAvailable = () => !!ScreenOrientation;
