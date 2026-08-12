/**
 * LinknRed Gasless Checkout SDK Helpers
 *
 * Provides standardized EIP-712 signing utilities for gasless escrow creation
 * and lifecycle actions (markShipped, confirmDelivery, openDispute, withdrawResolved).
 * Compatible with ethers v6.
 */

import { ethers } from "ethers";

const NONCE_ABI = ['function gaslessNonces(address) view returns (uint256)'];

export const EIP712_TYPES = {
  CreateEscrow: [
    { name: 'buyer', type: 'address' },
    { name: 'seller', type: 'address' },
    { name: 'token', type: 'address' },
    { name: 'itemsHash', type: 'bytes32' },
    { name: 'totalAmount', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
};

// V4.3: Lifecycle EIP-712 types
export const LIFECYCLE_TYPES = {
  MarkShipped: [
    { name: 'seller', type: 'address' },
    { name: 'escrowId', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
  ConfirmDelivery: [
    { name: 'buyer', type: 'address' },
    { name: 'escrowId', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
  OpenDispute: [
    { name: 'opener', type: 'address' },
    { name: 'escrowId', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
  WithdrawResolved: [
    { name: 'claimant', type: 'address' },
    { name: 'escrowId', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
};

/**
 * Build EIP-712 domain for LinknRed gasless checkout
 */
export function buildEIP712Domain(chainId: number, proxyAddress: string) {
  return {
    name: 'LinknRed Gasless Checkout',
    version: '1',
    chainId,
    verifyingContract: proxyAddress,
  };
}

/**
 * Fetch the current gasless nonce for a user from the contract
 */
export async function getGaslessNonce(
  provider: ethers.Provider,
  proxyAddress: string,
  userAddress: string
): Promise<bigint> {
  const contract = new ethers.Contract(proxyAddress, NONCE_ABI, provider);
  return contract.gaslessNonces(userAddress);
}

export interface GaslessOrderParams {
  seller: string;
  token: string;
  unitPrices: string[];
  quantities: string[];
  itemsHash: string;
  deadline: number; // Unix timestamp
}

export interface SignedGaslessOrder {
  buyer: string;
  seller: string;
  token: string;
  unitPrices: string[];
  quantities: string[];
  itemsHash: string;
  metadata: string;
  totalAmount: string;
  nonce: string;
  deadline: string;
  signature: string;
  permitData: string;
}

/**
 * Sign a gasless order using EIP-712.
 * Automatically fetches the nonce from the contract.
 */
export async function signGaslessOrder(
  signer: ethers.Signer,
  provider: ethers.Provider,
  chainId: number,
  proxyAddress: string,
  params: GaslessOrderParams
): Promise<SignedGaslessOrder> {
  const buyer = await signer.getAddress();

  // Fetch nonce
  const nonce = await getGaslessNonce(provider, proxyAddress, buyer);

  // Compute total
  const totalAmount = params.unitPrices.reduce(
    (acc, p, i) => acc + BigInt(p) * BigInt(params.quantities[i]),
    0n
  );

  const domain = buildEIP712Domain(chainId, proxyAddress);

  const message = {
    buyer,
    seller: params.seller,
    token: params.token,
    itemsHash: params.itemsHash,
    totalAmount: totalAmount.toString(),
    nonce: nonce.toString(),
    deadline: params.deadline.toString(),
  };

  const signature = await (signer as ethers.Wallet).signTypedData(domain, EIP712_TYPES, message);

  return {
    buyer,
    seller: params.seller,
    token: params.token,
    unitPrices: params.unitPrices,
    quantities: params.quantities,
    itemsHash: params.itemsHash,
    metadata: '{}',
    totalAmount: totalAmount.toString(),
    nonce: nonce.toString(),
    deadline: params.deadline.toString(),
    signature,
    permitData: '0x',
  };
}

// ============================================================
// V4.3: LIFECYCLE SIGNING HELPERS
// ============================================================

export interface SignedLifecycleAction {
  action: string;
  escrowId: string;
  actor: string;
  nonce: string;
  deadline: string;
  signature: string;
}

/**
 * Sign a markShipped action (seller signs)
 */
export async function signMarkShipped(
  signer: ethers.Signer,
  provider: ethers.Provider,
  chainId: number,
  proxyAddress: string,
  escrowId: number | string,
  deadline: number
): Promise<SignedLifecycleAction> {
  const seller = await signer.getAddress();
  const nonce = await getGaslessNonce(provider, proxyAddress, seller);
  const domain = buildEIP712Domain(chainId, proxyAddress);

  const message = {
    seller,
    escrowId: escrowId.toString(),
    nonce: nonce.toString(),
    deadline: deadline.toString(),
  };

  const signature = await (signer as ethers.Wallet).signTypedData(
    domain, { MarkShipped: LIFECYCLE_TYPES.MarkShipped }, message
  );

  return {
    action: 'markShipped',
    escrowId: escrowId.toString(),
    actor: seller,
    nonce: nonce.toString(),
    deadline: deadline.toString(),
    signature,
  };
}

/**
 * Sign a confirmDelivery action (buyer signs)
 */
export async function signConfirmDelivery(
  signer: ethers.Signer,
  provider: ethers.Provider,
  chainId: number,
  proxyAddress: string,
  escrowId: number | string,
  deadline: number
): Promise<SignedLifecycleAction> {
  const buyer = await signer.getAddress();
  const nonce = await getGaslessNonce(provider, proxyAddress, buyer);
  const domain = buildEIP712Domain(chainId, proxyAddress);

  const message = {
    buyer,
    escrowId: escrowId.toString(),
    nonce: nonce.toString(),
    deadline: deadline.toString(),
  };

  const signature = await (signer as ethers.Wallet).signTypedData(
    domain, { ConfirmDelivery: LIFECYCLE_TYPES.ConfirmDelivery }, message
  );

  return {
    action: 'confirmDelivery',
    escrowId: escrowId.toString(),
    actor: buyer,
    nonce: nonce.toString(),
    deadline: deadline.toString(),
    signature,
  };
}

/**
 * Sign an openDispute action (buyer or seller signs)
 */
export async function signOpenDispute(
  signer: ethers.Signer,
  provider: ethers.Provider,
  chainId: number,
  proxyAddress: string,
  escrowId: number | string,
  deadline: number
): Promise<SignedLifecycleAction> {
  const opener = await signer.getAddress();
  const nonce = await getGaslessNonce(provider, proxyAddress, opener);
  const domain = buildEIP712Domain(chainId, proxyAddress);

  const message = {
    opener,
    escrowId: escrowId.toString(),
    nonce: nonce.toString(),
    deadline: deadline.toString(),
  };

  const signature = await (signer as ethers.Wallet).signTypedData(
    domain, { OpenDispute: LIFECYCLE_TYPES.OpenDispute }, message
  );

  return {
    action: 'openDispute',
    escrowId: escrowId.toString(),
    actor: opener,
    nonce: nonce.toString(),
    deadline: deadline.toString(),
    signature,
  };
}

/**
 * Sign a withdrawResolved action (claimant signs)
 */
export async function signWithdrawResolved(
  signer: ethers.Signer,
  provider: ethers.Provider,
  chainId: number,
  proxyAddress: string,
  escrowId: number | string,
  deadline: number
): Promise<SignedLifecycleAction> {
  const claimant = await signer.getAddress();
  const nonce = await getGaslessNonce(provider, proxyAddress, claimant);
  const domain = buildEIP712Domain(chainId, proxyAddress);

  const message = {
    claimant,
    escrowId: escrowId.toString(),
    nonce: nonce.toString(),
    deadline: deadline.toString(),
  };

  const signature = await (signer as ethers.Wallet).signTypedData(
    domain, { WithdrawResolved: LIFECYCLE_TYPES.WithdrawResolved }, message
  );

  return {
    action: 'withdrawResolved',
    escrowId: escrowId.toString(),
    actor: claimant,
    nonce: nonce.toString(),
    deadline: deadline.toString(),
    signature,
  };
}
