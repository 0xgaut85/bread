/**
 * x402 Stress Test Script
 * 
 * Generates 100 Solana wallets and makes x402 transactions every 5 minutes.
 * Transactions go through https://app.bountydot.money and appear on x402scan.
 * 
 * SECURITY: Private keys are stored in a separate file that is gitignored.
 * Never commit the keypairs file!
 * 
 * Usage:
 *   1. First run: node scripts/x402-stress-test.js --generate
 *      This creates the wallets and saves them to x402-stress-keypairs.json
 *   
 *   2. Fund the wallets with USDC (mainnet USDC!)
 *      The script will output all public addresses for funding.
 *   
 *   3. Run the stress test: node scripts/x402-stress-test.js --run
 *      This will make one x402 transaction every 5 minutes, cycling through wallets.
 * 
 * Environment variables:
 *   - X402_TARGET_URL: The x402 endpoint (default: https://app.bountydot.money/api/tasks/available)
 *   - X402_NETWORK: solana or solana-devnet (default: solana for mainnet)
 *   - HELIUS_RPC_URL: RPC URL for Solana (optional)
 */

const { Keypair, Connection, VersionedTransaction, PublicKey } = require('@solana/web3.js');
const { getAssociatedTokenAddress, TOKEN_PROGRAM_ID } = require('@solana/spl-token');
const bs58 = require('bs58').default || require('bs58');
const fs = require('fs');
const path = require('path');

// Configuration
const KEYPAIRS_FILE = path.join(__dirname, 'x402-stress-keypairs.json');
const WALLET_COUNT = 100;
const INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

// USDC Mint addresses
const USDC_MINT_MAINNET = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const USDC_MINT_DEVNET = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';

// Get configuration from environment
// Default to production URL so transactions appear on x402scan
const TARGET_URL = process.env.X402_TARGET_URL || 'https://app.bountydot.money/api/tasks/available';
const NETWORK = process.env.X402_NETWORK || 'solana'; // Production = mainnet
const RPC_URL = process.env.HELIUS_RPC_URL || 
  (NETWORK === 'solana' ? 'https://api.mainnet-beta.solana.com' : 'https://api.devnet.solana.com');
const USDC_MINT = NETWORK === 'solana' ? USDC_MINT_MAINNET : USDC_MINT_DEVNET;

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
      // Store secret key as base64 for easy reconstruction
      secretKey: Buffer.from(keypair.secretKey).toString('base64')
    });
    
    if ((i + 1) % 10 === 0) {
      console.log(`  Generated ${i + 1}/${WALLET_COUNT} wallets...`);
    }
  }
  
  // Save to file
  fs.writeFileSync(KEYPAIRS_FILE, JSON.stringify(wallets, null, 2));
  console.log(`\n✅ Saved ${WALLET_COUNT} wallets to ${KEYPAIRS_FILE}`);
  console.log(`\n⚠️  IMPORTANT: This file contains private keys. Never commit it to git!\n`);
  
  // Output public addresses for funding
  console.log('='.repeat(60));
  console.log('PUBLIC ADDRESSES TO FUND WITH USDC:');
  console.log('='.repeat(60));
  wallets.forEach((w, i) => {
    console.log(`${String(i + 1).padStart(3, ' ')}. ${w.publicKey}`);
  });
  console.log('='.repeat(60));
  
  // Also save just the public keys to a separate file for convenience
  const publicKeysFile = path.join(__dirname, 'x402-stress-addresses.txt');
  fs.writeFileSync(publicKeysFile, wallets.map(w => w.publicKey).join('\n'));
  console.log(`\n📋 Public addresses also saved to ${publicKeysFile}`);
  
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
 * Check USDC balance for a wallet
 */
async function checkUsdcBalance(connection, publicKey) {
  try {
    const ata = await getAssociatedTokenAddress(
      new PublicKey(USDC_MINT),
      new PublicKey(publicKey)
    );
    const balance = await connection.getTokenAccountBalance(ata);
    return parseFloat(balance.value.uiAmount || 0);
  } catch (e) {
    return 0;
  }
}

