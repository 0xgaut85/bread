/**
 * Task Deadline Scheduler
 * 
 * Schedules judging to run exactly when each task's deadline passes.
 * Also runs a periodic cron every 5 minutes to catch any missed tasks.
 */

// Store scheduled timeouts by task ID
const scheduledJudgments = new Map<string, NodeJS.Timeout>();

// Track if periodic cron is running
let periodicCronInterval: NodeJS.Timeout | null = null;

/**
 * Schedule judging for a specific task at its deadline
 */
export function scheduleTaskJudging(taskId: string, deadline: Date) {
  // Cancel any existing schedule for this task
  cancelTaskJudging(taskId);

  const now = Date.now();
  const deadlineTime = new Date(deadline).getTime();
  const delay = deadlineTime - now;

  // If deadline already passed, trigger immediately
  if (delay <= 0) {
    console.log(`[Scheduler] Task ${taskId} deadline already passed, judging now...`);
    triggerJudgingForTask(taskId);
    return;
  }

  // Schedule for the exact deadline time
  console.log(`[Scheduler] Task ${taskId} scheduled for judging in ${Math.round(delay / 1000 / 60)} minutes`);
  
  const timeout = setTimeout(() => {
    console.log(`[Scheduler] Deadline reached for task ${taskId}, triggering judging...`);
    scheduledJudgments.delete(taskId);
    triggerJudgingForTask(taskId);
  }, delay);

  scheduledJudgments.set(taskId, timeout);
}

/**
 * Cancel scheduled judging for a task (e.g., if cancelled)
 */
export function cancelTaskJudging(taskId: string) {
  const existing = scheduledJudgments.get(taskId);
  if (existing) {
    clearTimeout(existing);
    scheduledJudgments.delete(taskId);
    console.log(`[Scheduler] Cancelled scheduled judging for task ${taskId}`);
  }
}

/**
 * Trigger judging for a specific task
 * Uses internal URL for Railway (avoids DNS issues) or falls back to public URL
 */
async function triggerJudgingForTask(taskId: string) {
  try {
    const apiKey = process.env.ADMIN_API_KEY;
    if (!apiKey) {
      console.error('[Scheduler] ADMIN_API_KEY not set, cannot judge');
      return;
    }

    // Try internal Railway URL first, then public URL, then localhost
    const urls = [
      process.env.RAILWAY_PRIVATE_DOMAIN ? `http://${process.env.RAILWAY_PRIVATE_DOMAIN}` : null,
      process.env.NEXT_PUBLIC_APP_URL,
      'http://localhost:3000',
    ].filter(Boolean) as string[];

    let lastError: Error | null = null;
    
    for (const baseUrl of urls) {
      try {
        console.log(`[Scheduler] Trying to judge task ${taskId} via ${baseUrl}`);
        
        const response = await fetch(`${baseUrl}/api/judge`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ taskId }),
        });

        if (response.ok) {
          const result = await response.json();
          console.log(`[Scheduler] Task ${taskId} judged successfully via ${baseUrl}:`, result.winner?.walletAddress?.slice(0, 8) || 'no winner');
          return; // Success!
        } else {
          const errorText = await response.text();
          console.error(`[Scheduler] Failed to judge task ${taskId} via ${baseUrl}:`, response.status, errorText);
          lastError = new Error(`HTTP ${response.status}: ${errorText}`);
        }
      } catch (fetchError) {
        console.error(`[Scheduler] Fetch error for ${baseUrl}:`, fetchError);
        lastError = fetchError as Error;
      }
    }

    console.error(`[Scheduler] All URLs failed for task ${taskId}:`, lastError?.message);
  } catch (error) {
    console.error(`[Scheduler] Error judging task ${taskId}:`, error);
  }
}

/**
 * Run the cron judge endpoint to process all expired tasks
 */
async function runCronJudge() {
  try {
    const apiKey = process.env.ADMIN_API_KEY;
    if (!apiKey) {
      console.error('[Scheduler] ADMIN_API_KEY not set, cannot run cron judge');
      return;
    }

    // Try internal Railway URL first, then public URL
    const urls = [
      process.env.RAILWAY_PRIVATE_DOMAIN ? `http://${process.env.RAILWAY_PRIVATE_DOMAIN}` : null,
      process.env.NEXT_PUBLIC_APP_URL,
      'http://localhost:3000',
    ].filter(Boolean) as string[];

    for (const baseUrl of urls) {
      try {
        console.log(`[Scheduler] Running cron judge via ${baseUrl}`);
        
        const response = await fetch(`${baseUrl}/api/cron/judge`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
        });

        if (response.ok) {
          const result = await response.json();
          console.log(`[Scheduler] Cron judge completed:`, {
            judged: result.judging?.successful || 0,
            cancelled: result.cancelled || 0,
            paymentsRetried: result.paymentRetries?.successful || 0,
          });
          return; // Success!
        } else {
          const errorText = await response.text();
          console.error(`[Scheduler] Cron judge failed via ${baseUrl}:`, response.status, errorText);
        }
      } catch (fetchError) {
        console.error(`[Scheduler] Cron judge fetch error for ${baseUrl}:`, fetchError);
      }
    }
  } catch (error) {
    console.error('[Scheduler] Error running cron judge:', error);
  }
}

/**
 * Start the periodic cron (every 5 minutes)
 */
function startPeriodicCron() {
  if (periodicCronInterval) {
    console.log('[Scheduler] Periodic cron already running');
    return;
  }

  const CRON_INTERVAL = 5 * 60 * 1000; // 5 minutes
  
  console.log('[Scheduler] Starting periodic cron (every 5 minutes)');
  
  // Run immediately on startup
  setTimeout(() => {
    console.log('[Scheduler] Running initial cron judge...');
    runCronJudge();
  }, 10000); // Wait 10 seconds for server to be ready
  
  // Then run every 5 minutes
  periodicCronInterval = setInterval(() => {
    console.log('[Scheduler] Periodic cron triggered');
    runCronJudge();
  }, CRON_INTERVAL);
}

/**
 * On server startup, reschedule all open tasks with future deadlines
 * and start the periodic cron
 */
export async function initializeScheduler() {
  console.log('[Scheduler] Starting initialization...');
  console.log('[Scheduler] Environment:', {
    ADMIN_API_KEY: process.env.ADMIN_API_KEY ? 'set' : 'NOT SET',
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || 'NOT SET',
    RAILWAY_PRIVATE_DOMAIN: process.env.RAILWAY_PRIVATE_DOMAIN || 'NOT SET',
    NODE_ENV: process.env.NODE_ENV,
  });

  // Start the periodic cron for reliability
  startPeriodicCron();

  try {
    // Dynamic import to avoid issues during build
    const { prisma } = await import('./prisma');
    
    const now = new Date();
    
    // Find all open tasks
    const openTasks = await prisma.task.findMany({
      where: {
        status: 'OPEN',
      },
      select: {
        id: true,
        deadline: true,
        title: true,
      },
    });

    console.log(`[Scheduler] Found ${openTasks.length} open tasks to schedule`);

    for (const task of openTasks) {
      const delay = new Date(task.deadline).getTime() - now.getTime();
      console.log(`[Scheduler] Task "${task.title}" (${task.id}): deadline in ${Math.round(delay / 1000 / 60)} minutes`);
      scheduleTaskJudging(task.id, task.deadline);
    }

    console.log('[Scheduler] Initialization complete');
  } catch (error) {
    console.error('[Scheduler] Failed to initialize:', error);
  }
}
