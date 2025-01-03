import { AddressLookupTableAccount, Connection, PublicKey, PublicKeyInitData, TransactionInstruction } from "@solana/web3.js";
import { Metaplex } from "@metaplex-foundation/js";
import Bottleneck from "bottleneck";
import { fetchIpfsMetadata } from "./fetchIpfsMetadata";
import { extractCidFromUrl } from "./extractCidFromUrl";
import { fetchJupiterSwap } from "./fetchJupiterSwap";
import { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { LOCKIN_MINT, TOKEN_PROGRAM_ID_ADDRESS } from "@utils/globals";
import { Instruction } from "@jup-ag/api";
import { fetchFloorPrice } from "./fetchFloorPrice";
import { NETWORK } from "@utils/endpoints";
import { createJupiterApiClient, QuoteGetRequest } from "@jup-ag/api";

const ENDPOINT = NETWORK;

// Add validation for the endpoint URL
if (!ENDPOINT || (!ENDPOINT.startsWith('http:') && !ENDPOINT.startsWith('https:'))) {
  // console.log(`ENDPOINT: ${ENDPOINT}`);
  throw new Error('Invalid RPC endpoint URL. Must start with http: or https:');
}

// console.log(`ENDPOINT: ${ENDPOINT}`);
const connection = new Connection(ENDPOINT);
const metaplex = Metaplex.make(connection);
const DEFAULT_IMAGE_URL = process.env.UNKNOWN_IMAGE_URL || "https://s3.coinmarketcap.com/static-gravity/image/5cc0b99a8dd84fbfa4e150d84b5531f2.png";

// Modify the rate limiters at the top
const rpcLimiter = new Bottleneck({
  maxConcurrent: 5, // Reduce concurrent requests
  minTime: 200, // Increase delay between requests
  reservoir: 30, // Initial tokens
  reservoirRefreshAmount: 30, // Tokens to refresh
  reservoirRefreshInterval: 1000, // Refresh every second
  retryCount: 3, // Number of retries
  retryDelay: 1000, // Delay between retries
});

export const apiLimiter = new Bottleneck({
  maxConcurrent: 3, // Reduce concurrent requests
  minTime: 333, // About 3 requests per second
  reservoir: 20, // Initial tokens
  reservoirRefreshAmount: 20, // Tokens to refresh
  reservoirRefreshInterval: 1000, // Refresh every second
  retryCount: 3,
  retryDelay: 1000,
});

// Add retry wrapper function
const withRetry = async <T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  delayMs: number = 1000
): Promise<T> => {
  let lastError;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;
      if (error.toString().includes('rate limit') || error.toString().includes('429')) {
        console.log(`Rate limit hit, attempt ${i + 1}/${maxRetries}, waiting ${delayMs}ms...`);
        await new Promise(resolve => setTimeout(resolve, delayMs * (i + 1))); // Exponential backoff
        continue;
      }
      throw error; // Throw non-rate-limit errors immediately
    }
  }
  throw lastError;
};

// Add these constants at the top
const MAX_TOKEN_FETCH_RETRIES = 2;
const TOKEN_FETCH_RETRY_DELAY = 1000;

// Add a retry wrapper function
const withTokenRetry = async <T>(
  operation: () => Promise<T>,
  tokenIdentifier: string
): Promise<T | null> => {
  let attempts = 0;
  while (attempts < MAX_TOKEN_FETCH_RETRIES) {
    try {
      return await operation();
    } catch (error) {
      attempts++;
      console.error(`Attempt ${attempts} failed for token ${tokenIdentifier}:`, error);
      if (attempts < MAX_TOKEN_FETCH_RETRIES) {
        await new Promise(resolve => setTimeout(resolve, TOKEN_FETCH_RETRY_DELAY));
        continue;
      }
      console.log(`Skipping token ${tokenIdentifier} after ${attempts} failed attempts`);
      return null;
    }
  }
  return null;
};

export type TokenData = {
  decimals: number;
  mintAddress: string;
  tokenAddress: string;
  name?: string;
  amount: number;
  symbol?: string;
  logo?: string;
  cid?: string | null;
  usdValue: number;
  collectionName?: string;
  collectionLogo?: string;
  isNft?: boolean;
  swappable: boolean;
};

