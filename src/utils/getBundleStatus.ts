import { BLOCKENGINE_URL } from "./endpoints"

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
    let endpoint = `https://${BLOCKENGINE_URL}/api/v1/bundles`;

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