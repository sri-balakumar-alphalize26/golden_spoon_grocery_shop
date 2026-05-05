import React from "react";
import { Modal, View, Text, TouchableOpacity, StyleSheet, Pressable, BackHandler } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import useNetworkErrorStore from "../../stores/network/useNetworkErrorStore";

const NetworkErrorModal = () => {
  const { visible, title, message, onRetry, onCancel, hide } = useNetworkErrorStore();

  const handleRetry = () => {
    const cb = onRetry;
    hide();
    if (typeof cb === "function") cb();
  };

  const handleCancel = () => {
    const cb = onCancel;
    hide();
    if (typeof cb === "function") cb();
  };

  React.useEffect(() => {
    if (!visible) return undefined;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      handleCancel();
      return true;
    });
    return () => sub.remove();
  }, [visible]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleCancel}
      statusBarTranslucent
    >
      <Pressable style={styles.backdrop} onPress={handleCancel}>
        <Pressable style={styles.card} onPress={() => {}}>
          <View style={styles.iconWrap}>
            <MaterialIcons name="wifi-off" size={40} color="#F47B20" />
          </View>
          <Text style={styles.title}>{title || "Connection problem"}</Text>
          <Text style={styles.message}>
            {message ||
              "Cannot reach server. Please check your internet connection or router."}
          </Text>
          <View style={styles.btnRow}>
            <TouchableOpacity
              style={[styles.btn, styles.cancelBtn]}
              onPress={handleCancel}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, styles.retryBtn]}
              onPress={handleRetry}
            >
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: "white",
    borderRadius: 12,
    padding: 22,
    alignItems: "center",
  },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#FFF4EC",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  title: {
    fontSize: 18,
    fontFamily: "Urbanist-Bold",
    color: "#2E294E",
    marginBottom: 6,
  },
  message: {
    fontSize: 14,
    fontFamily: "Urbanist-Regular",
    color: "#555",
    textAlign: "center",
    marginBottom: 18,
  },
  btnRow: {
    flexDirection: "row",
    gap: 10,
    width: "100%",
  },
  btn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  cancelBtn: {
    backgroundColor: "#EEE",
  },
  retryBtn: {
    backgroundColor: "#2E294E",
  },
  cancelText: {
    color: "#2E294E",
    fontFamily: "Urbanist-Bold",
  },
  retryText: {
    color: "white",
    fontFamily: "Urbanist-Bold",
  },
});

export default NetworkErrorModal;
