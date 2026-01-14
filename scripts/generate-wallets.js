const { Keypair } = require('@solana/web3.js');
const bs58 = require('bs58').default || require('bs58');

// Generate 3 keypairs
const wallets = [];
for (let i = 1; i <= 3; i++) {
  const keypair = Keypair.generate();
  wallets.push({
    name: `Wallet ${i}`,
    publicKey: keypair.publicKey.toBase58(),
    secretKey: Buffer.from(keypair.secretKey).toString('base64')
  });
}

console.log('=== GENERATED WALLETS ===\n');
wallets.forEach(w => {
  console.log(`${w.name}:`);
  console.log(`  Public Key: ${w.publicKey}`);
  console.log(`  Secret Key: ${w.secretKey}`);
  console.log('');
});

console.log('=== PUBLIC ADDRESSES TO FUND ===');
wallets.forEach(w => {
  console.log(w.publicKey);
});
