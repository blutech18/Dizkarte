import type { MapProvider, PlaceSuggestion } from "@dizkarte/domain";
import type { AdapterMode } from "@dizkarte/config";
import { LOCATION } from "@dizkarte/config";

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Real Google Maps provider using Google Geocoding REST API & Haversine distance calculations.
 */
export class GoogleMapProvider implements MapProvider {
  public readonly mode: AdapterMode = "live";

  constructor(private readonly apiKey: string) {}

  async geocode(query: string): Promise<{ lat: number; lng: number } | null> {
    if (!query.trim()) return null;
    try {
      const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
        query.trim(),
      )}&key=${encodeURIComponent(this.apiKey)}`;
      const response = await fetch(url);
      if (!response.ok) return null;
      const data = (await response.json()) as {
        status: string;
        results?: Array<{ geometry?: { location?: { lat: number; lng: number } } }>;
      };
      if (data.status === "OK" && data.results?.[0]?.geometry?.location) {
        const { lat, lng } = data.results[0].geometry.location;
        return { lat, lng };
      }
      return null;
    } catch {
      return null;
    }
  }

  async reverseGeocode(lat: number, lng: number): Promise<{ address: string } | null> {
    try {
      const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${encodeURIComponent(
        this.apiKey,
      )}`;
      const response = await fetch(url);
      if (!response.ok) return null;
      const data = (await response.json()) as {
        status: string;
        results?: Array<{ formatted_address?: string }>;
      };
      if (data.status === "OK" && data.results?.[0]?.formatted_address) {
        return { address: data.results[0].formatted_address };
      }
      return null;
    } catch {
      return null;
    }
  }

  async searchPlaces(query: string): Promise<ReadonlyArray<PlaceSuggestion>> {
    const trimmed = query.trim();
    if (trimmed.length === 0) return [];
    try {
      const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
        trimmed,
      )}&key=${encodeURIComponent(this.apiKey)}`;
      const response = await fetch(url);
      if (!response.ok) return [];
      const data = (await response.json()) as {
        status: string;
        results?: Array<{
          formatted_address?: string;
          geometry?: { location?: { lat: number; lng: number } };
        }>;
      };
      if (data.status !== "OK" || !Array.isArray(data.results)) return [];
      return data.results
        .slice(0, 6)
        .map((r) => {
          const loc = r.geometry?.location;
          if (
            !r.formatted_address ||
            !loc ||
            !Number.isFinite(loc.lat) ||
            !Number.isFinite(loc.lng)
          ) {
            return null;
          }
          return { description: r.formatted_address, lat: loc.lat, lng: loc.lng };
        })
        .filter((s): s is PlaceSuggestion => s !== null);
    } catch {
      return [];
    }
  }

  approximate(lat: number, lng: number): { lat: number; lng: number } {
    const factor = 10 ** LOCATION.approximateDecimalPlaces;
    return {
      lat: Math.round(lat * factor) / factor,
      lng: Math.round(lng * factor) / factor,
    };
  }

  distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
    const R = 6371;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return Math.round(2 * R * Math.asin(Math.sqrt(h)) * 100) / 100;
  }
}
