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

    // Create a temporary token mint address for development if not provided
    if (!process.env.TOKEN_MINT_ADDRESS) {
      // Optional: Log a message or just ignore, since we are using SOL now
      // Keeping it just in case legacy code checks it, but it's not used for transfer
      if (process.env.NODE_ENV !== 'production') {
        console.log('📝 Operating in SOL transfer mode. TOKEN_MINT_ADDRESS is optional.');
      }
    } else {
      this.tokenMintAddress = new PublicKey(process.env.TOKEN_MINT_ADDRESS);
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

      const recipientPublicKey = new PublicKey(recipientAddress);
      const connection = this.solanaService.getConnection();
      const serverWallet = this.solanaService.getServerWallet();

      // Check server wallet balance
      let serverBalance = 0;
      try {
        serverBalance = await this.solanaService.getSolBalance();
      } catch (balanceError) {
        logger.warn('Could not retrieve server balance, proceeding with transfer attempt', {
          error: balanceError.message,
          recipient: recipientAddress
        });
        // Continue with the transfer, the transaction will fail if there are insufficient funds
      }

      // No need to adjust for decimals as amount is considered SOL now
      // But verify it is reasonable

      logger.info('Preparing SOL transfer', {
        amount: amount,
        recipient: recipientAddress
      });

      if (serverBalance > 0 && serverBalance < amount) {
        const error = new Error(`Insufficient SOL balance in server wallet. Available: ${serverBalance}, Required: ${amount}`);
        logger.error('Insufficient server balance', {
          required: amount,
          available: serverBalance,
          recipient: recipientAddress
        });
        throw error;
      }

      // Perform SOL Transfer
      const signature = await this.solanaService.transferSol(recipientAddress, amount);

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