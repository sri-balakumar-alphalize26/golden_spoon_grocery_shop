// Signature pad — draw a signature and return it as raw base64 PNG (no
// `data:` prefix) so the caller can store it the same way ID-proof images
// are stored (ir.attachment `datas`).
//
// Reuses `react-native-signature-canvas` (already a dependency). The pad
// exposes imperative methods we drive from a toolbar — mirroring the
// tools-rental signature pad:
//   - Pen / Eraser toggle        → ref.draw() / ref.erase()
//   - Stroke width 1–20px         → ref.changePenSize(min, max)
//   - Colour picker (7 + custom)  → ref.changePenColor(hex)
//   - Clear                       → ref.clearSignature()
//
// The popup is CENTERED (zoom-in), not a bottom slide-up.
//
// Props:
//   visible            — show / hide
//   title              — heading text (e.g. "Customer Signature")
//   onConfirm(base64)  — fires with raw base64 PNG when the user taps Save
//   onClose            — fires on Cancel / back
import React, { useRef, useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import RNModal from 'react-native-modal';
import SignatureScreen from 'react-native-signature-canvas';
import { MaterialIcons } from '@expo/vector-icons';
import { COLORS, FONT_FAMILY } from '@constants/theme';

const NAVY = COLORS.primaryThemeColor;

// 7 preset ink colours + a custom hex entry.
const PRESET_COLORS = [
  '#000000', // black
  '#1E40AF', // blue
  '#DC2626', // red
  '#16A34A', // green
  '#F47B20', // orange
  '#7C3AED', // purple
  '#0891B2', // teal
];

const MIN_W = 1;
const MAX_W = 20;
// "Normal" pen the pad opens with every time. 3px reads as a natural
// ballpoint stroke on the touch canvas; the cashier can still step it
// down (fine, 1–2) or up (bold, 5+) up to MAX_W.
const DEFAULT_WIDTH = 3;
const DEFAULT_COLOR = '#000000';

const SignaturePadModal = ({ visible, title, onConfirm, onClose }) => {
  const ref = useRef(null);

  const [penColor, setPenColor] = useState(DEFAULT_COLOR);
  const [strokeWidth, setStrokeWidth] = useState(DEFAULT_WIDTH);
  const [isEraser, setIsEraser] = useState(false);

  // Lock back to the normal pen each time the pad opens, so every
  // signature starts from a consistent default (black, 3px, pen mode).
  useEffect(() => {
    if (visible) {
      setPenColor(DEFAULT_COLOR);
      setStrokeWidth(DEFAULT_WIDTH);
      setIsEraser(false);
    }
  }, [visible]);

  // Map a single "stroke width" to signature_pad's velocity range. A
  // small spread keeps strokes natural while honouring the chosen size.
  const applyPenSize = (w) => {
    ref.current?.changePenSize(Math.max(0.5, w * 0.55), w);
  };

  // Track the actual drawable box size so we can log it / debug the
  // canvas-fill issue.
  const [padSize, setPadSize] = useState({ width: 0, height: 0 });

  const handlePadLayout = (e) => {
    const { width, height } = e.nativeEvent.layout;
    setPadSize({ width, height });
    console.log('[SignaturePad] box layout (px):', { width: Math.round(width), height: Math.round(height) });
  };

  // The drawable box height in CSS px — measured from onLayout, with a
  // sane default for the very first render before layout settles. The
  // canvas is sized to THIS exact value so it fills the box (see
  // webStyle below).
  const boxHeight = Math.round(padSize.height) || 230;

  // Re-apply the current tool settings whenever the WebView (re)loads.
  const handleLoadEnd = () => {
    console.log('[SignaturePad] webview loaded; box size (px):', {
      width: Math.round(padSize.width),
      height: Math.round(padSize.height),
      canvasHeightApplied: boxHeight,
    });
    ref.current?.changePenColor(penColor);
    applyPenSize(strokeWidth);
    if (isEraser) ref.current?.erase();
  };

  const selectColor = (hex) => {
    setPenColor(hex);
    setIsEraser(false);
    ref.current?.draw();
    ref.current?.changePenColor(hex);
    applyPenSize(strokeWidth);
  };

  const toggleEraser = () => {
    if (isEraser) {
      // Back to pen with the last colour/size.
      setIsEraser(false);
      ref.current?.draw();
      ref.current?.changePenColor(penColor);
      applyPenSize(strokeWidth);
    } else {
      setIsEraser(true);
      ref.current?.erase();
    }
  };

  const changeWidth = (delta) => {
    const next = Math.min(MAX_W, Math.max(MIN_W, strokeWidth + delta));
    setStrokeWidth(next);
    applyPenSize(next);
  };

  const handleClear = () => {
    ref.current?.clearSignature();
  };

  // SignatureScreen.readSignature() triggers onOK with the data URL. We
  // strip the prefix and hand back raw base64.
  const handleOK = (signature) => {
    const base64 = (signature || '').replace('data:image/png;base64,', '');
    if (base64) onConfirm(base64);
  };

  const handleEmpty = () => onClose();
  const handleSave = () => ref.current?.readSignature();

  // Hide the library's built-in footer AND pin the page + canvas to the
  // EXACT measured box height. The library template hardcodes
  // `body,html { height: 300px }` and sizes the <canvas> off that, so on
  // our 230px box the canvas didn't match the visible area and strokes
  // near the top were clipped. Forcing every layer to `boxHeight`px makes
  // the canvas fill the box 1:1. Changing webStyle reloads the WebView,
  // so once onLayout reports the real height the pad re-renders at the
  // correct size.
  const webStyle = `
    .m-signature-pad { box-shadow: none; border: none; margin: 0; height: ${boxHeight}px; }
    .m-signature-pad--body { border: none; position: relative; height: ${boxHeight}px; left: 0; right: 0; top: 0; bottom: 0; }
    .m-signature-pad--body canvas { position: absolute; left: 0; top: 0; width: 100%; height: ${boxHeight}px; }
    .m-signature-pad--footer { display: none; margin: 0px; }
    body, html { width: 100%; height: ${boxHeight}px; margin: 0; padding: 0; }
  `;

  return (
    <RNModal
      isVisible={visible}
      animationIn="zoomIn"
      animationOut="zoomOut"
      backdropOpacity={0.7}
      onBackButtonPress={onClose}
      onBackdropPress={onClose}
      style={styles.modal}
    >
      <View style={styles.card}>
        <View style={styles.header}>
          <Text style={styles.title}>{title || 'Signature'}</Text>
          <Text style={styles.hint}>Sign inside the box below</Text>
        </View>

        {/* Toolbar — pen/eraser, stroke width, colours */}
        <View style={styles.toolbar}>
          <View style={styles.toolGroup}>
            <TouchableOpacity
              style={[styles.toolBtn, !isEraser && styles.toolBtnActive]}
              onPress={() => { if (isEraser) toggleEraser(); }}
              activeOpacity={0.85}
            >
              <MaterialIcons name="edit" size={16} color={!isEraser ? '#fff' : NAVY} />
              <Text style={[styles.toolBtnText, !isEraser && styles.toolBtnTextActive]}>Pen</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.toolBtn, isEraser && styles.toolBtnActive]}
              onPress={() => { if (!isEraser) toggleEraser(); }}
              activeOpacity={0.85}
            >
              <MaterialCommunityEraser active={isEraser} />
              <Text style={[styles.toolBtnText, isEraser && styles.toolBtnTextActive]}>Eraser</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.toolGroup}>
            <TouchableOpacity style={styles.stepBtn} onPress={() => changeWidth(-1)} activeOpacity={0.85}>
              <MaterialIcons name="remove" size={16} color={NAVY} />
            </TouchableOpacity>
            <View style={styles.widthDisplay}>
              <View style={[styles.widthDot, { width: strokeWidth, height: strokeWidth, backgroundColor: isEraser ? '#9CA3AF' : penColor }]} />
              <Text style={styles.widthText}>{strokeWidth}px</Text>
            </View>
            <TouchableOpacity style={styles.stepBtn} onPress={() => changeWidth(1)} activeOpacity={0.85}>
              <MaterialIcons name="add" size={16} color={NAVY} />
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.clearBtn} onPress={handleClear} activeOpacity={0.85}>
            <MaterialIcons name="refresh" size={16} color={NAVY} />
            <Text style={styles.clearBtnText}>Clear</Text>
          </TouchableOpacity>
        </View>

        {/* Colour swatches + custom hex */}
        <View style={styles.colorRow}>
          {PRESET_COLORS.map((c) => (
            <TouchableOpacity
              key={c}
              onPress={() => selectColor(c)}
              activeOpacity={0.85}
              style={[
                styles.swatch,
                { backgroundColor: c },
                !isEraser && penColor === c && styles.swatchActive,
              ]}
            >
              {!isEraser && penColor === c ? (
                <MaterialIcons name="check" size={14} color="#fff" />
              ) : null}
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.padWrap} onLayout={handlePadLayout}>
          <SignatureScreen
            ref={ref}
            webStyle={webStyle}
            style={styles.signatureFill}
            webviewContainerStyle={styles.signatureFill}
            onOK={handleOK}
            onEmpty={handleEmpty}
            onLoadEnd={handleLoadEnd}
            backgroundColor="#ffffff"
            penColor={penColor}
            minWidth={Math.max(0.5, strokeWidth * 0.55)}
            maxWidth={strokeWidth}
          />
        </View>

        <View style={styles.btnRow}>
          <TouchableOpacity
            style={[styles.btn, styles.cancelBtn]}
            activeOpacity={0.85}
            onPress={onClose}
          >
            <Text style={[styles.btnText, styles.cancelBtnText]}>CANCEL</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.btn, styles.saveBtn]}
            activeOpacity={0.85}
            onPress={handleSave}
          >
            <MaterialIcons name="check" size={16} color="#fff" />
            <Text style={[styles.btnText, styles.saveBtnText]}>SAVE</Text>
          </TouchableOpacity>
        </View>
      </View>
    </RNModal>
  );
};

