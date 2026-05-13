// LocationModal — reusable centered popup that displays a captured GPS
// location (place name + lat/long) with an "Open in Maps" deep link to
// the device's default map app. Used by both the post-payment receipt
// (CreateInvoicePreview) and the past-order detail (OrderDetailScreen),
// so the look stays consistent.
import React, { useCallback } from 'react';
import { View, Text, Modal, TouchableOpacity, Linking, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';

const LocationModal = ({
  isVisible,
  locationName,
  latitude,
  longitude,
  onClose,
}) => {
  const handleOpenInMaps = useCallback(() => {
    if (latitude == null || longitude == null) return;
    const url = `https://www.google.com/maps?q=${latitude},${longitude}`;
    Linking.openURL(url).catch((err) => {
      console.warn('[LocationModal] openURL failed:', err?.message || err);
      Toast.show({
        type: 'error',
        text1: 'Could not open Maps',
        text2: err?.message || '',
      });
    });
  }, [latitude, longitude]);

  return (
    <Modal
      visible={!!isVisible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={s.root}>
        <View style={s.card}>
          <View style={s.headerRow}>
            <View style={s.iconWrap}>
              <MaterialIcons name="place" size={20} color="#9333ea" />
            </View>
            <Text style={s.title} numberOfLines={2}>Order Location</Text>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <MaterialIcons name="close" size={22} color="#1a1a2e" />
            </TouchableOpacity>
          </View>
          {locationName ? <Text style={s.place}>{locationName}</Text> : null}
          <View style={s.coordRow}>
            <Text style={s.coordLabel}>Latitude</Text>
            <Text style={s.coordValue}>
              {latitude != null ? Number(latitude).toFixed(6) : '—'}
            </Text>
          </View>
          <View style={s.coordRow}>
            <Text style={s.coordLabel}>Longitude</Text>
            <Text style={s.coordValue}>
              {longitude != null ? Number(longitude).toFixed(6) : '—'}
            </Text>
          </View>
          <View style={s.buttonRow}>
            <TouchableOpacity
              style={[s.btn, s.btnSecondary]}
              onPress={onClose}
              activeOpacity={0.85}
            >
              <Text style={s.btnSecondaryText}>Close</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.btn, s.btnPrimary, (latitude == null || longitude == null) && { opacity: 0.5 }]}
              onPress={handleOpenInMaps}
              disabled={latitude == null || longitude == null}
              activeOpacity={0.85}
            >
              <MaterialIcons name="map" size={16} color="#fff" />
              <Text style={s.btnPrimaryText}>Open in Maps</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

export default LocationModal;

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#9333ea',
    paddingVertical: 22,
    paddingHorizontal: 18,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  iconWrap: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#f3e8ff',
  },
  title: { flex: 1, fontSize: 16, color: '#581c87', fontWeight: '700' },
  place: { fontSize: 14, color: '#0f172a', marginBottom: 10, lineHeight: 20 },
  coordRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderTopWidth: 1, borderTopColor: '#f1f5f9',
  },
  coordLabel: { fontSize: 12, color: '#64748b' },
  coordValue: { fontSize: 13, color: '#0f172a', fontWeight: '600' },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  btn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  btnSecondary: {
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#9333ea',
  },
  btnSecondaryText: { color: '#9333ea', fontWeight: '700' },
  btnPrimary: { backgroundColor: '#9333ea' },
  btnPrimaryText: { color: '#fff', fontWeight: '700' },
});
