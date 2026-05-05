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

const LoginScreenOdoo = () => {
  const navigation = useNavigation();
  const setUser = useAuthStore((state) => state.login);

  LogBox.ignoreLogs(["Non-serializable values were found in the navigation state"]);

  const [inputs, setInputs] = useState({
    baseUrl: "",
    username: "",
    password: "",
  });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);

  // DB dropdown state
  const [dbList, setDbList] = useState([]);
  const [selectedDb, setSelectedDb] = useState("");
  const [dbOpen, setDbOpen] = useState(false);
  const [dbFetchState, setDbFetchState] = useState("idle"); // idle | loading | ok | empty | error

  const debounceRef = useRef(null);
  const lastFetchedUrlRef = useRef("");

  // Restore saved credentials
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem("savedCredentials");
        if (raw) {
          const c = JSON.parse(raw);
          setInputs({
            baseUrl: c.baseUrl || "",
            username: c.username || "",
            password: c.password || "",
          });
          if (c.db) setSelectedDb(c.db);
        }
      } catch (_) {}
    })();
  }, []);

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
        setSelectedDb((prev) => (prev && list.includes(prev) ? prev : list[0]));
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
              style={{ width: 200, height: 180, alignSelf: "center" }}
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
          <View style={{ paddingTop: 8 }}>
            <View style={{ marginVertical: 5, marginHorizontal: 10 }}>
              <View style={{ marginTop: 0, marginBottom: 15 }}>
                <Text
                  style={{
                    fontSize: 25,
                    fontFamily: FONT_FAMILY.urbanistBold,
                    color: "#2e2a4f",
                    textAlign: "center",
                  }}
                >
                  Login
                </Text>
              </View>

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
  bottom: {
    alignItems: "center",
    marginTop: 10,
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
