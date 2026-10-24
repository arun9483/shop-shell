// Uploads every source map in dist to New Relic against its file's public URL, then deletes it so
// no map is ever served. Without New Relic keys the maps are only deleted.
import { readdirSync, rmSync } from 'node:fs';
import { join, relative } from 'node:path';
import { promisify } from 'node:util';
import sourcemaps from '@newrelic/publish-sourcemap';

const dist = 'dist';
const origin = process.env.PUBLIC_ORIGIN ?? 'http://localhost:3000';
const apiKey = process.env.NEW_RELIC_USER_API_KEY;
const applicationId = process.env.VITE_NEW_RELIC_APPLICATION_ID;
const publish = promisify(sourcemaps.publishSourcemap);

const maps = readdirSync(dist, { recursive: true, encoding: 'utf8' })
  .filter((file) => file.endsWith('.js.map'))
  .map((file) => join(dist, file));

if (!apiKey || !applicationId) {
  console.log(`sourcemaps: no New Relic keys, deleting ${maps.length} maps without upload`);
}

for (const map of maps) {
  if (apiKey && applicationId) {
    const javascriptUrl = `${origin}/${relative(dist, map).slice(0, -'.map'.length)}`;
    try {
      await publish({ sourcemapPath: map, javascriptUrl, applicationId, apiKey });
      console.log(`sourcemaps: uploaded ${javascriptUrl}`);
    } catch (error) {
      // A failed upload (for example, placeholder keys) must not ship the map, so it is still deleted.
      console.warn(`sourcemaps: upload failed for ${javascriptUrl}: ${error.message}`);
    }
  }
  rmSync(map);
}
