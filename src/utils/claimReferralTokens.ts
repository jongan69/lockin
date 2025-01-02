'use client'
import { ReferralProvider } from "@jup-ag/referral-sdk";
import { Connection, PublicKey } from "@solana/web3.js";
import { NETWORK } from "./endpoints";
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
    const connection = new Connection(NETWORK);
    const provider = new ReferralProvider(connection);

    // Get all withdrawable token accounts
    console.log('Fetching withdrawable tokens...');
    const referralTokens = await provider.getReferralTokenAccountsWithStrategy(
      referralAccountPubKey.toString(),
      { type: "token-list", tokenList: "all" }
    );

    const withdrawableTokenAddress = [
      ...(referralTokens.tokenAccounts || []),
      ...(referralTokens.token2022Accounts || []),
    ].map((a) => a.pubkey);

    if (withdrawableTokenAddress.length === 0) {
      console.log('No withdrawable tokens found');
      return { success: true, txids: [] };
    }

    console.log(`Found ${withdrawableTokenAddress.length} withdrawable tokens`);

    // Get claim transactions
    const txs = await provider.claimAll({

      payerPubKey: wallet.publicKey!,
      referralAccountPubKey
    });

    if (!wallet.sendTransaction) {
      throw new Error('Wallet does not support sending transactions');
    }

    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    const txids: string[] = [];

    // Send each claim transaction
    for (const tx of txs) {
      console.log('Sending transaction...');
      const signature = await wallet.sendTransaction(tx, connection);
      console.log('Transaction sent, signature:', signature);

      await connection.confirmTransaction({
        signature,
        blockhash,
        lastValidBlockHeight,
      });
      console.log('Transaction confirmed');

      txids.push(signature);
    }

    return {
      success: true,
      txids
    };
  } catch (error) {
    console.error('Failed to claim referral tokens:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}