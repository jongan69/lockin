import React from "react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";

export const Header: React.FC = () => {
  return (
    <header className="flex items-center justify-between py-6 mb-12">
      <div className="flex items-center space-x-4">
        <h1 className="text-4xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
          Lock TF In
        </h1>
      </div>
      <div className="flex items-center space-x-4">
        <WalletMultiButton className="btn btn-primary" />
      </div>
    </header>
  );
};