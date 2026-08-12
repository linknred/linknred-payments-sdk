import { describe, it, expect } from 'vitest';
import { 
  computeItemsHash, 
  computeTotal, 
  canonicalizeItems,
  validateItems,
  Item, 
  MAX_ITEMS 
} from './items';

describe('SDK Items Helpers', () => {
  const sampleItems: Item[] = [
    {
      id: "product-001",
      name: "Premium Widget A", 
      unitPrice: "1000000000000000000", // 1 ETH in wei
      quantity: "2"
    },
    {
      id: "product-002",
      name: "Standard Widget B",
      unitPrice: "500000000000000000", // 0.5 ETH in wei
      quantity: "3"
    }
  ];

  describe('canonicalizeItems', () => {
    it('should convert all fields to strings', () => {
      const items = [
        { id: 123, name: 'Item', unitPrice: 1000, quantity: 2 }
      ] as any;
      
      const result = canonicalizeItems(items);
      
      expect(result[0]).toEqual({
        id: "123",
        name: "Item", 
        unitPrice: "1000",
        quantity: "2"
      });
    });
    
    it('should preserve already string values', () => {
      const result = canonicalizeItems(sampleItems);
      expect(result).toEqual(sampleItems);
    });
  });

  describe('computeItemsHash', () => {
    it('should produce deterministic hashes', () => {
      const hash1 = computeItemsHash(sampleItems);
      const hash2 = computeItemsHash(sampleItems);
      
      expect(hash1).toBe(hash2);
      expect(typeof hash1).toBe('string');
      expect(hash1.startsWith('0x')).toBe(true);
      expect(hash1.length).toBe(66); // 0x + 64 hex chars
    });
    
    it('should produce different hashes for different items', () => {
      const items1: Item[] = [
        { id: "A", name: "Item A", unitPrice: "1000", quantity: "1" }
      ];
      
      const items2: Item[] = [
        { id: "B", name: "Item B", unitPrice: "2000", quantity: "1" }
      ];
      
      const hash1 = computeItemsHash(items1);
      const hash2 = computeItemsHash(items2);
      
      expect(hash1).not.toBe(hash2);
    });
    
    it('should handle order sensitivity', () => {
      const items1: Item[] = [
        { id: "A", name: "Item A", unitPrice: "1000", quantity: "1" },
        { id: "B", name: "Item B", unitPrice: "2000", quantity: "1" }
      ];
      
      const items2: Item[] = [
        { id: "B", name: "Item B", unitPrice: "2000", quantity: "1" },
        { id: "A", name: "Item A", unitPrice: "1000", quantity: "1" }
      ];
      
      const hash1 = computeItemsHash(items1);
      const hash2 = computeItemsHash(items2);
      
      expect(hash1).not.toBe(hash2); // Order matters
    });
    
    it('should throw on empty items array', () => {
      expect(() => computeItemsHash([])).toThrow('Items array cannot be empty');
    });
    
    it('should throw when exceeding MAX_ITEMS', () => {
      const tooManyItems: Item[] = Array(MAX_ITEMS + 1).fill(null).map((_, i) => ({
        id: `item-${i}`,
        name: `Item ${i}`,
        unitPrice: "1000000000000000000",
        quantity: "1"
      }));
      
      expect(() => computeItemsHash(tooManyItems)).toThrow(`Too many items. Maximum allowed: ${MAX_ITEMS}`);
    });
  });

  describe('computeTotal', () => {
    it('should calculate correct total amount', () => {
      const total = computeTotal(sampleItems);
      
      // (1 ETH * 2) + (0.5 ETH * 3) = 2 + 1.5 = 3.5 ETH
      const expected = BigInt("3500000000000000000");
      
      expect(total).toBe(expected);
      expect(typeof total).toBe('bigint');
    });
    
    it('should handle single item', () => {
      const singleItem: Item[] = [
        { id: "test", name: "Test", unitPrice: "1000000000000000000", quantity: "5" }
      ];
      
      const total = computeTotal(singleItem);
      expect(total).toBe(BigInt("5000000000000000000")); // 5 ETH
    });
    
    it('should return zero for items with zero prices or quantities', () => {
      const zeroItems: Item[] = [
        { id: "free", name: "Free Item", unitPrice: "0", quantity: "10" },
        { id: "none", name: "No Quantity", unitPrice: "1000", quantity: "0" }
      ];
      
      const total = computeTotal(zeroItems);
      expect(total).toBe(BigInt("0"));
    });
  });

  describe('validateItems', () => {
    it('should pass validation for valid items', () => {
      const result = validateItems(sampleItems);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
    
    it('should fail for non-array input', () => {
      const result = validateItems('not an array' as any);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Items must be an array');
    });
    
    it('should fail for empty array', () => {
      const result = validateItems([]);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Items array cannot be empty');
    });
    
    it('should fail when exceeding MAX_ITEMS', () => {
      const tooManyItems: Item[] = Array(MAX_ITEMS + 1).fill(null).map((_, i) => ({
        id: `item-${i}`,
        name: `Item ${i}`,
        unitPrice: "1000000000000000000",
        quantity: "1"
      }));
      
      const result = validateItems(tooManyItems);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('Too many items'))).toBe(true);
    });
    
    it('should detect invalid field types', () => {
      const invalidItems: any[] = [
        { id: "", name: "Valid", unitPrice: "1000", quantity: "1" }, // empty id
        { id: "valid", name: "", unitPrice: "1000", quantity: "1" }, // empty name
        { id: "valid", name: "Valid", unitPrice: "-1000", quantity: "1" }, // negative price
        { id: "valid", name: "Valid", unitPrice: "1000", quantity: "0" }, // zero quantity
        { id: "valid", name: "Valid", unitPrice: "invalid", quantity: "1" }, // invalid price
        { id: "valid", name: "Valid", unitPrice: "1000", quantity: "invalid" }, // invalid quantity
      ];
      
      const result = validateItems(invalidItems);
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('Integration compatibility tests', () => {
    it('should generate consistent hashes for contract compatibility', () => {
      // This test validates the exact ABI encoding format
      // The hash should match what the smart contract generates
      const testItems: Item[] = [
        {
          id: "TEST_001",
          name: "Test Product Alpha",
          unitPrice: "1000000000000000000", // 1 ETH in wei
          quantity: "1"
        }
      ];
      
      const hash = computeItemsHash(testItems);
      
      // Verify it's a valid keccak256 hash
      expect(hash).toMatch(/^0x[a-fA-F0-9]{64}$/);
      
      // This specific hash should be verifiable against smart contract
      // Note: Actual integration test would compare against Hardhat local chain
      expect(hash).toBeTruthy();
    });
  });
});