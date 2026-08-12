// examples/04-full-lifecycle-metamask.ts
// End-to-end browser flow: connect MetaMask, then walk an escrow through
// create → shipped → delivered via the LinknRed gasless relay, plus a
// buyer-signed cancel path (for escrows that are still in `created`).
//
// Targets a Vite/webpack app; adapt imports if you use webpack aliases.

import { BrowserProvider, Contract } from 'ethers'; // ethers v6
import {
  LinknRedClient,
  signCreateEscrow,
  signMarkShipped,
  signConfirmDelivery,
  computeItemsHash,
  toPriceArrays,
  type EscrowItem,
} from '@linknred/payments';

const CHAIN_ID = 1029; // BTTC Donau testnet
const CONTRACT = '0x1de88fB78A91eBF25c95982d4Ade7390E702Ab34';
const NATIVE_BTT = '0x0000000000000000000000000000000000000000';

const NONCE_ABI = ['function gaslessNonces(address) view returns (uint256)'];

async function getGaslessNonce(provider: BrowserProvider, actor: string): Promise<bigint> {
  const c = new Contract(CONTRACT, NONCE_ABI, provider);
  return (await c.gaslessNonces(actor)) as bigint;
}

// -------------------------------------------------------------------
// BUYER — create + fund escrow (EIP-712, gas paid by LinknRed relayer)
// -------------------------------------------------------------------
export async function createAsBuyer(params: {
  seller: string;
  items: EscrowItem[];
  token?: string;         // defaults to native BTT
  orderVendorId: string;  // used as idempotencyKey
}) {
  const provider = new BrowserProvider((window as any).ethereum);
  await provider.send('eth_requestAccounts', []);
  const signer = await provider.getSigner();
  const buyer = await signer.getAddress();

  const itemsHash = computeItemsHash(params.items);
  const { unitPrices, quantities } = toPriceArrays(params.items);
  const nonce = await getGaslessNonce(provider, buyer);

  const signed = await signCreateEscrow(signer, {
    chainId: CHAIN_ID,
    verifyingContract: CONTRACT,
    seller: params.seller,
    token: params.token ?? NATIVE_BTT,
    unitPrices,
    quantities,
    itemsHash,
    nonce,
    deadline: Math.floor(Date.now() / 1000) + 3600,
    metadata: JSON.stringify({ orderVendorId: params.orderVendorId }),
  });

  const client = new LinknRedClient({ apiKey: import.meta.env.VITE_LINKNRED_API_KEY });
  const res = await client.gasless.relay(
    { action: 'create', ...signed },
    { idempotencyKey: `create-${params.orderVendorId}` },
  );
  console.log('escrow created:', res);
  return res;
}

// -------------------------------------------------------------------
// SELLER — mark shipped (usually run from the backend with a KMS signer)
// -------------------------------------------------------------------
export async function shipAsSeller(orderVendorId: string, escrowId: number) {
  const provider = new BrowserProvider((window as any).ethereum);
  await provider.send('eth_requestAccounts', []);
  const signer = await provider.getSigner();
  const seller = await signer.getAddress();
  const nonce = await getGaslessNonce(provider, seller);

  const signed = await signMarkShipped(signer, {
    chainId: CHAIN_ID,
    verifyingContract: CONTRACT,
    escrowId,
    nonce,
    deadline: Math.floor(Date.now() / 1000) + 3600,
  });

  const client = new LinknRedClient({ apiKey: import.meta.env.VITE_LINKNRED_API_KEY });
  const res = await client.gasless.relay(
    { action: 'markShipped', ...signed },
    { idempotencyKey: `ship-${orderVendorId}` },
  );
  console.log('shipped:', res);
}

// -------------------------------------------------------------------
// BUYER — confirm delivery
// -------------------------------------------------------------------
export async function confirmAsBuyer(orderVendorId: string, escrowId: number) {
  const provider = new BrowserProvider((window as any).ethereum);
  await provider.send('eth_requestAccounts', []);
  const signer = await provider.getSigner();
  const buyer = await signer.getAddress();
  const nonce = await getGaslessNonce(provider, buyer);

  const signed = await signConfirmDelivery(signer, {
    chainId: CHAIN_ID,
    verifyingContract: CONTRACT,
    escrowId,
    nonce,
    deadline: Math.floor(Date.now() / 1000) + 3600,
  });

  const client = new LinknRedClient({ apiKey: import.meta.env.VITE_LINKNRED_API_KEY });
  const res = await client.gasless.relay(
    { action: 'confirmDelivery', ...signed },
    { idempotencyKey: `confirm-${orderVendorId}` },
  );
  console.log('delivered:', res);
}

// -------------------------------------------------------------------
// BUYER — cancel while still in `created` (buyer pays gas in V4.3)
// -------------------------------------------------------------------
export async function cancelAsBuyer(orderVendorId: string, escrowId: number) {
  const provider = new BrowserProvider((window as any).ethereum);
  await provider.send('eth_requestAccounts', []);
  const signer = await provider.getSigner();

  const client = new LinknRedClient({ apiKey: import.meta.env.VITE_LINKNRED_API_KEY });
  const res = await client.escrows.cancelOnChain({
    orderVendorId,
    buyerWallet: (await signer.getAddress()).toLowerCase(),
    escrowId,
    verifyingContract: CONTRACT,
    signer,
    reason: 'buyer requested',
  });
  console.log('cancel tx:', res.txHash, res.status);
}
