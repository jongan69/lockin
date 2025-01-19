import React from "react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useWallet } from "@solana/wallet-adapter-react";
import { useRouter } from "next/router";
import Link from "next/link";

export const Header: React.FC = () => {
  const { publicKey } = useWallet();
  const router = useRouter();

  const handleReferralClick = () => {
    if (publicKey) {
      router.push(`/referral?user=${publicKey.toString()}`);
    }
  };

  return (
    <header className="flex flex-col sm:flex-row items-center justify-between py-4 md:py-6 mb-8 md:mb-12 px-2 md:px-0 gap-4 sm:gap-0">
      <div className="flex items-center space-x-4">
        <Link href="/">
          <h1 className="text-2xl md:text-4xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent cursor-pointer">
            Lock TF In
          </h1>
        </Link>
      </div>
      <div className="flex flex-col sm:flex-row items-center gap-2 sm:space-x-4 w-full sm:w-auto max-w-[152px] sm:max-w-none">
        <button 
          onClick={handleReferralClick}
          disabled={!publicKey}
          className="btn btn-secondary h-[40px] text-xs md:text-base w-full sm:w-[152px]"
        >
          Referral
        </button>
        <WalletMultiButton className="btn btn-primary !h-[40px] !px-4 !py-0 !text-xs md:!text-base w-full sm:!w-[152px]" />
      </div>
    </header>
  );
};