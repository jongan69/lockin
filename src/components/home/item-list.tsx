import { Item, ItemData } from "@components/home/item";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, VersionedTransaction } from "@solana/web3.js";
import React, { useState, useEffect } from "react";
import { toast } from "react-hot-toast";
import { createJupiterApiClient, QuoteGetRequest } from '@jup-ag/api';
import { useCloseTokenAccount } from "../../utils/hooks/useCloseTokenAccount"; // Adjust the path as needed
import { DEFAULT_TOKEN, REFER_PROGRAM_ID, REFERAL_WALLET } from "@utils/globals";
import { amount } from "@metaplex-foundation/js";

type Props = {
  initialItems: Array<ItemData>;
  totalValue: number;
};

export function ItemList({ initialItems, totalValue }: Props) {
  const { publicKey, sendTransaction, signTransaction } = useWallet();
  const { connection } = useConnection();
  const { closeTokenAccount } = useCloseTokenAccount();
  const [items] = useState<ItemData[]>(initialItems);
  const [closedAccounts, setClosedAccounts] = useState<Set<string>>(new Set());
  const [sortedItems, setSortedItems] = useState<ItemData[]>(initialItems);
  const [selectedItems, setSelectedItems] = useState<Set<ItemData>>(new Set());
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
    setSelectedItems(prev => {
      const newSelectedItems = new Set(prev);
      if (newSelectedItems.has(item)) {
        newSelectedItems.delete(item);
      } else {
        newSelectedItems.add(item);
      }
      return newSelectedItems;
    });
  };

  const handleConfirmSelection = () => {
    if (selectedItems.size > 0) {
      setShowPopup(true);
      setErrorMessage(null);
    } else {
      toast.error("Please select at least one item.");
    }
  };

  const handleClosePopup = async (answer: boolean) => {
    if (answer && selectedItems.size > 0 && publicKey && signTransaction) {
      try {
        setSending(true);
        setMessage('Preparing transactions...');

        for (const selectedItem of selectedItems) {
          if (selectedItem.mintAddress === targetTokenMintAddress) {
            setErrorMessage("Error: You are already lock maxing this token.");
            window.open(raydiumUrl, '_blank');
            handleClosePopup(false);
            return;
          }
          const balanceInSmallestUnit = selectedItem.amount * Math.pow(10, selectedItem.decimals);
          console.log(`Balance: ${selectedItem.amount} ${selectedItem.symbol} , ${selectedItem.decimals} Decimals`);
          console.log(`Should Close Account: ${selectedItem.amount < 0.000001}`);
          if (balanceInSmallestUnit === 0) {
            await closeTokenAccount(new PublicKey(selectedItem.tokenAddress));
            setClosedAccounts(prev => new Set(prev).add(selectedItem.tokenAddress));
            continue;
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

          try {
            const quote = await jupiterQuoteApi.quoteGet(params);

            console.log("quote", quote);

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
            await sendTransaction(signedTransaction, connection, { minContextSlot });

            setMessage('Transaction confirmed successfully!');
            toast.success('Transaction confirmed successfully!');

            await closeTokenAccount(new PublicKey(selectedItem.tokenAddress));
            setClosedAccounts(prev => new Set(prev).add(selectedItem.tokenAddress));
          } catch (error) {
            console.error(`Skipping token ${selectedItem.symbol} due to error:`, error);
            toast.error(`Skipping token ${selectedItem.symbol} due to error.`);
          }
        }

        setShowPopup(false);
        setSelectedItems(new Set());
      } catch (error) {
        console.error("Error during swap:", error);
        setErrorMessage(`Swap failed: ${error}`);
        toast.error("Swap failed. Please try again.");
      } finally {
        setSending(false);
      }
    } else {
      setShowPopup(false);
      setSelectedItems(new Set());
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
      <h2 className="text-center text-primary m-10">{sortedItems.length} Token Accounts</h2>
      <h2 className="text-center text-primary m-10">Total Estimated Accounts Value: ${totalValue.toFixed(2)}</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {items.length === 0 || !sortedItems ? (
          <p className="p-4">No Coins found in your wallet</p>
        ) : (
          sortedItems.map((item, index) => (
            <div
              key={index}
              onClick={() => handleItemClick(item)}
              className={`transform transition-transform duration-300 hover:scale-105 custom-lock-cursor ${selectedItems.has(item) ? 'selected-item' : ''}`}
            >
              <Item data={item} />
            </div>
          ))
        )}
      </div>
      {selectedItems.size > 0 && (
        <button
          onClick={handleConfirmSelection}
          className="confirm-selection-button"
        >
          Confirm Selection
        </button>
      )}

      {showPopup && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white p-8 rounded shadow-lg max-w-sm w-full">
            <p className="text-lg font-semibold">Do you want to lock MAX your selected tokens?</p>
            <p className="text-sm text-gray-600 mt-2">**NOTE THIS WILL SELL ALL YOUR SELECTED TOKENS**</p>
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
