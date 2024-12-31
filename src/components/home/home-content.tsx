import { useWallet } from "@solana/wallet-adapter-react"; // Import the useWallet hook from Solana wallet adapter
import React, { useEffect, useState, useRef } from "react"; // Import React and necessary hooks
import { ItemList } from "@components/home/item-list"; // Import the ItemList component
import { toast } from "react-hot-toast"; // Import the toast notification library
import { Circles } from "react-loader-spinner"; // Import the Circles loader component
import { useTokenBalance } from "@utils/hooks/useTokenBalance"; // Import custom hook to get token balance
import { FEE_ADDRESS, REFERAL_WALLET } from "@utils/globals"; // Import FEE_ADDRESS constant
import { apiLimiter, fetchTokenAccounts, handleTokenData, TokenData } from "../../utils/tokenUtils"; // Import utility functions and types
import { saveWalletToDb } from "@utils/saveWallet";

export function HomeContent() {
  const { publicKey, signTransaction } = useWallet(); // Get publicKey and signTransaction from useWallet hook
  const [signState, setSignState] = useState<string>("initial"); // State for tracking the sign state
  const [tokens, setTokens] = useState<TokenData[]>([]); // State for storing token data
  const prevPublicKey = useRef<string>(publicKey?.toBase58() || ""); // Ref to store the previous public key
  const [loading, setLoading] = useState<boolean>(false); // State for tracking the loading state
  const [totalAccounts, setTotalAccounts] = useState<number>(0); // State for storing the total number of accounts
  const { balance } = useTokenBalance(FEE_ADDRESS); // Get the balance using useTokenBalance hook
  const [totalValue, setTotalValue] = useState<number>(0); // State for tracking the total value
  const [swappableTokenCount, setSwappableTokenCount] = useState<number>(0);
  const [rateLimitMessage, setRateLimitMessage] = useState<string | null>(null);
  const [referrer, setReferrer] = useState<string>(REFERAL_WALLET); // State for storing the referrer
  // Effect to reset sign state if the public key changes
  useEffect(() => {
    if (publicKey && publicKey.toBase58() !== prevPublicKey.current) {
      prevPublicKey.current = publicKey.toBase58(); // Update the previous public key
      setSignState("initial"); // Reset the sign state to initial
    }
  }, [publicKey]);

  // Function to update the total value of tokens
  const updateTotalValue = (usdValue: number) => {
    setTotalValue((prevValue) => prevValue + usdValue); // Increment the total value by the given USD value
  };

  // Effect to handle token signing in and fetching data
  useEffect(() => {
    const sign = async () => {
      if (publicKey && signTransaction && signState === "initial") {
        setLoading(true);
        setSignState("loading");
        const signToastId = toast.loading("Getting Token Data...");

        // Check url for a referral address
        const urlParams = new URLSearchParams(window.location.search);
        const referredBy = urlParams.get('referredBy');
        // Save the wallet and get the effective referral address
        const effectiveReferral = await saveWalletToDb(publicKey.toBase58(), referredBy || REFERAL_WALLET);
        setReferrer(effectiveReferral);
        try {
          const tokenAccounts = await fetchTokenAccounts(publicKey);
          setTotalAccounts(tokenAccounts.value.length);

          // Fetch token data for each account
          const tokenDataPromises = tokenAccounts.value.map(async (tokenAccount) => {
            const tokenData = await handleTokenData(publicKey, tokenAccount);
            if (tokenData?.swappable) {
              updateTotalValue(tokenData.usdValue);
              setSwappableTokenCount(prev => prev + 1);
            }
            return tokenData;
          });

          const tokens = (await Promise.all(tokenDataPromises))
            .filter((token): token is TokenData => token !== null);
          setTokens(tokens);
          setSignState("success");
          setRateLimitMessage(null); // Clear rate limit message on complete success
          toast.success("Token Data Retrieved", { id: signToastId });
        } catch (error: any) {
          setSignState("error");
          if (error.toString().includes('rate limit') || error.toString().includes('429')) {
            toast.error("Rate limit reached. Please try again in a few moments.", { id: signToastId });
          } else {
            toast.error("Error verifying wallet, please reconnect wallet", { id: signToastId });
          }
          console.error(error);
        } finally {
          setLoading(false);
        }
      }
    };

    sign();
  }, [signState, signTransaction, publicKey]);

  // Render loading state or token data fetching state
  if (loading || !tokens || signState === "loading") {
    return (
      <>
        <p>Found {totalAccounts} Accounts, Getting Token Data...</p>
        {rateLimitMessage && (
          <p className="text-yellow-500 text-center mt-2 mb-4">
            {rateLimitMessage}
          </p>
        )}
        <div className="flex flex-col justify-center items-center h-screen">
          <Circles color="#00BFFF" height={80} width={80} />
          <p className="text-sm text-gray-500 mt-4">
            {rateLimitMessage ? 
              "This may take a moment due to rate limiting..." :
              "Loading token data..."}
          </p>
        </div>
      </>
    );
  }

  // Render message if no tokens are found but sign state is successful
  if (publicKey && signState === "success" && tokens.length === 0) {
    return <p className="text-center p-4">Loading wallet information...</p>;
  }

  // Check if data has been successfully fetched
  const hasFetchedData = publicKey && signState === "success" && tokens.length > 0 && totalAccounts > 0;

  return (
    <div className="grid grid-cols-1">
      {hasFetchedData ? (
        <div>
          <p className="text-center p-4">
            Found {swappableTokenCount} swappable tokens out of {totalAccounts} total tokens
          </p>
          <ItemList initialItems={tokens} totalValue={totalValue} referrer={referrer} />
        </div>
      ) : (
        <div className="text-center">
          <p className="text-center p-4">
            This app allows users to convert SPL Tokens to $Lockin and will close their token account for returning rent.
          </p>
          {!publicKey && (
            <div className="card border-2 border-primary mb-5">
              <div className="card-body items-center">
                <h2 className="card-title text-center text-primary mb-2">
                  Please connect your wallet to lock in...
                </h2>
              </div>
            </div>
          )}
          {publicKey && signState === "error" && (
            <div className="card border-2 border-primary mb-5">
              <div className="card-body items-center text-center">
                <h2 className="card-title text-center mb-2">
                  {`Please Disconnect and reconnect your wallet. You might need to reload the page. You might have too many tokens and we're being rate limited. Thank you for locking in 🔒`}
                </h2>
              </div>
            </div>
          )}
        </div>
      )}
      {balance > 0 && <p className="text-center p-4">Total LOCKINS Generated: {balance.toFixed(5)}</p>} {/* Display total LOCKINS generated if balance is greater than 0 */}
    </div>
  );
}
