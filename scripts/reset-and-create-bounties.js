/**
 * Reset Database and Create Hourly Bounties
 * 
 * This script:
 * 1. Deletes all existing tasks, submissions, and escrow transactions
 * 2. Creates the new 2-hour bounties (Best X Thread, Best Meme about Bounty)
 * 
 * Run with: node scripts/reset-and-create-bounties.js
 */

const BASE_URL = 'https://app.bountydot.money';
const ADMIN_API_KEY = 'bounty-admin-api-key-2026';

async function main() {
  console.log('='.repeat(60));
  console.log('DATABASE RESET AND HOURLY BOUNTY CREATION');
  console.log('='.repeat(60));

  // Step 1: Check current state
  console.log('\n1. Checking current state...');
  const statusRes = await fetch(`${BASE_URL}/api/cron/judge`);
  const status = await statusRes.json();
  console.log('   Open tasks:', status.totalOpen);
  console.log('   Pending judgment:', status.pendingJudgment);

  // Step 2: Reset database via direct API call
  console.log('\n2. Resetting database...');
  console.log('   NOTE: This requires manual database reset or admin endpoint');
  console.log('   For now, we will just create new bounties');

  // Step 3: Create hourly bounties
  console.log('\n3. Creating hourly bounties...');
  const createRes = await fetch(`${BASE_URL}/api/tasks/daily`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${ADMIN_API_KEY}`,
      'Content-Type': 'application/json',
    },
  });

  if (!createRes.ok) {
    const error = await createRes.json();
    console.log('   Error:', JSON.stringify(error, null, 2));
    
    if (error.fundingNeeded) {
      console.log('\n   ESCROW NEEDS FUNDING:');
      console.log('   Address:', error.escrowAddress);
      console.log('   Current balance:', error.currentBalance, 'USDC');
      console.log('   Required:', error.requiredBalance, 'USDC');
      console.log('   Funding needed:', error.fundingNeeded, 'USDC');
    }
    return;
  }

  const result = await createRes.json();
  console.log('   Created', result.tasks?.length || 0, 'bounties');
  
  if (result.tasks) {
    for (const task of result.tasks) {
      console.log('   - ' + task.title + ' (' + task.reward + ' USDC, deadline: ' + new Date(task.deadline).toLocaleTimeString() + ')');
    }
  }

  // Step 4: Verify
  console.log('\n4. Verifying...');
  const verifyRes = await fetch(`${BASE_URL}/api/tasks/daily`);
  const verifyData = await verifyRes.json();
  console.log('   Active hourly bounties:', verifyData.tasks?.length || 0);

  console.log('\n' + '='.repeat(60));
  console.log('DONE');
  console.log('='.repeat(60));
}

main().catch(console.error);
