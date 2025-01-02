import { ReferralProvider } from "@jup-ag/referral-sdk";
import { Connection, PublicKey, Transaction } from "@solana/web3.js";
import { NETWORK } from "./endpoints";
import { LOCKIN_MINT } from "./globals";
import { WalletContextState } from "@solana/wallet-adapter-react";

export interface ClaimReferralResult {
  success: boolean;
  error?: string;
  txids?: string[];
}

type WalletAdapter = Pick<WalletContextState, 'sendTransaction' | 'publicKey'>;

export async function claimReferralTokens(
  wallet: WalletAdapter,
  referralAccountPubKey: PublicKey
): Promise<ClaimReferralResult> {
  try {
    console.log('Starting claim process...');
    const connection = new Connection(NETWORK, 'confirmed');
    const provider = new ReferralProvider(connection);

    // Get claim transaction
    console.log('Fetching claim transaction...');
    const tx = await provider.claim({
      payerPubKey: wallet.publicKey!,
      referralAccountPubKey,
      mint: new PublicKey(LOCKIN_MINT)
    });

    if (!wallet.sendTransaction) {
      throw new Error('Wallet does not support sending transactions');
    }

    console.log('Sending transaction...');
    const signature = await wallet.sendTransaction(tx, connection);
    console.log('Transaction sent, signature:', signature);

    const latestBlockhash = await connection.getLatestBlockhash();
    await connection.confirmTransaction({
      signature,
      ...latestBlockhash
    });
    console.log('Transaction confirmed');

    return {
      success: true,
      txids: [signature]
    };
  } catch (error) {
    console.error('Failed to claim referral tokens:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}