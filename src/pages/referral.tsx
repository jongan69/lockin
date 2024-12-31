import { PageContainer } from "@components/layout/page-container";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { saveWalletToDb } from "@utils/saveWallet";
import { LOCKIN_MINT, REFERAL_WALLET } from "@utils/globals";
import { Header } from "@components/layout/header";
import { createTokenReferralAccount } from "@utils/createReferralAccount";
import { useWallet } from "@solana/wallet-adapter-react";
import { FiCopy, FiExternalLink } from 'react-icons/fi';
import { useTokenBalance } from "@utils/hooks/useTokenBalance";

const getReferredBy = async (user: string | string[] | undefined, referrer: string | string[] | undefined) => {
  if (!user) return 'Unknown';
  
  // Convert potential array to string (Next.js query params can be arrays)
  const address = Array.isArray(user) ? user[0] : user;
  const referredBy = Array.isArray(referrer) ? referrer[0] : (referrer || REFERAL_WALLET);
  try {
    // Save wallet and get the actual referrer from DB
    const actualReferrer = await saveWalletToDb(address, referredBy);
    return actualReferrer;
  } catch (error) {
    console.error('Error getting referral:', error);
    return REFERAL_WALLET;
  }
};

const formatTokenBalance = (balance: number | null): string => {
  if (balance === null) return '0';
  return (balance / Math.pow(10, 9)).toFixed(4); // Assuming 9 decimals for SPL tokens
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
    const [tokenBalance, setTokenBalance] = useState<number | null>(null);
    
    const { balance } = useTokenBalance(accountExists && newReferralAccount ? newReferralAccount : '');

    useEffect(() => {
        if (balance !== null && accountExists) {
            setTokenBalance(balance);
        }
    }, [balance, accountExists]);

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
            const rpcUrl = process.env.NEXT_PUBLIC_HELIUS_RPC_URL || "";
            
            const result = await createTokenReferralAccount(wallet, rpcUrl, wallet.publicKey.toBase58(), LOCKIN_MINT);
            
            if (result.success && result.referralTokenAccountPubKey) {
                setNewReferralAccount(result.referralTokenAccountPubKey);
                if (result.exists) {
                    setAccountExists(true);
                }
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
                        
                        <p className="text-gray-600 mt-4 mb-2">Referred by:</p>
                        <code className="bg-gray-100 px-2 py-1 rounded text-sm sm:text-base break-all">
                            {referredBy}
                        </code>
                    </div>

                    {!newReferralAccount && (
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
                                                    <span className="text-2xl font-semibold text-gray-900">
                                                        {formatTokenBalance(tokenBalance)}
                                                    </span>
                                                    <span className="ml-2 text-sm text-gray-500">LOCKIN</span>
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