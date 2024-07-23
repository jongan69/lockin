import { Item, ItemData } from "@components/home/item";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import React, { useState, useEffect } from "react";
import { toast } from "react-hot-toast";
import { DEFAULT_TOKEN, REFER_PROGRAM_ID, REFERAL_WALLET } from "@utils/globals";
import { useTokenOperations } from "@utils/hooks/useTokenOperations";

type Props = {
  initialItems: Array<ItemData>;
  totalValue: number;
};

export const ItemList = ({ initialItems, totalValue }: Props) => {
  const { publicKey, sendTransaction, signTransaction } = useWallet();
  const { connection } = useConnection();
  const [items] = useState<ItemData[]>(initialItems);
  const [closedAccounts] = useState<Set<string>>(new Set());
  const [sortedItems, setSortedItems] = useState<ItemData[]>(initialItems);
  const [selectedItems, setSelectedItems] = useState<Set<ItemData>>(new Set());
  const [showPopup, setShowPopup] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const raydiumUrl = "https://raydium.io/swap/?inputMint=sol&outputMint=8Ki8DpuWNxu9VsS3kQbarsCWMcFGWkzzA8pUPto9zBd5&referrer=9yA9LPCRv8p8V8ZvJVYErrVGWbwqAirotDTQ8evRxE5N";
  const targetTokenMintAddress = DEFAULT_TOKEN;
  const referralAccountPubkey = new PublicKey(REFERAL_WALLET);
  const referralProgramId = REFER_PROGRAM_ID;

  const { handleClosePopup, sending } = useTokenOperations(
    publicKey,
    connection,
    signTransaction,
    sendTransaction,
    targetTokenMintAddress,
    referralAccountPubkey,
    referralProgramId,
    raydiumUrl,
    setShowPopup,
    setSelectedItems
  );

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

  useEffect(() => {
    const sortedItems = [...items]
      .filter(item => !closedAccounts.has(item.tokenAddress))
      .sort((a, b) => b.usdValue - a.usdValue);

    setSortedItems(sortedItems);
  }, [closedAccounts, items]);

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
                onClick={() => handleClosePopup(true, selectedItems, setMessage, setErrorMessage)}
                disabled={sending}
              >
                {sending ? 'Processing...' : 'Yes'}
              </button>
              <button
                onClick={() => handleClosePopup(false, selectedItems, setMessage, setErrorMessage)}
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
};

export default ItemList;
