// Script to validate the new private key format
const solanaWeb3 = require('@solana/web3.js');
const bs58Lib = require('bs58');
const bs58 = bs58Lib.default || bs58Lib;

const privateKey = "5rvrD9217QzEGQfWAs9sbiQs43DPTkpBJWD8D6mosqwyuDFzpV5yRgxd2yDXtxJ1jz19cHVDM16nNqNrm5672re8";

console.log("Testing bs58 import:", typeof bs58.decode);

try {
  // Try to decode as base58
  const decoded = bs58.decode(privateKey);
  console.log("✅ Private key successfully decoded from base58");
  console.log("Decoded length:", decoded.length, "bytes");
  
  // Try to create keypair
  const keypair = solanaWeb3.Keypair.fromSecretKey(decoded);
  console.log("✅ Keypair successfully created");
  console.log("Public key:", keypair.publicKey.toBase58());
  
  // Verify this matches the expected wallet that has the tokens
  const expectedWallet = "AuWuUtHcWcLwhzwABrwkjDWijvYeE17Apf3PBeXeRSCm";
  if (keypair.publicKey.toBase58() === expectedWallet) {
    console.log("✅ This is the correct wallet that has the tokens!");
  } else {
    console.log(`⚠️  Warning: This keypair corresponds to ${keypair.publicKey.toBase58()}, not the expected ${expectedWallet}`);
  }
  
  // Validate that it's the right length
  if (decoded.length !== 64) {
    console.log("⚠️  Warning: Private key should typically be 64 bytes, but is", decoded.length);
  }
} catch (error) {
  console.error("❌ Error with private key:", error.message);
  
  // Try parsing as JSON array
  try {
    const keyArray = JSON.parse(privateKey);
    console.log("Private key appears to be JSON format:", keyArray);
  } catch (jsonError) {
    console.log("Private key is not JSON format either");
  }
}