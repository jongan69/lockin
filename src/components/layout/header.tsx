import React from "react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useWallet } from "@solana/wallet-adapter-react";
import { useRouter } from "next/router";

export const Header: React.FC = () => {
  const { publicKey } = useWallet();
  const router = useRouter();

  const handleReferralClick = () => {
    if (publicKey) {
      router.push(`/referral?user=${publicKey.toString()}`);
    }
  };

  return (
    <header className="flex items-center justify-between py-6 mb-12">
      <div className="flex items-center space-x-4">
        <h1 className="text-4xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
          Lock TF In
        </h1>
      </div>
      <div className="flex items-center space-x-4">
        <button 
          onClick={handleReferralClick}
          disabled={!publicKey}
          className="btn btn-secondary"
        >
          Referral
        </button>
        <WalletMultiButton className="btn btn-primary" />
      </div>
    </header>
  );
};