import { db } from './firebase';
import { runAgent } from './agent';

interface ScheduleDocument {
  id: string;
  userId: string;
  command: string;
  cronExpression: string;
  humanReadable: string;
  isActive: boolean;
  lastRun?: string;
  lastRunStatus?: 'success' | 'failure';
  createdAt: string;
  updatedAt: string;
}

function isDue(schedule: ScheduleDocument): boolean {
  const now = new Date();
  const lastRun = schedule.lastRun ? new Date(schedule.lastRun) : null;

  // Parse cron: "minute hour * * *" or "minute hour * * dayOfWeek"
  const [minute, hour, , , dayOfWeek] = schedule.cronExpression.split(' ');

  const nowMinute = now.getMinutes();
  const nowHour = now.getHours();
  const nowDay = now.getDay(); // 0=Sunday, 1=Monday...

  // Check time match (within current minute)
  const minuteMatch = minute === '*' || parseInt(minute) === nowMinute;
  const hourMatch = hour === '*' || parseInt(hour) === nowHour;
  const dayMatch = dayOfWeek === '*' || parseInt(dayOfWeek) === nowDay;

  if (!minuteMatch || !hourMatch || !dayMatch) return false;

  // Don't run if already ran within the last 50 seconds (prevent double-firing)
  if (lastRun && now.getTime() - lastRun.getTime() < 50000) return false;

  return true;
}

export function startScheduler(): void {
  console.log('Scheduler started');

  setInterval(async () => {
    try {
      // Use Firestore collectionGroup to get all 'items' sub-collections
      const snapshot = await db.collectionGroup('items').get();

      const schedules: (ScheduleDocument & { userId: string })[] = [];

      snapshot.docs.forEach((doc) => {
        const data = doc.data();
        if (data.cronExpression && data.isActive) {
          const pathParts = doc.ref.path.split('/');
          // Path: schedules/{userId}/items/{id}
          if (pathParts[0] === 'schedules') {
            schedules.push({ ...(data as ScheduleDocument), userId: pathParts[1] });
          }
        }
      });

      for (const schedule of schedules) {
        if (!isDue(schedule)) continue;

        const now = new Date().toISOString();
        console.log(`Scheduler: firing "${schedule.command}" for user ${schedule.userId}`);

        // Update lastRun immediately to prevent double-firing
        await db
          .collection('schedules')
          .doc(schedule.userId)
          .collection('items')
          .doc(schedule.id)
          .update({ lastRun: now, updatedAt: now });

        const sendProgress = async (_type: string, _message: string): Promise<void> => {
          // Store progress in Firestore for later retrieval if needed
        };

        const sendBridgeAction = async (
          _action: string,
          _params: Record<string, unknown>,
        ): Promise<{ success: boolean; data?: Record<string, unknown>; error?: string }> => {
          // Browser actions not available in scheduled runs
          return { success: false, error: 'Browser automation requires extension connection' };
        };

        const waitForUserAnswer = (_questionId: string): Promise<string> =>
          // Scheduled runs have no interactive user — return empty immediately
          Promise.resolve('');

        try {
          await runAgent({
            command: schedule.command,
            sessionId: `scheduled-${schedule.id}-${Date.now()}`,
            userId: schedule.userId,
            sendProgress,
            sendBridgeAction,
            waitForUserAnswer,
          });

          await db
            .collection('schedules')
            .doc(schedule.userId)
            .collection('items')
            .doc(schedule.id)
            .update({ lastRunStatus: 'success', updatedAt: new Date().toISOString() });
        } catch {
          await db
            .collection('schedules')
            .doc(schedule.userId)
            .collection('items')
            .doc(schedule.id)
            .update({ lastRunStatus: 'failure', updatedAt: new Date().toISOString() });
        }
      }
    } catch (err) {
      console.error('Scheduler error:', err);
    }
  }, 60000); // Check every minute
}
