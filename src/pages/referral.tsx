'use client'
import { PageContainer } from "@components/layout/page-container";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";

import { saveWalletToDb, updateWalletReferralAccount } from "@utils/saveWallet";
import { LOCKIN_MINT, REFERAL_ADDRESS } from "@utils/globals";
import { Header } from "@components/layout/header";
import { createTokenReferralAccount } from "@utils/createReferralAccount";
import { useWallet } from "@solana/wallet-adapter-react";
import { FiCopy, FiExternalLink } from 'react-icons/fi';
import { useTokenBalance } from "@utils/hooks/useTokenBalance";
import { getReferralAccount } from "@utils/getReferralAccount";
import { PublicKey } from "@solana/web3.js";
import { claimReferralTokens } from "@utils/claimReferralTokens";
import { useConnection } from "@solana/wallet-adapter-react";

const getReferredBy = async (user: string | string[] | undefined, referrer: string | string[] | undefined) => {
  if (!user) return 'Unknown';
  
  // Convert potential array to string (Next.js query params can be arrays)
  const address = Array.isArray(user) ? user[0] : user;
  const referredBy = Array.isArray(referrer) ? referrer[0] : (referrer || REFERAL_ADDRESS);
  try {
    // Save wallet and get the actual referrer from DB
    const actualReferrer = await saveWalletToDb(address, referredBy);
    return actualReferrer;
  } catch (error) {
    console.error('Error getting referral:', error);
    return REFERAL_ADDRESS;
  }
};

const formatTokenBalance = (balance: number | null): string => {
  if (balance === null) return '0';
  return balance.toString(); // Assuming 9 decimals for SPL tokens
};

