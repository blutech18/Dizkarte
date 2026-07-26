import type { AppEnvironment } from "@dizkarte/config";
import { LOCATION } from "@dizkarte/config";
import type { MapProvider, MediaSigner, PushProvider } from "../ports/providers.js";
import { assertSyntheticAllowed } from "./guard.js";
import { syntheticToken } from "./hash.js";

/** Deterministic synthetic map provider using offset/rounded coordinates. */
export class SyntheticMapProvider implements MapProvider {
  public readonly mode = "synthetic" as const;

  constructor(environment: AppEnvironment) {
    assertSyntheticAllowed(environment, "map");
  }

  async geocode(query: string): Promise<{ lat: number; lng: number } | null> {
    if (query.trim().length === 0) return null;
    // Deterministic pseudo-coordinate within Metro Manila-ish bounds.
    const seed = query.length;
    return {
      lat: this.approximateValue(14.5 + (seed % 10) / 100),
      lng: this.approximateValue(120.98 + (seed % 10) / 100),
    };
  }

  async reverseGeocode(lat: number, lng: number): Promise<{ address: string } | null> {
    return { address: `Synthetic address near ${lat.toFixed(3)}, ${lng.toFixed(3)}` };
  }

  approximate(lat: number, lng: number): { lat: number; lng: number } {
    return { lat: this.approximateValue(lat), lng: this.approximateValue(lng) };
  }

  distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
    // Haversine distance.
    const R = 6371;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return Math.round(2 * R * Math.asin(Math.sqrt(h)) * 100) / 100;
  }

  private approximateValue(value: number): number {
    const factor = 10 ** LOCATION.approximateDecimalPlaces;
    return Math.round(value * factor) / factor;
  }
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Deterministic synthetic push provider; records outcomes without sending. */
export class SyntheticPushProvider implements PushProvider {
  public readonly mode = "synthetic" as const;

  constructor(environment: AppEnvironment) {
    assertSyntheticAllowed(environment, "push");
  }

  async registerToken(): Promise<void> {
    // No-op in synthetic mode.
  }

  async send(): Promise<{ delivered: boolean; synthetic: boolean }> {
    // Deterministic success outcome, explicitly labeled synthetic.
    return { delivered: true, synthetic: true };
  }
}

/** Deterministic synthetic media signer producing clearly fake short-lived URLs. */
export class SyntheticMediaSigner implements MediaSigner {
  public readonly mode = "synthetic" as const;

  constructor(environment: AppEnvironment) {
    assertSyntheticAllowed(environment, "media");
  }

  async createSignedUrl(input: {
    bucket: string;
    path: string;
    expiresInSeconds: number;
  }): Promise<{ url: string; expiresAt: string; synthetic: boolean }> {
    const token = syntheticToken("synurl", input.bucket, input.path);
    const expiresAt = new Date(Date.now() + input.expiresInSeconds * 1000).toISOString();
    return {
      url: `https://synthetic.dizkarte.invalid/${input.bucket}/${input.path}?token=${token}`,
      expiresAt,
      synthetic: true,
    };
  }
}
