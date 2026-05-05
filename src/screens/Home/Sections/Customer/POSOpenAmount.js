import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Key used to persist opened register info (supports multiple opened registers)
const OPENED_REGISTER_KEY = 'opened_register';
import { SafeAreaView } from '@components/containers';
import { NavigationHeader } from '@components/Header';
import { Button } from '@components/common/Button';

const POSOpenAmount = ({ navigation, route }) => {
  const [amount, setAmount] = useState('0.00');
  const register = route?.params?.register || null;

  const handleOpen = async () => {
    const parsed = parseFloat(amount);
    if (!parsed || parsed <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid opening amount greater than zero.');
      return;
    }

    // Persist opened register with opening amount so other screens know register(s) open
    try {
      const opened = {
        register: register || null,
        openingAmount: parsed,
        openedAt: new Date().toISOString(),
      };

      // Read existing stored value and convert to array if necessary
      const raw = await AsyncStorage.getItem(OPENED_REGISTER_KEY);
      let arr = [];
      if (raw) {
        try {
          const parsedRaw = JSON.parse(raw);
          if (Array.isArray(parsedRaw)) arr = parsedRaw;
          else if (parsedRaw) arr = [parsedRaw];
        } catch (e) {
          // if parse fails, overwrite
          arr = [];
        }
      }

      // Avoid duplicates (by register id) -- replace existing if same id
      if (opened.register && opened.register.id) {
        const idx = arr.findIndex((x) => x.register && x.register.id === opened.register.id);
        if (idx !== -1) arr[idx] = opened;
        else arr.push(opened);
      } else {
        arr.push(opened);
      }

      await AsyncStorage.setItem(OPENED_REGISTER_KEY, JSON.stringify(arr));
      console.log('Persisted opened_registers:', arr);
    } catch (err) {
      console.warn('Failed to persist opened register', err);
    }

    // Navigate to POS products screen and pass openingAmount and register
    navigation.navigate('POSProducts', { openingAmount: parsed, register });
  };

  return (
    <SafeAreaView style={styles.container}>
      <NavigationHeader title="Opening Amount" onBackPress={() => navigation.goBack()} />
      <View style={styles.content}>
        <Text style={styles.title}>Enter Opening Amount</Text>
        <Text style={styles.subtitle}>This amount will be used as the register opening cash.</Text>

        <TextInput
          keyboardType="numeric"
          value={amount}
          onChangeText={setAmount}
          style={styles.input}
        />

        <View style={{ marginTop: 20, alignItems: 'center' }}>
          <Button title="Open" onPress={handleOpen} style={styles.openBtn} textStyle={{ fontSize: 18 }} />
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f6f8fa', justifyContent: 'flex-start' },
  content: { padding: 28, backgroundColor: '#fff', borderRadius: 20, marginHorizontal: 20, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 16, elevation: 8, minHeight: 360, justifyContent: 'flex-start', marginTop: 80 },
  title: { fontSize: 30, fontWeight: '800', marginTop: 6, color: '#111', textAlign: 'center' },
  subtitle: { color: '#444', marginTop: 12, marginBottom: 20, textAlign: 'center', fontSize: 18 },
  input: { marginTop: 8, padding: 16, borderWidth: 1, borderColor: '#eee', borderRadius: 10, fontSize: 22, color: '#222', backgroundColor: '#f6f8fa', textAlign: 'center', height: 64 },
  openBtn: { width: '90%', paddingVertical: 14, borderRadius: 10 },
});

export default POSOpenAmount;
