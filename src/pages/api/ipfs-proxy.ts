// pages/api/ipfs-proxy.js
export default async function handler(req: { query: { cid: any; }; }, res: { status: (arg0: number) => { (): any; new(): any; json: { (arg0: { error: any; }): void; new(): any; }; }; }) {
  const { cid } = req.query;

  if (!cid) {
    res.status(400).json({ error: "CID is required" });
    return;
  }

  const ipfsUrl = `https://cf-ipfs.com/ipfs/${cid}`;

  try {
    const response = await fetch(ipfsUrl);
    if (!response.ok) {
      throw new Error(`Error fetching IPFS data: ${response.statusText}`);
    }
    const data = await response.json();
    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({ error });
  }
}
