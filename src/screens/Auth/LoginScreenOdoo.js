// src/screens/Auth/LoginScreenOdoo.js
import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Keyboard,
  StyleSheet,
  Image,
  TouchableWithoutFeedback,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  LogBox,
} from "react-native";
import { COLORS, FONT_FAMILY } from "@constants/theme";
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

LogBox.ignoreLogs(["new NativeEventEmitter"]);
LogBox.ignoreAllLogs();

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

  // Defaults — local Odoo running on the same machine. Auto-filled on cold
  // start so the user only needs to tap Login. `savedCredentials` (if any)
  // overrides these in the restore effect below.
  const DEFAULT_BASE_URL = "http://localhost:8069";
  const DEFAULT_USERNAME = "admin";
  const DEFAULT_PASSWORD = "admin";

  const [inputs, setInputs] = useState({
    baseUrl: DEFAULT_BASE_URL,
    username: DEFAULT_USERNAME,
    password: DEFAULT_PASSWORD,
  });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);

  // DB dropdown state
  const [dbList, setDbList] = useState([]);
  const [selectedDb, setSelectedDb] = useState("");
  const [dbOpen, setDbOpen] = useState(false);
  const [dbFetchState, setDbFetchState] = useState("idle"); // idle | loading | ok | empty | error

  // Auto-fill credentials toggle. When ON, username + password auto-populate
  // from the saved-credentials map keyed by the current URL+DB.
  const [autoCredentials, setAutoCredentials] = useState(false);

  const debounceRef = useRef(null);
  const lastFetchedUrlRef = useRef("");

  // Restore saved credentials. If nothing has been saved yet, the form keeps
  // the localhost / admin defaults seeded above. Also migrate the legacy
  // single-blob `savedCredentials` into the new per-(URL+DB) `saved_credentials`
  // map so the Auto Fill toggle works without forcing a fresh login.
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem("savedCredentials");
        if (raw) {
          const c = JSON.parse(raw);
          setInputs({
            baseUrl: c.baseUrl || DEFAULT_BASE_URL,
            username: c.username || DEFAULT_USERNAME,
            password: c.password || DEFAULT_PASSWORD,
          });
          if (c.db) setSelectedDb(c.db);
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

  // Auto-fetch DB list when URL changes (debounced)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const url = inputs.baseUrl.trim();
    if (!url || !isOdooUrl(url)) {
      setDbList([]);
      setDbFetchState("idle");
      lastFetchedUrlRef.current = "";
      return;
    }
    debounceRef.current = setTimeout(() => fetchDatabases(url), 700);
    return () => debounceRef.current && clearTimeout(debounceRef.current);
  }, [inputs.baseUrl]);

  const fetchDatabases = async (rawUrl) => {
    const normalized = normalizeUrl(rawUrl);
    if (!normalized || lastFetchedUrlRef.current === normalized) return;
    lastFetchedUrlRef.current = normalized;
    setDbFetchState("loading");
    try {
      const res = await axios.post(
        `${normalized}/web/database/list`,
        { jsonrpc: "2.0", method: "call", params: {} },
        { headers: { "Content-Type": "application/json" }, timeout: 8000 }
      );
      const list = Array.isArray(res?.data?.result) ? res.data.result : [];
      if (list.length > 0) {
        setDbList(list);
        setDbFetchState("ok");
        // Don't auto-pick the first database — keep "Select a database" as
        // the placeholder so the user explicitly chooses. Only preserve a
        // previously-set value if it still exists in the fetched list.
        setSelectedDb((prev) => (prev && list.includes(prev) ? prev : ""));
      } else {
        setDbList([]);
        setDbFetchState("empty");
      }
    } catch (_) {
      setDbList([]);
      setDbFetchState("error");
    }
  };

  const handleOnchange = (text, input) => {
    if (input === "baseUrl") {
      // URL is being edited — credentials and DB belong to the previous
      // server, so wipe them so the user doesn't accidentally submit a
      // stale combo. Doesn't fire on the initial restore effect since that
      // calls setInputs directly, not via this handler.
      setInputs((prev) => {
        if (prev.baseUrl === text) return prev;
        return { ...prev, baseUrl: text, username: "", password: "" };
      });
      setSelectedDb("");
      setDbList([]);
      setDbFetchState("idle");
      return;
    }
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

  const dbPlaceholder = () => {
    if (!inputs.baseUrl.trim()) return "Enter Server URL above to load databases";
    if (dbFetchState === "loading") return "Fetching databases…";
    if (dbFetchState === "error") return "Couldn't reach server — check URL";
    if (dbFetchState === "empty") return "No databases found on this server";
    return "Select a database";
  };

  const canOpenDb = dbFetchState === "ok" && dbList.length > 0;

  return (
    <TouchableWithoutFeedback onPress={() => Keyboard.dismiss()}>
      <SafeAreaView backgroundColor={COLORS.white}>
        {/* Loader removed during login per UX requirement; submit button has its own disabled state. */}

        <View style={styles.imageContainer}>
          <View style={styles.logoWrapper}>
            <Image
              source={require("@assets/images/header/logo_header.png")}
              style={{ width: 260, height: 234, alignSelf: "center" }}
              resizeMode="contain"
            />
          </View>
        </View>

        <RoundedScrollContainer
          backgroundColor={COLORS.white}
          paddingHorizontal={15}
          borderTopLeftRadius={40}
          borderTopRightRadius={40}
        >
          <View style={{ paddingTop: 12 }}>
            <View style={{ marginVertical: 5, marginHorizontal: 10 }}>
              <View style={styles.titleBlock}>
                <Text style={styles.titleText}>Welcome back</Text>
                <Text style={styles.subtitleText}>Login to continue to your store</Text>
              </View>

              <Text style={styles.sectionLabel}>SERVER</Text>

              {/* Server URL */}
              <TextInput
                value={inputs.baseUrl}
                onChangeText={(text) => handleOnchange(text, "baseUrl")}
                onFocus={() => handleError(null, "baseUrl")}
                label="Server URL"
                placeholder="Enter Server URL"
                column={true}
                login={true}
              />

              {/* Database dropdown (styled as a field) */}
              <View style={styles.dbFieldWrap}>
                <Text style={styles.dbLabel}>Database</Text>
                <TouchableOpacity
                  activeOpacity={0.8}
                  disabled={!canOpenDb}
                  onPress={() => canOpenDb && setDbOpen((o) => !o)}
                  style={[styles.dbSelector, !canOpenDb && styles.dbSelectorDisabled]}
                >
                  {dbFetchState === "loading" ? (
                    <>
                      <ActivityIndicator size="small" color={COLORS.orange} />
                      <Text style={[styles.dbSelectorText, { color: COLORS.gray, marginLeft: 8 }]}>
                        {dbPlaceholder()}
                      </Text>
                    </>
                  ) : (
                    <Text
                      style={[
                        styles.dbSelectorText,
                        !selectedDb && { color: "#bbb" },
                      ]}
                      numberOfLines={1}
                    >
                      {selectedDb || dbPlaceholder()}
                    </Text>
                  )}
                  {canOpenDb && (
                    <Text style={styles.chevron}>{dbOpen ? "▲" : "▼"}</Text>
                  )}
                </TouchableOpacity>

                {dbOpen && canOpenDb && (
                  <View style={styles.dropdown}>
                    <ScrollView
                      nestedScrollEnabled
                      keyboardShouldPersistTaps="handled"
                      showsVerticalScrollIndicator
                      style={styles.dropdownScroll}
                    >
                      {dbList.map((item) => {
                        const active = item === selectedDb;
                        return (
                          <TouchableOpacity
                            key={item}
                            style={[styles.dropdownItem, active && styles.dropdownItemActive]}
                            onPress={() => {
                              // Wipe whatever is typed for the previous DB
                              // when switching to a different one. The
                              // auto-fill effect, if ON, then refills with
                              // the saved combo for the new (URL+DB) key.
                              if (selectedDb !== item) {
                                setInputs((prev) => ({ ...prev, username: "", password: "" }));
                              }
                              setSelectedDb(item);
                              setDbOpen(false);
                            }}
                          >
                            <Text
                              style={[
                                styles.dropdownItemText,
                                active && styles.dropdownItemTextActive,
                              ]}
                            >
                              {item}
                            </Text>
                            {active && <Text style={styles.checkmark}>✓</Text>}
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  </View>
                )}
              </View>

              <Text style={[styles.sectionLabel, { marginTop: 14 }]}>ACCOUNT</Text>

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
  },
  logoWrapper: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    padding: 8,
  },
  titleBlock: {
    alignItems: "center",
    marginTop: 4,
    marginBottom: 18,
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
  // DB field (mimics TextInput look)
  dbFieldWrap: {
    marginTop: 4,
    marginBottom: 12,
  },
  dbLabel: {
    fontSize: 13,
    color: COLORS.gray,
    fontFamily: FONT_FAMILY.urbanistBold,
    marginBottom: 6,
    marginLeft: 2,
  },
  dbSelector: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: COLORS.lightGray,
    borderRadius: 12,
    backgroundColor: COLORS.white,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  dbSelectorDisabled: {
    backgroundColor: "#fafafa",
  },
  dbSelectorText: {
    flex: 1,
    fontSize: 14,
    color: "#222",
    fontFamily: FONT_FAMILY.urbanistBold,
  },
  chevron: {
    color: COLORS.gray,
    fontSize: 11,
    marginLeft: 6,
  },
  dropdown: {
    borderWidth: 1,
    borderColor: COLORS.lightGray,
    borderRadius: 10,
    backgroundColor: COLORS.white,
    marginTop: 6,
    elevation: 6,
    shadowColor: "#000",
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
    borderBottomColor: "#f4f4f4",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  dropdownItemActive: {
    backgroundColor: COLORS.orange + "15",
  },
  dropdownItemText: {
    fontSize: 14,
    color: "#333",
  },
  dropdownItemTextActive: {
    color: COLORS.orange,
    fontFamily: FONT_FAMILY.urbanistBold,
  },
  checkmark: {
    color: COLORS.orange,
    fontSize: 14,
    fontFamily: FONT_FAMILY.urbanistBold,
  },
});

export default LoginScreenOdoo;
