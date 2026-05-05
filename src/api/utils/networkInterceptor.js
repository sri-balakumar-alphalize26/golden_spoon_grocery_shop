import axios from "axios";
import NetInfo from "@react-native-community/netinfo";
import useNetworkErrorStore from "../../stores/network/useNetworkErrorStore";

const isNetworkError = (error) => {
  if (!error) return false;
  if (!error.response) return true;
  if (error.code === "ECONNABORTED") return true;
  if (typeof error.message === "string" && /Network Error/i.test(error.message)) return true;
  return false;
};

const pickMessage = () => ({
  title: "No internet connection",
  message: "You appear to be offline. Please check your Wi-Fi or mobile data and try again.",
});

let installed = false;
let wasOffline = false;

export function installNetworkInterceptor() {
  if (installed) return;
  installed = true;

  const showPassiveOfflinePopup = () => {
    const store = useNetworkErrorStore.getState();
    if (store.visible) return;
    const { title, message } = pickMessage();
    const onRetry = async () => {
      let stillOffline = true;
      try {
        const s = await NetInfo.fetch();
        stillOffline = s.isConnected === false || s.isInternetReachable === false;
      } catch (_) {
        stillOffline = false;
      }
      if (stillOffline) {
        showPassiveOfflinePopup();
      }
    };
    store.show({ title, message, onRetry, onCancel: () => {} });
  };

  const handleConnectivity = (state) => {
    const offline = state.isConnected === false || state.isInternetReachable === false;
    if (offline) {
      showPassiveOfflinePopup();
    } else if (wasOffline) {
      const store = useNetworkErrorStore.getState();
      store.bumpReconnect();
      if (store.visible) {
        const cb = store.onRetry;
        store.hide();
        if (typeof cb === "function") cb();
      }
    }
    wasOffline = offline;
  };

  NetInfo.fetch().then(handleConnectivity).catch(() => {});
  NetInfo.addEventListener(handleConnectivity);

  axios.interceptors.response.use(
    (response) => response,
    async (error) => {
      if (!isNetworkError(error)) return Promise.reject(error);

      const config = error.config;
      if (!config || config.__networkRetried) return Promise.reject(error);

      let offline = false;
      try {
        const state = await NetInfo.fetch();
        offline = state.isConnected === false || state.isInternetReachable === false;
      } catch (_) {
        offline = false;
      }

      if (!offline) return Promise.reject(error);

      return new Promise((resolve, reject) => {
        const { show } = useNetworkErrorStore.getState();
        const { title, message } = pickMessage();

        const showPopup = () => {
          show({
            title,
            message,
            onRetry: async () => {
              let stillOffline = true;
              try {
                const s = await NetInfo.fetch();
                stillOffline = s.isConnected === false || s.isInternetReachable === false;
              } catch (_) {
                stillOffline = false;
              }
              if (stillOffline) {
                showPopup();
                return;
              }
              try {
                const retryConfig = { ...config, __networkRetried: true };
                const res = await axios.request(retryConfig);
                useNetworkErrorStore.getState().bumpReconnect();
                resolve(res);
              } catch (e) {
                reject(e);
              }
            },
            onCancel: () => reject(error),
          });
        };

        showPopup();
      });
    }
  );
}

export default installNetworkInterceptor;
