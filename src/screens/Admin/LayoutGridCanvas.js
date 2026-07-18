// Grid-mode canvas for the native layout editor — mirrors the web editor's grid
// view. Blocks are absolutely-positioned boxes on a fixed paper grid: grab a
// box's TOP BAR to move, the bottom-right CORNER to resize, snapping to 0.25 cm
// (live). Dragging runs on the UI thread (reanimated) so it never hangs; the
// server write + preview refresh happen only on gesture release.
//
// Scrolling the Design view is done ONLY with the broad drag scrollbars (right =
// up/down, bottom = left/right) so the canvas surface is used purely for boxes —
// no native scroll gesture to fight with a box drag.
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, PanResponder, Animated as RNAnimated } from 'react-native';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, runOnJS } from 'react-native-reanimated';
import { MaterialIcons } from '@expo/vector-icons';
import { FONT_FAMILY } from '@constants/theme';
import { BLOCK_TYPE_LABELS } from './layoutBlockMeta';

const ORANGE = '#F47B20';
const PURPLE = '#6b2c6b';
const HIT = { top: 8, bottom: 8, left: 8, right: 8 };
const BAR = 26; // broad scrollbar thickness (easy to grab)

// One draggable/resizable box.
const GridBox = ({ block, pxPerCm, selected, onSelect, onCommitMove, onCommitResize, onToggleVisible, onDelete }) => {
  const snapPx = pxPerCm * 0.25;
  const tx = useSharedValue((block.grid_x || 0) * pxPerCm);
  const ty = useSharedValue((block.grid_y || 0) * pxPerCm);
  const w = useSharedValue(Math.max(0.25, block.grid_w || 1) * pxPerCm);
  const h = useSharedValue(Math.max(0.25, block.grid_h || 1) * pxPerCm);
  const s0 = useSharedValue(0);
  const s1 = useSharedValue(0);

  useEffect(() => {
    tx.value = (block.grid_x || 0) * pxPerCm;
    ty.value = (block.grid_y || 0) * pxPerCm;
    w.value = Math.max(0.25, block.grid_w || 1) * pxPerCm;
    h.value = Math.max(0.25, block.grid_h || 1) * pxPerCm;
  }, [block.grid_x, block.grid_y, block.grid_w, block.grid_h, pxPerCm]);

  // Gesture callbacks are reanimated worklets (UI thread) — inline all math.
  const movePan = Gesture.Pan()
    .minDistance(4)
    .onBegin(() => { 'worklet'; runOnJS(onSelect)(block.id); })
    .onStart(() => { 'worklet'; s0.value = tx.value; s1.value = ty.value; })
    .onUpdate((e) => {
      'worklet';
      tx.value = Math.max(0, Math.round((s0.value + e.translationX) / snapPx) * snapPx);
      ty.value = Math.max(0, Math.round((s1.value + e.translationY) / snapPx) * snapPx);
    })
    .onEnd(() => {
      'worklet';
      const sx = Math.max(0, Math.round(tx.value / snapPx) * snapPx);
      const sy = Math.max(0, Math.round(ty.value / snapPx) * snapPx);
      tx.value = sx; ty.value = sy;
      runOnJS(onCommitMove)(block.id, Math.round((sx / pxPerCm) * 100) / 100, Math.round((sy / pxPerCm) * 100) / 100);
    });

  const resizePan = Gesture.Pan()
    .minDistance(4)
    .onBegin(() => { 'worklet'; runOnJS(onSelect)(block.id); })
    .onStart(() => { 'worklet'; s0.value = w.value; s1.value = h.value; })
    .onUpdate((e) => {
      'worklet';
      w.value = Math.max(snapPx, Math.round((s0.value + e.translationX) / snapPx) * snapPx);
      h.value = Math.max(snapPx, Math.round((s1.value + e.translationY) / snapPx) * snapPx);
    })
    .onEnd(() => {
      'worklet';
      const sw = Math.max(snapPx, Math.round(w.value / snapPx) * snapPx);
      const sh = Math.max(snapPx, Math.round(h.value / snapPx) * snapPx);
      w.value = sw; h.value = sh;
      runOnJS(onCommitResize)(block.id, Math.round((sw / pxPerCm) * 100) / 100, Math.round((sh / pxPerCm) * 100) / 100);
    });

  const boxStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }],
    width: w.value,
    height: h.value,
  }));

  return (
    <Animated.View style={[styles.gbox, selected && styles.gboxActive, !block.visible && styles.gboxHidden, boxStyle]}>
      <GestureDetector gesture={movePan}>
        <View style={styles.ghbar}>
          <MaterialIcons name="drag-indicator" size={16} color="#fff" />
          <Text style={styles.ghbarText} numberOfLines={1}>{BLOCK_TYPE_LABELS[block.block_type] || block.block_type}</Text>
          <TouchableOpacity onPress={() => onToggleVisible(block)} hitSlop={HIT} style={styles.barBtn}>
            <MaterialIcons name={block.visible ? 'visibility' : 'visibility-off'} size={16} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => onDelete(block)} hitSlop={HIT} style={styles.barBtn}>
            <MaterialIcons name="close" size={16} color="#fff" />
          </TouchableOpacity>
        </View>
      </GestureDetector>
      <TouchableOpacity style={styles.gbody} activeOpacity={1} onPress={() => onSelect(block.id)} />
      <GestureDetector gesture={resizePan}>
        <View style={styles.gresize}>
          <MaterialIcons name="open-in-full" size={15} color="#fff" />
        </View>
      </GestureDetector>
    </Animated.View>
  );
};

