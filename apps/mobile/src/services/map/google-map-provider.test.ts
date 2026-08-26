import { beforeEach, describe, expect, it } from "vitest";
import { GoogleMapProvider } from "./google-map-provider";
import { getMapProvider, __resetMapProviderForTests } from "./factory";
import { __resetAppConfigForTests } from "../../lib/config";

describe("GoogleMapProvider & factory", () => {
  beforeEach(() => {
    __resetMapProviderForTests();
    __resetAppConfigForTests();
  });

  it("calculates distance correctly using Haversine formula", () => {
    const provider = new GoogleMapProvider("dummy-key");
    const distance = provider.distanceKm(
      { lat: 14.5995, lng: 120.9842 },
      { lat: 14.676, lng: 121.0437 },
    );
    expect(distance).toBeGreaterThan(9);
    expect(distance).toBeLessThan(12);
  });

  it("returns coarse approximate coordinates to preserve user privacy", () => {
    const provider = new GoogleMapProvider("dummy-key");
    const approx = provider.approximate(14.5995123, 120.9842456);
    expect(approx.lat).toBe(14.6);
    expect(approx.lng).toBe(120.984);
  });

  it("returns GoogleMapProvider from factory when mapPublicKey is configured", () => {
    process.env.EXPO_PUBLIC_MAP_PUBLIC_KEY = "AIzaSyTestKey";
    const provider = getMapProvider();
    expect(provider).not.toBeNull();
    expect(provider?.mode).toBe("live");
  });
});
