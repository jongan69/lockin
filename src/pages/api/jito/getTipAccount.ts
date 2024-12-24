import * as jito from "jito-ts";
import { BLOCKENGINE_URL } from "@utils/endpoints";
import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const client = jito.searcher.searcherClient(BLOCKENGINE_URL);
    
    // Get tip accounts
    const tipAccount = await client.getTipAccounts();
    
    return res.status(200).json({ 
      success: true, 
      tipAccount 
    });
  } catch (error: any) {
    console.error('Tip account error:', error);
    return res.status(500).json({ 
      error: 'Failed to get tip account',
      details: error.message 
    });
  }
} 