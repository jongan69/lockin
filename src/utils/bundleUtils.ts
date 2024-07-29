import { bs58 } from "@project-serum/anchor/dist/cjs/utils/bytes";
export type bundleStatus = {
  jsonrpc: string
  result: {
    context: {
      slot: number
    }
    value: {
      bundle_id: string
      transactions: string[]
      slot: number
      confirmation_status: string
      err: any
    }[]
  }
  id: number
}

export async function getBundleStatus(id: string): Promise<bundleStatus> {
  let endpoint = 'https://mainnet.block-engine.jito.wtf/api/v1/bundles';

  let payload = {
    jsonrpc: "2.0",
    id: 1,
    method: "getBundleStatuses",
    params: [[id]]
  };

  let res = await fetch(endpoint, {
    method: 'POST',
    body: JSON.stringify(payload),
    headers: {'Content-Type': 'application/json'}
  });

  let json = await res.json();
  if (json.error) {
    throw new Error(json.error.message);
  }

  return json
}

export async function getTipAccounts(): Promise<string> {
  let endpoint = 'https://mainnet.block-engine.jito.wtf/api/v1/bundles';

  let payload = {
    jsonrpc: "2.0",
    id: 1,
    method: "getTipAccounts",
    params: []
  };

  let res = await fetch(endpoint, {
    method: 'POST',
    body: JSON.stringify(payload),
    headers: {'Content-Type': 'application/json'}
  });

  let json = await res.json();
  if (json.error) {
    throw new Error(json.error.message);
  }

  // returns an Array of Bundler Tip Addresses
  return json.result[0];
}

export async function sendTxUsingJito(serializedTxs: (Uint8Array | Buffer | number[])[]): Promise<string> {
  let endpoint = 'https://mainnet.block-engine.jito.wtf/api/v1/bundles';

  console.log(serializedTxs.map(t => bs58.encode(t)));
  let payload = {
    jsonrpc: "2.0",
    id: 1,
    method: "sendBundle",
    params: [serializedTxs.map(t => bs58.encode(t))]
  };

  let res = await fetch(endpoint, {
    method: 'POST',
    body: JSON.stringify(payload),
    headers: {'Content-Type': 'application/json'}
  });

  let json = await res.json();
  if (json.error) {
    throw new Error(json.error.message);
  }

  // return bundle ID
  return json.result;
}