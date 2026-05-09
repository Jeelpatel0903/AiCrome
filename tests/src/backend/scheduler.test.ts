import { describe, it, expect } from 'vitest';

// Mirror the isDue logic from backend/src/services/scheduler.ts
// The real scheduler uses local time (Date.getMinutes/getHours/getDay)
// and supports simple integer matching and '*' wildcard

interface ScheduleDocument {
  id: string;
  userId: string;
  command: string;
  cronExpression: string;
  humanReadable: string;
  isActive: boolean;
  lastRun?: string;
  createdAt: string;
  updatedAt: string;
}

function isDue(schedule: ScheduleDocument, now: Date = new Date()): boolean {
  const lastRun = schedule.lastRun ? new Date(schedule.lastRun) : null;

  const [minute, hour, , , dayOfWeek] = schedule.cronExpression.split(' ');

  const nowMinute = now.getMinutes();
  const nowHour = now.getHours();
  const nowDay = now.getDay(); // 0=Sunday, 1=Monday...

  const minuteMatch = minute === '*' || parseInt(minute ?? '0') === nowMinute;
  const hourMatch = hour === '*' || parseInt(hour ?? '0') === nowHour;
  const dayMatch = dayOfWeek === '*' || parseInt(dayOfWeek ?? '0') === nowDay;

  if (!minuteMatch || !hourMatch || !dayMatch) return false;

  // Don't run if already ran within the last 50 seconds
  if (lastRun && now.getTime() - lastRun.getTime() < 50000) return false;

  return true;
}

function makeSchedule(cronExpression: string, lastRun?: string): ScheduleDocument {
  return {
    id: 'sched-1',
    userId: 'user-1',
    command: 'test command',
    cronExpression,
    humanReadable: 'test',
    isActive: true,
    lastRun,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

describe('Scheduler isDue logic', () => {
  it('matches * * * * * (every minute)', () => {
    const now = new Date();
    expect(isDue(makeSchedule('* * * * *'), now)).toBe(true);
  });

  it('matches specific minute and hour', () => {
    // Create a date at known local time
    const now = new Date();
    const minute = now.getMinutes();
    const hour = now.getHours();
    expect(isDue(makeSchedule(`${minute} ${hour} * * *`), now)).toBe(true);
  });

  it('does not match wrong minute', () => {
    const now = new Date();
    const wrongMinute = (now.getMinutes() + 1) % 60;
    expect(isDue(makeSchedule(`${wrongMinute} * * * *`), now)).toBe(false);
  });

  it('does not match wrong hour', () => {
    const now = new Date();
    const wrongHour = (now.getHours() + 1) % 24;
    expect(isDue(makeSchedule(`* ${wrongHour} * * *`), now)).toBe(false);
  });

  it('matches day of week correctly', () => {
    const now = new Date();
    const day = now.getDay();
    expect(isDue(makeSchedule(`* * * * ${day}`), now)).toBe(true);
  });

  it('does not match wrong day of week', () => {
    const now = new Date();
    const wrongDay = (now.getDay() + 1) % 7;
    expect(isDue(makeSchedule(`* * * * ${wrongDay}`), now)).toBe(false);
  });

  it('does not run if ran within 50 seconds', () => {
    const now = new Date();
    const recentRun = new Date(now.getTime() - 10000).toISOString(); // 10s ago
    expect(isDue(makeSchedule('* * * * *', recentRun), now)).toBe(false);
  });

  it('runs if last run was more than 50 seconds ago', () => {
    const now = new Date();
    const oldRun = new Date(now.getTime() - 60000).toISOString(); // 60s ago
    expect(isDue(makeSchedule('* * * * *', oldRun), now)).toBe(true);
  });

  it('runs if no lastRun recorded', () => {
    const now = new Date();
    expect(isDue(makeSchedule('* * * * *', undefined), now)).toBe(true);
  });
});
