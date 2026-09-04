/**
 * Next.js instrumentation hook – runs once per server instance.
 * Boots the database, seeds development data and starts the station scheduler.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { boot } = await import("./server/boot");
  await boot();
}
