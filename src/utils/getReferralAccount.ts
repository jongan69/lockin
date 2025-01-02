'use client'
import { LOCKIN_MINT } from "./globals";
import { ReferralProvider } from "@jup-ag/referral-sdk";
import { clusterApiUrl, Connection, PublicKey } from "@solana/web3.js";
import { NETWORK } from "./endpoints";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";

export const getReferralAccount = async (walletAddress: string) => {
    const connection = new Connection(
        NETWORK.startsWith('http') ? NETWORK : clusterApiUrl("mainnet-beta"),
        'confirmed'
      );
    const provider = new ReferralProvider(connection);

    if (!walletAddress) {
        return null;
    }

    try {
        const existingReferralAccounts = await provider.getReferralAccounts([
            {
                memcmp: {
                    offset: 8,
                    bytes: walletAddress
                }
            }
        ]);

        if (!existingReferralAccounts[0]?.publicKey) {
            return null;
        }

        const referralTokenAccountPubKey = provider.getReferralTokenAccountPubKey(
            {
                referralAccountPubKey: existingReferralAccounts[0]?.publicKey,
                mint: new PublicKey(LOCKIN_MINT)
            }
        );

        // Add verification that token account exists and is initialized
        if (referralTokenAccountPubKey) {
            try {
                const tokenAccountInfo = await connection.getAccountInfo(referralTokenAccountPubKey);
                
                // Check if account exists and is owned by Token Program
                const isValidTokenAccount = tokenAccountInfo && 
                    tokenAccountInfo.owner.equals(TOKEN_PROGRAM_ID) &&
                    tokenAccountInfo.data.length === 165; // SPL Token Account data length

                return {
                    referralAccount: existingReferralAccounts[0]?.publicKey,
                    referralTokenAccount: isValidTokenAccount ? referralTokenAccountPubKey : null
                };
            } catch (error) {
                console.error('Error verifying token account:', error);
                return {
                    referralAccount: existingReferralAccounts[0]?.publicKey,
                    referralTokenAccount: null
                };
            }
        }

        return {
            referralAccount: existingReferralAccounts[0]?.publicKey,
            referralTokenAccount: null
        };
    } catch (error) {
        console.error('Error getting referral account:', error);
        return null;
    }
}   