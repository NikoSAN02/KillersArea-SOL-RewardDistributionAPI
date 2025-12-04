const {
  Connection,
  PublicKey,
  Keypair,
  clusterApiUrl,
} = require('@solana/web3.js');
const {
  getOrCreateAssociatedTokenAccount,
  createTransferInstruction,
  TOKEN_PROGRAM_ID,
  Account,
  getAssociatedTokenAddress,
  TOKEN_2022_PROGRAM_ID,
  getMint,
} = require('@solana/spl-token');
const bs58Lib = require('bs58');
const bs58 = bs58Lib.default || bs58Lib;

class SolanaService {
  constructor() {
    // Initialize connection based on network
    const network = process.env.SOLANA_NETWORK || 'devnet';
    const rpcUrl = process.env.SOLANA_RPC_URL || clusterApiUrl(network);

    this.connection = new Connection(rpcUrl, 'confirmed');
    this.network = network;

    // Create server wallet from private key
    if (!process.env.SERVER_WALLET_PRIVATE_KEY) {
      // In development mode, we can create a temporary wallet for testing
      if (process.env.NODE_ENV !== 'production') {
        this.serverWallet = Keypair.generate();
        console.warn('⚠️ WARNING: Using a generated wallet for development. DO NOT use in production!');
        console.log(`📝 Development server wallet address: ${this.serverWallet.publicKey.toBase58()}`);
        console.log('📝 To use a real wallet, set SERVER_WALLET_PRIVATE_KEY in your .env file');
      } else {
        throw new Error('SERVER_WALLET_PRIVATE_KEY is required in environment variables');
      }
    } else {
      try {
        // First, try to parse as JSON array (for array format)
        let secretKey;
        try {
          const secretKeyArray = JSON.parse(process.env.SERVER_WALLET_PRIVATE_KEY);
          secretKey = new Uint8Array(secretKeyArray);
        } catch (parseError) {
          // If that fails, try to decode as base58 (for private key strings)
          try {
            secretKey = bs58.decode(process.env.SERVER_WALLET_PRIVATE_KEY);
          } catch (bs58Error) {
            throw new Error(`Private key must be either base58 encoded string or JSON array of numbers: ${parseError.message}`);
          }
        }

        this.serverWallet = Keypair.fromSecretKey(secretKey);
        console.log(`✅ Server wallet initialized: ${this.serverWallet.publicKey.toBase58()}`);
      } catch (error) {
        throw new Error(`Invalid server wallet private key: ${error.message}`);
      }
    }
  }

  /**
   * Get the server wallet keypair
   * @returns {Keypair} Server wallet keypair
   */
  getServerWallet() {
    return this.serverWallet;
  }

  /**
   * Get connection instance
   * @returns {Connection} Solana connection
   */
  getConnection() {
    return this.connection;
  }

  /**
   * Get the Program ID for a Mint address (Token or Token-2022)
   * @param {PublicKey} mintAddress - Mint address
   * @returns {Promise<PublicKey>} Program ID
   */
  async getMintProgramId(mintAddress) {
    try {
      const accountInfo = await this.connection.getAccountInfo(mintAddress);
      if (!accountInfo) {
        throw new Error(`Mint address ${mintAddress.toBase58()} not found on chain`);
      }
      return accountInfo.owner;
    } catch (error) {
      console.error('Error getting mint program ID:', error);
      throw error;
    }
  }

  /**
   * Get the decimals for a Mint address
   * @param {PublicKey} mintAddress - Mint address
   * @returns {Promise<number>} Decimals
   */
  async getMintDecimals(mintAddress) {
    try {
      const programId = await this.getMintProgramId(mintAddress);
      const mintInfo = await getMint(
        this.connection,
        mintAddress,
        'confirmed',
        programId
      );
      return mintInfo.decimals;
    } catch (error) {
      console.error('Error getting mint decimals:', error);
      throw error;
    }
  }

  /**
   * Create associated token account if it doesn't exist
   * @param {PublicKey} tokenMintAddress - SPL token mint address
   * @param {PublicKey} owner - Owner of the token account
   * @returns {Promise<Account>} Token account
   */
  async createAssociatedTokenAccount(tokenMintAddress, owner) {
    try {
      const programId = await this.getMintProgramId(tokenMintAddress);

      const tokenAccount = await getOrCreateAssociatedTokenAccount(
        this.connection,
        this.serverWallet, // Payer
        tokenMintAddress,
        owner,
        true, // Allow owner off curve
        'confirmed',
        undefined,
        programId
      );
      return tokenAccount;
    } catch (error) {
      console.error('Error in createAssociatedTokenAccount:', error);
      throw new Error(`Failed to create associated token account: ${error.message}`);
    }
  }

  /**
   * Check if a wallet address is valid
   * @param {string} address - Wallet address to validate
   * @returns {boolean} True if valid, false otherwise
   */
  isValidSolanaAddress(address) {
    try {
      new PublicKey(address);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get balance of a token account
   * @param {PublicKey} tokenAccount - Token account public key
   * @returns {Promise<number>} Token balance
   */
  async getTokenBalance(tokenAccount) {
    try {
      const accountInfo = await this.connection.getTokenAccountBalance(tokenAccount);
      return accountInfo.value.uiAmount || 0;
    } catch (error) {
      console.error(`Error getting token balance for account ${tokenAccount.toBase58()}:`, error);
      throw new Error(`Failed to get token balance: ${error.message}`);
    }
  }

  /**
   * Get server wallet token balance
   * @param {PublicKey} tokenMintAddress - SPL token mint address
   * @returns {Promise<number>} Token balance in server wallet
   */
  async getServerTokenBalance(tokenMintAddress) {
    try {
      console.log(`Getting token balance for mint: ${tokenMintAddress.toBase58()}`);
      console.log(`Server wallet: ${this.serverWallet.publicKey.toBase58()}`);

      const programId = await this.getMintProgramId(tokenMintAddress);

      // Use getOrCreateAssociatedTokenAccount which will find the correct account
      const serverTokenAccount = await getOrCreateAssociatedTokenAccount(
        this.connection,
        this.serverWallet, // Payer
        tokenMintAddress,  // Mint
        this.serverWallet.publicKey, // Owner
        true, // Allow owner off curve
        'confirmed',
        undefined,
        programId
      );

      console.log(`Server token account: ${serverTokenAccount.address.toBase58()}`);

      const balance = await this.getTokenBalance(serverTokenAccount.address);
      console.log(`Balance retrieved: ${balance}`);

      return balance;
    } catch (error) {
      console.error('Detailed error in getServerTokenBalance:', error);
      if (error.message && error.message.includes('TokenAccountNotFoundError')) {
        console.log('Token account does not exist, returning 0 balance');
        return 0; // Return 0 if the token account doesn't exist
      }
      const errorMessage = error.message || JSON.stringify(error);
      throw new Error(`Failed to get server token balance: ${errorMessage}`);
    }
  }
}

module.exports = SolanaService;