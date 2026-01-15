const {
  Transaction,
  sendAndConfirmTransaction,
  Keypair,
  PublicKey,
} = require('@solana/web3.js');
const {
  createTransferInstruction,
  getOrCreateAssociatedTokenAccount,
  TOKEN_PROGRAM_ID,
} = require('@solana/spl-token');
const SolanaService = require('../utils/solana');
const logger = require('../utils/logger');

class TokenService {
  constructor() {
    this.solanaService = new SolanaService();

    // Token Mint Address is now REQUIRED for SPL transfers
    if (!process.env.TOKEN_MINT_ADDRESS) {
      console.warn('⚠️ TOKEN_MINT_ADDRESS is missing in .env');
      if (process.env.NODE_ENV === 'production') {
        throw new Error('TOKEN_MINT_ADDRESS is required for production SPL transfers');
      }
    } else {
      this.tokenMintAddress = new PublicKey(process.env.TOKEN_MINT_ADDRESS);
      console.log(`✅ Token Service initialized for Mint: ${this.tokenMintAddress.toBase58()}`);
    }
  }

  /**
   * Transfer SPL tokens to a recipient
   * @param {string} recipientAddress - Recipient's Solana wallet address
   * @param {number} amount - Amount of tokens to transfer
   * @returns {Promise<string>} Transaction signature
   */
  async transferTokens(recipientAddress, amount) {
    try {
      logger.info('Starting token transfer', { recipient: recipientAddress, amount });

      if (!this.tokenMintAddress) {
        throw new Error('Token Mint Address is not configured');
      }

      // Validate inputs
      if (!recipientAddress || !this.solanaService.isValidSolanaAddress(recipientAddress)) {
        const error = new Error('Invalid recipient address');
        logger.error('Invalid recipient address', { recipient: recipientAddress });
        throw error;
      }

      if (typeof amount !== 'number' || amount <= 0) {
        const error = new Error('Amount must be a positive number');
        logger.error('Invalid amount provided', { amount, recipient: recipientAddress });
        throw error;
      }

      // Check server wallet SOL balance (for gas fees only)
      // We don't check against 'amount' here because 'amount' is in Tokens, balance is in SOL
      let serverSolBalance = 0;
      try {
        serverSolBalance = await this.solanaService.getSolBalance();
      } catch (balanceError) {
        logger.warn('Could not retrieve server balance, proceeding with transfer attempt', {
          error: balanceError.message
        });
      }

      // Ensure we have at least a little SOL for fees (e.g. 0.002 SOL)
      // This is a loose check, the actual transaction will fail if insufficient
      if (serverSolBalance < 0.002) {
        logger.warn(`Server SOL balance is low (${serverSolBalance} SOL). Transaction might fail due to insufficient gas.`);
      }

      logger.info('Preparing SPL Token transfer', {
        amount: amount,
        recipient: recipientAddress,
        mint: this.tokenMintAddress.toBase58()
      });

      // Perform SPL Token Transfer
      const signature = await this.solanaService.transferSplToken(recipientAddress, amount, this.tokenMintAddress);

      logger.logTransaction(signature, recipientAddress, amount);

      return signature;
    } catch (error) {
      logger.logTransactionError(recipientAddress, amount, error);
      throw error;
    }
  }

  /**
   * Transfer multiple tokens to multiple recipients
   * @param {Array<{address: string, amount: number}>} recipients - Array of recipient addresses and amounts
   * @returns {Promise<Array<{address: string, amount: number, success: boolean, transaction?: string, error?: string}>>} Results for each transfer
   */
  async transferTokensBatch(recipients) {
    const results = [];

    for (const recipient of recipients) {
      try {
        const transaction = await this.transferTokens(recipient.address, recipient.amount);
        results.push({
          address: recipient.address,
          amount: recipient.amount,
          success: true,
          transaction: transaction
        });
      } catch (error) {
        results.push({
          address: recipient.address,
          amount: recipient.amount,
          success: false,
          error: error.message
        });
      }
    }

    return results;
  }
}

module.exports = TokenService;