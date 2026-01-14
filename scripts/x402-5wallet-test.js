/**
 * x402 5-Wallet Test Script
 * 
 * Generates 5 Solana wallets and makes x402 transactions every 30 seconds.
 * Transactions go through https://bread.markets and appear on x402scan.
 * 
 * Usage:
 *   1. Generate wallets: node scripts/x402-5wallet-test.js --generate
 *   2. Fund wallets with SOL (for fees) and USDC
 *   3. Check balances: node scripts/x402-5wallet-test.js --balances
 *   4. Run test: node scripts/x402-5wallet-test.js --run
 */

const { Keypair, Connection, PublicKey, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const { getAssociatedTokenAddress, getAccount } = require('@solana/spl-token');
const fs = require('fs');
const path = require('path');

// Configuration
const KEYPAIRS_FILE = path.join(__dirname, 'x402-5wallet-keypairs.json');
const WALLET_COUNT = 5;
const INTERVAL_MS = 30 * 1000; // 30 seconds

// USDC Mint (mainnet)
const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');

// Get configuration from environment
const TARGET_URL = process.env.X402_TARGET_URL || 'https://bread.markets/api/tasks/available';
const RPC_URL = process.env.HELIUS_RPC_URL || 'https://api.mainnet-beta.solana.com';

/**
 * Generate wallets and save to file
 */
function generateWallets() {
  console.log(`\n🔑 Generating ${WALLET_COUNT} Solana wallets...\n`);
  
  const wallets = [];
  for (let i = 0; i < WALLET_COUNT; i++) {
    const keypair = Keypair.generate();
    wallets.push({
      index: i,
      publicKey: keypair.publicKey.toBase58(),
      secretKey: Buffer.from(keypair.secretKey).toString('base64')
    });
    console.log(`  Wallet ${i + 1}: ${keypair.publicKey.toBase58()}`);
  }
  
  // Save to file
  fs.writeFileSync(KEYPAIRS_FILE, JSON.stringify(wallets, null, 2));
  console.log(`\n✅ Saved ${WALLET_COUNT} wallets to ${KEYPAIRS_FILE}`);
  console.log(`\n⚠️  IMPORTANT: This file contains private keys. Never commit it to git!\n`);
  
  // Output public addresses for funding
  console.log('='.repeat(60));
  console.log('PUBLIC ADDRESSES TO FUND WITH SOL + USDC:');
  console.log('='.repeat(60));
  wallets.forEach((w, i) => {
    console.log(`${i + 1}. ${w.publicKey}`);
  });
  console.log('='.repeat(60));
  
  console.log('\n📋 Copy these addresses to fund them:');
  console.log(wallets.map(w => w.publicKey).join('\n'));
  
  return wallets;
}

/**
 * Load wallets from file
 */
function loadWallets() {
  if (!fs.existsSync(KEYPAIRS_FILE)) {
    console.error(`❌ Keypairs file not found: ${KEYPAIRS_FILE}`);
    console.error('   Run with --generate first to create wallets.');
    process.exit(1);
  }
  
  const data = JSON.parse(fs.readFileSync(KEYPAIRS_FILE, 'utf8'));
  console.log(`📂 Loaded ${data.length} wallets from ${KEYPAIRS_FILE}`);
  return data;
}

/**
 * Reconstruct Keypair from stored data
 */
function getKeypair(walletData) {
  const secretKey = Buffer.from(walletData.secretKey, 'base64');
  return Keypair.fromSecretKey(secretKey);
}

/**
 * Get balances for a wallet
 */
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

/**
 * Create wallet adapter for x402-solana client
 */
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

/**
 * Make an x402 payment request using x402-solana client
 */
async function makeX402Request(keypair) {
  const { createX402Client } = await import('x402-solana/client');
  
  const wallet = createWalletAdapter(keypair);
  const client = createX402Client({
    wallet,
    network: 'solana',
    rpcUrl: RPC_URL,
    maxPaymentAmount: BigInt(100_000), // 0.1 USDC max
  });
  
  console.log(`   📡 Requesting ${TARGET_URL}...`);
  const response = await client.fetch(TARGET_URL, { method: 'GET' });
  
  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`Request failed: ${response.status} - ${errorText}`);
  }
  
  return await response.json();
}

/**
 * Run the test
 */
