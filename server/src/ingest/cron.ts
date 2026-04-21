import cron from "node-cron";
import { runRefresh } from "./refresh.js";

export function scheduleDailyRefresh() {
  // 07:00 UTC daily — shortly after LA28 CMS typical publishing windows.
  cron.schedule("0 7 * * *", async () => {
    const r = await runRefresh();
    console.log("[cron] refresh", r);
  });
}