export async function fetchTokenMetadata(mintAddress: PublicKey, mint: string) {
  try {
    const metadataAccount = metaplex
      .nfts()
      .pdas()
      .metadata({ mint: mintAddress });

    const metadataAccountInfo = await withRetry(() =>
      rpcLimiter.schedule(() => connection.getAccountInfo(metadataAccount))
    );

    if (!metadataAccountInfo) {
      return getDefaultTokenMetadata(mint);
    }

    const token = await withRetry(() =>
      rpcLimiter.schedule(() => metaplex.nfts().findByMint({ mintAddress: mintAddress }))
    );

    let metadata = await processTokenMetadata(token, mint);

    // Handle collection metadata separately to prevent failures
    if (token.collection) {
      try {
        const collectionMetadata = await fetchCollectionMetadata(token.collection.address);
        metadata = {
          ...metadata,
          collectionName: collectionMetadata?.name ?? metadata.name,
          collectionLogo: collectionMetadata?.logo ?? metadata.logo,
          isNft: true
        };
      } catch (collectionError) {
        console.warn(`Failed to fetch collection metadata for token ${mint}:`, collectionError);
        // Keep existing metadata if collection fetch fails
      }
    }

    return metadata;

  } catch (error) {
    console.warn("Error fetching token metadata for:", mint, error);
    return getDefaultTokenMetadata(mint);
  }
}

async function fetchCollectionMetadata(collectionAddress: PublicKey) {
  try {
    const metadataAccount = metaplex
      .nfts()
      .pdas()
      .metadata({ mint: collectionAddress });

    // Wrap RPC calls with withRetry and rpcLimiter
    const metadataAccountInfo = await withRetry(() =>
      rpcLimiter.schedule(() =>
        connection.getAccountInfo(metadataAccount)
      )
    );

    if (!metadataAccountInfo) {
      console.log(`No metadata account found for collection: ${collectionAddress.toString()}`);
      return getDefaultMetadata();
    }

    const collection = await withRetry(() =>
      rpcLimiter.schedule(() =>
        metaplex.nfts().findByMint({ mintAddress: collectionAddress })
      )
    );

    const cid = extractCidFromUrl(collection.uri);
    if (cid) {
      try {
        const collectionMetadata = await apiLimiter.schedule(() =>
          fetchIpfsMetadata(cid)
        );
        return {
          name: collection.name || "Unknown Collection",
          symbol: collection.symbol || "UNKNOWN",
          logo: collectionMetadata.imageUrl ?? collection.json?.image ?? DEFAULT_IMAGE_URL,
          cid: cid,
          isNft: true
        };
      } catch (ipfsError) {
        console.warn(`Failed to fetch IPFS metadata for collection ${collectionAddress.toString()}:`, ipfsError);
        return {
          name: collection.name || "Unknown Collection",
          symbol: collection.symbol || "UNKNOWN",
          logo: collection.json?.image ?? DEFAULT_IMAGE_URL,
          cid: cid,
          isNft: true
        };
      }
    }

    return {
      name: collection.name || "Unknown Collection",
      symbol: collection.symbol || "UNKNOWN",
      logo: collection.json?.image ?? DEFAULT_IMAGE_URL,
      cid: null,
      isNft: true
    };

  } catch (error) {
    console.warn("Error fetching collection metadata for address:", collectionAddress.toString(), error);
    return getDefaultMetadata();
  }
}

// Add a helper function to return default metadata
function getDefaultMetadata() {
  return {
    name: "Unknown Collection",
    symbol: "UNKNOWN",
    logo: DEFAULT_IMAGE_URL,
    cid: null,
    isNft: true
  };
}

// Helper function to get default token metadata
function getDefaultTokenMetadata(mint: string) {
  return {
    name: mint,
    symbol: mint,
    logo: DEFAULT_IMAGE_URL,
    cid: null,
    collectionName: mint,
    collectionLogo: DEFAULT_IMAGE_URL,
    isNft: false
  };
}

// Helper function to process token metadata
async function processTokenMetadata(token: any, mint: string) {
  const cid = extractCidFromUrl(token.uri);
  let metadata = {
    name: token?.name || mint,
    symbol: token?.symbol || mint,
    logo: token.json?.image ?? DEFAULT_IMAGE_URL,
    cid,
    collectionName: token?.name || mint,
    collectionLogo: token.json?.image ?? DEFAULT_IMAGE_URL,
    isNft: false
  };

  if (cid) {
    try {
      const newMetadata = await apiLimiter.schedule(() =>
        fetchIpfsMetadata(cid)
      );
      metadata.logo = newMetadata.imageUrl ?? token.json?.image ?? DEFAULT_IMAGE_URL;
    } catch (ipfsError) {
      console.warn(`Failed to fetch IPFS metadata for token ${mint}:`, ipfsError);
      // Keep existing metadata if IPFS fetch fails
    }
  }

  return metadata;
}

