// The client's source maps, kept out of the image and uploaded per tenant at deploy (MVP-3 phase 2).
//
//   node scripts/sourcemaps.mjs keep     after `vite build`: moves every map from dist to sourcemaps/,
//                                        so no map is ever served
//   node scripts/sourcemaps.mjs upload   uploads sourcemaps/ to New Relic against PUBLIC_ORIGIN; run once
//                                        per tenant. Without New Relic keys it uploads nothing.
//
import { mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import sourcemaps from '@newrelic/publish-sourcemap';

const dist = 'dist';
const kept = 'sourcemaps';
const mapsIn = (dir) =>
  readdirSync(dir, { recursive: true, encoding: 'utf8' }).filter((file) =>
    file.endsWith('.js.map'),
  );

const command = process.argv[2];
if (command === 'keep') {
  rmSync(kept, { recursive: true, force: true });
  const maps = mapsIn(dist);
  for (const file of maps) {
    mkdirSync(dirname(join(kept, file)), { recursive: true });
    renameSync(join(dist, file), join(kept, file));
  }
  console.log(`sourcemaps: kept ${maps.length} maps in ${kept}/, none in ${dist}/`);
} else if (command === 'upload') {
  const base = process.env.PUBLIC_ORIGIN ?? 'http://localhost:3000';
  const apiKey = process.env.NEW_RELIC_USER_API_KEY;
  const applicationId = process.env.NEW_RELIC_BROWSER_APP_ID;
  const maps = mapsIn(kept);
  if (!apiKey || !applicationId) {
    console.log(`sourcemaps: no New Relic keys, ${maps.length} maps not uploaded`);
    process.exit(0);
  }
  const publish = promisify(sourcemaps.publishSourcemap);
  for (const file of maps) {
    const javascriptUrl = `${base}/${file.slice(0, -'.map'.length)}`;
    try {
      await publish({ sourcemapPath: join(kept, file), javascriptUrl, applicationId, apiKey });
      console.log(`sourcemaps: uploaded ${javascriptUrl}`);
    } catch (error) {
      // Hashed names change with content, so this exact file's map is already in New Relic.
      if (error.message === 'Conflict')
        console.log(`sourcemaps: already uploaded ${javascriptUrl}`);
      else console.warn(`sourcemaps: upload failed for ${javascriptUrl}: ${error.message}`);
    }
  }
} else {
  console.error('Usage: node scripts/sourcemaps.mjs keep|upload');
  process.exit(1);
}