/**
 * Make an x402 payment request
 */
async function makeX402Request(keypair, connection) {
  const walletAddress = keypair.publicKey.toBase58();
  
  console.log(`\n🔄 Making x402 request with wallet: ${walletAddress.slice(0, 8)}...${walletAddress.slice(-8)}`);
  
  // Step 1: Make initial request to get 402 response
  console.log(`   📡 Requesting ${TARGET_URL}...`);
  const initialResponse = await fetch(TARGET_URL, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    }
  });
  
  if (initialResponse.status !== 402) {
    if (initialResponse.status === 200) {
      console.log(`   ✅ Endpoint returned 200 (no payment required or already paid)`);
      const data = await initialResponse.json();
      return { success: true, data };
    }
    throw new Error(`Unexpected status: ${initialResponse.status}`);
  }
  
  // Step 2: Parse 402 response to get payment requirements
  const paymentRequired = await initialResponse.json();
  console.log(`   💰 Payment required: ${paymentRequired.accepts?.[0]?.amount || 'unknown'} atomic units`);
  
  if (!paymentRequired.accepts || paymentRequired.accepts.length === 0) {
    throw new Error('No payment options in 402 response');
  }
  
  const accepted = paymentRequired.accepts[0];
  const resource = paymentRequired.resource;
  
  // Step 3: Create payment transaction via facilitator
  console.log(`   🏗️  Building payment transaction...`);
  
  const facilitatorUrl = 'https://facilitator.payai.network';
  const quoteResponse = await fetch(`${facilitatorUrl}/quote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      network: accepted.network,
      amount: accepted.amount,
      payTo: accepted.payTo,
      asset: accepted.asset,
      payer: walletAddress,
      resource: resource,
    })
  });
  
  if (!quoteResponse.ok) {
    const errorText = await quoteResponse.text();
    throw new Error(`Facilitator quote failed: ${quoteResponse.status} - ${errorText}`);
  }
  
  const quote = await quoteResponse.json();
  console.log(`   📝 Got quote from facilitator`);
  
  // Step 4: Deserialize and sign the transaction
  const transactionBuffer = Buffer.from(quote.transaction, 'base64');
  const transaction = VersionedTransaction.deserialize(transactionBuffer);
  
  // Sign the transaction
  transaction.sign([keypair]);
  console.log(`   ✍️  Transaction signed`);
  
  // Step 5: Create payment payload
  const signedTxBase64 = Buffer.from(transaction.serialize()).toString('base64');
  
  const paymentPayload = {
    x402Version: 2,
    resource: resource,
    accepted: accepted,
    payload: {
      transaction: signedTxBase64
    }
  };
  
  const paymentHeader = Buffer.from(JSON.stringify(paymentPayload)).toString('base64');
  
  // Step 6: Make the paid request
  console.log(`   📤 Sending paid request...`);
  const paidResponse = await fetch(TARGET_URL, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'X-PAYMENT': paymentHeader,
    }
  });
  
  if (!paidResponse.ok) {
    const errorData = await paidResponse.json().catch(() => ({}));
    throw new Error(`Paid request failed: ${paidResponse.status} - ${JSON.stringify(errorData)}`);
  }
  
  const result = await paidResponse.json();
  console.log(`   ✅ Payment successful!`);
  
  return { success: true, data: result };
}

/**
 * Run the stress test
 */
async function runStressTest() {
  const wallets = loadWallets();
  const connection = new Connection(RPC_URL, 'confirmed');
  
  console.log(`\n🚀 Starting x402 Stress Test`);
  console.log(`   Target URL: ${TARGET_URL}`);
  console.log(`   Network: ${NETWORK}`);
  console.log(`   RPC: ${RPC_URL}`);
  console.log(`   Interval: ${INTERVAL_MS / 1000 / 60} minutes`);
  console.log(`   Wallets: ${wallets.length}`);
  console.log(`\n`);
  
  // Check balances first
  console.log('📊 Checking USDC balances...');
  let fundedWallets = [];
  for (let i = 0; i < wallets.length; i++) {
    const balance = await checkUsdcBalance(connection, wallets[i].publicKey);
    if (balance > 0) {
      fundedWallets.push({ ...wallets[i], balance });
      console.log(`   Wallet ${i + 1}: ${balance.toFixed(4)} USDC ✓`);
    }
  }
  
  if (fundedWallets.length === 0) {
    console.error('\n❌ No wallets have USDC balance!');
    console.error('   Please fund the wallets with USDC before running the stress test.');
    console.error('   Run with --generate to see the list of addresses to fund.');
    process.exit(1);
  }
  
  console.log(`\n✅ Found ${fundedWallets.length} funded wallets`);
  
  let currentIndex = 0;
  let successCount = 0;
  let failCount = 0;
  
  const runTransaction = async () => {
    const walletData = fundedWallets[currentIndex];
    const keypair = getKeypair(walletData);
    
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Transaction #${successCount + failCount + 1} | Wallet ${currentIndex + 1}/${fundedWallets.length}`);
    console.log(`Time: ${new Date().toISOString()}`);
    console.log(`${'='.repeat(60)}`);
    
    try {
      const result = await makeX402Request(keypair, connection);
      successCount++;
      console.log(`\n📈 Stats: ${successCount} success, ${failCount} failed`);
    } catch (error) {
      failCount++;
      console.error(`\n❌ Transaction failed: ${error.message}`);
      console.log(`📈 Stats: ${successCount} success, ${failCount} failed`);
    }
    
    // Move to next wallet
    currentIndex = (currentIndex + 1) % fundedWallets.length;
  };
  
  // Run first transaction immediately
  await runTransaction();
  
  // Then run every 5 minutes
  console.log(`\n⏰ Next transaction in ${INTERVAL_MS / 1000 / 60} minutes...`);
  setInterval(async () => {
    await runTransaction();
    console.log(`\n⏰ Next transaction in ${INTERVAL_MS / 1000 / 60} minutes...`);
  }, INTERVAL_MS);
}

