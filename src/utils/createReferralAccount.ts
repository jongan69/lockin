import { ReferralProvider } from "@jup-ag/referral-sdk";
import {
  Connection,
  PublicKey,
  Transaction,
  SendTransactionError,
} from "@solana/web3.js";

interface CreateTokenReferralResult {
  success: boolean;
  referralTokenAccountPubKey?: string;
  txId?: string;
  error?: string;
}

interface WalletAdapter {
  signAllTransactions: ((transactions: Transaction[]) => Promise<Transaction[]>) | undefined;
  sendTransaction: ((transaction: Transaction, connection: Connection) => Promise<string>) | undefined;
  publicKey: PublicKey | null;
}

export const createTokenReferralAccount = async (
  wallet: WalletAdapter,
  rpcUrl: string,
  referralAccountPubKey: string,
  mint: string = "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB" // USDC mint
): Promise<CreateTokenReferralResult> => {
  if (!wallet.publicKey || !wallet.signAllTransactions || !wallet.sendTransaction) {
    return {
      success: false,
      error: "Wallet not connected"
    };
  }

  try {
    const connection = new Connection(rpcUrl);
    const provider = new ReferralProvider(connection);

    const { tx, referralTokenAccountPubKey } = await provider.initializeReferralTokenAccount({
      payerPubKey: wallet.publicKey,
      referralAccountPubKey: new PublicKey(referralAccountPubKey),
      mint: new PublicKey(mint),
    });

    // Check if account already exists
    const referralTokenAccount = await connection.getAccountInfo(referralTokenAccountPubKey);

    if (referralTokenAccount) {
      return {
        success: true,
        referralTokenAccountPubKey: referralTokenAccountPubKey.toBase58(),
        error: "Token referral account already exists"
      };
    }

    const { blockhash } = await connection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;
    tx.feePayer = wallet.publicKey;

    const [signedTx] = await wallet.signAllTransactions([tx]);
    const txId = await wallet.sendTransaction(signedTx, connection);

    return {
      success: true,
      referralTokenAccountPubKey: referralTokenAccountPubKey.toBase58(),
      txId
    };

  } catch (error) {
    console.error('Error creating token referral account:', error);
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