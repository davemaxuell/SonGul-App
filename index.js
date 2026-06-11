// Native entry. Native links Skia directly, so it just boots the app. The web
// entry (index.web.js) additionally preloads Skia/CanvasKit first. Metro resolves
// the platform-specific file automatically because package.json "main" is "index".
import "expo-router/entry";
