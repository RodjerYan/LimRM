// src/utils/regionMap.ts
import { abkhazia } from '../../utils/region-data/abkhazia';
import { armenia } from '../../utils/region-data/armenia';
import { azerbaijan } from '../../utils/region-data/azerbaijan';
import { belarus } from '../../utils/region-data/belarus';
import { georgia } from '../../utils/region-data/georgia';
import { kazakhstan } from '../../utils/region-data/kazakhstan';
import { kyrgyzstan } from '../../utils/region-data/kyrgyzstan';
import { moldova } from '../../utils/region-data/moldova';
import { russia } from '../../utils/region-data/russia';
import { tajikistan } from '../../utils/region-data/tajikistan';
import { turkmenistan } from '../../utils/region-data/turkmenistan';
import { uzbekistan } from '../../utils/region-data/uzbekistan';

/**
 * A comprehensive map of cities, towns, and settlements across Russia and the CIS,
 * linking them to their respective region and providing a list of associated postal codes
 * and, critically, their geographic coordinates for map functionality.
 * This object is assembled from country-specific data files for better maintainability.
 */
export const REGION_BY_CITY_WITH_INDEXES: Record<string, { region: string; indexes: string[]; lat: number; lon: number; }> = {
  ...russia,
  ...abkhazia,
  ...armenia,
  ...azerbaijan,
  ...belarus,
  ...georgia,
  ...kazakhstan,
  ...kyrgyzstan,
  ...moldova,
  ...tajikistan,
  ...turkmenistan,
  ...uzbekistan,
};
