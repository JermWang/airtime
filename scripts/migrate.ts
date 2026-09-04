import "./_env";
import { ensureMigrated, closeDb } from "../src/server/db/client";

ensureMigrated()
  .then(async () => {
    console.log("migrations applied");
    await closeDb();
  })
  .catch(async (err) => {
    console.error(err);
    await closeDb();
    process.exit(1);
  });
