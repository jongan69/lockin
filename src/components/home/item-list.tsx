import { Item, ItemData } from "@components/home/item";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, TransactionSignature, VersionedTransaction } from "@solana/web3.js";
import React, { useState } from "react";
import { toast } from "react-hot-toast";
import { createJupiterApiClient, QuoteGetRequest } from '@jup-ag/api';


type Props = {
  items: Array<ItemData>;
};

export function ItemList({ items }: Props) {
  const { publicKey, sendTransaction, signTransaction } = useWallet();
  const { connection } = useConnection();
  const [selectedItem, setSelectedItem] = useState<ItemData | null>(null);
  const [showPopup, setShowPopup] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState('');
  const jupiterQuoteApi = createJupiterApiClient();

  const targetTokenMintAddress = "8Ki8DpuWNxu9VsS3kQbarsCWMcFGWkzzA8pUPto9zBd5";

  if (!items) {
    return null;
  }

  const handleItemClick = (item: ItemData) => {
    setSelectedItem(item);
    setShowPopup(true);
    setErrorMessage(null);
  };

  const handleClosePopup = async (answer: boolean) => {
    let signature: TransactionSignature | undefined = undefined;

    if (answer && selectedItem && publicKey && signTransaction) {
      if (selectedItem.mintAddress === targetTokenMintAddress) {
        setErrorMessage("Error: You are already lock maxing this token.");
        return;
      }

      try {
        setSending(true);
        setMessage('Preparing transaction...');
        const balanceInSmallestUnit = selectedItem.amount * Math.pow(10, selectedItem.decimals);

        const params: QuoteGetRequest = {
          inputMint: selectedItem.mintAddress,
          outputMint: targetTokenMintAddress,
          amount: balanceInSmallestUnit, // 0.1 SOL
          autoSlippage: true,
          autoSlippageCollisionUsdValue: 1_000,
          maxAutoSlippageBps: 1000, // 10%
          minimizeSlippage: true,
          onlyDirectRoutes: false,
          asLegacyTransaction: false,
        };
        const quote = await jupiterQuoteApi.quoteGet(params);

        // const quoteResponse = await fetch(
        //   `https://quote-api.jup.ag/v6/quote?inputMint=${selectedItem.mintAddress}&outputMint=${targetTokenMintAddress}&amount=${selectedItem.amount}&slippageBps=50`
        // ).then((res) => res.json());

        if (!quote) {
          throw new Error("Failed to fetch quote");
        }

        console.log("Initiating swap request for: ", publicKey?.toString());

        const swapObj = await jupiterQuoteApi.swapPost({
          swapRequest: {
            quoteResponse: quote,
            userPublicKey: publicKey.toBase58(),
            dynamicComputeUnitLimit: true,
            prioritizationFeeLamports: "auto",
          },
        });

        if (!swapObj) {
          throw new Error("Swap API request failed");
        }

        console.log('Received swap data:', swapObj);

        const swapTransactionBuf = Buffer.from(swapObj.swapTransaction, 'base64');
        const tx = VersionedTransaction.deserialize(swapTransactionBuf);

        if (!signTransaction) {
          throw new Error('Wallet does not support transaction signing!');
        }

        const signedTransaction = await signTransaction(tx);

        setMessage('Simulating transaction...');

        // Simulate transaction
        const simulationResult = await connection.simulateTransaction(signedTransaction);
        if (simulationResult.value.err) {
          console.error("Simulation error:", simulationResult.value.err);
          throw new Error("Transaction simulation failed");
        }

        setMessage('Sending transaction...');

        const {
          context: { slot: minContextSlot } } = await connection.getLatestBlockhashAndContext();

        // signedTransaction.recentBlockhash = blockhash;
        // signedTransaction.lastValidBlockHeight = lastValidBlockHeight;

        signature = await sendTransaction(signedTransaction, connection, { minContextSlot });

        setMessage('Transaction confirmed successfully!');
        toast.success('Transaction confirmed successfully!');
        console.log("Swap successful:", signature);
        setShowPopup(false);
        setSelectedItem(null);
      } catch (error) {
        console.error("Error during swap:", error);
        setErrorMessage("Swap failed. Please try again.");
        toast.error("Swap failed. Please try again.");
      } finally {
        setSending(false);
      }
    } else {
      setShowPopup(false);
      setSelectedItem(null);
    }
  };

  return (
    <div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {items.length === 0 ? (
          <p className="p-4">No Coins found in your wallet</p>
        ) : (
          items.map((item, index) => (
            <div
              key={index}
              onClick={() => handleItemClick(item)}
              className="transform transition-transform duration-300 hover:scale-105 cursor-pointer"
            >
              <Item data={item} />
            </div>
          ))
        )}
      </div>

      {showPopup && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white p-8 rounded shadow-lg max-w-sm w-full">
            <p className="text-lg font-semibold">Do you want to lock MAX your `{selectedItem?.symbol}`?</p>
            <p className="text-sm text-gray-600 mt-2">**NOTE THIS WILL SELL ALL YOUR `{selectedItem?.symbol}`**</p>
            {errorMessage && <p className="text-red-500 mt-2">{errorMessage}</p>}
            {message && <p className="text-blue-500 mt-2">{message}</p>}
            <div className="flex justify-around mt-4">
              <button
                onClick={() => handleClosePopup(true)}
                // variant="contained"
                color="secondary"
                disabled={sending}
              >
                {sending ? 'Processing...' : 'Yes'}
              </button>
              <button
                onClick={() => handleClosePopup(false)}
                // variant="contained"
                color="secondary"
                disabled={sending}
              >
                No
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