const ReferralPage = () => {
    const { user, referrer } = useRouter().query;
    const [referredBy, setReferredBy] = useState<string>('Loading...');
    const [isCreatingAccount, setIsCreatingAccount] = useState(false);
    const [createAccountError, setCreateAccountError] = useState<string | null>(null);
    const [newReferralAccount, setNewReferralAccount] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const wallet = useWallet();
    const [accountExists, setAccountExists] = useState(false);
    const [tokenAccount, setTokenAccount] = useState<any>(null);
    const [isCheckingAccount, setIsCheckingAccount] = useState(true);
    const [hasTokenAccount, setHasTokenAccount] = useState<boolean>(false);
    const { connection } = useConnection();
    const [isClaiming, setIsClaiming] = useState(false);
    const [claimError, setClaimError] = useState<string | null>(null);
    
    // Only fetch balance if we have a valid referral account
    const { balance, balanceLoading, error: balanceError } = useTokenBalance(
        accountExists && tokenAccount ? tokenAccount : null
    );

    // Add error boundary
    useEffect(() => {
        if (balanceError) {
            console.error('Error loading balance:', balanceError);
            // Maybe add some user feedback here
        }
    }, [balanceError]);

    // Add new effect to detect wallet's referral account
    useEffect(() => {
        const detectReferralAccount = async () => {
            if (!wallet.publicKey) {
                console.log('No wallet connected');
                return;
            }
            
            setIsCheckingAccount(true);
            
            try {
                const referralAccountInfo = await getReferralAccount(wallet.publicKey.toBase58());

                if (referralAccountInfo) {
                    setNewReferralAccount(referralAccountInfo.referralAccount.toBase58());
                    
                    // Check if token account exists and is properly initialized
                    if (referralAccountInfo.referralTokenAccount) {
                        setTokenAccount(referralAccountInfo.referralTokenAccount.toBase58());
                        setHasTokenAccount(true);
                        setAccountExists(true);
                    } else {
                        // Token account doesn't exist or isn't properly initialized
                        console.log('Token account needs initialization');
                        setHasTokenAccount(false);
                        setTokenAccount(null);
                        setAccountExists(true); // Referral account exists, but token account needs creation
                    }
                } else {
                    setAccountExists(false);
                    setNewReferralAccount(null);
                    setHasTokenAccount(false);
                }
            } catch (error) {
                console.error('Error in detectReferralAccount:', error);
                setAccountExists(false);
                setNewReferralAccount(null);
                setHasTokenAccount(false);
            } finally {
                setIsCheckingAccount(false);
            }
        };

        detectReferralAccount();
    }, [wallet.publicKey]);

    // Keep existing useEffect for referral info
    useEffect(() => {
        const initializeReferral = async () => {
            if (user) {
                const referralInfo = await getReferredBy(user, referrer);
                setReferredBy(referralInfo);
            }
        };

        initializeReferral();
    }, [user, referrer]);

    const handleCreateReferralAccount = async () => {
        if (!wallet.connected || !wallet.publicKey) {
            setCreateAccountError('Please connect your wallet first');
            return;
        }

        setIsCreatingAccount(true);
        setCreateAccountError(null);
        
        try {
            const walletAddress = wallet.publicKey.toBase58();
            
            const result = await createTokenReferralAccount(wallet, walletAddress, LOCKIN_MINT);
            
            if (result.success && result.referralTokenAccountPubKey) {
                // Update the wallet in the database with the new referral account
                await updateWalletReferralAccount(walletAddress, result.referralTokenAccountPubKey);
                
                setNewReferralAccount(result.referralTokenAccountPubKey);
                setAccountExists(result.exists || false);
            } else {
                setCreateAccountError(result.error || 'Failed to create referral account');
            }
        } catch (error) {
            setCreateAccountError(error instanceof Error ? error.message : 'Unknown error occurred');
        } finally {
            setIsCreatingAccount(false);
        }
    };

    const handleCopy = () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const referralLink = `https://lock.wtf?referredBy=${newReferralAccount}`;

    const handleCreateTokenAccount = async () => {
        if (!wallet.connected || !wallet.publicKey || !newReferralAccount) {
            setCreateAccountError('Please connect your wallet first');
            return;
        }

        setIsCreatingAccount(true);
        setCreateAccountError(null);
        
        try {
            const walletAddress = wallet.publicKey.toBase58();
            
            const result = await createTokenReferralAccount(
                wallet, 
                walletAddress, 
                LOCKIN_MINT,
                new PublicKey(newReferralAccount) // Pass existing referral account
            );
            
            if (result.success && result.referralTokenAccountPubKey) {
                setTokenAccount(new PublicKey(result.referralTokenAccountPubKey));
                setHasTokenAccount(true);
                // Update the wallet in the database with the new token account
                await updateWalletReferralAccount(walletAddress, result.referralTokenAccountPubKey);
            } else {
                setCreateAccountError(result.error || 'Failed to create token account');
            }
        } catch (error) {
            setCreateAccountError(error instanceof Error ? error.message : 'Unknown error occurred');
        } finally {
            setIsCreatingAccount(false);
        }
    };

    const handleClaimTokens = async () => {
        if (!wallet.connected || !wallet.publicKey || !newReferralAccount) {
            setClaimError('Please connect your wallet first');
            return;
        }

        setIsClaiming(true);
        setClaimError(null);

        try {
            const result = await claimReferralTokens(
                wallet,
                new PublicKey(newReferralAccount)
            );

            if (!result.success) {
                setClaimError(result.error || 'Failed to claim tokens');
            }
        } catch (error) {
            setClaimError(error instanceof Error ? error.message : 'Unknown error occurred');
        } finally {
            setIsClaiming(false);
        }
    };

    return (
        <PageContainer>
            <Header />
            <div className="max-w-3xl mx-auto px-4 py-4 sm:py-8">
                <div className="bg-white rounded-lg shadow-lg p-4 sm:p-6 mb-8">
                    <h1 className="text-2xl sm:text-3xl font-bold mb-4 sm:mb-6">Jupiter Referral Program</h1>
                    
                    <div className="bg-gray-50 rounded-lg p-3 sm:p-4 mb-6">
                        <p className="text-gray-600 mb-2">Your wallet address:</p>
                        <code className="bg-gray-100 px-2 py-1 rounded text-sm sm:text-base break-all">
                            {Array.isArray(user) ? user[0] : user}
                        </code>
                        
                    </div>

                    {!newReferralAccount && !isCheckingAccount && (
                        <div className="mb-6 sm:mb-8">
                            <h2 className="text-lg sm:text-xl font-semibold mb-3 sm:mb-4">Create Your Referral Account</h2>
                            <p className="text-sm sm:text-base text-gray-600 mb-4">
                                Create a referral account to start earning rewards when others trade through your link.
                            </p>
                            <button
                                onClick={handleCreateReferralAccount}
                                disabled={isCreatingAccount || !wallet.connected}
                                className="w-full sm:w-auto px-4 sm:px-6 py-3 bg-blue-500 text-white rounded-lg 
                                         hover:bg-blue-600 disabled:bg-gray-400 disabled:cursor-not-allowed 
                                         transition-colors text-sm sm:text-base"
                            >
                                {!wallet.connected 
                                    ? 'Connect Wallet First'
                                    : isCreatingAccount 
                                        ? 'Creating...' 
                                        : 'Create Referral Account'
                                }
                            </button>
                        </div>
                    )}

                    {isCheckingAccount && (
                        <div className="text-center py-4">
                            <p className="text-gray-600">Checking for existing referral account...</p>
                        </div>
                    )}

                    {createAccountError && (
                        <div className="bg-red-50 border border-red-200 text-red-600 px-3 py-2 sm:px-4 
                                      sm:py-3 rounded-lg mb-6 text-sm sm:text-base">
                            {createAccountError}
                        </div>
                    )}

                    {newReferralAccount && (
                        <div className="bg-green-50 border border-green-200 rounded-lg p-4 sm:p-6">
                            <h2 className="text-lg sm:text-xl font-semibold mb-4">
                                {accountExists ? '✨ Existing Referral Account Found!' : '🎉 Your Referral Account is Ready!'}
                            </h2>
                            
                            {accountExists && (
                                <>
                                    <p className="text-sm sm:text-base text-gray-600 mb-4">
                                        We found an existing referral account for your wallet. You can use it to start earning rewards!
                                    </p>
                                    <div className="bg-white rounded-lg border border-green-100 p-4 mb-6">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <h3 className="text-sm font-medium text-gray-500">Total Earned</h3>
                                                <div className="mt-1 flex items-baseline">
                                                    {!hasTokenAccount ? (
                                                        <div>
                                                            <p className="text-sm text-gray-500 mb-2">Token account not created yet</p>
                                                            <button
                                                                onClick={handleCreateTokenAccount}
                                                                disabled={isCreatingAccount}
                                                                className="px-4 py-2 bg-blue-500 text-white rounded-lg 
                                                                         hover:bg-blue-600 disabled:bg-gray-400 
                                                                         disabled:cursor-not-allowed transition-colors text-sm"
                                                            >
                                                                {isCreatingAccount ? 'Creating...' : 'Create Token Account'}
                                                            </button>
                                                        </div>
                                                    ) : balanceLoading ? (
                                                        <span className="text-sm text-gray-500">Loading...</span>
                                                    ) : balanceError ? (
                                                        <span className="text-sm text-red-500">Error loading balance</span>
                                                    ) : (
                                                        <div>
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-2xl font-semibold text-gray-900">
                                                                    {formatTokenBalance(balance)}
                                                                </span>
                                                                <span className="text-sm text-gray-500">LOCKIN</span>
                                                            </div>
                                                            {balance !== null && balance > 0 && (
                                                                <div className="mt-2">
                                                                    <button
                                                                        onClick={handleClaimTokens}
                                                                        disabled={isClaiming}
                                                                        className="px-4 py-2 bg-green-500 text-white rounded-lg 
                                                                                 hover:bg-green-600 disabled:bg-gray-400 
                                                                                 disabled:cursor-not-allowed transition-colors text-sm"
                                                                    >
                                                                        {isClaiming ? 'Claiming...' : 'Claim Tokens'}
                                                                    </button>
                                                                    {claimError && (
                                                                        <p className="text-red-500 text-sm mt-1">{claimError}</p>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="rounded-full bg-green-50 p-2">
                                                <svg className="h-6 w-6 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                </svg>
                                            </div>
                                        </div>
                                    </div>
                                </>
                            )}
                            
                            <div className="mb-6">
                                <p className="text-sm sm:text-base text-gray-600 mb-2">Your referral account:</p>
                                <div className="flex items-center gap-2 bg-white p-2 sm:p-3 rounded-lg border">
                                    <code className="flex-1 break-all text-sm sm:text-base">
                                        {newReferralAccount}
                                    </code>
                                    <button 
                                        onClick={() => { 
                                            navigator.clipboard.writeText(newReferralAccount);
                                            handleCopy();
                                        }}
                                        className="p-2 hover:bg-gray-100 rounded shrink-0"
                                    >
                                        <FiCopy className="text-gray-600" />
                                    </button>
                                </div>
                                {copied && (
                                    <p className="text-green-600 text-xs sm:text-sm mt-1">Copied to clipboard!</p>
                                )}
                            </div>

                            <div className="mb-6">
                                <p className="text-sm sm:text-base text-gray-600 mb-2">Share this link with friends:</p>
                                <div className="flex items-center gap-2 bg-white p-2 sm:p-3 rounded-lg border">
                                    <code className="flex-1 break-all text-sm sm:text-base">
                                        {referralLink}
                                    </code>
                                    <button 
                                        onClick={() => { 
                                            navigator.clipboard.writeText(referralLink);
                                            handleCopy();
                                        }}
                                        className="p-2 hover:bg-gray-100 rounded shrink-0"
                                    >
                                        <FiCopy className="text-gray-600" />
                                    </button>
                                </div>
                            </div>

                            <a 
                                href="https://referral.jup.ag/dashboard" 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-2 px-4 sm:px-6 py-3 bg-blue-500 
                                         text-white rounded-lg hover:bg-blue-600 transition-colors 
                                         text-sm sm:text-base w-full sm:w-auto justify-center"
                            >
                                View Referral Dashboard
                                <FiExternalLink />
                            </a>
                        </div>
                    )}
                </div>
            </div>
        </PageContainer>
    );
};

export default ReferralPage;