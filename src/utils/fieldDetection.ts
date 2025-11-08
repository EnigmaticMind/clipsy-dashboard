// Field detection utility - identifies what type of field an input element represents
// Used for contextual bulk editing suggestions

export type FieldType = 
  | 'title'
  | 'description'
  | 'tags'
  | 'price'
  | 'quantity'
  | 'sku'
  | 'status'
  | 'unknown';

export interface FieldInfo {
  type: FieldType;
  fieldName: string; // CSV field name (e.g., 'Title', 'Price', 'Quantity')
  isVariationField: boolean; // Whether this is a variation-level field
  currentValue: string;
}

/**
 * Detect the field type from an HTML input element
 */
export function detectFieldType(element: HTMLElement): FieldInfo {
  const tagName = element.tagName.toLowerCase();
  const id = element.id?.toLowerCase() || '';
  const name = (element as HTMLInputElement).name?.toLowerCase() || '';
  const className = element.className?.toLowerCase() || '';
  const placeholder = (element as HTMLInputElement).placeholder?.toLowerCase() || '';
  const type = (element as HTMLInputElement).type?.toLowerCase() || '';
  const value = (element as HTMLInputElement).value || element.textContent || '';

  // Title field detection
  if (
    id.includes('title') ||
    name.includes('title') ||
    className.includes('title') ||
    placeholder.includes('title')
  ) {
    return {
      type: 'title',
      fieldName: 'Title',
      isVariationField: false,
      currentValue: value,
    };
  }

  // Description field detection
  if (
    id.includes('description') ||
    name.includes('description') ||
    className.includes('description') ||
    placeholder.includes('description') ||
    (tagName === 'textarea' && className.includes('rich-text'))
  ) {
    return {
      type: 'description',
      fieldName: 'Description',
      isVariationField: false,
      currentValue: value,
    };
  }

  // Tags field detection
  if (
    id.includes('tag') ||
    name.includes('tag') ||
    className.includes('tag') ||
    placeholder.includes('tag')
  ) {
    return {
      type: 'tags',
      fieldName: 'Tags',
      isVariationField: false,
      currentValue: value,
    };
  }

  // Price field detection
  if (
    id.includes('price') ||
    name.includes('price') ||
    className.includes('price') ||
    placeholder.includes('price') ||
    (type === 'number' && (id.includes('amount') || name.includes('amount'))) ||
    (type === 'text' && placeholder.includes('$'))
  ) {
    // Check if it's variation price or listing price
    const isVariationPrice = 
      id.includes('variation') ||
      name.includes('variation') ||
      className.includes('variation') ||
      className.includes('property') ||
      element.closest('[class*="variation"]') !== null;

    return {
      type: 'price',
      fieldName: isVariationPrice ? 'Variation Price' : 'Price',
      isVariationField: isVariationPrice,
      currentValue: value,
    };
  }

  // Quantity field detection
  if (
    id.includes('quantity') ||
    name.includes('quantity') ||
    className.includes('quantity') ||
    placeholder.includes('quantity') ||
    (type === 'number' && (id.includes('qty') || name.includes('qty')))
  ) {
    // Check if it's variation quantity or listing quantity
    const isVariationQuantity = 
      id.includes('variation') ||
      name.includes('variation') ||
      className.includes('variation') ||
      className.includes('property') ||
      element.closest('[class*="variation"]') !== null;

    return {
      type: 'quantity',
      fieldName: isVariationQuantity ? 'Variation Quantity' : 'Quantity',
      isVariationField: isVariationQuantity,
      currentValue: value,
    };
  }

  // SKU field detection
  if (
    id.includes('sku') ||
    name.includes('sku') ||
    className.includes('sku') ||
    placeholder.includes('sku')
  ) {
    const isVariationSKU = 
      id.includes('variation') ||
      name.includes('variation') ||
      className.includes('variation') ||
      element.closest('[class*="variation"]') !== null;

    return {
      type: 'sku',
      fieldName: isVariationSKU ? 'Variation SKU' : 'SKU (DELETE=delete listing)',
      isVariationField: isVariationSKU,
      currentValue: value,
    };
  }

  // Status field detection
  if (
    id.includes('status') ||
    name.includes('status') ||
    className.includes('status') ||
    (type === 'select' && (id.includes('state') || name.includes('state')))
  ) {
    return {
      type: 'status',
      fieldName: 'Status',
      isVariationField: false,
      currentValue: value,
    };
  }

  // Unknown field
  return {
    type: 'unknown',
    fieldName: 'Unknown',
    isVariationField: false,
    currentValue: value,
  };
}

