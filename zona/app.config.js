// Android resource names must match /^[a-z][a-z0-9_]*$/. The bundled
// ios-*.wav files are APNs-only, so Android builds omit them and use the
// system default sound instead.
const { existsSync } = require('node:fs');
const { dirname, resolve } = require('node:path');

module.exports = ({ config }) => {
  const localGoogleServices = resolve(dirname(require.resolve('./app.json')), 'google-services.json');
  const googleServicesFile = process.env.GOOGLE_SERVICES_JSON
    || (existsSync(localGoogleServices) ? localGoogleServices : undefined);

  const resolvedConfig = {
    ...config,
    android: {
      ...config.android,
      ...(googleServicesFile ? { googleServicesFile } : {}),
    },
  };

  if (process.env.EAS_BUILD_PLATFORM === 'android' || process.env.ZONA_ANDROID_NO_SOUND_ASSETS === '1') {
    resolvedConfig.plugins = resolvedConfig.plugins.map((plugin) =>
      Array.isArray(plugin) && plugin[0] === 'expo-notifications'
        ? [plugin[0], { ...plugin[1], sounds: [] }]
        : plugin,
    );
  }

  return resolvedConfig;
};
