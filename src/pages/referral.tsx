import { PageContainer } from "@components/layout/page-container";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { saveWalletToDb } from "@utils/saveWallet";
import { LOCKIN_MINT, REFERAL_WALLET } from "@utils/globals";
import { Header } from "@components/layout/header";
import { createTokenReferralAccount } from "@utils/createReferralAccount";
import { useWallet } from "@solana/wallet-adapter-react";
import { FiCopy, FiExternalLink } from 'react-icons/fi';

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



const ReferralPage = () => {
    const { user, referrer } = useRouter().query;
    const [referredBy, setReferredBy] = useState<string>('Loading...');
    const [isCreatingAccount, setIsCreatingAccount] = useState(false);
    const [createAccountError, setCreateAccountError] = useState<string | null>(null);
    const [newReferralAccount, setNewReferralAccount] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const wallet = useWallet();

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
        if (!wallet.connected) {
            setCreateAccountError('Please connect your wallet first');
            return;
        }

        setIsCreatingAccount(true);
        setCreateAccountError(null);
        
        try {
            const rpcUrl = process.env.NEXT_PUBLIC_HELIUS_RPC_URL || "";
            
            const result = await createTokenReferralAccount(wallet, rpcUrl, REFERAL_WALLET, LOCKIN_MINT);
            
            if (result.success && result.referralTokenAccountPubKey) {
                setNewReferralAccount(result.referralTokenAccountPubKey);
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
            <div className="max-w-3xl mx-auto px-4 py-8">
                <div className="bg-white rounded-lg shadow-lg p-6 mb-8">
                    <h1 className="text-3xl font-bold mb-6">Jupiter Referral Program</h1>
                    
                    <div className="bg-gray-50 rounded-lg p-4 mb-6">
                        <p className="text-gray-600 mb-2">Your wallet address:</p>
                        <code className="bg-gray-100 px-3 py-1 rounded">
                            {Array.isArray(user) ? user[0] : user}
                        </code>
                        
                        <p className="text-gray-600 mt-4 mb-2">Referred by:</p>
                        <code className="bg-gray-100 px-3 py-1 rounded">
                            {referredBy}
                        </code>
                    </div>

                    {!newReferralAccount && (
                        <div className="mb-8">
                            <h2 className="text-xl font-semibold mb-4">Create Your Referral Account</h2>
                            <p className="text-gray-600 mb-4">
                                Create a referral account to start earning rewards when others trade through your link.
                            </p>
                            <button
                                onClick={handleCreateReferralAccount}
                                disabled={isCreatingAccount || !wallet.connected}
                                className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 
                                         disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
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
                        <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg mb-6">
                            {createAccountError}
                        </div>
                    )}

                    {newReferralAccount && (
                        <div className="bg-green-50 border border-green-200 rounded-lg p-6">
                            <h2 className="text-xl font-semibold mb-4">🎉 Your Referral Account is Ready!</h2>
                            
                            <div className="mb-6">
                                <p className="text-gray-600 mb-2">Your referral account:</p>
                                <div className="flex items-center gap-2 bg-white p-3 rounded-lg border">
                                    <code className="flex-1 break-all">
                                        {newReferralAccount}
                                    </code>
                                    <button 
                                        onClick={() => { 
                                            navigator.clipboard.writeText(newReferralAccount);
                                            handleCopy();
                                        }}
                                        className="p-2 hover:bg-gray-100 rounded"
                                    >
                                        <FiCopy className="text-gray-600" />
                                    </button>
                                </div>
                                {copied && (
                                    <p className="text-green-600 text-sm mt-1">Copied to clipboard!</p>
                                )}
                            </div>

                            <div className="mb-6">
                                <p className="text-gray-600 mb-2">Share this link with friends:</p>
                                <div className="flex items-center gap-2 bg-white p-3 rounded-lg border">
                                    <code className="flex-1 break-all">
                                        {referralLink}
                                    </code>
                                    <button 
                                        onClick={() => { 
                                            navigator.clipboard.writeText(referralLink);
                                            handleCopy();
                                        }}
                                        className="p-2 hover:bg-gray-100 rounded"
                                    >
                                        <FiCopy className="text-gray-600" />
                                    </button>
                                </div>
                            </div>

                            <a 
                                href="https://referral.jup.ag/dashboard" 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-2 px-6 py-3 bg-blue-500 text-white 
                                         rounded-lg hover:bg-blue-600 transition-colors"
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