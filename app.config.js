// Dynamic Expo config.
//
// Everything lives in app.json (read automatically and passed in as `config`).
// The only override here is android.googleServicesFile: the real
// google-services.json is gitignored and therefore NOT uploaded to EAS Build,
// so the FCM google-services Gradle plugin would fail with "file is missing".
// We inject it at build time via the GOOGLE_SERVICES_JSON file environment
// variable (created with `eas env:create --type file`). EAS resolves that env
// var to the on-builder file path. Locally, we use the path from app.json only
// if the file actually exists — otherwise we omit the key so the build skips FCM.
const fs = require('fs');

module.exports = ({ config }) => {
  const envFile = process.env.GOOGLE_SERVICES_JSON;
  const localFile = config.android?.googleServicesFile;

  // Prefer EAS env var; fall back to local file only if it exists on disk.
  // If neither is available, omit googleServicesFile so Expo skips the FCM plugin.
  const googleServicesFile = envFile
    || (localFile && fs.existsSync(localFile) ? localFile : undefined);

  // Destructure to remove the original googleServicesFile from the spread,
  // then conditionally re-add only if resolved above.
  const { googleServicesFile: _orig, ...restAndroid } = config.android || {};

  return {
    ...config,
    android: {
      ...restAndroid,
      ...(googleServicesFile ? { googleServicesFile } : {}),
    },
  };
};
