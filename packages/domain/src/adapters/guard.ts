import type { AppEnvironment } from "@dizkarte/config";
import { DomainError } from "../errors.js";

/**
 * Synthetic adapters cannot run in production (core invariant 9). Every
 * synthetic adapter calls this guard at construction time so a synthetic
 * implementation can never be instantiated in a production environment.
 */
export function assertSyntheticAllowed(environment: AppEnvironment, adapter: string): void {
  if (environment === "production") {
    throw new DomainError(
      "CONFIGURATION_ERROR",
      `Synthetic ${adapter} adapter cannot run in production.`,
    );
  }
}

/** Marker mixed into every synthetic result so callers can label the UI. */
export const SYNTHETIC = true as const;
