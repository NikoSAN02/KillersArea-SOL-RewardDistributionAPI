// Script to validate the private key format
const solanaWeb3 = require('@solana/web3.js');
const bs58Lib = require('bs58');
const bs58 = bs58Lib.default || bs58Lib;

const privateKey = "3SmhDDenCYcUSuNJP4xmKxQUjZEDuLfFT7ptVab2F8DBx34yYwNXHJ5SAeCemtXF8w4DRnR9DeW2dfpZ84wgBmeu";

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
  
  // Validate that it matches Phantom's expected format
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