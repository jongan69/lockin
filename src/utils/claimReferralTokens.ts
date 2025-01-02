'use client'
import { ReferralProvider } from "@jup-ag/referral-sdk";
import { clusterApiUrl, Connection, PublicKey } from "@solana/web3.js";
import { NETWORK, SOLANA_MAIN } from "./endpoints";
import { WalletContextState } from "@solana/wallet-adapter-react";
import { LOCKIN_MINT } from "./globals";

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
        const connection = new Connection(
            NETWORK.startsWith('http') ? NETWORK : clusterApiUrl("mainnet-beta"),
            'confirmed'
          );
        const provider = new ReferralProvider(connection);

        // Get claim transactions
        const tx = await provider.claim({
            payerPubKey: wallet.publicKey!,
            referralAccountPubKey,
            mint: new PublicKey(LOCKIN_MINT)
        });

        if (!wallet.sendTransaction) {
            throw new Error('Wallet does not support sending transactions');
        }

        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
        const txids: string[] = [];

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