async function runTest() {
  const wallets = loadWallets();
  const connection = new Connection(RPC_URL, 'confirmed');
  
  console.log(`\n🚀 Starting x402 5-Wallet Test`);
  console.log(`   Target URL: ${TARGET_URL}`);
  console.log(`   Network: solana (mainnet)`);
  console.log(`   RPC: ${RPC_URL}`);
  console.log(`   Interval: ${INTERVAL_MS / 1000} seconds`);
  console.log(`   Wallets: ${wallets.length}`);
  console.log(`\n`);
  
  // Check balances first
  console.log('📊 Checking balances...');
  let fundedWallets = [];
  for (let i = 0; i < wallets.length; i++) {
    const pubkey = new PublicKey(wallets[i].publicKey);
    const bal = await getBalances(connection, pubkey);
    
    console.log(`   Wallet ${i + 1}: ${bal.sol.toFixed(4)} SOL, ${bal.usdc.toFixed(4)} USDC`);
    
    if (bal.usdc >= 0.01 && bal.sol > 0.001) {
      fundedWallets.push({ ...wallets[i], solBalance: bal.sol, usdcBalance: bal.usdc });
    }
    
    await new Promise(r => setTimeout(r, 100)); // Rate limit
  }
  
  if (fundedWallets.length === 0) {
    console.error('\n❌ No wallets have both SOL and USDC balance!');
    console.error('   Please fund the wallets before running the test.');
    console.error('   Each wallet needs:');
    console.error('   - Some SOL for transaction fees (~0.01 SOL)');
    console.error('   - USDC for x402 payments (0.01 USDC per request)');
    process.exit(1);
  }
  
  console.log(`\n✅ Found ${fundedWallets.length} funded wallets`);
  
  let currentIndex = 0;
  let successCount = 0;
  let failCount = 0;
  const startTime = Date.now();
  
  const runTransaction = async () => {
    const walletData = fundedWallets[currentIndex];
    const keypair = getKeypair(walletData);
    
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Transaction #${successCount + failCount + 1} | Wallet ${currentIndex + 1}/${fundedWallets.length} | ${elapsed}s elapsed`);
    console.log(`Wallet: ${walletData.publicKey.slice(0, 12)}...${walletData.publicKey.slice(-8)}`);
    console.log(`Time: ${new Date().toISOString()}`);
    console.log(`${'='.repeat(60)}`);
    
    try {
      console.log('📤 Making x402 payment...');
      const result = await makeX402Request(keypair);
      successCount++;
      console.log(`✅ Success! Tasks: ${result.tasks?.length || 0}`);
      if (result.tasks && result.tasks.length > 0) {
        console.log(`   First task: ${result.tasks[0].title}`);
      }
    } catch (error) {
      failCount++;
      console.error(`❌ Transaction failed: ${error.message}`);
    }
    
    console.log(`\n📈 Stats: ${successCount} success, ${failCount} failed`);
    
    // Move to next wallet
    currentIndex = (currentIndex + 1) % fundedWallets.length;
  };
  
  // Run first transaction immediately
  await runTransaction();
  
  // Then run every 30 seconds
  console.log(`\n⏰ Next transaction in ${INTERVAL_MS / 1000} seconds...`);
  setInterval(async () => {
    await runTransaction();
    console.log(`\n⏰ Next transaction in ${INTERVAL_MS / 1000} seconds...`);
  }, INTERVAL_MS);
}

/**
 * Show wallet balances
 */
async function showBalances() {
  const wallets = loadWallets();
  const connection = new Connection(RPC_URL, 'confirmed');
  
  console.log(`\n📊 Checking balances for ${wallets.length} wallets...\n`);
  console.log(`Network: solana (mainnet)`);
  console.log(`USDC Mint: ${USDC_MINT.toBase58()}\n`);
  
  let totalSol = 0;
  let totalUsdc = 0;
  let fundedCount = 0;
  
  for (let i = 0; i < wallets.length; i++) {
    const pubkey = new PublicKey(wallets[i].publicKey);
    const bal = await getBalances(connection, pubkey);
    
    totalSol += bal.sol;
    totalUsdc += bal.usdc;
    
    const status = (bal.sol > 0.001 && bal.usdc >= 0.01) ? '✅' : '❌';
    if (bal.sol > 0.001 && bal.usdc >= 0.01) fundedCount++;
    
    console.log(`${i + 1}. ${wallets[i].publicKey}`);
    console.log(`   SOL: ${bal.sol.toFixed(4)} | USDC: ${bal.usdc.toFixed(4)} ${status}`);
    
    await new Promise(r => setTimeout(r, 100)); // Rate limit
  }
  
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Total: ${totalSol.toFixed(4)} SOL, ${totalUsdc.toFixed(4)} USDC`);
  console.log(`Ready wallets: ${fundedCount}/${wallets.length}`);
  console.log(`${'='.repeat(60)}`);
}

/**
 * Main entry point
 */
async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--generate')) {
    generateWallets();
  } else if (args.includes('--run')) {
    await runTest();
  } else if (args.includes('--balances')) {
    await showBalances();
  } else {
    console.log(`
x402 5-Wallet Test Script
=========================

Usage:
  node scripts/x402-5wallet-test.js --generate   Generate 5 wallets
  node scripts/x402-5wallet-test.js --balances   Check SOL + USDC balances
  node scripts/x402-5wallet-test.js --run        Run the test (1 txn every 30 seconds)

Environment variables:
  X402_TARGET_URL   Target x402 endpoint (default: https://bread.markets/api/tasks/available)
  HELIUS_RPC_URL    Custom RPC URL (optional)

Steps:
  1. Run --generate to create 5 wallets
  2. Fund each wallet with:
     - ~0.01 SOL (for transaction fees)
     - ~0.1 USDC (for x402 payments, 0.01 USDC each)
  3. Run --balances to verify funding
  4. Run --run to start the test
`);
  }
}

main().catch(console.error);
