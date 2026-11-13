const TRAFFIC_REFRESH_INTERVAL = 60_000;
const TRAFFIC_SAVED_EVENT = "asiste:traffic-saved";

function openTrafficChannel() {
  if (typeof BroadcastChannel === "undefined") return null;
  try {
    return new BroadcastChannel(TRAFFIC_SAVED_EVENT);
  } catch {
    return null;
  }
}

export function notifyTrafficSaved() {
  window.dispatchEvent(new Event(TRAFFIC_SAVED_EVENT));
  const channel = openTrafficChannel();
  channel?.postMessage(TRAFFIC_SAVED_EVENT);
  channel?.close();
}

export function watchTrafficUpdates(refresh) {
  let lastRefresh = 0;
  let pending = false;
  let refreshAgain = false;
  let stopped = false;
  const check = async () => {
    if (document.hidden || Date.now() - lastRefresh < 1000) return;
    lastRefresh = Date.now();
    if (pending) {
      refreshAgain = true;
      return;
    }
    pending = true;
    try {
      await refresh();
    } finally {
      pending = false;
      if (!stopped && refreshAgain) {
        refreshAgain = false;
        lastRefresh = 0;
        void check();
      }
    }
  };
  const onSaved = () => {
    lastRefresh = 0;
    check();
  };
  const channel = openTrafficChannel();
  channel?.addEventListener("message", onSaved);
  window.addEventListener(TRAFFIC_SAVED_EVENT, onSaved);
  window.addEventListener("focus", check);
  window.addEventListener("online", check);
  document.addEventListener("visibilitychange", check);
  const interval = window.setInterval(check, TRAFFIC_REFRESH_INTERVAL);
  return () => {
    stopped = true;
    channel?.close();
    window.removeEventListener(TRAFFIC_SAVED_EVENT, onSaved);
    window.removeEventListener("focus", check);
    window.removeEventListener("online", check);
    document.removeEventListener("visibilitychange", check);
    window.clearInterval(interval);
  };
}
