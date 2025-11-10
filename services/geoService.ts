// services/geoService.ts

// This file is intentionally left blank.
// The geocoding functionality that used the external Nominatim API has been removed
// to radically improve the performance of file processing. The application now
// relies exclusively on the coordinates provided within the OKB file, using a
// fast in-memory index for lookups. This eliminates network latency and rate-limiting
// as the primary bottleneck.
export {};
