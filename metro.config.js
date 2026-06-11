// Learn more: https://docs.expo.dev/guides/customizing-metro/
const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// expo-sqlite ships a WebAssembly engine (wa-sqlite) for web. Metro does not
// treat `.wasm` as a resolvable asset by default, so register the extension or
// `expo-sqlite/web/worker.ts` fails to bundle. See SDK 56 expo-sqlite docs.
config.resolver.assetExts.push('wasm');

// The web SQLite engine relies on SharedArrayBuffer, which the browser only
// exposes in a cross-origin-isolated context. Send COOP/COEP on every dev-server
// response so the worker can spin up locally. (For production/EAS Hosting these
// same headers are configured on the expo-router plugin instead.)
config.server.enhanceMiddleware = (middleware) => {
  return (req, res, next) => {
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
    middleware(req, res, next);
  };
};

module.exports = config;
