import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const searchParams = new URLSearchParams(req.body);
    const response = await fetch(
      `https://quote-api.jup.ag/v6/quote?${searchParams.toString()}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        }
      }
    );

    const data = await response.json();
    res.status(200).json(data);
  } catch (error) {
    console.error('Jupiter API error:', error);
    res.status(500).json({ error: 'Failed to fetch from Jupiter API' });
  }
} 