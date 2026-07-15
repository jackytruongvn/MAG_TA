import cron from 'node-cron';
import { prisma } from '@/lib/db/prisma';
import { getConfig } from '@/lib/config';
import { sendRequestEmails } from '@/lib/email/send';
import { wallClockInTz, wallTimeToUtc } from '@/lib/dates';
import type { ScheduleSettings } from '@/types';

let started = false;
let running = false;

/**
 * Compute the next send slot (real UTC instant) from `from`, honoring the
 * configured wall-clock times, timezone and working-days setting.
 * Returns null when scheduling is disabled or no times are configured.
 */
export function computeNextSendSlot(settings: ScheduleSettings, from: Date = new Date()): Date | null {
  if (!settings.enabled) return null;
  const times = [...(settings.sendTimes ?? [])]
    .map((t) => t.trim())
    .filter((t) => /^\d{1,2}:\d{2}$/.test(t))
    .sort();
  if (times.length === 0) return null;

  const tz = settings.timezone || 'Asia/Ho_Chi_Minh';

  // walk up to 14 days ahead to find a valid slot
  for (let dayOffset = 0; dayOffset < 14; dayOffset++) {
    const probe = new Date(from.getTime() + dayOffset * 86400_000);
    const wc = wallClockInTz(tz, probe);
    if (settings.onlyWorkingDays && (wc.weekday === 0 || wc.weekday === 6)) continue;

    for (const t of times) {
      const [hh, mm] = t.split(':').map(Number);
      const slot = wallTimeToUtc(tz, wc.y, wc.m, wc.d, hh, mm);
      if (slot.getTime() > from.getTime()) return slot;
    }
  }
  return null;
}

/** Send every due SCHEDULED request. Returns a summary for logging/API. */
export async function runSchedulerOnce(trigger = 'CRON'): Promise<{ picked: number; sent: number; failed: number }> {
  if (running) return { picked: 0, sent: 0, failed: 0 };
  running = true;
  try {
    const config = await getConfig();
    if (!config.scheduleSettings.enabled && trigger === 'CRON') {
      return { picked: 0, sent: 0, failed: 0 };
    }
    const due = await prisma.onboardingRequest.findMany({
      where: {
        status: 'SCHEDULED',
        scheduledSendAt: { lte: new Date() },
      },
      orderBy: { scheduledSendAt: 'asc' },
      take: 200,
    });
    if (due.length === 0) return { picked: 0, sent: 0, failed: 0 };

    console.info(`[scheduler] picked ${due.length} due request(s)`);
    const outcome = await sendRequestEmails(due, 'system-scheduler', { trigger: 'SCHEDULER' });
    console.info(`[scheduler] sent=${outcome.sent.length} failed=${outcome.failed.length}`);
    return { picked: due.length, sent: outcome.sent.length, failed: outcome.failed.length };
  } catch (e) {
    console.error('[scheduler] run failed', e);
    return { picked: 0, sent: 0, failed: 0 };
  } finally {
    running = false;
  }
}

/** Start the in-process cron (invoked once from instrumentation.ts). */
export function startScheduler() {
  if (started) return;
  if (process.env.SCHEDULER_ENABLED === 'false') {
    console.info('[scheduler] disabled via SCHEDULER_ENABLED=false');
    return;
  }
  started = true;
  cron.schedule('* * * * *', () => {
    void runSchedulerOnce('CRON');
  });
  console.info('[scheduler] node-cron started (every minute)');
}
