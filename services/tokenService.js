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
      if (process.env.NODE_ENV !== 'production') {
        // Generate a temporary keypair for development
        this.tokenMintAddress = Keypair.generate().publicKey;
        console.warn('⚠️ WARNING: Using a generated token mint address for development. DO NOT use in production!');
        console.log(`📝 Development token mint address: ${this.tokenMintAddress.toBase58()}`);
        console.log('📝 To use a real token, set TOKEN_MINT_ADDRESS in your .env file');
      } else {
        throw new Error('TOKEN_MINT_ADDRESS is required in environment variables');
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
        serverBalance = await this.solanaService.getServerTokenBalance(this.tokenMintAddress);
      } catch (balanceError) {
        logger.warn('Could not retrieve server balance, proceeding with transfer attempt', {
          error: balanceError.message,
          recipient: recipientAddress
        });
        // Continue with the transfer, the transaction will fail if there are insufficient funds
      }

      // Get decimals and adjust amount
      const decimals = await this.solanaService.getMintDecimals(this.tokenMintAddress);
      const adjustedAmount = Math.floor(amount * Math.pow(10, decimals));

      logger.info('Adjusting amount for decimals', {
        originalAmount: amount,
        decimals,
        adjustedAmount
      });

      if (serverBalance > 0 && serverBalance < adjustedAmount) {
        const error = new Error(`Insufficient balance in server wallet. Available: ${serverBalance}, Required: ${adjustedAmount} (${amount} tokens)`);
        logger.error('Insufficient server balance', {
          required: adjustedAmount,
          available: serverBalance,
          recipient: recipientAddress
        });
        throw error;
      }

      // Get program ID (Token or Token-2022)
      const programId = await this.solanaService.getMintProgramId(this.tokenMintAddress);

      // Create or get associated token account for recipient
      // Note: createAssociatedTokenAccount in SolanaService now handles programId internally
      const recipientTokenAccount = await this.solanaService.createAssociatedTokenAccount(
        this.tokenMintAddress,
        recipientPublicKey
      );

      // Create associated token account for server if not exists
      const serverTokenAccount = await getOrCreateAssociatedTokenAccount(
        connection,
        serverWallet,
        this.tokenMintAddress,
        serverWallet.publicKey,
        false,
        'confirmed',
        undefined,
        programId
      );

      // Create transaction
      const transaction = new Transaction().add(
        createTransferInstruction(
          serverTokenAccount.address, // source
          recipientTokenAccount.address, // destination
          serverWallet.publicKey, // owner of source account
          adjustedAmount, // amount
          [], // multisig authority (not used)
          programId
        )
      );

      // Sign transaction
      transaction.feePayer = serverWallet.publicKey;
      transaction.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

      // Send and confirm transaction
      const signature = await sendAndConfirmTransaction(
        connection,
        transaction,
        [serverWallet],
        {
          commitment: 'confirmed',
          skipPreflight: false,
        }
      );

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