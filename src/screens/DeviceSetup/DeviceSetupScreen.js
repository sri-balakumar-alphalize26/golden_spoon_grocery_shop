// src/screens/DeviceSetup/DeviceSetupScreen.js
import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Keyboard,
  TouchableWithoutFeedback,
  ActivityIndicator,
  Alert,
  TextInput as TextInputNative,
} from 'react-native';
import * as Device from 'expo-device';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import Text from '@components/Text';
import { OverlayLoader } from '@components/Loader';
import { SafeAreaView } from '@components/containers';
import { showToastMessage } from '@components/Toast';
import { FONT_FAMILY } from '@constants/theme';
import * as deviceApi from '@api/services/deviceApi';
import { generateUUIDv4 } from '@utils/uuid';
import ConfirmModal from '@components/Modal/ConfirmModal';

const getDeviceModel = () =>
  Device.deviceName || Device.modelName || 'Unknown Device';

const PURPLE = '#2E294E';
const LIGHT_PURPLE = '#eeecf5';
const BORDER = '#d0ceea';

const Field = ({ error, children }) => (
  <View style={styles.fieldGroup}>
    {children}
    {error ? <Text style={styles.errorText}>{error}</Text> : null}
  </View>
);

const DeviceSetupScreen = () => {
  const navigation = useNavigation();

  const [serverUrl, setServerUrl] = useState('');
  const [databases, setDatabases] = useState([]);
  const [selectedDb, setSelectedDb] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [deviceUUID, setDeviceUUID] = useState('');
  const [loadingDbs, setLoadingDbs] = useState(false);
  const [loadingConfigure, setLoadingConfigure] = useState(false);
  const [dbDropdownOpen, setDbDropdownOpen] = useState(false);
  const [errors, setErrors] = useState({});
  const [notRegisteredOpen, setNotRegisteredOpen] = useState(false);

  useEffect(() => {
    async function init() {
      try {
        const pairs = await AsyncStorage.multiGet([
          'device_uuid',
          'device_server_url',
          'device_db_name',
        ]);
        let uuid = pairs[0][1];
        if (!uuid) {
          uuid = generateUUIDv4();
          await AsyncStorage.setItem('device_uuid', uuid);
        }
        setDeviceUUID(uuid);

        const savedUrl = pairs[1][1];
        if (savedUrl) setServerUrl(savedUrl);
      } catch (_) {}
    }
    init();
  }, []);

  const setError = (field, msg) => setErrors((p) => ({ ...p, [field]: msg }));
  const clearError = (field) => setErrors((p) => ({ ...p, [field]: null }));

  const normalizeUrl = (url = '') => {
    let u = url.trim();
    if (u && !u.startsWith('http')) u = 'http://' + u;
    return u.replace(/\/+$/, '');
  };

  const handleFetchDatabases = async () => {
    Keyboard.dismiss();
    if (!serverUrl.trim()) return;
    clearError('serverUrl');
    setLoadingDbs(true);
    setDatabases([]);
    setSelectedDb('');
    setDbDropdownOpen(false);

    try {
      const dbs = await deviceApi.fetchDatabases(normalizeUrl(serverUrl));
      if (!dbs || dbs.length === 0) {
        setError('serverUrl', 'Could not fetch databases — check the URL and try again');
      } else {
        setDatabases(dbs);
        setDbDropdownOpen(true);
      }
    } catch (err) {
      console.warn('[DeviceSetup] fetchDatabases error:', err.message);
      const msg = err.message || '';
      if (msg.includes('timeout')) {
        setError('serverUrl', 'Connection timed out — is the server running?');
      } else if (msg.includes('Network Error') || msg.includes('ECONNREFUSED')) {
        setError('serverUrl', 'Cannot reach server — check the IP address and port');
      } else if (msg.includes('404')) {
        setError('serverUrl', 'Server found but database listing is disabled or module not installed');
      } else {
        setError('serverUrl', `Cannot fetch databases: ${msg}`);
      }
    } finally {
      setLoadingDbs(false);
    }
  };

  const handleConfigure = async () => {
    Keyboard.dismiss();
    let valid = true;
    if (!serverUrl.trim()) {
      setError('serverUrl', 'Server URL is required');
      valid = false;
    }
    if (!selectedDb) {
      setError('db', 'Select a database');
      valid = false;
    }
    if (!username.trim()) {
      setError('username', 'Username is required');
      valid = false;
    }
    if (!password.trim()) {
      setError('password', 'Password is required');
      valid = false;
    }
    if (!valid) return;

    const base = normalizeUrl(serverUrl);
    setLoadingConfigure(true);
    try {
      // Step 1 — Authenticate
      const session = await deviceApi.authenticate(base, selectedDb, username.trim(), password);
      if (!session.uid || session.uid === false) {
        setError('username', 'Invalid username or password');
        return;
      }

      // Step 2 — Check if device_login_config module is installed
      const moduleInstalled = await deviceApi.isModuleInstalled(
        base, selectedDb, session.uid, password, 'device_login_config'
      );
      if (!moduleInstalled) {
        Alert.alert(
          'Device Module Not Installed',
          'The "device_login_config" module is not installed on this Odoo server.\n\nPlease ask your admin to install it before configuring this device.',
          [{ text: 'OK' }]
        );
        return;
      }

      // Step 3 — Lookup device
      const lookup = await deviceApi.lookupDevice(base, deviceUUID, selectedDb);

      if (lookup.status === 'not_found') {
        const prevRegistered = await AsyncStorage.getItem('device_registered');
        if (prevRegistered === 'true') {
          Alert.alert(
            'Server IP Changed?',
            'This device was previously configured but is not found on this server IP.\n\nIf you changed WiFi/network, tap "Update & Continue" to use the new server address.',
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Update & Continue',
                onPress: async () => {
                  await AsyncStorage.multiSet([
                    ['device_server_url', base],
                    ['device_db_name', selectedDb],
                  ]);
                  navigation.reset({ index: 0, routes: [{ name: 'LoginScreenOdoo' }] });
                },
              },
              {
                text: 'Scan QR',
                onPress: () => navigation.navigate('DeviceQRScanner', {
                  deviceUUID,
                  deviceModel: getDeviceModel(),
                  serverUrl: base,
                }),
              },
            ]
          );
        } else {
          setNotRegisteredOpen(true);
        }
        return;
      }

      if (lookup.status === 'blocked' || lookup.device_status === 'blocked') {
        Alert.alert(
          'Device Blocked',
          'This device has been blocked by the administrator.\nContact your Odoo admin to unblock it.',
          [{ text: 'OK' }]
        );
        return;
      }

      if (lookup.status === 'error') {
        showToastMessage(lookup.message || 'Server error during lookup. Check URL and database.');
        return;
      }

      // Step 4 — Activate
      const activate = await deviceApi.activateDevice(base, deviceUUID, selectedDb);

      if (activate.status === 'activated' || activate.status === 'already_active') {
        await AsyncStorage.multiSet([
          ['device_server_url', base],
          ['device_db_name', selectedDb],
          ['device_registered', 'true'],
        ]);
        navigation.reset({ index: 0, routes: [{ name: 'LoginScreenOdoo' }] });
        return;
      }

      if (activate.status === 'blocked') {
        Alert.alert('Device Blocked', 'This device has been blocked by the administrator.', [{ text: 'OK' }]);
        return;
      }

      showToastMessage(activate.message || 'Activation failed. Try again.');

    } catch (err) {
      const msg = err.message || '';
      const isNetworkError = !err.response && (
        err.code === 'ECONNABORTED' ||
        err.code === 'ECONNREFUSED' ||
        err.code === 'ENOTFOUND' ||
        err.code === 'ERR_NETWORK' ||
        msg.includes('timeout') ||
        msg.includes('Network Error') ||
        msg.includes('ECONNREFUSED') ||
        msg.includes('Network request failed')
      );

      if (msg.includes('timeout') || err.code === 'ECONNABORTED') {
        showToastMessage('Connection timed out. Check your network and server URL.');
      } else if (isNetworkError) {
        showToastMessage('Cannot reach server. Check the URL and ensure Odoo is running.');
      } else {
        showToastMessage(`Error: ${msg}`);
      }
    } finally {
      setLoadingConfigure(false);
    }
  };

  const isLoading = loadingDbs || loadingConfigure;

  return (
    <TouchableWithoutFeedback
      onPress={() => { Keyboard.dismiss(); setDbDropdownOpen(false); }}
    >
      <SafeAreaView backgroundColor={PURPLE}>
        <OverlayLoader visible={loadingConfigure} />

        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <View style={styles.iconCircle}>
              <Text style={styles.iconText}>⚙</Text>
            </View>
            <Text style={styles.headerTitle}>Device Setup</Text>
            <Text style={styles.headerSubtitle}>
              Configure this device to connect to your server
            </Text>
          </View>

          <View style={styles.card}>

            <View style={styles.stepRow}>
              <View style={styles.stepBadge}><Text style={styles.stepNum}>1</Text></View>
              <Text style={styles.stepTitle}>Server URL</Text>
            </View>

            <Field error={errors.serverUrl}>
              <View style={styles.urlInputRow}>
                <TextInputNative
                  value={serverUrl}
                  onChangeText={(t) => {
                    setServerUrl(t);
                    clearError('serverUrl');
                    setDatabases([]);
                    setSelectedDb('');
                    setDbDropdownOpen(false);
                  }}
                  onFocus={() => clearError('serverUrl')}
                  onBlur={() => { if (serverUrl.trim()) handleFetchDatabases(); }}
                  onSubmitEditing={() => { if (serverUrl.trim()) handleFetchDatabases(); }}
                  placeholder="Enter the URL (http:// or https://)"
                  placeholderTextColor="#bbb"
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                  returnKeyType="done"
                  style={[styles.nativeInput, styles.urlInput, errors.serverUrl && styles.inputError]}
                />
                {loadingDbs && (
                  <ActivityIndicator size="small" color={PURPLE} style={styles.urlSpinner} />
                )}
              </View>
            </Field>

            <View style={styles.divider} />

            <View style={styles.stepRow}>
              <View style={styles.stepBadge}><Text style={styles.stepNum}>2</Text></View>
              <Text style={styles.stepTitle}>Database</Text>
            </View>

            <Field error={errors.db}>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => {
                  if (databases.length > 0) setDbDropdownOpen((o) => !o);
                }}
                style={[styles.nativeInput, styles.dbSelector, errors.db && styles.inputError]}
              >
                <Text style={selectedDb ? styles.dbSelectedText : styles.dbPlaceholderText}>
                  {selectedDb || (databases.length === 0 ? 'Enter URL above to load databases' : 'Select a database')}
                </Text>
                {databases.length > 0 && (
                  <Text style={styles.chevron}>{dbDropdownOpen ? '▲' : '▼'}</Text>
                )}
              </TouchableOpacity>

              {dbDropdownOpen && databases.length > 0 && (
                <View style={styles.dropdown}>
                  <ScrollView
                    nestedScrollEnabled
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator
                    style={styles.dropdownScroll}
                  >
                    {databases.map((item) => (
                      <TouchableOpacity
                        key={item}
                        style={[styles.dropdownItem, item === selectedDb && styles.dropdownItemActive]}
                        onPress={() => {
                          setSelectedDb(item);
                          clearError('db');
                          setDbDropdownOpen(false);
                        }}
                      >
                        <Text style={[styles.dropdownItemText, item === selectedDb && styles.dropdownItemTextActive]}>
                          {item}
                        </Text>
                        {item === selectedDb && <Text style={styles.checkmark}>✓</Text>}
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}
            </Field>

            <View style={styles.divider} />

            <View style={styles.stepRow}>
              <View style={styles.stepBadge}><Text style={styles.stepNum}>3</Text></View>
              <Text style={styles.stepTitle}>Admin Credentials</Text>
            </View>

            <Field error={errors.username}>
              <TextInputNative
                value={username}
                onChangeText={(t) => { setUsername(t); clearError('username'); }}
                onFocus={() => clearError('username')}
                placeholder="Username"
                placeholderTextColor="#bbb"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="next"
                style={[styles.nativeInput, errors.username && styles.inputError]}
              />
            </Field>

            <Field error={errors.password}>
              <TextInputNative
                value={password}
                onChangeText={(t) => { setPassword(t); clearError('password'); }}
                onFocus={() => clearError('password')}
                placeholder="Password"
                placeholderTextColor="#bbb"
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="done"
                style={[styles.nativeInput, errors.password && styles.inputError]}
              />
            </Field>

            <View style={styles.divider} />

            <TouchableOpacity
              style={[styles.registerBtn, isLoading && styles.btnDisabled]}
              onPress={handleConfigure}
              disabled={isLoading}
              activeOpacity={0.8}
            >
              {loadingConfigure ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.registerBtnText}>Configure Device</Text>
              )}
            </TouchableOpacity>

            <Text style={styles.hint}>
              Your Device ID must be pre-registered by your admin.{'\n'}
              You only need to do this once per device.
            </Text>

          </View>
        </ScrollView>

        <ConfirmModal
          isVisible={notRegisteredOpen}
          title="Device Not Registered"
          message={`This device is not registered.\n\nDevice Model: ${getDeviceModel()}\nDevice ID: ${deviceUUID}\n\nAsk your admin to open Device Registry → New Device — a QR code will appear. Then tap Scan QR below.`}
          confirmLabel="Scan QR"
          cancelLabel="OK"
          onCancel={() => setNotRegisteredOpen(false)}
          onConfirm={() => {
            setNotRegisteredOpen(false);
            navigation.navigate('DeviceQRScanner', {
              deviceUUID,
              deviceModel: getDeviceModel(),
              serverUrl: normalizeUrl(serverUrl),
            });
          }}
        />
      </SafeAreaView>
    </TouchableWithoutFeedback>
  );
};

