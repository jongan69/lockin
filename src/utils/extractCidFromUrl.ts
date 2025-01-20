export const extractCidFromUrl = (url: string): string | null => {
  if (!url) {
    console.error("No IPFS URL provided");
    return "";
  }

  let cid = "";
  if (url.startsWith("https://cf-ipfs.com/ipfs/")) {
    cid = url.replace("https://cf-ipfs.com/ipfs/", "");
  } else if (url.startsWith("https://ipfs.io/ipfs/")) {
    cid = url.replace("https://ipfs.io/ipfs/", "");
  } else if (url.startsWith("https://nftstorage.link/ipfs/")) {
    cid = url.replace("https://nftstorage.link/ipfs/", "");
  } else if (url.startsWith("ipfs://")) {
    cid = url.replace("ipfs://", "");
  } else {
    const urlParts = url.split("/");
    // Match either CIDv0 (Qm..., 46 chars) or CIDv1 (baf..., 59 chars)
    cid = urlParts.find((part) => 
      (part.length === 46 && part.startsWith("Qm")) || 
      (part.length === 59 && part.startsWith("baf"))
    ) ?? "";
  }

  return cid.toString();
};
