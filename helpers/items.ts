// helpers/items.ts
import { ethers } from "ethers";

const { keccak256 } = ethers;
const abiCoder = ethers.AbiCoder.defaultAbiCoder();

/**
 * Item type definition
 */
export type Item = {
  id: string;
  name: string;
  unitPrice: string;
  quantity: string;
};

/** Maximum allowed items in a single transaction */
export const MAX_ITEMS = 50;

/**
 * Ensure deterministic ordering and string types for each item.
 * Canonical format matches on-chain struct exactly.
 */
export function canonicalizeItems(items: Item[]): Item[] {
  return items.map((item) => ({
    id: String(item.id),
    name: String(item.name),
    unitPrice: String(item.unitPrice),
    quantity: String(item.quantity),
  }));
}

/**
 * Compute keccak256 hash compatible with on-chain ABI encoding:
 * tuple(string id,string name,string unitPrice,string quantity)[]
 */
export function computeItemsHash(items: Item[]): string {
  if (!Array.isArray(items)) {
    throw new Error("Items must be an array");
  }

  if (items.length === 0) {
    throw new Error("Items array cannot be empty");
  }

  if (items.length > MAX_ITEMS) {
    throw new Error(`Too many items. Maximum allowed: ${MAX_ITEMS}, provided: ${items.length}`);
  }

  const canonicalItems = canonicalizeItems(items);

  const encoded = abiCoder.encode(
    ["tuple(string id,string name,string unitPrice,string quantity)[]"],
    [canonicalItems]
  );

  return keccak256(encoded);
}

/**
 * Compute total amount as BigInt
 */
export function computeTotal(items: Item[]): bigint {
  const canonicalItems = canonicalizeItems(items);

  return canonicalItems.reduce((acc, item) => {
    const price = BigInt(item.unitPrice);
    const qty = BigInt(item.quantity);
    return acc + price * qty;
  }, BigInt(0));
}

/**
 * Validate items array for common issues
 */
export function validateItems(items: Item[]): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!Array.isArray(items)) {
    errors.push("Items must be an array");
    return { isValid: false, errors };
  }

  if (items.length === 0) {
    errors.push("Items array cannot be empty");
  }

  if (items.length > MAX_ITEMS) {
    errors.push(`Too many items. Maximum: ${MAX_ITEMS}, provided: ${items.length}`);
  }

  items.forEach((item, index) => {
    if (!item.id || typeof item.id !== "string") {
      errors.push(`Item ${index}: id must be a non-empty string`);
    }
    if (!item.name || typeof item.name !== "string") {
      errors.push(`Item ${index}: name must be a non-empty string`);
    }

    try {
      const price = BigInt(item.unitPrice);
      if (price <= 0n) errors.push(`Item ${index}: unitPrice must be positive`);
    } catch {
      errors.push(`Item ${index}: unitPrice must be a valid number string`);
    }

    try {
      const qty = BigInt(item.quantity);
      if (qty <= 0n) errors.push(`Item ${index}: quantity must be positive`);
    } catch {
      errors.push(`Item ${index}: quantity must be a valid number string`);
    }
  });

  return { isValid: errors.length === 0, errors };
}
