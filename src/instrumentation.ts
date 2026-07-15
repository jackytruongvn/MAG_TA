/**
 * Next.js instrumentation hook — runs once when the server boots.
 * Starts the in-process node-cron scheduler for queued email sending.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startScheduler } = await import('@/lib/scheduler');
    startScheduler();
  }
}
