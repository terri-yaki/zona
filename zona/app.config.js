// Dynamic Expo config. Android resource names must match /^[a-z][a-z0-9_]*$/,
// and the expo-notifications plugin asserts that for every bundled sound —
// our ios-*.wav basenames are iOS-only (APNs plays them by name, and the
// Android client falls back to the default notification sound regardless), so
// Android builds strip the sounds list instead of failing prebuild.
const appJson = require('./app.json');

module.exports = () => {
  const config = { ...appJson };
  if (process.env.ZONA_ANDROID_NO_SOUND_ASSETS === '1') {
    config.expo = {
      ...config.expo,
      plugins: config.expo.plugins.map((plugin) =>
        Array.isArray(plugin) && plugin[0] === 'expo-notifications'
          ? [plugin[0], { ...plugin[1], sounds: [] }]
          : plugin,
      ),
    };
  }
  return config;
};
