// Bulk edit service - generates CSV files with bulk changes applied
// Used for contextual bulk editing from the side panel

import { fetchListings, getShopID, type Listing, type ListingsResponse, type ListingStatus } from './etsyApi';
import { convertListingsToCSV } from './csvService';
import { getValidAccessToken } from './oauth';
import type { FieldType } from '../utils/fieldDetection';

export interface BulkEditOperation {
  fieldType: FieldType;
  operation: string; // e.g., 'add_prefix', 'increase_price_percent', 'set_quantity'
  parameters: Record<string, unknown>; // Operation-specific parameters
  filter?: {
    status?: ListingStatus[]; // Filter by listing status
    minPrice?: number;
    maxPrice?: number;
    hasVariations?: boolean;
  };
}

/**
 * Apply a bulk edit operation to listings and generate a CSV
 */
export async function generateBulkEditCSV(
  operation: BulkEditOperation,
  onProgress?: (message: string, current?: number, total?: number) => void
): Promise<string> {
  onProgress?.('Authenticating...');
  await getValidAccessToken();

  onProgress?.('Getting shop information...');
  const shopID = await getShopID();

  onProgress?.('Fetching listings...');
  const listings = await fetchListings(shopID, undefined, (current, total) => {
    onProgress?.(`Fetching listings... ${current}/${total}`, current, total);
  });

  // Apply filters if specified
  let filteredListings = listings.results;
  if (operation.filter) {
    filteredListings = listings.results.filter(listing => {
      if (operation.filter?.status && !operation.filter.status.includes(listing.state)) {
        return false;
      }
      if (operation.filter?.minPrice || operation.filter?.maxPrice) {
        const price = listing.price?.amount ? listing.price.amount / listing.price.divisor : 0;
        if (operation.filter.minPrice && price < operation.filter.minPrice) return false;
        if (operation.filter.maxPrice && price > operation.filter.maxPrice) return false;
      }
      if (operation.filter?.hasVariations !== undefined) {
        const hasVariations = listing.inventory.products.length > 1;
        if (operation.filter.hasVariations !== hasVariations) return false;
      }
      return true;
    });
  }

  onProgress?.(`Applying bulk edit to ${filteredListings.length} listings...`);

  // Apply the bulk edit operation to each listing
  const modifiedListings = filteredListings.map(listing => {
    return applyBulkEditToListing(listing, operation);
  });

  // Convert modified listings to CSV format
  onProgress?.('Generating CSV...');
  const modifiedListingsResponse: ListingsResponse = {
    count: modifiedListings.length,
    results: modifiedListings,
  };

  const csvContent = convertListingsToCSV(modifiedListingsResponse);
  return csvContent;
}

/**
 * Apply a bulk edit operation to a single listing
 */
