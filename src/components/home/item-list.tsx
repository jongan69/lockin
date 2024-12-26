import React, { useState, useEffect } from "react";
// Import components
import { Item } from "@components/home/item"; // Import the Item component
import { useConnection, useWallet } from "@solana/wallet-adapter-react"; // Import hooks for Solana wallet and connection
import { PublicKey, VersionedTransaction } from "@solana/web3.js"; // Import PublicKey and TransactionInstruction from Solana web3.js
import { toast } from "react-hot-toast"; // Import toast for notifications
import { CgSpinner } from "react-icons/cg";

// Import hooks
import { TokenItem, useCreateSwapInstructions } from "@utils/hooks/useCreateSwapInstructions";
import { useCloseTokenAccount } from "@utils/hooks/useCloseTokenAccount"; // Import hook to close token accounts

// Import global constants
import { LOCKIN_MINT, REFERAL_WALLET } from "@utils/globals";
import { TokenData } from "@utils/tokenUtils"; // Import TokenData type

type Props = {
  initialItems: Array<TokenData>; // Define prop type for initial items
  totalValue: number; // Define prop type for total value
};

export const ItemList = ({ initialItems, totalValue }: Props) => {
  const { publicKey, signAllTransactions } = useWallet(); // Get wallet details from useWallet hook
  const { connection } = useConnection(); // Get connection from useConnection hook
  const { closeTokenAccountsAndSendTransaction } = useCloseTokenAccount(); // Get closeTokenAccount function from useCloseTokenAccount hook

  const [items] = useState<TokenData[]>(initialItems); // Initialize items state
  const [sortedItems, setSortedItems] = useState<TokenData[]>(initialItems); // Initialize sorted items state
  const [selectedItems, setSelectedItems] = useState<Set<TokenData>>(new Set()); // Initialize selected items state
  const [closedTokenAccounts] = useState(new Set()); // Initialize closed token accounts state
  const [closableTokenAccounts, setClosableTokenAccounts] = useState(initialItems); // Initialize closable token accounts state
  const [nfts, setNfts] = useState(initialItems); // Initialize NFTs state
  const [tipAmount, setTipAmount] = useState(0.001); // Initialize tip amount state
  const [tipAmountLamports, setTipAmountLamports] = useState(tipAmount * 10 ** 9); // Initialize tip amount state
  const [maxBps, setmaxBps] = useState(10); // Initialize tip amount state  at 10% slippage
  const [showPopup, setShowPopup] = useState(false); // State to show/hide popup
  const [errorMessage, setErrorMessage] = useState<string | null>(null); // State for error message
  const [message, setMessage] = useState<string | null>(null); // Allow null
  const [closing, setClosing] = useState(false); // State for closing token accounts

  const raydiumUrl = "https://raydium.io/swap/?inputMint=sol&outputMint=8Ki8DpuWNxu9VsS3kQbarsCWMcFGWkzzA8pUPto9zBd5&referrer=9yA9LPCRv8p8V8ZvJVYErrVGWbwqAirotDTQ8evRxE5N"; // URL for Raydium swap
  const targetTokenMintAddress = LOCKIN_MINT; // Target token mint address
  const referralAccountPubkey = new PublicKey(REFERAL_WALLET); // Referral account public key
  const safeSignAllTransactions = signAllTransactions || (async (txs: VersionedTransaction[]) => txs);

  const { handleClosePopup, sending } = useCreateSwapInstructions(
    publicKey,
    connection,
    safeSignAllTransactions,
    setMessage,
    referralAccountPubkey
  );

  const convertToTokenItem = (data: TokenData): TokenItem => ({
    symbol: data.symbol ?? "Unknown",
    mintAddress: data.mintAddress,
    amount: data.amount,
    decimals: data.decimals,
    tokenAddress: data.tokenAddress,
  });

  const handleItemClick = (item: TokenData) => {
    if (item.isNft && item.amount > 0) {
      return; // Ignore selection if the item is an NFT as we can't do anything with it 
    }
    if (item.mintAddress === targetTokenMintAddress) {
      toast.error("Lock tf in bro."); // Show error toast
      setErrorMessage("Error: You are already lock maxing this token.");
      window.open(raydiumUrl, '_blank'); // Open Raydium URL in a new tab
      return;
    }
    setSelectedItems(prev => {
      const newSelectedItems = new Set(prev);
      if (newSelectedItems.has(item)) {
        newSelectedItems.delete(item); // Remove item from selected items
      } else {
        newSelectedItems.add(item); // Add item to selected items
      }
      return newSelectedItems;
    });
  };

  const handleTipChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(event.target.value);
    if (!isNaN(value)) setTipAmount(value);
  };

  const handleBpsChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(event.target.value, 10);
    if (!isNaN(value)) {
      setmaxBps(value); // Update slippage percentage state
    }
  };

  const handleConfirmSelection = () => {
    setTipAmountLamports(tipAmount * 10 ** 9);
    if (selectedItems.size > 0) {
      setShowPopup(true);
      setErrorMessage(null);
    } else {
      toast.error("Please select at least one item.");
    }
  };

  const handleCloseTokenAccounts = async () => {
    setClosing(true);
    if (closableTokenAccounts.length > 0 && publicKey && signAllTransactions) {
      try {
        setMessage("Preparing to close accounts...");
        const tokenAccountPubkeys = closableTokenAccounts.map(
          account => new PublicKey(account.tokenAddress)
        );
        const success = await closeTokenAccountsAndSendTransaction(tokenAccountPubkeys, setMessage);
        if (success) {
          setClosableTokenAccounts([]);
          setMessage("");
          setClosing(false);
        }
      } catch (error) {
        console.error("Error closing accounts:", error);
        toast.error("Error Closing Token Accounts, Please Reload Page.");
        setMessage("");
        setClosing(false);
      }
    }
  };

  useEffect(() => {
    const sortedItems = [...items]
      .filter(item => !closedTokenAccounts.has(item.tokenAddress))
      .filter(item => !item?.isNft)
      .filter(item => (item.amount !== 0 && item.usdValue !== 0))
      .sort((a, b) => b.usdValue - a.usdValue);
    setSortedItems(sortedItems); // Update sorted items state
  }, [closedTokenAccounts, items]);

  useEffect(() => {
    const nfts = [...items]
      .filter(item => !closedTokenAccounts.has(item.tokenAddress))
      .filter(item => item?.isNft)
      .sort((a, b) => b.usdValue - a.usdValue);
    setNfts(nfts); // Update NFTs state
  }, [closedTokenAccounts, items]);

  useEffect(() => {
    const closeableItems = [...items]
      .filter(item => !closedTokenAccounts.has(item.tokenAddress))
      .filter(item => item.amount === 0 && item.usdValue === 0);
    setClosableTokenAccounts(closeableItems); // Update closable token accounts state
  }, [closedTokenAccounts, items]);


  const handleSwapComplete = () => {
    // Wait a brief moment after confirmation before refreshing
    setTimeout(() => {
      window.location.reload();
    }, 2000);
  };

  return (
    <div>
      <h2 className="text-center text-primary m-10">{items.length} Token Accounts</h2>
      <h2 className="text-center text-primary m-10">Total Estimated Accounts Value: ${totalValue.toFixed(2)}</h2>
      <div className="tip-amount-container">
        <label htmlFor="tip-amount" className="block text-sm font-medium text-white bold">
          Jito Bundle Tip Amount (SOL):
        </label>
        <input
          type="number"
          id="tip-amount"
          value={tipAmount}
          onChange={handleTipChange}
          step="0.001"
          min="0"
          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary focus:border-primary sm:text-sm"
        />
      </div>

      <br />
      <div className="maxBps-container">
        <label htmlFor="maxBps" className="block text-sm font-medium text-white bold">
          Max Slippage for Jupiter Swaps (%):
        </label>
        <input
          type="range"
          id="maxBps-slider"
          value={maxBps}
          onChange={handleBpsChange}
          min="0"
          max="50"
          step="1"
          className="mt-1 block w-full"
        />
        <span className="mt-1 text-sm block text-center">{maxBps}% Slippage</span>
      </div>

      <h1 className="text-center text-primary m-10">Swappable Tokens</h1>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {items.length === 0 || !sortedItems ? (
          <p className="p-4">No Coins found in your wallet</p>
        ) : (
          <>
            {sortedItems.map((item, index) => (
              <div
                key={index}
                onClick={() => handleItemClick(item)} // Handle item click event
                className={`transform transition-transform duration-300 hover:scale-105 custom-lock-cursor ${selectedItems.has(item) ? 'selected-item' : ''}`}
              >
                <Item data={item} /> {/* Render Item component */}
              </div>
            ))}
          </>
        )}
      </div>

      {nfts.length > 0 && (
        <>
          <h1 className="text-center text-primary m-10">NFTs</h1>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {nfts.map((item, index) => (
              <div
                key={index}
                onClick={() => handleItemClick(item)} // Handle item click event
                className={`transform transition-transform duration-300 hover:scale-105 custom-lock-cursor ${selectedItems.has(item) ? 'selected-item' : ''}`}
              >
                <Item data={item} /> {/* Render Item component */}
              </div>
            ))}
          </div>
        </>
      )}

      {closableTokenAccounts.length > 0 && (
        <>
          <h1 className="text-center text-primary m-10">Closable Token Accounts</h1>
          {closableTokenAccounts.map((item, index) => (
            <div
              key={index}
              onClick={() => handleItemClick(item)} // Handle item click event
              className={`transform transition-transform duration-300 hover:scale-105 py-2 custom-lock-cursor ${selectedItems.has(item) ? 'selected-item' : ''}`}
            >
              <Item data={item} /> {/* Render Item component */}
            </div>
          ))}
        </>
      )}

      {closableTokenAccounts.length > 0 && (
        <button
          onClick={handleCloseTokenAccounts}
          className="close-token-accounts-button"
          disabled={sending || closing}
        >
          {closing ? (
            <span className="flex items-center justify-center gap-2">
              <CgSpinner className="animate-spin h-5 w-5" />
              Closing...
            </span>
          ) : (
            `Close (${closableTokenAccounts.length} Accounts)`
          )}
        </button>
      )}

      {selectedItems.size > 0 && !showPopup && (
        <button
          onClick={handleConfirmSelection} // Handle confirm selection event
          className="confirm-selection-button"
        >
          Lockin ({selectedItems.size} Selected)
        </button>
      )}

      {showPopup && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-75 z-50">
          <div className="bg-gray-800 p-8 rounded-xl shadow-2xl max-w-md w-full border border-gray-700 transform transition-all">
            <h2 className="text-2xl font-bold text-white mb-4 text-center">Confirm Transaction</h2>
            
            <div className="space-y-4">
              <p className="text-gray-300 text-center">
                Are you sure you want to lock MAX your selected tokens?
              </p>
              
              <div className="bg-red-900/50 p-4 rounded-lg border border-red-500">
                <p className="text-red-400 text-sm font-medium text-center">
                  WARNING: This action will sell all your selected tokens
                </p>
              </div>

              {errorMessage && (
                <div className="bg-red-900/50 p-4 rounded-lg">
                  <p className="text-red-400 text-sm">{errorMessage}</p>
                </div>
              )}

              {message && (
                <div className="bg-blue-900/50 p-4 rounded-lg">
                  <p className="text-blue-400 text-sm">{message}</p>
                </div>
              )}
            </div>

            <div className="flex gap-4 mt-6">
              <button
                onClick={() => handleClosePopup(
                  true,
                  new Set(Array.from(selectedItems).map(convertToTokenItem)),
                  setErrorMessage,
                  tipAmountLamports,
                  maxBps,
                  handleSwapComplete,
                )}
                disabled={sending}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white py-3 px-4 rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {sending ? 'Processing...' : `${errorMessage ? 'Retry' : 'Confirm'}`}
              </button>
              
              <button
                onClick={() => setShowPopup(false)}
                className="flex-1 bg-gray-600 hover:bg-gray-700 text-white py-3 px-4 rounded-lg font-medium transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ItemList;
