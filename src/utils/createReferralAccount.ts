'use client'
import { ReferralProvider } from "@jup-ag/referral-sdk";
import {
  Connection,
  PublicKey,
  Transaction,
  SendTransactionError,
  Keypair,
  clusterApiUrl
} from "@solana/web3.js";
import { LOCKIN_MINT, JUPITER_PROJECT } from "./globals";
import { NETWORK } from "./endpoints";
import { getReferralAccount } from "./getReferralAccount";

interface CreateReferralResult {
  success: boolean;
  referralAccountPubKey?: string;
  referralTokenAccountPubKey?: string;
  txId?: string;
  error?: string;
  exists?: boolean;
}

interface WalletAdapter {
  signAllTransactions: ((transactions: Transaction[]) => Promise<Transaction[]>) | undefined;
  sendTransaction: ((transaction: Transaction, connection: Connection) => Promise<string>) | undefined;
  publicKey: PublicKey | null;
}

export const createTokenReferralAccount = async (
  wallet: WalletAdapter,
  referralWallet: string,
  mint: string = LOCKIN_MINT,
  existingReferralAccount?: PublicKey
): Promise<CreateReferralResult> => {
  if (!wallet.publicKey || !wallet.signAllTransactions || !wallet.sendTransaction) {
    return {
      success: false,
      error: "Wallet not connected"
    };
  }

  try {
    const connection = new Connection(
      NETWORK.startsWith('http') ? NETWORK : clusterApiUrl("mainnet-beta"),
      'confirmed'
    );
    
    const provider = new ReferralProvider(connection);

    // If we have an existing referral account, skip to creating token account
    if (existingReferralAccount) {
      // Create the token account
      const { tx: tokenTx, referralTokenAccountPubKey } = await provider.initializeReferralTokenAccount({
        payerPubKey: wallet.publicKey,
        referralAccountPubKey: existingReferralAccount,
        mint: new PublicKey(mint),
      });

      const tokenTxBlockhash = await connection.getLatestBlockhash();
      tokenTx.recentBlockhash = tokenTxBlockhash.blockhash;
      tokenTx.feePayer = wallet.publicKey;

      try {
        const [signedTx] = await wallet.signAllTransactions([tokenTx]);
        const signature = await wallet.sendTransaction(signedTx, connection);
        await connection.confirmTransaction({
          signature,
          blockhash: tokenTxBlockhash.blockhash,
          lastValidBlockHeight: tokenTxBlockhash.lastValidBlockHeight
        });

        return {
          success: true,
          referralAccountPubKey: existingReferralAccount.toBase58(),
          referralTokenAccountPubKey: referralTokenAccountPubKey.toBase58(),
          txId: signature
        };
      } catch (error) {
        console.error('Error creating token account:', error);
        throw new Error('Failed to create token account');
      }
    }

    // First try to find existing referral account for this wallet
    try {
      const referralAccountInfo = await getReferralAccount(wallet.publicKey.toBase58());

      if (referralAccountInfo?.referralTokenAccount) {
        // Add verification that account is still valid
        const accountInfo = await connection.getAccountInfo(new PublicKey(referralAccountInfo.referralTokenAccount));
        if (!accountInfo) {
          console.log('Token account not found, creating new one...');
          // Continue with creation
        } else {
          return {
            success: true,
            referralAccountPubKey: referralAccountInfo.referralAccount.toBase58(),
            referralTokenAccountPubKey: referralAccountInfo.referralTokenAccount.toBase58(),
            exists: true
          };
        }
      }
    } catch (error) {
      // Add more specific error handling
      if (error instanceof Error && error.message.includes('Account not found')) {
        console.log('No existing account found, creating new one...');
      } else {
        console.error('Unexpected error checking existing accounts:', error);
        throw error;
      }
    }

    // If no existing account found, create new one
    const referralAccountKeypair = Keypair.generate();
    
    const referralTx = await provider.initializeReferralAccount({
      payerPubKey: wallet.publicKey,
      partnerPubKey: new PublicKey(referralWallet),
      projectPubKey: JUPITER_PROJECT,
      referralAccountPubKey: referralAccountKeypair.publicKey,
    });

    const { blockhash } = await connection.getLatestBlockhash();
    referralTx.recentBlockhash = blockhash;
    referralTx.feePayer = wallet.publicKey;
    
    referralTx.sign(referralAccountKeypair);

    try {
      const [signedTx] = await wallet.signAllTransactions([referralTx]);
      const signature = await wallet.sendTransaction(signedTx, connection);
      await connection.confirmTransaction({
        signature,
        blockhash: blockhash,
        lastValidBlockHeight: (await connection.getLatestBlockhash()).lastValidBlockHeight
      });
    } catch (error: any) {
      console.error('Error creating referral account:', error);
      throw new Error('Failed to create referral account: ' + error?.message);
    }

    // Create the token account
    const { tx: tokenTx, referralTokenAccountPubKey } = await provider.initializeReferralTokenAccount({
      payerPubKey: wallet.publicKey,
      referralAccountPubKey: referralAccountKeypair.publicKey,
      mint: new PublicKey(mint),
    });

    const tokenTxBlockhash = await connection.getLatestBlockhash();
    tokenTx.recentBlockhash = tokenTxBlockhash.blockhash;
    tokenTx.feePayer = wallet.publicKey;

    try {
      const [signedTx] = await wallet.signAllTransactions([tokenTx]);
      const signature = await wallet.sendTransaction(signedTx, connection);
      await connection.confirmTransaction({
        signature,
        blockhash: tokenTxBlockhash.blockhash,
        lastValidBlockHeight: tokenTxBlockhash.lastValidBlockHeight
      });

      return {
        success: true,
        referralAccountPubKey: referralAccountKeypair.publicKey.toBase58(),
        referralTokenAccountPubKey: referralTokenAccountPubKey.toBase58(),
        txId: signature
      };
    } catch (error) {
      console.error('Error creating token account:', error);
      throw new Error('Failed to create token account');
    }

  } catch (error) {
    console.error('Error creating referral accounts:', error);
    if (error instanceof SendTransactionError) {
      return {
        success: false,
        error: `Transaction failed: ${error.message}`
      };
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}; 