// Small helper so the eraser icon colour tracks the active state without
// repeating the ternary inline.
const MaterialCommunityEraser = ({ active }) => (
  <MaterialIcons name="auto-fix-normal" size={16} color={active ? '#fff' : NAVY} />
);

export default SignaturePadModal;

const styles = StyleSheet.create({
  modal: { justifyContent: 'center', alignItems: 'center', margin: 16 },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 16,
    borderColor: NAVY,
    borderWidth: 2,
    paddingVertical: 16,
    paddingHorizontal: 14,
    width: '100%',
    alignSelf: 'center',
  },
  header: { marginBottom: 12 },
  title: {
    fontSize: 17,
    color: NAVY,
    fontFamily: FONT_FAMILY.urbanistBold,
    textAlign: 'center',
  },
  hint: {
    fontSize: 12,
    color: '#8896ab',
    fontFamily: FONT_FAMILY.urbanistMedium,
    textAlign: 'center',
    marginTop: 2,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  toolGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  toolBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: NAVY,
    backgroundColor: '#fff',
  },
  toolBtnActive: { backgroundColor: NAVY },
  toolBtnText: {
    fontSize: 11,
    color: NAVY,
    fontFamily: FONT_FAMILY.urbanistBold,
  },
  toolBtnTextActive: { color: '#fff' },
  stepBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: NAVY,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  widthDisplay: {
    minWidth: 48,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  widthDot: { borderRadius: 999, marginBottom: 2 },
  widthText: {
    fontSize: 10,
    color: '#6B7280',
    fontFamily: FONT_FAMILY.urbanistBold,
  },
  clearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: NAVY,
    backgroundColor: '#fff',
  },
  clearBtnText: {
    fontSize: 11,
    color: NAVY,
    fontFamily: FONT_FAMILY.urbanistBold,
  },
  colorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  swatch: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  swatchActive: {
    borderWidth: 2,
    borderColor: NAVY,
  },
  padWrap: {
    height: 230,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#BBB7B7',
    overflow: 'hidden',
    backgroundColor: '#fff',
  },
  // Make the signature WebView fill the whole box (default sizing leaves
  // the canvas short, clipping strokes near the top).
  signatureFill: { flex: 1, width: '100%', height: '100%' },
  btnRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  btn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
    borderRadius: 10,
    gap: 6,
  },
  btnText: {
    fontFamily: FONT_FAMILY.urbanistBold,
    letterSpacing: 0.6,
    fontSize: 13,
  },
  cancelBtn: { backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#9CA3AF' },
  cancelBtnText: { color: '#6B7280' },
  saveBtn: { backgroundColor: NAVY },
  saveBtnText: { color: '#fff' },
});