// Broad, grab-and-drag scrollbar. `length` = track px; `value`/`max` = scroll
// offset; `onChange(offset)` fires while dragging the thumb.
const DragScrollBar = ({ vertical, length, thumb, offset, offsetRef, max }) => {
  const travel = Math.max(1, length - thumb);
  const disabled = max <= 0;
  // Thumb position tracks the Animated offset (native-updated, no re-render).
  const translate = offset.interpolate({
    inputRange: [0, Math.max(1, max)],
    outputRange: [0, travel],
    extrapolate: 'clamp',
  });
  const startRef = useRef(0);
  const cfg = useRef({ travel, max });
  cfg.current = { travel, max };
  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => { startRef.current = offsetRef.current; },
      onPanResponderMove: (e, g) => {
        const { travel: tv, max: mx } = cfg.current;
        const delta = vertical ? g.dy : g.dx;
        offset.setValue(Math.min(mx, Math.max(0, startRef.current + (delta / tv) * mx)));
      },
    }),
  ).current;
  const trackStyle = vertical ? { width: BAR, height: length } : { height: BAR, width: length };
  const thumbBase = vertical ? { width: BAR - 8, height: thumb, left: 4 } : { height: BAR - 8, width: thumb, top: 4 };
  return (
    <View style={[styles.track, trackStyle]}>
      <RNAnimated.View
        style={[styles.thumb, thumbBase, disabled && styles.thumbDisabled, { transform: vertical ? [{ translateY: translate }] : [{ translateX: translate }] }]}
        {...(disabled ? {} : responder.panHandlers)}
      />
    </View>
  );
};

