// Browser-side Web Push wiring. No accounts — the PushSubscription itself
// is the identity, tied to a cookie we get back from /api/push/subscribe.

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function pushSupported(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

async function registerSW(): Promise<ServiceWorkerRegistration> {
  const reg = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;
  return reg;
}

export async function getExistingSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return null;
  return reg.pushManager.getSubscription();
}

export async function enablePush(): Promise<{ ok: boolean; error?: string }> {
  if (!pushSupported()) return { ok: false, error: "Push not supported in this browser" };
  const perm = await Notification.requestPermission();
  if (perm !== "granted") return { ok: false, error: "Notification permission denied" };
  const reg = await registerSW();
  const existing = await reg.pushManager.getSubscription();
  if (existing) {
    await sendSubscriptionToServer(existing);
    return { ok: true };
  }
  const keyRes = await fetch("/api/push/vapid-public-key").then((r) => r.json());
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(keyRes.key).buffer as ArrayBuffer,
  });
  await sendSubscriptionToServer(sub);
  return { ok: true };
}

async function sendSubscriptionToServer(sub: PushSubscription) {
  const json = sub.toJSON();
  await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      endpoint: json.endpoint,
      keys: json.keys,
    }),
  });
}

export async function disablePush() {
  await fetch("/api/push/unsubscribe", { method: "POST", credentials: "include" });
  const sub = await getExistingSubscription();
  if (sub) await sub.unsubscribe();
}

export async function sendTestPush() {
  const r = await fetch("/api/push/test", { method: "POST", credentials: "include" });
  return r.json();
}
