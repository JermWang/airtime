import "./_env";
import { boot } from "../src/server/boot";
import { closeDb } from "../src/server/db/client";

boot({ ticker: false })
  .then(async () => {
    console.log("database ready");
    await closeDb();
  })
  .catch(async (err) => {
    console.error(err);
    await closeDb();
    process.exit(1);
  });
