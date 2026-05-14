// src/screens/Auth/LoginScreenOdoo.js
import React, { useState, useEffect } from "react";
import {
  View,
  Keyboard,
  StyleSheet,
  Image,
  TouchableWithoutFeedback,
  TouchableOpacity,
  LogBox,
} from "react-native";
import { COLORS, FONT_FAMILY, BORDER_RADIUS } from "@constants/theme";
import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";
import { useNavigation } from "@react-navigation/native";

import { Button } from "@components/common/Button";
import { post } from "@api/services/utils";
import { fetchPOSRegisters, fetchPOSSessions } from "@api/services/generalApi";
import Text from "@components/Text";
import { TextInput } from "@components/common/TextInput";
import { RoundedScrollContainer, SafeAreaView } from "@components/containers";
import { useAuthStore } from "@stores/auth";
import { showToastMessage } from "@components/Toast";

import { setRuntimeBaseUrl, setRuntimeDb } from "@api/config/odooConfig";
import { fetchCompanyCurrency, fetchUserCompanyId, fetchDecimalAccuracy } from "@api/services/currencyApi";
import { saveCurrencyConfig } from "@utils/currency";
import { useCurrencyStore } from "@stores/currency";

LogBox.ignoreLogs(["new NativeEventEmitter"]);
LogBox.ignoreAllLogs();

const LOGIN_BG = "#FFF8F1";

const isOdooUrl = (url = "") => {
  const lower = url.toLowerCase().trim();
  if (!lower) return false;
  return (
    lower.startsWith("http") ||
    lower.includes("ngrok") ||
    lower.includes("odoo") ||
    lower.includes("/web") ||
    lower.includes(":8069") ||
    /\d+\.\d+\.\d+\.\d+/.test(lower)
  );
};

const normalizeUrl = (raw = "") => {
  const trimmed = raw.trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  return trimmed.startsWith("http") ? trimmed : `https://${trimmed}`;
};

// Per-(URL+DB) credential storage helpers. Lets users save & auto-fill
// credentials for multiple Odoo servers / databases.
const _credKey = (baseUrl, db) => {
  const u = String(baseUrl || "").trim().toLowerCase().replace(/\/+$/, "");
  const d = String(db || "").trim();
  return u && d ? `${u}|${d}` : "";
};
const _readSavedMap = async () => {
  try {
    const raw = await AsyncStorage.getItem("saved_credentials");
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed;
  } catch (_) {
    return {};
  }
};
const _writeSavedMap = async (map) => {
  try {
    await AsyncStorage.setItem("saved_credentials", JSON.stringify(map));
  } catch (_) {}
};