function applyBulkEditToListing(
  listing: Listing,
  operation: BulkEditOperation
): Listing {
  const modified = { ...listing };

  switch (operation.fieldType) {
    case 'title':
      if (operation.operation === 'add_prefix' && operation.parameters.prefix) {
        modified.title = `${operation.parameters.prefix} ${listing.title}`;
      } else if (operation.operation === 'add_suffix' && operation.parameters.suffix) {
        modified.title = `${listing.title} ${operation.parameters.suffix}`;
      } else if (operation.operation === 'replace_text' && operation.parameters.find && operation.parameters.replace) {
        modified.title = listing.title.replace(
          new RegExp(String(operation.parameters.find), 'gi'),
          String(operation.parameters.replace)
        );
      } else if (operation.operation === 'capitalize') {
        modified.title = listing.title
          .split(' ')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
          .join(' ');
      }
      break;

    case 'description':
      if (operation.operation === 'add_prefix' && operation.parameters.prefix) {
        modified.description = `${operation.parameters.prefix}\n\n${listing.description}`;
      } else if (operation.operation === 'add_suffix' && operation.parameters.suffix) {
        modified.description = `${listing.description}\n\n${operation.parameters.suffix}`;
      } else if (operation.operation === 'replace_text' && operation.parameters.find && operation.parameters.replace) {
        modified.description = listing.description.replace(
          new RegExp(String(operation.parameters.find), 'gi'),
          String(operation.parameters.replace)
        );
      }
      break;

    case 'tags':
      if (operation.operation === 'add_tags' && operation.parameters.tags) {
        const tagsToAdd = Array.isArray(operation.parameters.tags)
          ? operation.parameters.tags
          : String(operation.parameters.tags).split(',').map(t => t.trim());
        const existingTags = listing.tags || [];
        const newTags = [...existingTags];
        tagsToAdd.forEach(tag => {
          if (!newTags.includes(tag) && newTags.length < 13) {
            newTags.push(tag);
          }
        });
        modified.tags = newTags.slice(0, 13); // Etsy max is 13
      } else if (operation.operation === 'remove_tags' && operation.parameters.tags) {
        const tagsToRemove = Array.isArray(operation.parameters.tags)
          ? operation.parameters.tags
          : String(operation.parameters.tags).split(',').map(t => t.trim());
        modified.tags = (listing.tags || []).filter(tag => !tagsToRemove.includes(tag));
      } else if (operation.operation === 'replace_tags' && operation.parameters.tags) {
        const newTags = Array.isArray(operation.parameters.tags)
          ? operation.parameters.tags
          : String(operation.parameters.tags).split(',').map(t => t.trim());
        modified.tags = newTags.slice(0, 13);
      }
      break;

    case 'price':
      if (operation.operation === 'increase_percent' && operation.parameters.percent) {
        const percent = Number(operation.parameters.percent);
        if (listing.price) {
          const newAmount = Math.round(listing.price.amount * (1 + percent / 100));
          modified.price = {
            ...listing.price,
            amount: newAmount,
          };
        }
        // Also update variation prices if they exist
        if (listing.inventory.products) {
          modified.inventory = {
            ...listing.inventory,
            products: listing.inventory.products.map(product => {
              if (product.offerings && product.offerings.length > 0) {
                const offering = product.offerings[0];
                if (offering.price) {
                  const newAmount = Math.round(offering.price.amount * (1 + percent / 100));
                  return {
                    ...product,
                    offerings: [{
                      ...offering,
                      price: {
                        ...offering.price,
                        amount: newAmount,
                      },
                    }],
                  };
                }
              }
              return product;
            }),
          };
        }
      } else if (operation.operation === 'decrease_percent' && operation.parameters.percent) {
        const percent = Number(operation.parameters.percent);
        if (listing.price) {
          const newAmount = Math.round(listing.price.amount * (1 - percent / 100));
          modified.price = {
            ...listing.price,
            amount: Math.max(1, newAmount), // Ensure price is at least 1
          };
        }
        // Also update variation prices
        if (listing.inventory.products) {
          modified.inventory = {
            ...listing.inventory,
            products: listing.inventory.products.map(product => {
              if (product.offerings && product.offerings.length > 0) {
                const offering = product.offerings[0];
                if (offering.price) {
                  const newAmount = Math.round(offering.price.amount * (1 - percent / 100));
                  return {
                    ...product,
                    offerings: [{
                      ...offering,
                      price: {
                        ...offering.price,
                        amount: Math.max(1, newAmount),
                      },
                    }],
                  };
                }
              }
              return product;
            }),
          };
        }
      } else if (operation.operation === 'set_price' && operation.parameters.price) {
        const newPrice = Number(operation.parameters.price);
        if (listing.price) {
          modified.price = {
            ...listing.price,
            amount: Math.round(newPrice * listing.price.divisor),
          };
        }
      } else if (operation.operation === 'round_to_nearest' && operation.parameters.nearest) {
        const nearest = Number(operation.parameters.nearest);
        if (listing.price) {
          const currentPrice = listing.price.amount / listing.price.divisor;
          const rounded = Math.round(currentPrice / nearest) * nearest;
          modified.price = {
            ...listing.price,
            amount: Math.round(rounded * listing.price.divisor),
          };
        }
      }
      break;

    case 'quantity':
      if (operation.operation === 'set_quantity' && operation.parameters.quantity !== undefined) {
        const newQuantity = Number(operation.parameters.quantity);
        modified.quantity = newQuantity;
        // Also update variation quantities if they exist
        if (listing.inventory.products) {
          modified.inventory = {
            ...listing.inventory,
            products: listing.inventory.products.map(product => {
              if (product.offerings && product.offerings.length > 0) {
                return {
                  ...product,
                  offerings: product.offerings.map(offering => ({
                    ...offering,
                    quantity: newQuantity,
                  })),
                };
              }
              return product;
            }),
          };
        }
      } else if (operation.operation === 'increase_by' && operation.parameters.amount) {
        const amount = Number(operation.parameters.amount);
        modified.quantity = (listing.quantity || 0) + amount;
        if (listing.inventory.products) {
          modified.inventory = {
            ...listing.inventory,
            products: listing.inventory.products.map(product => {
              if (product.offerings && product.offerings.length > 0) {
                return {
                  ...product,
                  offerings: product.offerings.map(offering => ({
                    ...offering,
                    quantity: (offering.quantity || 0) + amount,
                  })),
                };
              }
              return product;
            }),
          };
        }
      } else if (operation.operation === 'decrease_by' && operation.parameters.amount) {
        const amount = Number(operation.parameters.amount);
        modified.quantity = Math.max(0, (listing.quantity || 0) - amount);
        if (listing.inventory.products) {
          modified.inventory = {
            ...listing.inventory,
            products: listing.inventory.products.map(product => {
              if (product.offerings && product.offerings.length > 0) {
                return {
                  ...product,
                  offerings: product.offerings.map(offering => ({
                    ...offering,
                    quantity: Math.max(0, (offering.quantity || 0) - amount),
                  })),
                };
              }
              return product;
            }),
          };
        }
      }
      break;

    case 'status':
      if (operation.operation === 'set_status' && operation.parameters.status) {
        const statusValue = String(operation.parameters.status);
        // Validate it's a valid ListingStatus
        const validStatuses: ListingStatus[] = ['active', 'inactive', 'draft', 'sold_out', 'expired'];
        if (validStatuses.includes(statusValue as ListingStatus)) {
          modified.state = statusValue as ListingStatus;
        }
      }
      break;
  }

  return modified;
}

/**
 * Create a File object from CSV content
 */
export function createCSVFile(csvContent: string, filename: string = 'bulk-edit.csv'): File {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  return new File([blob], filename, { type: 'text/csv' });
}