const LayoutGridCanvas = ({ blocks, widthMm, selectedId, onSelect, onCommitMove, onCommitResize, onToggleVisible, onDelete }) => {
  const [vp, setVp] = useState({ w: 0, h: 0 }); // viewport (clip) size
  // Scroll offsets as Animated values → the canvas + thumbs update natively while
  // dragging, with NO React re-render (so scrolling is smooth, not janky).
  const offsetX = useRef(new RNAnimated.Value(0)).current;
  const offsetY = useRef(new RNAnimated.Value(0)).current;
  const offsetXRef = useRef(0);
  const offsetYRef = useRef(0);
  useEffect(() => {
    const ix = offsetX.addListener(({ value }) => { offsetXRef.current = value; });
    const iy = offsetY.addListener(({ value }) => { offsetYRef.current = value; });
    return () => { offsetX.removeListener(ix); offsetY.removeListener(iy); };
  }, [offsetX, offsetY]);

  const widthCm = Math.max(1, (widthMm || 80) / 10);
  const contentRight = blocks.reduce((m, b) => Math.max(m, (b.grid_x || 0) + (b.grid_w || 0)), 0);
  const contentBottom = blocks.reduce((m, b) => Math.max(m, (b.grid_y || 0) + (b.grid_h || 0)), 0);

  const gridWcm = widthCm;
  const gridHcm = Math.max(8, contentBottom + 0.5);
  const contentWcm = Math.max(widthCm, contentRight);
  const pxPerCm = vp.w > 0 ? Math.max(16, vp.w / gridWcm) : 0;
  const canvasW = pxPerCm * gridWcm;      // paper (grid) width
  const contentW = pxPerCm * contentWcm;  // scrollable width (incl. overflow)
  const canvasH = pxPerCm * gridHcm;

  const maxX = Math.max(0, contentW - vp.w);
  const maxY = Math.max(0, canvasH - vp.h);
  // Clamp offsets when the scale/content changes.
  useEffect(() => { if (offsetXRef.current > maxX) offsetX.setValue(maxX); }, [maxX, offsetX]);
  useEffect(() => { if (offsetYRef.current > maxY) offsetY.setValue(maxY); }, [maxY, offsetY]);

  const thumbV = Math.max(40, vp.h > 0 && canvasH > 0 ? Math.min(vp.h, (vp.h * vp.h) / canvasH) : (vp.h || 40));
  const thumbH = Math.max(40, vp.w > 0 && contentW > 0 ? Math.min(vp.w, (vp.w * vp.w) / contentW) : (vp.w || 40));
  const negX = RNAnimated.multiply(offsetX, -1);
  const negY = RNAnimated.multiply(offsetY, -1);

  const vLines = [];
  const hLines = [];
  if (pxPerCm > 0) {
    for (let i = 1; i * 0.25 < gridWcm; i += 1) vLines.push({ cm: i * 0.25, major: i % 4 === 0 });
    for (let i = 1; i * 0.25 < gridHcm; i += 1) hLines.push({ cm: i * 0.25, major: i % 4 === 0 });
  }

  return (
    <View style={{ flex: 1 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsRow} contentContainerStyle={{ paddingRight: 8 }}>
        {blocks.map((b) => (
          <TouchableOpacity key={`chip-${b.id}`} style={[styles.chip, selectedId === b.id && styles.chipActive]} onPress={() => onSelect(b.id)}>
            <Text style={[styles.chipText, selectedId === b.id && styles.chipTextActive]} numberOfLines={1}>{BLOCK_TYPE_LABELS[b.block_type] || b.block_type}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      <Text style={styles.hint}>Top bar = move · corner = resize · snaps 0.25 cm · drag the side bars to scroll</Text>

      <View style={styles.area}>
        <View style={styles.leftCol}>
          <View style={styles.viewport} onLayout={(e) => setVp({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
            {pxPerCm > 0 ? (
              <RNAnimated.View style={{ width: contentW, height: canvasH, transform: [{ translateX: negX }, { translateY: negY }] }}>
                <View style={[styles.paper, { width: canvasW, height: canvasH }]}>
                  {vLines.map((l) => (
                    <View key={`v-${l.cm}`} style={[l.major ? styles.glineMajor : styles.glineMinor, { position: 'absolute', left: l.cm * pxPerCm, top: 0, bottom: 0, width: l.major ? 1 : StyleSheet.hairlineWidth }]} />
                  ))}
                  {hLines.map((l) => (
                    <View key={`h-${l.cm}`} style={[l.major ? styles.glineMajor : styles.glineMinor, { position: 'absolute', top: l.cm * pxPerCm, left: 0, right: 0, height: l.major ? 1 : StyleSheet.hairlineWidth }]} />
                  ))}
                </View>
                {blocks.map((b) => (
                  <GridBox
                    key={`gb-${b.id}`}
                    block={b}
                    pxPerCm={pxPerCm}
                    selected={selectedId === b.id}
                    onSelect={onSelect}
                    onCommitMove={onCommitMove}
                    onCommitResize={onCommitResize}
                    onToggleVisible={onToggleVisible}
                    onDelete={onDelete}
                  />
                ))}
              </RNAnimated.View>
            ) : null}
          </View>
          <DragScrollBar length={vp.w} thumb={thumbH} offset={offsetX} offsetRef={offsetXRef} max={maxX} />
        </View>
        <View style={styles.rightCol}>
          <DragScrollBar vertical length={vp.h} thumb={thumbV} offset={offsetY} offsetRef={offsetYRef} max={maxY} />
          <View style={{ height: BAR }} />
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  chipsRow: { height: 34, flexGrow: 0, flexShrink: 0, marginBottom: 4 },
  chip: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 14, paddingHorizontal: 10, paddingVertical: 5, marginRight: 6, backgroundColor: '#fff', maxWidth: 150, justifyContent: 'center' },
  chipActive: { borderColor: ORANGE, backgroundColor: '#fff7ed' },
  chipText: { fontSize: 11, color: '#374151', fontFamily: FONT_FAMILY.urbanistSemiBold },
  chipTextActive: { color: ORANGE },
  hint: { fontSize: 10, color: '#9ca3af', fontFamily: FONT_FAMILY.urbanistMedium, marginBottom: 6 },
  area: { flex: 1, flexDirection: 'row' },
  leftCol: { flex: 1 },
  rightCol: { width: BAR },
  viewport: { flex: 1, overflow: 'hidden', backgroundColor: '#fafafa' },
  paper: { position: 'absolute', left: 0, top: 0, backgroundColor: '#fff', borderWidth: 1, borderColor: '#d1d5db' },
  glineMinor: { backgroundColor: '#eef0f4' },
  glineMajor: { backgroundColor: '#cfd4dc' },
  gbox: { position: 'absolute', left: 0, top: 0, borderWidth: 1, borderColor: PURPLE, backgroundColor: 'rgba(107,44,107,0.06)' },
  gboxActive: { borderColor: ORANGE, borderWidth: 2, backgroundColor: 'rgba(244,123,32,0.10)' },
  gboxHidden: { opacity: 0.4 },
  ghbar: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: PURPLE, paddingHorizontal: 6, paddingVertical: 6 },
  ghbarText: { flex: 1, color: '#fff', fontSize: 11, fontFamily: FONT_FAMILY.urbanistSemiBold },
  barBtn: { padding: 2 },
  gbody: { flex: 1 },
  gresize: { position: 'absolute', right: 0, bottom: 0, width: 30, height: 30, alignItems: 'center', justifyContent: 'center', backgroundColor: PURPLE, borderTopLeftRadius: 8 },
  // Broad scrollbars
  track: { backgroundColor: '#eef0f4', borderRadius: 6 },
  thumb: { position: 'absolute', backgroundColor: '#9aa2b1', borderRadius: 6 },
  thumbDisabled: { backgroundColor: '#dfe3ea' },
});

export default LayoutGridCanvas;
