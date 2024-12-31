import { ReferralProvider } from "@jup-ag/referral-sdk";
import {
  Connection,
  PublicKey,
  Transaction,
  SendTransactionError,
  Keypair,
} from "@solana/web3.js";
import { LOCKIN_MINT, JUPITER_PROJECT } from "./globals";

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
  rpcUrl: string,
  referralWallet: string,
  mint: string = LOCKIN_MINT
): Promise<CreateReferralResult> => {
  if (!wallet.publicKey || !wallet.signAllTransactions || !wallet.sendTransaction) {
    return {
      success: false,
      error: "Wallet not connected"
    };
  }

  try {
    const connection = new Connection(rpcUrl);
    const provider = new ReferralProvider(connection);

    // First create the referral account
    const referralAccountKeypair = Keypair.generate();
    
    const referralTx = await provider.initializeReferralAccount({
      payerPubKey: wallet.publicKey,
      partnerPubKey: new PublicKey(referralWallet),
      projectPubKey: JUPITER_PROJECT,
      referralAccountPubKey: referralAccountKeypair.publicKey,
    });

    // Check if referral account exists
    const referralAccount = await connection.getAccountInfo(referralAccountKeypair.publicKey);
    let referralAccountPubKey = referralAccountKeypair.publicKey;

    if (!referralAccount) {
      const { blockhash } = await connection.getLatestBlockhash();
      referralTx.recentBlockhash = blockhash;
      referralTx.feePayer = wallet.publicKey;
      
      // Add the referral account keypair as a signer after setting blockhash
      referralTx.sign(referralAccountKeypair);

      try {
        const [signedTx] = await wallet.signAllTransactions([referralTx]);
        const signature = await wallet.sendTransaction(signedTx, connection);
        // Wait for confirmation
        await connection.confirmTransaction({
          signature,
          blockhash: (await connection.getLatestBlockhash()).blockhash,
          lastValidBlockHeight: (await connection.getLatestBlockhash()).lastValidBlockHeight
        });
      } catch (error) {
        console.error('Error creating referral account:', error);
        throw new Error('Failed to create referral account');
      }
    }

    // Now create the referral token account
    const { tx: tokenTx, referralTokenAccountPubKey } = await provider.initializeReferralTokenAccount({
      payerPubKey: wallet.publicKey,
      referralAccountPubKey: referralAccountPubKey,
      mint: new PublicKey(mint),
    });

    // Check if token account exists
    const referralTokenAccount = await connection.getAccountInfo(referralTokenAccountPubKey);

    if (referralTokenAccount) {
      return {
        success: true,
        referralAccountPubKey: referralAccountPubKey.toBase58(),
        referralTokenAccountPubKey: referralTokenAccountPubKey.toBase58(),
        exists: true
      };
    }

    const { blockhash } = await connection.getLatestBlockhash();
    tokenTx.recentBlockhash = blockhash;
    tokenTx.feePayer = wallet.publicKey;

    try {
      const [signedTx] = await wallet.signAllTransactions([tokenTx]);
      const signature = await wallet.sendTransaction(signedTx, connection);
      // Wait for confirmation
      await connection.confirmTransaction({
        signature,
        blockhash: (await connection.getLatestBlockhash()).blockhash,
        lastValidBlockHeight: (await connection.getLatestBlockhash()).lastValidBlockHeight
      });

      return {
        success: true,
        referralAccountPubKey: referralAccountPubKey.toBase58(),
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