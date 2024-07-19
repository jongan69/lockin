import { useWallet } from "@solana/wallet-adapter-react";
import React, { useEffect, useState } from "react";
import { ItemList } from "@components/home/item-list";
import { Button, ButtonState } from "@components/home/button";
import { toast } from "react-hot-toast";
import { Connection, PublicKey } from "@solana/web3.js";
import { Metaplex } from "@metaplex-foundation/js";
import { ENV, TokenListProvider } from "@solana/spl-token-registry";

const RPC_ENDPOINT = process.env.NEXT_PUBLIC_SOLANA_RPC_ENDPOINT!;
const connection = new Connection(RPC_ENDPOINT);
const metaplex = Metaplex.make(connection);

type TokenData = {
  decimals: number;
  mintAddress: string;
  name?: string;
  amount: number;
  symbol?: string;
  logo?: string;
  usdValue?: number;
};

export function HomeContent() {
  const { publicKey, signTransaction } = useWallet();
  const [signState, setSignState] = useState<ButtonState>("initial");
  const [tokens, setTokens] = useState<TokenData[]>([]);
  const prevPublicKey = React.useRef<string>(publicKey?.toBase58() || "");

  const fetchJupiterSwap = async (id: string | undefined) => {
    const price = (await fetch(`https://price.jup.ag/v6/price?ids=${id}`)).json();
    return price;
  };

  // Reset the state if wallet changes or disconnects
  useEffect(() => {
    if (publicKey && publicKey.toBase58() !== prevPublicKey.current) {
      prevPublicKey.current = publicKey.toBase58();
      setSignState("initial");
    }
  }, [publicKey]);

  // This will request a signature automatically but you can have a separate button for that
  useEffect(() => {
    async function sign() {
      if (publicKey && signTransaction && signState === "initial") {
        setSignState("loading");
        const signToastId = toast.loading("Getting Token Data...");

        try {
          const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
            publicKey,
            { programId: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA") }
          );

          const tokenDataPromises = tokenAccounts.value.map(async (tokenAccount) => {

            const mintAddress = tokenAccount.account.data.parsed.info.mint;
            const amount = tokenAccount.account.data.parsed.info.tokenAmount.uiAmount;
            const decimals = tokenAccount.account.data.parsed.info.tokenAmount.decimals
            const jupiterPrice = await fetchJupiterSwap(mintAddress);
            if (jupiterPrice)
              console.log(`The Price of ${mintAddress} is $${jupiterPrice.data[mintAddress].price}`);

            // Fetch token metadata
            const metadata = await fetchTokenMetadata(new PublicKey((mintAddress)), mintAddress);

            return {
              mintAddress: mintAddress,
              amount,
              decimals,
              ...metadata,
              usdValue: amount * jupiterPrice.data[mintAddress].price,
            };
          });

          const tokens = await Promise.all(tokenDataPromises);

          if (tokens.length > 0)
            setSignState("success");
          setTokens(tokens);
          toast.success("Token Data Retrieved", { id: signToastId });
        } catch (error: any) {
          setSignState("error");
          toast.error("Error verifying wallet, please reconnect wallet", {
            id: signToastId,
          });
        }
      }
    }

    sign();
  }, [signState, signTransaction, publicKey]);

  // Fetch token metadata
  async function fetchTokenMetadata(mintAddress: PublicKey, mint: string) {
    // First get price from jupiter if it exsits
    // console.log("mintAddress", mint);
    try {
      const metadataAccount = metaplex
        .nfts()
        .pdas()
        .metadata({ mint: mintAddress });
      // console.log("token", metadataAccount);

      const metadataAccountInfo = await connection.getAccountInfo(metadataAccount);

      if (metadataAccountInfo) {
        const token = await metaplex.nfts().findByMint({ mintAddress: mintAddress });
        // console.log("token", token);
        return {
          name: token.name,
          symbol: token.symbol,
          logo: token.json?.image,
        };
      } else {
        const provider = await new TokenListProvider().resolve();
        const tokenList = provider.filterByChainId(ENV.MainnetBeta).getList();
        const tokenMap = tokenList.reduce((map, item) => {
          map.set(item.address, item);
          return map;
        }, new Map());

        const token = tokenMap.get(mintAddress);

        return {
          name: token.name,
          symbol: token.symbol,
          logo: token.logoURI,
        };
      }

    } catch (error) {
      console.error("Error fetching token metadata:", error);
      return { name: "Unknown", symbol: "Unknown", logo: "" };
    }
  }

  // const onSignClick = () => {
  //   setSignState("initial");
  // };

  if (!tokens) {
    return (
      <p className="text-center p-4">
        Failed to load items, please try connecting again.
      </p>
    );
  }

  if (publicKey && signState === "success" && !tokens) {
    return <p className="text-center p-4">Loading wallet information...</p>;
  }

  const hasFetchedData = publicKey && signState === "success" && tokens.length > 0;

  return (
    <div className="grid grid-cols-1">
      {hasFetchedData ? (
        <div>
          <h2 className="text-center text-primary mt-4">Token Accounts</h2>
          <ItemList 
          items={tokens} 
          />
        </div>
      ) : (
        <div className="text-center">
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
                  Please Disconnect and reconnect your wallet
                </h2>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
