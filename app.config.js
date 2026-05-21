// Dynamic Expo config.
//
// Everything lives in app.json (read automatically and passed in as `config`).
// The only override here is android.googleServicesFile: the real
// google-services.json is gitignored and therefore NOT uploaded to EAS Build,
// so the FCM google-services Gradle plugin would fail with "file is missing".
// We inject it at build time via the GOOGLE_SERVICES_JSON file environment
// variable (created with `eas env:create --type file`). EAS resolves that env
// var to the on-builder file path. Locally (no env var) we fall back to the
// committed path in app.json so `expo start` keeps working.
module.exports = ({ config }) => {
  const googleServicesFile =
    process.env.GOOGLE_SERVICES_JSON || config.android?.googleServicesFile;

  return {
    ...config,
    android: {
      ...config.android,
      googleServicesFile,
    },
  };
};
