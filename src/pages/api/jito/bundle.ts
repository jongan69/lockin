import * as jito from "jito-ts";
import { BLOCKENGINE_URL } from "@utils/endpoints";
import type { NextApiRequest, NextApiResponse } from 'next';
import { BundleResult } from "jito-ts/dist/gen/block-engine/bundle";
import { VersionedTransaction } from "@solana/web3.js";

type BundleResponse = {
    status: string;
    result: BundleResult;
    bundleId?: string;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    let cleanup: (() => void) | undefined;
    let bundleId: string | undefined;

    try {
        const { transactions } = req.body;
        console.log(`Received ${transactions.length} transactions to bundle`);
        
        const client = jito.searcher.searcherClient(BLOCKENGINE_URL);
        console.log('Created Jito client');

        const decodedTxs = transactions.map((tx: string) => {
            const decoded = VersionedTransaction.deserialize(Buffer.from(tx, 'base64') as any);
            console.log('Decoded transaction with blockhash:', decoded.message.recentBlockhash);
            return decoded;
        });

        const bundle = new jito.bundle.Bundle(decodedTxs, 5);

        // Send bundle first
        const sendResult = await client.sendBundle(bundle);
        if (!sendResult.ok) throw sendResult.error;
        bundleId = sendResult.value;
        console.log('Bundle sent to Jito with ID:', bundleId);

        // Return early with the bundle ID
        res.status(202).json({
            success: true,
            bundleId,
            status: 'processing',
            message: 'Bundle submitted successfully, check status endpoint for updates'
        });

        // Continue processing in the background
        const bundleResult = new Promise<BundleResponse>((resolve, reject) => {
            cleanup = client.onBundleResult(
                (result: BundleResult) => {
                    console.log('Bundle result received:', JSON.stringify(result, null, 2));
                    if (result.accepted) {
                        resolve({ status: 'accepted', result, bundleId });
                        if (cleanup) cleanup();
                    } else if (result.finalized) {
                        resolve({ status: 'finalized', result, bundleId });
                        if (cleanup) cleanup();
                    } else if (result.rejected) {
                        console.log('Bundle rejected:', JSON.stringify(result.rejected, null, 2));
                        resolve({ status: 'rejected', result, bundleId });
                        if (cleanup) cleanup();
                    } else if (result.dropped) {
                        console.log('Bundle dropped:', JSON.stringify(result.dropped, null, 2));
                        resolve({ status: 'dropped', result, bundleId });
                        if (cleanup) cleanup();
                    }
                },
                (error: Error) => {
                    if (!error.message.includes('CANCELLED')) {
                        console.error('Bundle error in listener:', error);
                        reject({ status: 'error', error, bundleId });
                    }
                    if (cleanup) cleanup();
                }
            );
        });

        // Wait for result in background
        try {
            const result = await Promise.race([
                bundleResult,
                new Promise((_, reject) => 
                    setTimeout(() => {
                        console.log('Bundle processing timed out after 30s');
                        reject({ status: 'pending', message: 'Still processing', bundleId })
                    }, 30000)
                )
            ]);
            console.log('Final bundle result:', result);
        } catch (error) {
            console.log('Background processing result:', error);
        }

    } catch (error: any) {
        console.error('Bundle error details:', error);
        if (error.result) {
            console.error('Bundle result details:', JSON.stringify(error.result, null, 2));
        }
        // Only send error response if we haven't sent the 202 already
        if (!res.writableEnded) {
            return res.status(500).json({
                success: false,
                error: 'Failed to process bundle',
                details: error.status === 'error' ? error.error : error.message || error,
                bundleId
            });
        }
    } finally {
        if (cleanup) {
            console.log('Cleaning up bundle listener');
            cleanup();
        }
    }
} 