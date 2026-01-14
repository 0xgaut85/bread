async function getResults() {
  const taskIds = [
    'cmk701n4e001mnu019hkwu2i4', // Best AI Generated Art
    'cmk701pq8001pnu012so4lvyn', // Best Crypto Twitter Thread
    'cmk701sby001snu01cbo0thvt', // Best Inspirational Quote
    'cmk701uxa001vnu01ntjzqxr3', // Funniest Crypto Meme
  ];
  
  console.log('='.repeat(60));
  console.log('🏆 AI JUDGING RESULTS');
  console.log('='.repeat(60));
  
  for (const taskId of taskIds) {
    const res = await fetch('https://app.bountydot.money/api/tasks/' + taskId);
    const task = await res.json();
    
    const subRes = await fetch('https://app.bountydot.money/api/submissions?taskId=' + taskId);
    const subData = await subRes.json();
    const submissions = subData.submissions || [];
    
    console.log('');
    console.log('📋 ' + task.title);
    console.log('   Status: ' + task.status + ' | Reward: ' + task.reward + ' USDC');
    console.log('');
    
    for (const sub of submissions) {
      const wallet = sub.submitter?.walletAddress?.slice(0, 8) || 'unknown';
      const icon = sub.isWinner ? '🥇' : '  ';
      console.log('   ' + icon + ' ' + wallet + '... | Score: ' + (sub.score || 0));
      if (sub.aiReasoning) {
        console.log('      AI: ' + sub.aiReasoning.slice(0, 100) + '...');
      }
    }
  }
  
  console.log('');
  console.log('='.repeat(60));
  
  // Check winner balances
  const { Connection, PublicKey } = await import('@solana/web3.js');
  const { getAssociatedTokenAddress, getAccount } = await import('@solana/spl-token');
  const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
  const usdcMint = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
  
  const wallets = [
    { name: 'Submitter1', addr: 'CBBL2eHbhZggd351Ef2bxcizkQvwW2tns3aBuiio2tpY' },
    { name: 'Submitter2', addr: 'CNLjxkBqDoUZUcPniMHc21Rc5kNoB1B49Uocw5AfdqdK' },
  ];
  
  console.log('');
  console.log('💰 WINNER BALANCES (USDC received):');
  for (const w of wallets) {
    try {
      const ata = await getAssociatedTokenAddress(usdcMint, new PublicKey(w.addr));
      const account = await getAccount(connection, ata);
      const balance = Number(account.amount) / 1e6;
      console.log('   ' + w.name + ' (' + w.addr.slice(0, 8) + '...): ' + balance.toFixed(2) + ' USDC');
    } catch (e) {
      console.log('   ' + w.name + ': 0.00 USDC');
    }
  }
}

getResults();
