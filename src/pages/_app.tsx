import React, { useMemo } from "react";
import type { AppProps } from "next/app";
import dynamic from "next/dynamic";
import { ConnectionProvider } from "@solana/wallet-adapter-react";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-wallets";
import ClientWalletProvider from "@components/contexts/ClientWalletProvider";
import { RPC_URL } from "@utils/endpoints";
import { Toaster } from "react-hot-toast";

import "../styles/globals.css";
import "../styles/App.css";
import Script from "next/script";

const endpoint = RPC_URL!;

// console.log("endpoint", endpoint);
const ReactUIWalletModalProviderDynamic = dynamic(
  async () =>
    (await import("@solana/wallet-adapter-react-ui")).WalletModalProvider,
  { ssr: false }
);

if (typeof window !== 'undefined') {
  window.Buffer = window.Buffer || require('buffer').Buffer;
  window.process = window.process || require('process');
}

function MyApp({ Component, pageProps }: AppProps) {
  const wallets = useMemo(() => [new PhantomWalletAdapter()], []);

  return (
    <>
      <Script
        async
        src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-6202902142885850"
        crossOrigin="anonymous"
      />
      <ConnectionProvider endpoint={endpoint}>
        <ClientWalletProvider wallets={wallets}>
          <ReactUIWalletModalProviderDynamic>
            <Toaster position="bottom-right" reverseOrder={true} />
            <Component {...pageProps} />
          </ReactUIWalletModalProviderDynamic>
        </ClientWalletProvider>
      </ConnectionProvider>
    </>
  );
}

export default MyApp;
