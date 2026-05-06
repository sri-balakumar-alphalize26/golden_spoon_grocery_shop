import React, { useState, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { SafeAreaView } from '@components/containers';
import { NavigationHeader } from '@components/Header';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import { fetchPaymentMethods, deletePaymentMethod } from '@api/services/easyPurchaseApi';
import { showToastMessage } from '@components/Toast';

const NAVY = COLORS.primaryThemeColor;
const ORANGE = '#F47B20';

const PaymentMethodsScreen = ({ navigation }) => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await fetchPaymentMethods({ active: false });
      setData(Array.isArray(rows) ? rows : []);
    } catch (e) {
      console.error('[PaymentMethods]', e);
      showToastMessage(e?.message || 'Failed to load payment methods');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onDelete = (id, name) => {
    Alert.alert('Delete Payment Method', `Delete "${name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          try { await deletePaymentMethod(id); showToastMessage('Deleted'); load(); }
          catch (e) { showToastMessage(e?.message || 'Failed to delete'); }
        },
      },
    ]);
  };

  const renderItem = ({ item }) => (
    <TouchableOpacity
      activeOpacity={0.85}
      style={styles.card}
      onPress={() => navigation.navigate('PaymentMethodForm', { id: item.id })}
    >
      <View style={[styles.iconBox, item.is_vendor_account ? styles.iconCredit : styles.iconCash]}>
        <MaterialIcons
          name={item.is_vendor_account ? 'account-balance-wallet' : (item.journal_type === 'cash' ? 'payments' : 'account-balance')}
          size={22}
          color="#fff"
        />
      </View>
      <View style={{ flex: 1, marginLeft: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text style={styles.name}>{item.name}</Text>
          {item.is_default ? <View style={styles.defaultChip}><Text style={styles.defaultChipText}>DEFAULT</Text></View> : null}
        </View>
        <Text style={styles.meta}>
          {item.is_vendor_account
            ? 'Credit (Vendor Account)'
            : (item.journal_id?.[1] || 'No journal')}
          {!item.active ? '  •  Inactive' : ''}
        </Text>
      </View>
      <TouchableOpacity onPress={() => onDelete(item.id, item.name)} style={{ padding: 6 }}>
        <MaterialIcons name="delete-outline" size={20} color="#dc2626" />
      </TouchableOpacity>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView backgroundColor={NAVY}>
      <NavigationHeader title="Payment Methods" onBackPress={() => navigation.goBack()} />
      <View style={styles.container}>
        {loading && data.length === 0 ? (
          <View style={styles.empty}>
            <ActivityIndicator size="large" color={ORANGE} />
          </View>
        ) : (
          <FlatList
            data={data}
            keyExtractor={(it) => `pm-${it.id}`}
            renderItem={renderItem}
            contentContainerStyle={{ padding: 12, paddingBottom: 80 }}
            refreshing={loading}
            onRefresh={load}
            ListEmptyComponent={(
              <View style={styles.empty}>
                <MaterialIcons name="account-balance-wallet" size={48} color="#cbd5e1" />
                <Text style={styles.emptyText}>No payment methods yet</Text>
                <Text style={styles.emptySub}>Tap + to add one</Text>
              </View>
            )}
          />
        )}

        <TouchableOpacity
          activeOpacity={0.85}
          style={styles.fab}
          onPress={() => navigation.navigate('PaymentMethodForm')}
        >
          <MaterialIcons name="add" size={26} color="#fff" />
          <Text style={styles.fabText}>Add Method</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f6f7fb' },
  card: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', borderRadius: 14, padding: 12, marginBottom: 10,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  iconBox: {
    width: 44, height: 44, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  iconCash: { backgroundColor: '#0ea5e9' },
  iconCredit: { backgroundColor: '#a16207' },
  name: { fontSize: 15, fontFamily: FONT_FAMILY.urbanistBold, color: NAVY },
  meta: { fontSize: 12, color: '#6b7280', marginTop: 2, fontFamily: FONT_FAMILY.urbanistMedium },
  defaultChip: { marginLeft: 8, backgroundColor: ORANGE, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  defaultChipText: { color: '#fff', fontSize: 9, fontFamily: FONT_FAMILY.urbanistBold, letterSpacing: 0.4 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 80 },
  emptyText: { marginTop: 12, fontSize: 14, color: '#6b7280', fontFamily: FONT_FAMILY.urbanistSemiBold },
  emptySub: { fontSize: 12, color: '#9ca3af', marginTop: 4, fontFamily: FONT_FAMILY.urbanistMedium },
  fab: {
    position: 'absolute', right: 16, bottom: 24,
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: ORANGE, paddingVertical: 12, paddingHorizontal: 18, borderRadius: 28,
    shadowColor: ORANGE, shadowOpacity: 0.35, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 8,
  },
  fabText: { color: '#fff', fontFamily: FONT_FAMILY.urbanistBold, fontSize: 14, marginLeft: 4 },
});

export default PaymentMethodsScreen;