/**
 * Show wallet balances
 */
async function showBalances() {
  const wallets = loadWallets();
  const connection = new Connection(RPC_URL, 'confirmed');
  
  console.log(`\n📊 Checking USDC balances for ${wallets.length} wallets...\n`);
  console.log(`Network: ${NETWORK}`);
  console.log(`USDC Mint: ${USDC_MINT}\n`);
  
  let totalBalance = 0;
  let fundedCount = 0;
  
  for (let i = 0; i < wallets.length; i++) {
    const balance = await checkUsdcBalance(connection, wallets[i].publicKey);
    totalBalance += balance;
    
    if (balance > 0) {
      fundedCount++;
      console.log(`${String(i + 1).padStart(3, ' ')}. ${wallets[i].publicKey.slice(0, 8)}...${wallets[i].publicKey.slice(-8)}: ${balance.toFixed(4)} USDC`);
    }
  }
  
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Total: ${totalBalance.toFixed(4)} USDC across ${fundedCount} funded wallets`);
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
    await runStressTest();
  } else if (args.includes('--balances')) {
    await showBalances();
  } else {
    console.log(`
x402 Stress Test Script
=======================

Usage:
  node scripts/x402-stress-test.js --generate   Generate 100 wallets
  node scripts/x402-stress-test.js --balances   Check USDC balances
  node scripts/x402-stress-test.js --run        Run the stress test

Environment variables:
  X402_TARGET_URL   Target x402 endpoint (default: https://app.bountydot.money/api/tasks/available)
  X402_NETWORK      Network: solana or solana-devnet (default: solana for mainnet)
  HELIUS_RPC_URL    Custom RPC URL (optional)

Steps:
  1. Run --generate to create 100 wallets
  2. Fund the wallets with USDC (addresses are printed and saved to x402-stress-addresses.txt)
  3. Run --balances to verify funding
  4. Run --run to start the stress test (1 transaction every 5 minutes)
`);
  }
}

main().catch(console.error);
