/**
 * Approved brand gradients.
 *
 * Gradients are expressive brand assets, not default control fills. Normal
 * buttons use the solid `primary` token so hover/pressed/disabled/focus and
 * contrast behavior stays predictable.
 *
 * Source of truth: `docs/Dizkarte-Brand-Color-System.md` section 7.
 */

export type BrandGradient = {
  readonly id: string;
  readonly css: string;
  readonly stops: ReadonlyArray<{ color: string; position: number }>;
  readonly recommendedUse: string;
};

export const iconAuthenticPurple: BrandGradient = {
  id: "icon-authentic-purple",
  css: "linear-gradient(180deg, #6A23DC 0%, #6E20DF 52%, #7121E3 100%)",
  stops: [
    { color: "#6A23DC", position: 0 },
    { color: "#6E20DF", position: 52 },
    { color: "#7121E3", position: 100 },
  ],
  recommendedUse: "Splash, icon-adjacent hero, branded illustration",
};

export const deepBrandPurple: BrandGradient = {
  id: "deep-brand-purple",
  css: "linear-gradient(135deg, #42209D 0%, #6E20DF 58%, #7121E3 100%)",
  stops: [
    { color: "#42209D", position: 0 },
    { color: "#6E20DF", position: 58 },
    { color: "#7121E3", position: 100 },
  ],
  recommendedUse: "Onboarding/marketing hero",
};

export const rayAccent: BrandGradient = {
  id: "ray-accent",
  css: "linear-gradient(135deg, #FDBE17 0%, #FECE32 100%)",
  stops: [
    { color: "#FDBE17", position: 0 },
    { color: "#FECE32", position: 100 },
  ],
  recommendedUse: "Small decorative ray/opportunity accent",
};

export const brandGradients = {
  iconAuthenticPurple,
  deepBrandPurple,
  rayAccent,
} as const;

export type BrandGradientName = keyof typeof brandGradients;