export async function fetchTokenAccounts(publicKey: PublicKey) {
  return withRetry(() =>
    rpcLimiter.schedule(() =>
      connection.getParsedTokenAccountsByOwner(publicKey, {
        programId: TOKEN_PROGRAM_ID_ADDRESS,
      })
    )
  );
}

export async function handleTokenData(
  publicKey: PublicKey,
  tokenAccount: any): Promise<TokenData | null> {
  const mintAddress = tokenAccount.account.data.parsed.info.mint;
  const amount = tokenAccount.account.data.parsed.info.tokenAmount.uiAmount || 0;
  const decimals = tokenAccount.account.data.parsed.info.tokenAmount.decimals;

  const [tokenAccountAddress] = PublicKey.findProgramAddressSync(
    [publicKey.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), new PublicKey(mintAddress).toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID
  );

  // Get Jupiter price with retry
  const jupiterPrice = await withTokenRetry(
    () => apiLimiter.schedule(() => fetchJupiterSwap(mintAddress)),
    mintAddress
  );
  
  if (!jupiterPrice) {
    console.log(`Skipping token ${mintAddress} due to Jupiter price fetch failure`);
    return null;
  }

  // Get metadata with retry
  const metadata = await withTokenRetry(
    () => fetchTokenMetadata(new PublicKey(mintAddress), mintAddress),
    mintAddress
  );

  if (!metadata) {
    console.log(`Skipping token ${mintAddress} due to metadata fetch failure`);
    return null;
  }

  let price = 0;
  if (metadata && metadata.isNft) {
    // Get floor price with retry
    const floorPrice = await withTokenRetry(
      () => apiLimiter.schedule(() => fetchFloorPrice(mintAddress)),
      mintAddress
    );
    
    price = floorPrice?.usdValue || 0;
    console.log(`${metadata.collectionName} NFT Floor price: $${price}`);
  } else {
    price = jupiterPrice.data[mintAddress]?.price || 0;
  }

  const usdValue = amount * price;

  // Check if token is swappable with retry
  const isSwappable = await withTokenRetry(
    () => isTokenSwappable(
      mintAddress,
      LOCKIN_MINT,
      tokenAccount.account.data.parsed.info.tokenAmount.amount
    ),
    mintAddress
  ) ?? false; // Default to false if swappable check fails

  return {
    mintAddress,
    tokenAddress: tokenAccountAddress.toString(),
    amount,
    decimals,
    usdValue,
    ...metadata,
    swappable: isSwappable,
  };
}

export const deserializeInstruction = (instruction: Instruction) => {
  return new TransactionInstruction({
    programId: new PublicKey(instruction.programId),
    keys: instruction.accounts.map((key: { pubkey: PublicKeyInitData; isSigner: any; isWritable: any; }) => ({
      pubkey: new PublicKey(key.pubkey),
      isSigner: key.isSigner,
      isWritable: key.isWritable,
    })),
    data: Buffer.from(instruction.data, "base64"),
  });
};

export const getAddressLookupTableAccounts = async (connection: Connection, keys: any[]) => {
  const addressLookupTableAccountInfos = await connection.getMultipleAccountsInfo(
    keys.map((key) => new PublicKey(key))
  );

  return addressLookupTableAccountInfos.reduce<AddressLookupTableAccount[]>((acc, accountInfo, index) => {
    const addressLookupTableAddress = keys[index];
    if (accountInfo) {
      const addressLookupTableAccount = new AddressLookupTableAccount({
        key: new PublicKey(addressLookupTableAddress),
        state: AddressLookupTableAccount.deserialize(accountInfo.data as any),
      });
      if (typeof addressLookupTableAccount !== "undefined") {
        acc.push(addressLookupTableAccount);
      }
    }
    return acc;
  }, []);
};

export async function isTokenSwappable(inputMint: string, targetMint: string, amount: number): Promise<boolean> {
  if (inputMint === LOCKIN_MINT) {
    return true;
  }
  
  const jupiterQuoteApi = createJupiterApiClient();
  
  try {
    return await withRetry(async () => {
      const params: QuoteGetRequest = {
        inputMint: inputMint,
        outputMint: targetMint,
        amount: amount,
        slippageBps: 50,
        onlyDirectRoutes: false,
      };

      const quote = await jupiterQuoteApi.quoteGet(params) as any;
      return quote?.routes?.length > 0;
    });
  } catch (error) {
    console.log(`Token ${inputMint} is not swappable:`, error);
    return false;
  }
}
