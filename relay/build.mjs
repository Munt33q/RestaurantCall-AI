import {build} from '../frontend/node_modules/esbuild/lib/main.js';
await build({entryPoints:['relay/index.ts'],bundle:true,platform:'node',target:'node24',format:'esm',outfile:'relay/dist/index.mjs',minify:false});
