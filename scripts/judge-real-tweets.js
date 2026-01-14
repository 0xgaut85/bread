const TASK_ID = 'cmk6uozw7000no1019zyo9jfw';
const ADMIN_KEY = 'bounty-admin-api-key-2026';

// The real tweets we submitted
const tweetContents = {
  '57zj': '@aixbt_agent any thoughts on @mementodotmoney? should i maxx out every vault with my life savings?',
  'DCB3': "I don't think you guys realize how fucked up it is that tokens on SOL get 1-2m volume without breaking 300k mc lmao",
  '4bCk': 'Last chance to tax loss harvest is today btw'
};

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('       REAL TWEET EVALUATION - @0xresent TWEETS');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');
  console.log('TWEETS SUBMITTED:');
  console.log('');
  console.log('1. "' + tweetContents['57zj'] + '"');
  console.log('2. "' + tweetContents['DCB3'] + '"');
  console.log('3. "' + tweetContents['4bCk'] + '"');
  console.log('');
  console.log('Triggering AI judge...');
  console.log('');
  
  const res = await fetch('https://app.bountydot.money/api/judge', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + ADMIN_KEY
    },
    body: JSON.stringify({ taskId: TASK_ID })
  });
  
  const data = await res.json();
  
  if (data.error) {
    console.log('Error:', data.error);
    return;
  }
  
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('                    AI JUDGING RESULTS');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');
  console.log('WINNER WALLET:', data.winnerWallet);
  console.log('TASK STATUS:', data.status);
  console.log('PAYMENT TX:', data.transfer?.signature || 'N/A');
  console.log('');
  console.log('───────────────────────────────────────────────────────────────');
  console.log('DETAILED SCORES:');
  console.log('');
  
  for (const [id, scoreData] of Object.entries(data.scores || {})) {
    const isWinner = id === data.winnerId;
    const walletPrefix = scoreData.wallet?.substring(0, 4) || '????';
    const tweetText = tweetContents[walletPrefix] || 'Unknown tweet';
    
    console.log((isWinner ? '🏆 ' : '   ') + 'Submission by ' + walletPrefix + '...' + (isWinner ? ' (WINNER)' : ''));
    console.log('   Tweet: "' + tweetText.substring(0, 70) + (tweetText.length > 70 ? '...' : '') + '"');
    console.log('   Score: ' + scoreData.score + '/100');
    console.log('');
    console.log('   AI Reasoning:');
    console.log('   ' + scoreData.reasoning);
    console.log('');
    console.log('───────────────────────────────────────────────────────────────');
  }
  
  if (data.transfer?.signature) {
    console.log('');
    console.log('✅ PAYMENT RELEASED!');
    console.log('   View on Solscan: https://solscan.io/tx/' + data.transfer.signature);
  }
}

main().catch(console.error);
