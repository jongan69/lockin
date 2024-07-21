import { Item, ItemData } from "@components/home/item";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, VersionedTransaction } from "@solana/web3.js";
import React, { useState, useEffect } from "react";
import { toast } from "react-hot-toast";
import { createJupiterApiClient, QuoteGetRequest } from '@jup-ag/api';
import { useCloseTokenAccount } from "../../utils/hooks/useCloseTokenAccount"; // Adjust the path as needed
import { DEFAULT_TOKEN, REFER_PROGRAM_ID, REFERAL_WALLET } from "@utils/globals";

type Props = {
  initialItems: Array<ItemData>;
};

export function ItemList({ initialItems }: Props) {
  const { publicKey, sendTransaction, signTransaction } = useWallet();
  const { connection } = useConnection();
  const { closeTokenAccount } = useCloseTokenAccount();
  const [items] = useState<ItemData[]>(initialItems);
  const [closedAccounts, setClosedAccounts] = useState<Set<string>>(new Set());
  const [sortedItems, setSortedItems] = useState<ItemData[]>(initialItems);
  const [selectedItem, setSelectedItem] = useState<ItemData | null>(null);
  const [showPopup, setShowPopup] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState('');
  const jupiterQuoteApi = createJupiterApiClient();

  const raydiumUrl = "https://raydium.io/swap/?inputMint=sol&outputMint=8Ki8DpuWNxu9VsS3kQbarsCWMcFGWkzzA8pUPto9zBd5&referrer=9yA9LPCRv8p8V8ZvJVYErrVGWbwqAirotDTQ8evRxE5N"
  const targetTokenMintAddress = DEFAULT_TOKEN;
  const targetTokenMintPubkey = new PublicKey(targetTokenMintAddress);
  const referralAccountPubkey = new PublicKey(REFERAL_WALLET);
  const referralProgramId = REFER_PROGRAM_ID;

  const handleItemClick = (item: ItemData) => {
    setSelectedItem(item);
    setShowPopup(true);
    setErrorMessage(null);
  };

  const handleClosePopup = async (answer: boolean) => {
    if (answer && selectedItem && publicKey && signTransaction) {
      if (selectedItem.mintAddress === targetTokenMintAddress) {
        setErrorMessage("Error: You are already lock maxing this token.");
        window.open(raydiumUrl, '_blank');
        handleClosePopup(false)
        return;
      }

      try {
        setSending(true);
        setMessage('Preparing transaction...');
        const balanceInSmallestUnit = selectedItem.amount * Math.pow(10, selectedItem.decimals);

        if (balanceInSmallestUnit === 0) {
          // Close the token account if no tokens
          console.log(`No tokens to swap for lockin, skipping and Closing token account for ${selectedItem.symbol}: ${selectedItem.mintAddress}`);
          await closeTokenAccount(new PublicKey(selectedItem.tokenAddress));
          setClosedAccounts(prev => new Set(prev).add(selectedItem.tokenAddress));
          setShowPopup(false);
          setSelectedItem(null);
          toast.success("Token account closed successfully!");
          setSending(false);
          return;
        }

        if (selectedItem.usdValue === 0 && balanceInSmallestUnit !== 0) {
          alert("Congrats, this is Dogshit, swap could not be done. Get it to raydium or burn it.");
          setShowPopup(false);
          return
        }

        console.log(`Swapping ${balanceInSmallestUnit} ${selectedItem.symbol} for ${targetTokenMintAddress}`);
        const params: QuoteGetRequest = {
          inputMint: selectedItem.mintAddress,
          outputMint: targetTokenMintAddress,
          amount: balanceInSmallestUnit,
          autoSlippage: true,
          autoSlippageCollisionUsdValue: 1_000,
          platformFeeBps: 150,
          maxAutoSlippageBps: 1000,
          minimizeSlippage: true,
          onlyDirectRoutes: false,
          asLegacyTransaction: false,
        };
        const quote = await jupiterQuoteApi.quoteGet(params);

        if (!quote) {
          throw new Error("Failed to fetch quote");
        }

        const [feeAccount] = PublicKey.findProgramAddressSync(
          [
            Buffer.from("referral_ata"),
            referralAccountPubkey.toBuffer(),
            targetTokenMintPubkey.toBuffer(),
          ],
          referralProgramId
        );

        const swapObj = await jupiterQuoteApi.swapPost({
          swapRequest: {
            quoteResponse: quote,
            userPublicKey: publicKey.toBase58(),
            dynamicComputeUnitLimit: true,
            prioritizationFeeLamports: "auto",
            feeAccount: feeAccount.toBase58(),
          },
        });

        if (!swapObj) {
          throw new Error("Swap API request failed");
        }

        const swapTransactionBuf = Buffer.from(swapObj.swapTransaction, 'base64');
        const tx = VersionedTransaction.deserialize(swapTransactionBuf);

        const signedTransaction = await signTransaction(tx);

        setMessage('Simulating transaction...');

        const simulationResult = await connection.simulateTransaction(signedTransaction);
        if (simulationResult.value.err) {
          throw new Error("Transaction simulation failed");
        }

        setMessage('Sending transaction...');
        const { context: { slot: minContextSlot } } = await connection.getLatestBlockhashAndContext();
        const signature = await sendTransaction(signedTransaction, connection, { minContextSlot });

        setMessage('Transaction confirmed successfully!');
        toast.success('Transaction confirmed successfully!');
        console.log("Swap successful:", signature);

        // Close the token account after the swap
        await closeTokenAccount(new PublicKey(selectedItem.tokenAddress));
        setClosedAccounts(prev => new Set(prev).add(selectedItem.tokenAddress));

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

  useEffect(() => {
    const sortedItems = [...items]
      .filter(item => !closedAccounts.has(item.tokenAddress))
      .sort((a, b) => b.usdValue - a.usdValue);


    setSortedItems(sortedItems);
  }, [closedAccounts]);

  return (
    <div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {items.length === 0 || !sortedItems ? (
          <p className="p-4">No Coins found in your wallet</p>
        ) : (
          sortedItems.map((item, index) => (
            <div
              key={index}
              onClick={() => handleItemClick(item)}
              className="transform transition-transform duration-300 hover:scale-105 custom-lock-cursor"
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
                disabled={sending}
              >
                {sending ? 'Processing...' : 'Yes'}
              </button>
              <button
                onClick={() => handleClosePopup(false)}
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
