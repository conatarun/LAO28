import webpush from "web-push";
import { randomBytes } from "node:crypto";
import { db, getMeta, setMeta } from "./db.js";

// VAPID keys: read from env (preferred on Replit), else mint once and persist
// to the meta table so the app keeps working across restarts in dev.
function loadVapid() {
  let publicKey = process.env.VAPID_PUBLIC_KEY ?? getMeta("vapid_public_key");
  let privateKey = process.env.VAPID_PRIVATE_KEY ?? getMeta("vapid_private_key");
  if (!publicKey || !privateKey) {
    const keys = webpush.generateVAPIDKeys();
    publicKey = keys.publicKey;
    privateKey = keys.privateKey;
    setMeta("vapid_public_key", publicKey);
    setMeta("vapid_private_key", privateKey);
    console.log("[push] minted new VAPID keys and stored in meta table");
  }
  const subject = process.env.VAPID_SUBJECT ?? "mailto:tarun@conalabs.com";
  webpush.setVapidDetails(subject, publicKey, privateKey);
  return { publicKey };
}

export const vapid = loadVapid();

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
};

export async function sendPush(
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  payload: PushPayload
): Promise<{ ok: boolean; statusCode?: number; error?: string }> {
  try {
    const res = await webpush.sendNotification(
      subscription,
      JSON.stringify(payload),
      { TTL: 60 * 60 * 24 }
    );
    return { ok: true, statusCode: res.statusCode };
  } catch (e: any) {
    return {
      ok: false,
      statusCode: e?.statusCode,
      error: e?.body || e?.message || String(e),
    };
  }
}

export function newSubscriptionId(): string {
  return randomBytes(16).toString("hex");
}

/**
 * Mark a subscription disabled if the push service reports it's gone.
 * 404/410 means the browser has unsubscribed or the install is dead.
 */
export function maybeDisableOnFailure(subId: string, statusCode?: number) {
  if (statusCode === 404 || statusCode === 410) {
    db.prepare("UPDATE push_subscriptions SET disabled = 1 WHERE id = ?").run(subId);
  }
}
