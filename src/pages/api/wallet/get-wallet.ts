import { MongoClient } from 'mongodb';
import type { NextApiRequest, NextApiResponse } from 'next';

const uri = process.env.MONGODB_URI;

if (!uri) {
    throw new Error('Please add your Mongo URI to .env.local');
}

export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse
) {
    if (req.method !== 'GET') {
        return res.status(405).json({ message: 'Method not allowed' });
    }

    const { address } = req.query;

    if (!address) {
        return res.status(400).json({ message: 'Wallet address is required' });
    }

    try {
        const client = await MongoClient.connect(uri as string);
        const db = client.db('referral');
        const walletsCollection = db.collection('wallets');

        const wallet = await walletsCollection.findOne({ address });

        await client.close();

        if (!wallet) {
            return res.status(404).json({ message: 'Wallet not found' });
        }

        return res.status(200).json({
            referredBy: wallet.referredBy,
            referralAccountPubKey: wallet.referralAccountPubKey
        });
    } catch (error) {
        console.error('Error fetching wallet:', error);
        return res.status(500).json({ message: 'Error fetching wallet' });
    }
} 