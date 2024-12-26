import { JUPITERQUOTE } from '@utils/endpoints';
import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Convert request body to URLSearchParams
    const params = new URLSearchParams();
    Object.entries(req.body).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        params.append(key, value.toString());
      }
    });

    const response = await fetch(
      `${JUPITERQUOTE}?${params.toString()}`,
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