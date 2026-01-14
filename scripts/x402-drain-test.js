/**
 * x402 Drain Test - Run fast until out of money
 * 
 * Runs x402 transactions every 5 seconds until wallets are empty.
 * 
 * Usage: node scripts/x402-drain-test.js
 */

const { Keypair, Connection, PublicKey, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const { getAssociatedTokenAddress, getAccount } = require('@solana/spl-token');
const fs = require('fs');
const path = require('path');

// Configuration
const KEYPAIRS_FILE = path.join(__dirname, 'x402-5wallet-keypairs.json');
const INTERVAL_MS = 5 * 1000; // 5 seconds

// USDC Mint (mainnet)
const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');

// URLs
const TARGET_URL = process.env.X402_TARGET_URL || 'https://bread.markets/api/tasks/available';
const RPC_URL = process.env.HELIUS_RPC_URL || 'https://api.mainnet-beta.solana.com';

function loadWallets() {
  if (!fs.existsSync(KEYPAIRS_FILE)) {
    console.error(`❌ Keypairs file not found: ${KEYPAIRS_FILE}`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(KEYPAIRS_FILE, 'utf8'));
}

function getKeypair(walletData) {
  return Keypair.fromSecretKey(Buffer.from(walletData.secretKey, 'base64'));
}

async function getBalances(connection, publicKey) {
  const sol = await connection.getBalance(publicKey) / LAMPORTS_PER_SOL;
  let usdc = 0;
  try {
    const ata = await getAssociatedTokenAddress(USDC_MINT, publicKey);
    const account = await getAccount(connection, ata);
    usdc = Number(account.amount) / 1_000_000;
  } catch {}
  return { sol, usdc };
}

// Minimum SOL needed (just enough for a few txs)
const MIN_SOL = 0.0005;

function createWalletAdapter(keypair) {
  return {
    publicKey: keypair.publicKey,
    address: keypair.publicKey.toBase58(),
    signTransaction: async (tx) => {
      tx.sign([keypair]);
      return tx;
    },
  };
}

async function makeX402Request(keypair) {
  const { createX402Client } = await import('x402-solana/client');
  
  const wallet = createWalletAdapter(keypair);
  const client = createX402Client({
    wallet,
    network: 'solana',
    rpcUrl: RPC_URL,
    maxPaymentAmount: BigInt(100_000),
  });
  
  const response = await client.fetch(TARGET_URL, { method: 'GET' });
  
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  
  return await response.json();
}

async function main() {
  const wallets = loadWallets();
  const connection = new Connection(RPC_URL, 'confirmed');
  
  console.log(`\n🚀 x402 DRAIN TEST - Running until out of money!`);
  console.log(`   Target: ${TARGET_URL}`);
  console.log(`   Interval: ${INTERVAL_MS / 1000}s`);
  console.log(`   Wallets: ${wallets.length}`);
  console.log('');
  
  // Check initial balances
  console.log('📊 Initial balances:');
  let totalUsdc = 0;
  for (let i = 0; i < wallets.length; i++) {
    const bal = await getBalances(connection, new PublicKey(wallets[i].publicKey));
    totalUsdc += bal.usdc;
    console.log(`   Wallet ${i + 1}: ${bal.usdc.toFixed(4)} USDC`);
  }
  console.log(`   Total: ${totalUsdc.toFixed(4)} USDC (~${Math.floor(totalUsdc / 0.01)} transactions)\n`);
  
  let currentIndex = 0;
  let successCount = 0;
  let failCount = 0;
  let emptyWallets = new Set();
  const startTime = Date.now();
  
  const runTransaction = async () => {
    // Skip empty wallets
    while (emptyWallets.has(currentIndex) && emptyWallets.size < wallets.length) {
      currentIndex = (currentIndex + 1) % wallets.length;
    }
    
    // All wallets empty?
    if (emptyWallets.size >= wallets.length) {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      console.log(`\n${'='.repeat(60)}`);
      console.log(`🏁 ALL WALLETS DRAINED!`);
      console.log(`   Total transactions: ${successCount + failCount}`);
      console.log(`   Successful: ${successCount}`);
      console.log(`   Failed: ${failCount}`);
      console.log(`   Time: ${elapsed}s`);
      console.log(`${'='.repeat(60)}`);
      process.exit(0);
    }
    
    const walletData = wallets[currentIndex];
    const keypair = getKeypair(walletData);
    
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    console.log(`[${elapsed}s] TX #${successCount + failCount + 1} | W${currentIndex + 1} | ${walletData.publicKey.slice(0, 8)}...`);
    
    try {
      const result = await makeX402Request(keypair);
      successCount++;
      console.log(`   ✅ Success! Tasks: ${result.tasks?.length || 0}`);
    } catch (error) {
      failCount++;
      const msg = error.message || String(error);
      console.log(`   ❌ Failed: ${msg.slice(0, 60)}`);
      
      // Check if out of funds
      if (msg.includes('insufficient') || msg.includes('balance') || msg.includes('0x1')) {
        console.log(`   💸 Wallet ${currentIndex + 1} appears empty, marking as drained`);
        emptyWallets.add(currentIndex);
      }
    }
    
    // Move to next wallet
    currentIndex = (currentIndex + 1) % wallets.length;
    
    console.log(`   📈 ${successCount} ok / ${failCount} fail | ${emptyWallets.size} drained`);
  };
  
  // Run immediately
  await runTransaction();
  
  // Then every 5 seconds
  const interval = setInterval(async () => {
    await runTransaction();
  }, INTERVAL_MS);
  
  // Handle Ctrl+C gracefully
  process.on('SIGINT', () => {
    clearInterval(interval);
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    console.log(`\n\n🛑 Stopped by user`);
    console.log(`   Transactions: ${successCount} success, ${failCount} failed`);
    console.log(`   Time: ${elapsed}s`);
    process.exit(0);
  });
}

main().catch(console.error);
