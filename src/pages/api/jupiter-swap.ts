import type { NextApiRequest, NextApiResponse } from 'next';
import { JUPITERSWAPINSTRUCTIONS } from '@utils/endpoints';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const response = await fetch(JUPITERSWAPINSTRUCTIONS, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(req.body),
    });

    const data = await response.json();
    res.status(200).json(data);
  } catch (error) {
    console.error('Jupiter API error:', error);
    res.status(500).json({ error: 'Failed to fetch swap instructions' });
  }
} 