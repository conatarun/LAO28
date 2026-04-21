import { runRefresh } from "./refresh.js";

runRefresh({ force: true }).then((r) => {
  console.log(JSON.stringify(r, null, 2));
  process.exit(r.ok ? 0 : 1);
});
