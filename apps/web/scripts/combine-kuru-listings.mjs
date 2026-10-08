import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { KURU_LISTINGS_SCHEMA, parseKuruListings } from '../server/kuru-collection.mjs';

// Joins verified single-market listings into the value of FLURBO_KURU_LISTING_JSON.
// Every input must be a verified_kuru_snapshot; duplicates and more than 8 markets are refused.
export function combineKuruListings(listings) {
  if (!Array.isArray(listings) || listings.some(listing => listing?.status !== 'verified_kuru_snapshot'))
    throw Error('Every Kuru listing must be a verified_kuru_snapshot.');
  const combined = { schema: KURU_LISTINGS_SCHEMA, listings };
  parseKuruListings(combined);
  return combined;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const files = process.argv.slice(2);
  if (!files.length) {
    process.stderr.write('Usage: node combine-kuru-listings.mjs <verified1.json> [<verified2.json> ...]\n');
    process.exitCode = 2;
  } else {
    try {
      process.stdout.write(JSON.stringify(combineKuruListings(files.map(file => JSON.parse(readFileSync(file, 'utf8'))))) + '\n');
    } catch (error) {
      process.stderr.write((error instanceof Error ? error.message : 'Could not combine Kuru listings') + '\n');
      process.exitCode = 1;
    }
  }
}
