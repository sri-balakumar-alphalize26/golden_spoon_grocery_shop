// Lightweight, pure-JS draggable slider (no native module). Drag the thumb (or
// tap the track) to set a value between min and max. Used by the Invoice
// Settings "Custom size" controls to drag-and-fit the receipt width/height.
import React, { useRef, useState } from 'react';
import { View, PanResponder, StyleSheet } from 'react-native';

const DragSlider = ({
  value,
  min = 0,
  max = 100,
  step = 1,
  onChange,
  fillColor = '#F47B20',
  thumbColor = '#F47B20',
}) => {
  const [trackW, setTrackW] = useState(0);
  const trackWRef = useRef(0);

  const clamp = (v) => Math.max(min, Math.min(max, v));
  const ratio = max > min ? (clamp(Number(value) || 0) - min) / (max - min) : 0;

  const setFromX = (x) => {
    const w = trackWRef.current || 1;
    const r = Math.max(0, Math.min(1, x / w));
    let v = min + r * (max - min);
    v = Math.round(v / step) * step;
    onChange && onChange(clamp(v));
  };

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => setFromX(e.nativeEvent.locationX),
      onPanResponderMove: (e) => setFromX(e.nativeEvent.locationX),
    })
  ).current;

  return (
    <View style={styles.wrap} {...pan.panHandlers}>
      <View
        style={styles.track}
        onLayout={(e) => {
          const w = e.nativeEvent.layout.width;
          trackWRef.current = w;
          setTrackW(w);
        }}
      >
        <View style={[styles.fill, { width: `${ratio * 100}%`, backgroundColor: fillColor }]} />
        <View style={[styles.thumb, { left: `${ratio * 100}%`, backgroundColor: thumbColor }]} />
      </View>
    </View>
  );
};

export default DragSlider;

const styles = StyleSheet.create({
  wrap: { paddingVertical: 12, justifyContent: 'center' },
  track: { height: 6, borderRadius: 3, backgroundColor: '#e5e7eb', justifyContent: 'center' },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 3 },
  thumb: {
    position: 'absolute', width: 22, height: 22, borderRadius: 11, marginLeft: -11,
    borderWidth: 2, borderColor: '#fff',
    // subtle shadow
    elevation: 3, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 3, shadowOffset: { width: 0, height: 1 },
  },
});
