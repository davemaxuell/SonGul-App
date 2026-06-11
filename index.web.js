// Web entry. CanvasKit must be initialized before any module that imports Skia
// evaluates, because @shopify/react-native-skia's skia/Skia.web.js binds
// global.CanvasKit into its singleton at import time. A STATIC import keeps
// LoadSkiaWeb in the main bundle (no async chunk — a dynamic import() here splits
// into a separate chunk that can fail to load and leave a white screen). Once
// CanvasKit is ready we require the Expo Router app. The wasm is served from
// /canvaskit.wasm (copied into public/ by `setup-skia-web`).
import { LoadSkiaWeb } from "@shopify/react-native-skia/lib/commonjs/web";

const startApp = () => require("expo-router/entry");

LoadSkiaWeb({ locateFile: (file) => `/${file}` }).then(startApp, (error) => {
  // Never leave a blank screen: if CanvasKit fails to load, boot the app anyway
  // (Skia surfaces will error individually instead of the whole app white-screening).
  console.error("[web entry] CanvasKit failed to load:", error);
  startApp();
});