const styles = StyleSheet.create({
  scroll: {
    flexGrow: 1,
    paddingBottom: 40,
  },
  header: {
    alignItems: 'center',
    paddingTop: 20,
    paddingBottom: 28,
    paddingHorizontal: 24,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  iconText: {
    fontSize: 28,
    color: '#fff',
  },
  headerTitle: {
    fontSize: 26,
    fontFamily: FONT_FAMILY.urbanistBold,
    color: '#fff',
    marginBottom: 6,
  },
  headerSubtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.85)',
    textAlign: 'center',
    lineHeight: 19,
  },
  card: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    flex: 1,
    paddingHorizontal: 22,
    paddingTop: 24,
    paddingBottom: 20,
    minHeight: 500,
  },
  urlInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  urlInput: {
    flex: 1,
  },
  urlSpinner: {
    position: 'absolute',
    right: 14,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: 8,
  },
  stepBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: PURPLE,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepNum: {
    color: '#fff',
    fontSize: 12,
    fontFamily: FONT_FAMILY.urbanistBold,
  },
  stepTitle: {
    fontSize: 15,
    fontFamily: FONT_FAMILY.urbanistBold,
    color: '#2e2a4f',
    flex: 1,
  },
  fieldGroup: {
    marginBottom: 10,
  },
  nativeInput: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 14,
    color: '#222',
    backgroundColor: '#fafafa',
    fontFamily: FONT_FAMILY.urbanistBold,
  },
  inputError: {
    borderColor: '#e74c3c',
    backgroundColor: '#fff8f8',
  },
  errorText: {
    color: '#e74c3c',
    fontSize: 12,
    marginTop: 4,
    marginLeft: 2,
  },
  dbSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dbSelectedText: {
    color: '#222',
    fontSize: 14,
    fontFamily: FONT_FAMILY.urbanistBold,
    flex: 1,
  },
  dbPlaceholderText: {
    color: '#bbb',
    fontSize: 14,
    flex: 1,
  },
  chevron: {
    color: '#999',
    fontSize: 11,
    marginLeft: 6,
  },
  dropdown: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 10,
    backgroundColor: '#fff',
    marginTop: 4,
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    maxHeight: 220,
  },
  dropdownScroll: {
    maxHeight: 220,
  },
  dropdownItem: {
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: '#f4f4f4',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dropdownItemActive: {
    backgroundColor: LIGHT_PURPLE,
  },
  dropdownItemText: {
    fontSize: 14,
    color: '#333',
  },
  dropdownItemTextActive: {
    color: PURPLE,
    fontFamily: FONT_FAMILY.urbanistBold,
  },
  checkmark: {
    color: PURPLE,
    fontSize: 14,
    fontFamily: FONT_FAMILY.urbanistBold,
  },
  registerBtn: {
    backgroundColor: '#F47B20',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 14,
    elevation: 2,
    shadowColor: '#F47B20',
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  registerBtnText: {
    color: '#fff',
    fontSize: 16,
    fontFamily: FONT_FAMILY.urbanistBold,
    letterSpacing: 0.3,
  },
  btnDisabled: {
    opacity: 0.6,
  },
  divider: {
    height: 1,
    backgroundColor: '#f0e8f4',
    marginVertical: 16,
  },
  hint: {
    fontSize: 12,
    color: '#aaa',
    textAlign: 'center',
    lineHeight: 18,
    marginTop: 4,
  },
});

export default DeviceSetupScreen;
