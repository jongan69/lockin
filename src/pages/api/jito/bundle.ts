import * as jito from "jito-ts";
import { BLOCKENGINE_URL } from "@utils/endpoints";
import type { NextApiRequest, NextApiResponse } from 'next';
import { BundleResult } from "jito-ts/dist/gen/block-engine/bundle";
import { VersionedTransaction } from "@solana/web3.js";

// Add type definition
type BundleResponse = {
    status: string;
    result: BundleResult;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { transactions } = req.body;
        const client = jito.searcher.searcherClient(BLOCKENGINE_URL);

        const decodedTxs = transactions.map((tx: string) => 
            VersionedTransaction.deserialize(Buffer.from(tx, 'base64'))
        );

        const bundle = new jito.bundle.Bundle(decodedTxs, 5);

        // Modify the Promise type
        const bundleResult = new Promise<BundleResponse>((resolve, reject) => {
            client.onBundleResult(
                (result: BundleResult) => {
                    if (result.accepted) {
                        resolve({ status: 'accepted', result });
                    } else if (result.finalized) {
                        resolve({ status: 'finalized', result });
                    } else if (result.rejected) {
                        reject({ status: 'rejected', result });
                    } else if (result.dropped) {
                        reject({ status: 'dropped', result });
                    }
                },
                (error: Error) => reject({ status: 'error', error })
            );
        });

        // Send bundle and wait for result
        const bundleId = await client.sendBundle(bundle);
        const result = await Promise.race<BundleResponse>([
            bundleResult,
            new Promise((_, reject) => setTimeout(() => reject('timeout'), 10000))
        ]);

        return res.status(200).json({
            success: true,
            bundleId,
            status: result.status,
            result: result.result
        });

    } catch (error: any) {
        console.error('Bundle error:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to process bundle',
            details: error.message || error
        });
    }
} 