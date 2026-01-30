
// utils/regionMap.ts
import { abkhazia } from './region-data/abkhazia';
import { armenia } from './region-data/armenia';
import { azerbaijan } from './region-data/azerbaijan';
import { belarus } from './region-data/belarus';
import { georgia } from './region-data/georgia';
import { kazakhstan } from './region-data/kazakhstan';
import { kyrgyzstan } from './region-data/kyrgyzstan';
import { moldova } from './region-data/moldova';
import { russia } from './region-data/russia';
import { tajikistan } from './region-data/tajikistan';
import { turkmenistan } from './region-data/turkmenistan';
import { uzbekistan } from './region-data/uzbekistan';
import { transnistria } from './region-data/transnistria';
import { south_ossetia } from './region-data/south_ossetia';
import { ukraine } from './region-data/ukraine';

/**
 * A comprehensive map of cities, towns, and settlements across Russia and the CIS,
 * linking them to their respective region and providing a list of associated postal codes
 * and, critically, their geographic coordinates for map functionality.
 * This object is assembled from country-specific data files for better maintainability.
 */
export const REGION_BY_CITY_WITH_INDEXES: Record<string, { region: string; indexes: string[]; lat: number; lon: number; }> = {
  ...russia,
  ...armenia,
  ...azerbaijan,
  ...belarus,
  ...georgia,
  ...kazakhstan,
  ...kyrgyzstan,
  ...moldova, // Loaded first
  ...transnistria, // Overwrites Moldova cities if duplicates exist (e.g. Tiraspol)
  ...tajikistan,
  ...turkmenistan,
  ...uzbekistan,
  ...abkhazia,
  ...south_ossetia,
  ...ukraine,
};