const LoginScreenOdoo = () => {
  const navigation = useNavigation();
  const setUser = useAuthStore((state) => state.login);

  LogBox.ignoreLogs(["Non-serializable values were found in the navigation state"]);

  // Server URL and database come from the device config (set in DeviceSetup),
  // not from user input on the Login screen. Username/password are the only
  // editable inputs here.
  const [inputs, setInputs] = useState({
    baseUrl: "",
    username: "",
    password: "",
  });
  const [selectedDb, setSelectedDb] = useState("");
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);

  // Auto-fill credentials toggle. When ON, username + password auto-populate
  // from the saved-credentials map keyed by the current URL+DB.
  const [autoCredentials, setAutoCredentials] = useState(false);

  // Hydrate URL + DB from device config, and migrate legacy `savedCredentials`
  // username/password into the per-(URL+DB) `saved_credentials` map.
  useEffect(() => {
    (async () => {
      try {
        const pairs = await AsyncStorage.multiGet([
          "device_server_url",
          "device_db_name",
          "savedCredentials",
        ]);
        const deviceUrl = pairs[0][1] || "";
        const deviceDb = pairs[1][1] || "";
        const rawSaved = pairs[2][1];

        setInputs((prev) => ({ ...prev, baseUrl: deviceUrl }));
        if (deviceDb) setSelectedDb(deviceDb);

        if (rawSaved) {
          const c = JSON.parse(rawSaved);
          if (c.username || c.password) {
            setInputs((prev) => ({
              ...prev,
              username: c.username || "",
              password: c.password || "",
            }));
          }
          // One-time migration into the new map. Idempotent.
          if (c.baseUrl && c.db && (c.username || c.password)) {
            const key = _credKey(c.baseUrl, c.db);
            if (key) {
              const map = await _readSavedMap();
              if (!map[key]) {
                map[key] = { username: c.username || "", password: c.password || "" };
                await _writeSavedMap(map);
              }
            }
          }
        }
      } catch (_) {}
    })();
  }, []);

  // Auto-fill credentials when the toggle is ON and URL+DB are both set.
  // Re-fires when the user switches URL or DB so the right combo's creds
  // pop in automatically.
  useEffect(() => {
    if (!autoCredentials) return;
    const url = inputs.baseUrl?.trim();
    const db = selectedDb?.trim();
    if (!url || !db) return;
    (async () => {
      const map = await _readSavedMap();
      const entry = map[_credKey(url, db)];
      if (entry && (entry.username || entry.password)) {
        setInputs((prev) => ({
          ...prev,
          username: entry.username || "",
          password: entry.password || "",
        }));
      } else {
        showToastMessage("No saved credentials yet — log in once to save");
        setInputs((prev) => ({ ...prev, username: "", password: "" }));
      }
    })();
  }, [inputs.baseUrl, selectedDb, autoCredentials]);

  const toggleAutoCredentials = () => {
    if (autoCredentials) {
      setAutoCredentials(false);
      setInputs((prev) => ({ ...prev, username: "", password: "" }));
      return;
    }
    const url = inputs.baseUrl?.trim();
    const db = selectedDb?.trim();
    if (!url || !db) {
      showToastMessage("Please enter server URL and select database first");
      return;
    }
    setAutoCredentials(true);
    // The effect above fills the fields.
  };

  const handleOnchange = (text, input) => {
    setInputs((prev) => ({ ...prev, [input]: text }));
  };

  const handleError = (error, input) => {
    setErrors((prev) => ({ ...prev, [input]: error }));
  };

  const validate = () => {
    Keyboard.dismiss();
    let isValid = true;
    if (!inputs.username) { handleError("Please input user name", "username"); isValid = false; }
    if (!inputs.password) { handleError("Please input password", "password"); isValid = false; }
    if (isValid) login();
  };

  const login = async () => {
    setLoading(true);
    try {
      const url = inputs.baseUrl.trim();
      const username = inputs.username;
      const password = inputs.password;
      const useOdoo = url && isOdooUrl(url);

      if (useOdoo) {
        const finalOdooUrl = normalizeUrl(url);
        const dbNameUsed = (selectedDb && selectedDb.trim()) || "";
        if (!finalOdooUrl) {
          showToastMessage("Please enter a server URL");
          return;
        }
        if (!dbNameUsed) {
          showToastMessage("Please select or enter a database");
          return;
        }

        const response = await axios.post(
          `${finalOdooUrl}/web/session/authenticate`,
          {
            jsonrpc: "2.0",
            method: "call",
            params: { db: dbNameUsed, login: username, password },
          },
          { headers: { "Content-Type": "application/json" }, withCredentials: true }
        );

        if (response.data?.result?.uid) {
          const userData = response.data.result;
          try { setRuntimeBaseUrl(finalOdooUrl); } catch (_) {}
          try { setRuntimeDb(dbNameUsed); } catch (_) {}
          try { await AsyncStorage.setItem("odoo_db", dbNameUsed); } catch (_) {}
          await AsyncStorage.setItem("userData", JSON.stringify(userData));

          const setCookieHeader = response.headers["set-cookie"];
          if (setCookieHeader && String(setCookieHeader).includes("session_id=")) {
            const sessionId = String(setCookieHeader).split("session_id=")[1]?.split(";")[0];
            if (sessionId) await AsyncStorage.setItem("odoo_session_id", sessionId);
          }

          await AsyncStorage.setItem(
            "savedCredentials",
            JSON.stringify({ baseUrl: url, db: dbNameUsed, username, password })
          );
          // Also write into the per-(URL+DB) map so the Auto Fill toggle
          // can pick this combo up next time the user lands on the same
          // server + database.
          try {
            const key = _credKey(finalOdooUrl, dbNameUsed);
            if (key) {
              const map = await _readSavedMap();
              map[key] = { username, password };
              await _writeSavedMap(map);
            }
          } catch (_) {}

          setUser(userData);

          // Refresh currency from the connected Odoo company so the UI
          // renders the right symbol/name. Fire-and-forget — never delays
          // navigation. If it fails, the last cached currency stays in use.
          (async () => {
            try {
              let companyId = Array.isArray(userData?.company_id)
                ? userData.company_id[0]
                : (userData?.company_id || null);
              console.log('[CURRENCY:LOGIN] post-login fetch begin companyId=', companyId, 'userData.company_id=', userData?.company_id);
              if (!companyId) {
                // Odoo 17+ omits company_id from /web/session/authenticate;
                // resolve it via res.users.read.
                try {
                  companyId = await fetchUserCompanyId(finalOdooUrl, dbNameUsed, userData.uid, password);
                  console.log('[CURRENCY:LOGIN] resolved companyId via res.users.read =', companyId);
                } catch (e) {
                  console.warn('[CURRENCY:LOGIN] could not resolve companyId:', e?.message || e);
                  return;
                }
              }
              const cfg = await fetchCompanyCurrency(
                finalOdooUrl, dbNameUsed, userData.uid, password, companyId
              );
              console.log('[CURRENCY:LOGIN] fetchCompanyCurrency returned cfg=', cfg);
              if (cfg && (cfg.symbol || cfg.name)) {
                await saveCurrencyConfig(cfg);
                useCurrencyStore.getState().setCurrencyConfig(cfg);
                useAuthStore.getState().setCurrency(cfg);
                console.log('[CURRENCY:LOGIN] saved + pushed to both stores =', cfg);
              } else {
                console.warn('[CURRENCY:LOGIN] cfg missing symbol/name — not persisted. cfg=', cfg);
              }
            } catch (e) {
              console.warn('[CURRENCY:LOGIN] fetch after login failed:', e?.message || e);
            }

            // Independent of currency: fetch decimal.precision so the app
            // mirrors Odoo's Settings → Technical → Decimal Accuracy.
            try {
              const digitsMap = await fetchDecimalAccuracy(
                finalOdooUrl, dbNameUsed, userData.uid, password
              );
              await AsyncStorage.setItem('decimalAccuracy', JSON.stringify(digitsMap));
              useAuthStore.getState().setDecimalAccuracy(digitsMap);
              console.log('[CURRENCY:LOGIN] saved + pushed decimalAccuracy =', digitsMap);
            } catch (e) {
              console.warn('[CURRENCY:LOGIN] decimal.precision fetch failed:', e?.message || e);
            }
          })();

          // Eagerly preload POS registers + open sessions right after login
          // so the [POSRegister] logs surface immediately (instead of when
          // the user navigates to that screen).
          console.log('[POSRegister] loading registers and open sessions');
          const tPreload = Date.now();
          Promise.all([
            fetchPOSRegisters(),
            fetchPOSSessions({ state: 'opened' }),
          ])
            .then(([regs, sessions]) => {
              console.log('[POSRegister] loaded', {
                registers: Array.isArray(regs) ? regs.length : 0,
                openSessions: Array.isArray(sessions) ? sessions.length : 0,
                ms: Date.now() - tPreload,
              });
            })
            .catch((e) => {
              console.error('[POSRegister] preload error after login:', e?.message || e);
            });

          navigation.navigate("AppNavigator");
        } else {
          showToastMessage("Invalid Odoo credentials");
        }
      } else {
        // UAE admin fallback
        const response = await post("/viewuser/login", { user_name: username, password });
        if (response?.success === true && response.data?.length) {
          const userData = response.data[0];
          await AsyncStorage.setItem("userData", JSON.stringify(userData));
          await AsyncStorage.setItem(
            "savedCredentials",
            JSON.stringify({ baseUrl: "", db: "", username, password })
          );
          setUser(userData);
          navigation.navigate("AppNavigator");
        } else {
          showToastMessage("Invalid admin credentials");
        }
      }
    } catch (error) {
      showToastMessage(`Error! ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <TouchableWithoutFeedback onPress={() => Keyboard.dismiss()}>
      <SafeAreaView backgroundColor={LOGIN_BG}>
        {/* Loader removed during login per UX requirement; submit button has its own disabled state. */}

        <View style={styles.imageContainer}>
          <TouchableOpacity
            onPress={() => navigation.navigate("DeviceSetup")}
            style={styles.gearBtn}
            activeOpacity={0.7}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={styles.gearIcon}>⚙</Text>
          </TouchableOpacity>
          <View style={styles.logoWrapper}>
            <Image
              source={require("@assets/images/header/logo_header.png")}
              style={{ width: 260, height: 234, alignSelf: "center" }}
              resizeMode="contain"
            />
          </View>
        </View>

        <RoundedScrollContainer
          backgroundColor={LOGIN_BG}
          paddingHorizontal={15}
          borderTopLeftRadius={40}
          borderTopRightRadius={40}
        >
          <View style={{ paddingTop: 12 }}>
            <View style={styles.titleBlock}>
              <Text style={styles.titleText}>Welcome back</Text>
              <Text style={styles.subtitleText}>Login to continue to your store</Text>
            </View>

            <View style={styles.formCard}>
              <Text style={styles.sectionLabel}>ACCOUNT</Text>

              {/* Username */}
              <TextInput
                value={inputs.username}
                onChangeText={(text) => handleOnchange(text, "username")}
                onFocus={() => handleError(null, "username")}
                iconName="account-outline"
                label="Username or Email"
                placeholder="Enter Username or Email"
                error={errors.username}
                column={true}
                login={true}
              />

              {/* Password */}
              <TextInput
                value={inputs.password}
                onChangeText={(text) => handleOnchange(text, "password")}
                onFocus={() => handleError(null, "password")}
                error={errors.password}
                iconName="lock-outline"
                label="Password"
                placeholder="Enter password"
                password
                column={true}
                login={true}
              />

              {/* Auto Fill Credentials toggle — looks up { username, password }
                  for the current URL+DB and fills the fields. Saves on each
                  successful login. */}
              <TouchableOpacity
                onPress={toggleAutoCredentials}
                activeOpacity={0.85}
                style={styles.autoFillRow}
              >
                <Text style={styles.autoFillLabel} numberOfLines={1}>
                  Auto Fill Credentials
                </Text>
                <View
                  style={[
                    styles.autoFillTrack,
                    { backgroundColor: autoCredentials ? COLORS.primaryThemeColor : "#ccc" },
                  ]}
                >
                  <View
                    style={[
                      styles.autoFillThumb,
                      { alignSelf: autoCredentials ? "flex-end" : "flex-start" },
                    ]}
                  />
                </View>
              </TouchableOpacity>

              <View style={styles.bottom}>
                <Button title="Login" onPress={validate} />
              </View>
            </View>
          </View>
        </RoundedScrollContainer>
      </SafeAreaView>
    </TouchableWithoutFeedback>
  );
};

const styles = StyleSheet.create({
  imageContainer: {
    alignItems: "center",
    marginBottom: "4%",
    position: "relative",
  },
  gearBtn: {
    position: "absolute",
    top: 12,
    right: 16,
    zIndex: 10,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.05)",
    justifyContent: "center",
    alignItems: "center",
  },
  gearIcon: {
    fontSize: 20,
    color: "#555",
  },
  logoWrapper: {
    backgroundColor: "transparent",
    borderRadius: 12,
    padding: 8,
  },
  titleBlock: {
    alignItems: "center",
    marginTop: 4,
    marginBottom: 10,
  },
  formCard: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.large,
    paddingHorizontal: 18,
    paddingVertical: 22,
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: "#EFEFEF",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.10,
    shadowRadius: 16,
    elevation: 6,
  },
  titleText: {
    fontSize: 26,
    fontFamily: FONT_FAMILY.urbanistBold,
    color: "#2e2a4f",
    letterSpacing: 0.3,
  },
  subtitleText: {
    fontSize: 13,
    fontFamily: FONT_FAMILY.urbanistMedium,
    color: "#9aa0a6",
    marginTop: 6,
  },
  sectionLabel: {
    fontSize: 11,
    fontFamily: FONT_FAMILY.urbanistBold,
    color: "#9aa0a6",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: 6,
    marginLeft: 2,
  },
  bottom: {
    alignItems: "center",
    marginTop: 14,
  },
  autoFillRow: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-end",
    gap: 8,
    marginTop: 8,
    marginBottom: 4,
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  autoFillLabel: {
    fontSize: 12,
    fontFamily: FONT_FAMILY.urbanistBold,
    color: "#555",
  },
  autoFillTrack: {
    width: 40,
    height: 22,
    borderRadius: 11,
    justifyContent: "center",
    paddingHorizontal: 2,
  },
  autoFillThumb: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#fff",
  },
});

export default LoginScreenOdoo;
