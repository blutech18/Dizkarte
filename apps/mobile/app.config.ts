import type { ConfigContext, ExpoConfig } from "expo/config";

/**
 * Dynamic Expo config.
 *
 * Takes the static `app.json` as the base and only injects the native Android
 * Google Maps SDK key (used by `react-native-maps` to render the map on
 * Android) from the environment. Keeping it here — rather than in the
 * git-tracked `app.json` — means the key lives in the git-ignored `.env.local`
 * and is never committed.
 *
 * Scope:
 *  - iOS renders with Apple Maps and needs no key.
 *  - Android needs the key, and it only takes effect in a dev/production build
 *    (`expo run:android` / EAS). Expo Go ignores custom native config and uses
 *    its own bundled Maps key, so this has no effect there.
 *  - For EAS builds, provide GOOGLE_MAPS_ANDROID_KEY as an EAS env var/secret;
 *    `.env.local` is git-ignored and not uploaded to EAS.
 */
export default ({ config }: ConfigContext): ExpoConfig => {
  const googleMapsApiKey = process.env.GOOGLE_MAPS_ANDROID_KEY;

  return {
    ...config,
    // `name`/`slug` are required on ExpoConfig; app.json provides them, but the
    // incoming type is partial, so assert sensible fallbacks for the type.
    name: config.name ?? "Dizkarte",
    slug: config.slug ?? "dizkarte",
    android: {
      ...config.android,
      ...(googleMapsApiKey
        ? {
            config: {
              ...config.android?.config,
              googleMaps: { apiKey: googleMapsApiKey },
            },
          }
        : {}),
    },
  };
};
