async function summary() {
  // Check escrow status
  const escrowRes = await fetch('https://app.bountydot.money/api/escrow');
  const escrow = await escrowRes.json();
  
  // Check cron status
  const cronRes = await fetch('https://app.bountydot.money/api/cron/judge');
  const cron = await cronRes.json();
  
  console.log('='.repeat(50));
  console.log('📊 SYSTEM STATUS SUMMARY');
  console.log('='.repeat(50));
  
  console.log('\n💰 Escrow:');
  console.log('  Address:', escrow.escrowAddress);
  console.log('  Balance:', escrow.balance, 'USDC');
  
  console.log('\n📋 Tasks:');
  console.log('  Pending judgment:', cron.pendingJudgment);
  console.log('  Payment pending:', cron.paymentPending);
  console.log('  Recently judged:', cron.recentlyJudged);
  console.log('  Total open:', cron.totalOpen);
  
  console.log('\n📝 Recent Transactions:');
  const recentTx = escrow.transactions.slice(0, 5);
  for (const tx of recentTx) {
    const status = tx.status === 'CONFIRMED' ? '✓' : '⏳';
    console.log('  ' + status + ' ' + tx.type + ': ' + tx.amount + ' USDC - ' + (tx.task?.title || 'N/A').slice(0, 30));
  }
  
  console.log('\n' + '='.repeat(50));
}

summary();
