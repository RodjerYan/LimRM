// utils/addressMappings.ts
import { regionCenters } from './regionCenters';

export const normalizeRegion = (input: string): string => {
  if (!input) return '';
  let normalized = input.trim();

  normalized = normalized.replace(/\bобл\.?/gi, 'область')
                       .replace(/\bресп\.?/gi, 'Республика')
                       .replace(/\bр-н\b/gi, 'район');

  const parts = normalized.split(' ');
  if (parts.length === 2 && parts[0].toLowerCase() === 'область') {
      normalized = `${parts[1]} ${parts[0]}`;
  }

  return normalized.split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
};

// The base regionCenters map is exported from its own file now for clarity
// but this file can still be a central point for address-related utilities.
export { regionCenters };
