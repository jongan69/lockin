// pages/api/ipfs-proxy.js
export default async function handler(req: { query: { cid: any; }; }, res: { status: (arg0: number) => { (): any; new(): any; json: { (arg0: { error?: unknown; imageUrl?: any; }): void; new(): any; }; }; }) {
  const { cid } = req.query;
  // console.log(`Retrieving IPFS metadata for CID: ${cid}`);
  if (!cid) {
    res.status(400).json({ error: "CID is required" });
    return;
  }

  const ipfsUrl = `https://ipfs.io/ipfs/${cid}`;

  try {
    const response = await fetch(ipfsUrl);
    if (!response.ok) {
      throw new Error(`Error fetching IPFS data: ${response}`);
    }
    const data = await response.json();
    console.log(`Found IPFS data from: ${data.image}`);
    res.status(200).json({imageUrl: data.image});
  } catch (error) {
    res.status(500).json({ error });
  }
}
