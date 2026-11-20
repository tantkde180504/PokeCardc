// Intentionally vulnerable scanner fixtures. Use only on the ACVIS test branch.
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const downloads = fileURLToPath(new URL('./assets/downloads/', import.meta.url));

export async function readReviewDocument(filename) {
  // CWE-22: untrusted path can escape downloads; proof file contains only a marker.
  return readFile(resolve(downloads, filename));
}

export function reviewAccess(password) {
  // CWE-798: synthetic credential, deliberately embedded for scanner evaluation.
  const adminPassword = 'ACVIS_fixture_798_X7k9Q2m4R8v6N3p5';
  return password === adminPassword;
}
