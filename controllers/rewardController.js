const TokenService = require('../services/tokenService');
const Joi = require('joi');
const logger = require('../utils/logger');

// Validation schema for single reward request
const singleRewardSchema = Joi.object({
  address: Joi.string().required().pattern(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/).messages({
    'string.pattern.base': 'Invalid Solana address format'
  }),
  amount: Joi.number().integer().min(1).required()
});

// Validation schema for batch reward request
const batchRewardSchema = Joi.array().items(
  Joi.object({
    address: Joi.string().required().pattern(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/).messages({
      'string.pattern.base': 'Invalid Solana address format'
    }),
    amount: Joi.number().integer().min(1).required()
  })
).min(1).max(100); // Max 100 transfers per batch request

class RewardController {
  constructor() {
    this.tokenService = new TokenService();
  }

  /**
   * Distribute rewards to a single user
   */
  async distributeReward(req, res) {
    try {
      logger.info('Processing single reward distribution', { 
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        body: req.body
      });
      
      // Validate request body
      const { error, value } = singleRewardSchema.validate(req.body);
      if (error) {
        logger.warn('Validation failed for single reward distribution', { 
          error: error.details[0].message,
          body: req.body 
        });
        
        return res.status(400).json({
          error: 'Validation Error',
          message: error.details[0].message
        });
      }

      const { address, amount } = value;

      // Perform the token transfer
      const transactionSignature = await this.tokenService.transferTokens(address, amount);

      res.status(200).json({
        success: true,
        message: 'Reward distributed successfully',
        data: {
          recipient: address,
          amount: amount,
          transaction: transactionSignature
        }
      });
      
      logger.info('Single reward distribution completed', { 
        transaction: transactionSignature,
        recipient: address, 
        amount 
      });
    } catch (error) {
      logger.error('Error distributing single reward', { 
        error: error.message,
        body: req.body,
        ip: req.ip
      });
      
      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message
      });
    }
  }

  /**
   * Distribute rewards to multiple users in batch
   */
  async distributeBatchRewards(req, res) {
    try {
      logger.info('Processing batch reward distribution', { 
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        recipientCount: Array.isArray(req.body) ? req.body.length : 0
      });
      
      // Validate request body
      const { error, value } = batchRewardSchema.validate(req.body);
      if (error) {
        logger.warn('Validation failed for batch reward distribution', { 
          error: error.details[0].message,
          body: req.body 
        });
        
        return res.status(400).json({
          error: 'Validation Error',
          message: error.details[0].message
        });
      }

      const recipients = value;

      // Perform batch token transfers
      const results = await this.tokenService.transferTokensBatch(recipients);

      // Calculate summary
      const successfulTransfers = results.filter(r => r.success).length;
      const failedTransfers = results.filter(r => !r.success).length;

      res.status(200).json({
        success: true,
        message: `Batch reward distribution completed. ${successfulTransfers} successful, ${failedTransfers} failed`,
        data: {
          totalRequested: recipients.length,
          successful: successfulTransfers,
          failed: failedTransfers,
          results: results
        }
      });
      
      logger.info('Batch reward distribution completed', { 
        totalRequested: recipients.length,
        successful: successfulTransfers,
        failed: failedTransfers
      });
    } catch (error) {
      logger.error('Error distributing batch rewards', { 
        error: error.message,
        body: req.body,
        ip: req.ip
      });
      
      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message
      });
    }
  }

  /**
   * Get server wallet balance
   */
  async getBalance(req, res) {
    try {
      logger.info('Balance check requested', { ip: req.ip });
      
      const balance = await this.tokenService.solanaService.getServerTokenBalance(
        this.tokenService.tokenMintAddress
      );

      res.status(200).json({
        success: true,
        data: {
          balance: balance,
          tokenMint: process.env.TOKEN_MINT_ADDRESS,
          serverWallet: this.tokenService.solanaService.getServerWallet().publicKey.toBase58()
        }
      });
      
      logger.info('Balance check completed', { balance });
    } catch (error) {
      logger.error('Error getting balance', { error: error.message, ip: req.ip });
      
      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message
      });
    }
  }
}

module.exports = RewardController;