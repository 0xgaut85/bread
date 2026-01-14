/**
 * Next.js Instrumentation
 * 
 * This file runs once when the server starts.
 * We use it to initialize the task deadline scheduler with automatic cron.
 */

export async function register() {
  // Only run on the server, not during build
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    console.log('[Instrumentation] Server starting, will initialize scheduler in 5 seconds...');
    
    // Small delay to ensure database is ready
    setTimeout(async () => {
      try {
        console.log('[Instrumentation] Initializing scheduler...');
        const { initializeScheduler } = await import('./lib/scheduler');
        await initializeScheduler();
        // The scheduler now handles its own periodic cron internally
      } catch (error) {
        console.error('[Instrumentation] Failed to initialize scheduler:', error);
      }
    }, 5000);
  }
}
