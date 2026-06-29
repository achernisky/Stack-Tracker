// Push notification helpers - loaded as plain script, not bundled by Vite
window.stackPush = {
  vapidPublicKey: "BEl62iUYgUivxIkv69yViEuiBIa40HI2KAtGRB5G9L3kBSBMbKLVlhCoJwqBOYCJIcJHBV7cNFCMSOuRVjNFTE4",

  toUint8Array: function(base64Str) {
    var b64 = (base64Str + "=".repeat((4 - base64Str.length % 4) % 4))
      .replace(/-/g, "+").replace(/_/g, "/");
    return Uint8Array.from(atob(b64), function(ch) { return ch.charCodeAt(0); });
  },

  register: async function(userId, supabaseUrl, supabaseKey, authToken) {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return null;
    try {
      var reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      var permission = await Notification.requestPermission();
      if (permission !== "granted") return null;

      var existing = await reg.pushManager.getSubscription();
      if (existing) await existing.unsubscribe();

      var sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: window.stackPush.toUint8Array(window.stackPush.vapidPublicKey),
      });

      var headers = {
        "Content-Type": "application/json",
        "apikey": supabaseKey,
        "Authorization": "Bearer " + authToken,
        "Prefer": "return=minimal"
      };

      await fetch(supabaseUrl + "/rest/v1/push_subscriptions?user_id=eq." + userId, {
        method: "DELETE", headers: headers
      });
      await fetch(supabaseUrl + "/rest/v1/push_subscriptions", {
        method: "POST", headers: headers,
        body: JSON.stringify({ user_id: userId, subscription: JSON.stringify(sub) })
      });
      return sub;
    } catch(e) {
      console.error("Push registration failed:", e);
      return null;
    }
  }
};
