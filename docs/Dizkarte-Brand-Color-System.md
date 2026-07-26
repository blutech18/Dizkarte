# Dizkarte Brand Color System

**Document type:** Brand-derived application color specification  
**Version:** 1.0  
**Prepared:** 20 July 2026  
**Applies to:** Dizkarte mobile application, admin dashboard, public assets, and product documentation

## 1. Purpose

This document converts the supplied Dizkarte logo assets into a consistent, accessible application color system:

- `D:\Clients\Dizkarte\app-icon-logo.png`
- `D:\Clients\Dizkarte\text-icon-logo.png`

The source logos remain unchanged. The scales and semantic tokens below are derived UI colors intended to preserve the brand while supporting forms, dashboards, maps, financial states, messaging, accessibility, light mode, and dark mode.

## 2. Verified source colors

The following anchors were sampled directly from high-opacity pixels in the supplied PNG files. Small variations exist because of gradients and antialiasing.

| Source role     | Canonical value | Observed source range/use                                                       |
| --------------- | --------------: | ------------------------------------------------------------------------------- |
| Icon purple     |       `#6E20DF` | Dominant app-icon purple; sampled gradient approximately `#6A23DC` to `#7121E3` |
| Wordmark violet |       `#42209D` | Purple `K`; observed approximately `#411C8B` to `#43239F`                       |
| Icon yellow     |       `#FECE32` | Yellow rays on the app icon                                                     |
| Wordmark amber  |       `#FDBE17` | Yellow/amber rays on the wordmark                                               |
| Wordmark navy   |       `#030815` | Primary wordmark lettering and canonical dark ink                               |
| Logo white      |       `#FEFEFE` | Stylized `D`; normalized to `#FFFFFF` for UI tokens                             |

### Brand interpretation

- **Purple** represents action, resourcefulness, energy, and the marketplace’s digital identity.
- **Navy** represents trust, financial seriousness, safety, and readable information.
- **Yellow/amber** represents opportunity, attention, momentum, and the logo’s “bright idea” rays.
- **White/lavender neutrals** keep the product approachable and prevent the vivid brand colors from overwhelming task-heavy screens.

## 3. Usage balance

Use an approximate **70/20/10 balance**:

- **70% neutrals:** backgrounds, surfaces, forms, cards, tables, and readable content
- **20% purple:** navigation state, primary actions, links, selection, and branded emphasis
- **10% yellow and semantic colors:** highlights, opportunity cues, pending states, badges, and feedback

Yellow is an accent, not the default page background or primary action color. Data-heavy admin pages should use even more neutral space.

## 4. Core brand palettes

### 4.1 Purple scale

The `500` and `700` values come directly from the icon and wordmark. Other values are derived interaction and surface steps.

| Token          |           Hex | Intended use                          |
| -------------- | ------------: | ------------------------------------- |
| Purple 50      |     `#F7F2FF` | Brand-tinted page section             |
| Purple 100     |     `#EDE3FF` | Selected/soft state                   |
| Purple 200     |     `#DCC7FF` | Disabled decorative purple            |
| Purple 300     |     `#C39CFF` | Dark-theme links and highlights       |
| Purple 400     |     `#9D63F4` | Illustration/supporting accent        |
| **Purple 500** | **`#6E20DF`** | Canonical primary action              |
| Purple 600     |     `#5B18C2` | Hover and accessible link             |
| **Purple 700** | **`#42209D`** | Pressed/strong state; wordmark violet |
| Purple 800     |     `#321773` | Deep branded surface/content          |
| Purple 900     |     `#220F4F` | Very dark violet                      |
| Purple 950     |     `#15072F` | Darkest purple tint                   |

### 4.2 Yellow/amber scale

Both source yellows are preserved: icon yellow is the bright highlight; wordmark amber is the primary solid accent.

| Token          |           Hex | Intended use                    |
| -------------- | ------------: | ------------------------------- |
| Yellow 50      |     `#FFF9E6` | Accent-tinted background        |
| Yellow 100     |     `#FFF1B8` | Soft badge/background           |
| Yellow 200     |     `#FFE47A` | Decorative highlight            |
| Yellow 300     |     `#FFD64A` | Illustration and chart accent   |
| **Yellow 400** | **`#FECE32`** | Icon-derived highlight          |
| **Yellow 500** | **`#FDBE17`** | Wordmark-derived solid accent   |
| Yellow 600     |     `#D99A00` | Accent hover/darker chart value |
| Yellow 700     |     `#A96F00` | Strong amber label              |
| Yellow 800     |     `#794B00` | Dark amber content              |
| Yellow 900     |     `#4D2D00` | Darkest amber content           |

### 4.3 Navy/neutral scale

| Token           |           Hex | Intended use                        |
| --------------- | ------------: | ----------------------------------- |
| Neutral 0       |     `#FFFFFF` | Main light surface                  |
| Neutral 50      |     `#F6F7FA` | Secondary canvas                    |
| Neutral 100     |     `#ECEEF3` | Disabled/subtle fill                |
| Neutral 200     |     `#D9DEE7` | Divider/supporting border           |
| Neutral 300     |     `#B7C0CE` | Inactive decoration                 |
| Neutral 400     |     `#8793A7` | Disabled text/icons only            |
| Neutral 500     |     `#596274` | Secondary body text                 |
| Neutral 600     |     `#3D4658` | Strong secondary text               |
| Neutral 700     |     `#242D40` | Subheading/dark surface text        |
| Neutral 800     |     `#111929` | Elevated dark surface               |
| **Neutral 900** | **`#030815`** | Canonical text/navy and dark canvas |
| Neutral 950     |     `#01030A` | Deepest overlay/shadow              |

## 5. Semantic theme tokens

Application code should consume semantic tokens instead of hard-coding palette steps. A component should request `primary`, `surface`, or `textSecondary`, not `purple500` unless it is explicitly rendering a brand illustration.

### 5.1 Light theme

| Semantic token       |                  Value | Use                                             |
| -------------------- | ---------------------: | ----------------------------------------------- |
| `background`         |              `#F8F7FC` | Main application canvas                         |
| `surface`            |              `#FFFFFF` | Cards, sheets, dialogs, forms                   |
| `surfaceElevated`    |              `#FFFFFF` | Elevated dialog/menu surface with shadow        |
| `surfaceSubtle`      |              `#F4F0FB` | Grouped sections and alternating regions        |
| `surfaceBrand`       |              `#F7F2FF` | Branded onboarding/selection region             |
| `surfaceAccent`      |              `#FFF9E6` | Opportunity/pending highlight                   |
| `logoSurface`        |              `#FFFFFF` | Guaranteed safe plate for the supplied wordmark |
| `textPrimary`        |              `#030815` | Headings and normal body text                   |
| `textSecondary`      |              `#596274` | Supporting body text and metadata               |
| `textInverse`        |              `#FFFFFF` | Text on accessible dark fills                   |
| `primary`            |              `#6E20DF` | Primary CTA and selected navigation             |
| `primaryHover`       |              `#5B18C2` | Pointer/hover state                             |
| `primaryPressed`     |              `#42209D` | Pressed/active state                            |
| `primarySoft`        |              `#EDE3FF` | Selected row, chip, or icon background          |
| `onPrimary`          |              `#FFFFFF` | Primary-button text/icon                        |
| `accent`             |              `#FDBE17` | Solid brand accent                              |
| `accentHighlight`    |              `#FECE32` | Bright logo-derived highlight                   |
| `accentSoft`         |              `#FFF1B8` | Soft badge or opportunity callout               |
| `onAccent`           |              `#030815` | Required text/icon color on yellow              |
| `link`               |              `#5B18C2` | Accessible inline link                          |
| `borderSubtle`       |              `#E5DEEF` | Decorative divider; not sole control boundary   |
| `borderControl`      |              `#8B7C9E` | Inputs and interactive control boundary         |
| `focusRing`          |              `#6E20DF` | Keyboard/accessibility focus indicator          |
| `disabledBackground` |              `#ECEEF3` | Disabled control fill                           |
| `disabledForeground` |              `#8793A7` | Disabled label/icon only                        |
| `overlay`            | `rgba(3, 8, 21, 0.56)` | Modal/sheet scrim                               |
| `shadow`             | `rgba(3, 8, 21, 0.12)` | Elevation shadow                                |

### 5.2 Dark theme

Dark mode uses the wordmark navy as the canvas and introduces slightly violet surfaces. The supplied dark wordmark must not be placed directly on these backgrounds. Until a separately approved inverse asset exists, render the supplied wordmark on the solid white `logoSurface` or use the app icon by itself.

| Semantic token       |                  Value | Use                                       |
| -------------------- | ---------------------: | ----------------------------------------- |
| `background`         |              `#030815` | Main dark canvas; source navy             |
| `surface`            |              `#0D1424` | Cards, sheets, forms                      |
| `surfaceElevated`    |              `#17142B` | Dialog/elevated region                    |
| `surfaceSubtle`      |              `#111929` | Grouped sections and alternating regions  |
| `surfaceBrand`       |              `#2A174A` | Soft branded selection                    |
| `surfaceAccent`      |              `#3B300C` | Opportunity/pending highlight             |
| `logoSurface`        |              `#FFFFFF` | Safe plate for the supplied dark wordmark |
| `textPrimary`        |              `#F9F7FF` | Headings and body text                    |
| `textSecondary`      |              `#B8B3C7` | Supporting text                           |
| `textInverse`        |              `#030815` | Text on light/yellow fills                |
| `primary`            |              `#7B35E8` | Dark-theme primary CTA                    |
| `primaryHover`       |              `#8947EC` | Hover state with accessible white text    |
| `primaryPressed`     |              `#6E20DF` | Pressed state                             |
| `primarySoft`        |              `#2A174A` | Selected row/chip background              |
| `onPrimary`          |              `#FFFFFF` | Primary-button text/icon                  |
| `accent`             |              `#FECE32` | High-visibility accent                    |
| `accentHighlight`    |              `#FECE32` | Bright logo-derived highlight             |
| `accentSoft`         |              `#3B300C` | Dark accent-tinted surface                |
| `onAccent`           |              `#030815` | Required text/icon on yellow              |
| `link`               |              `#C39CFF` | Dark-theme link                           |
| `borderSubtle`       |              `#312A45` | Decorative divider                        |
| `borderControl`      |              `#6B5E7C` | Input/control outline                     |
| `focusRing`          |              `#FDBE17` | High-visibility focus indicator           |
| `disabledBackground` |              `#1F2433` | Disabled fill                             |
| `disabledForeground` |              `#7F8494` | Disabled label/icon                       |
| `overlay`            | `rgba(1, 3, 10, 0.72)` | Modal/sheet scrim                         |
| `shadow`             |  `rgba(0, 0, 0, 0.40)` | Elevation shadow                          |

Dark mode is implementation-ready but does not become contractual scope merely because tokens are documented.

## 6. Feedback and operational colors

Semantic feedback colors are intentionally distinct from the brand palette. Never use only color to communicate status; pair it with a label, icon, and accessible text.

### 6.1 Light feedback tokens

| State       |     Solid | Soft background | Text on soft background | Typical use                             |
| ----------- | --------: | --------------: | ----------------------: | --------------------------------------- |
| Success     | `#137A50` |       `#E9F8F1` |               `#0F6B46` | Completed, released, available          |
| Warning     | `#8A5A00` |       `#FFF5D6` |               `#6B4500` | Pending, processing, review needed      |
| Error       | `#B4233B` |       `#FDECEF` |               `#9F1833` | Failed, rejected, disputed, destructive |
| Information | `#1D4ED8` |       `#EAF0FF` |               `#173EA6` | Booked, protected funds, informational  |

White text is permitted on the listed solid colors. Use the listed darker text on soft backgrounds.

### 6.2 Dark feedback tokens

| State       | Solid fill | Soft background | Text/icon on soft background | Typical use                             |
| ----------- | ---------: | --------------: | ---------------------------: | --------------------------------------- |
| Success     |  `#137A50` |       `#0E2B22` |                    `#65D6A1` | Completed, released, available          |
| Warning     |  `#8A5A00` |       `#312509` |                    `#FFD64A` | Pending, processing, review needed      |
| Error       |  `#B4233B` |       `#35121C` |                    `#FF8CA0` | Failed, rejected, disputed, destructive |
| Information |  `#1D4ED8` |       `#102145` |                    `#8DB6FF` | Booked, protected funds, informational  |

Use white text on the listed solid fills. Use the listed bright foreground only on its matching soft background.

## 7. Brand gradients

Gradients are expressive brand assets, not default control fills.

| Gradient              | Definition                                                       | Recommended use                                  |
| --------------------- | ---------------------------------------------------------------- | ------------------------------------------------ |
| Icon-authentic purple | `linear-gradient(180deg, #6A23DC 0%, #6E20DF 52%, #7121E3 100%)` | Splash, icon-adjacent hero, branded illustration |
| Deep brand purple     | `linear-gradient(135deg, #42209D 0%, #6E20DF 58%, #7121E3 100%)` | Onboarding/marketing hero                        |
| Ray accent            | `linear-gradient(135deg, #FDBE17 0%, #FECE32 100%)`              | Small decorative ray/opportunity accent          |

Use solid `primary` for normal buttons so hover, pressed, loading, disabled, focus, and contrast behaviour remains predictable. Do not put long text over a gradient without testing the full gradient area.

## 8. Component mapping

| Component/role         | Color rule                                                                                           |
| ---------------------- | ---------------------------------------------------------------------------------------------------- |
| Primary button         | `primary` fill + `onPrimary`; hover/pressed tokens as defined                                        |
| Secondary button       | `surface` fill + `borderControl`; use `primary` label in light mode and `link` label in dark mode    |
| Tertiary/text button   | Transparent + `link` label in both themes; dark `primary` is a fill, not a normal-size text color    |
| Accent button/callout  | `accent` or `accentHighlight` + `onAccent`; reserve for opportunity/promotion, not every main action |
| Destructive button     | Theme `errorSolid` (`#B4233B`) + white, with explicit destructive label                              |
| Active bottom-tab item | Purple icon/label; inactive uses secondary neutral                                                   |
| Selected chip/filter   | `primarySoft` background + Purple 700 text in light mode                                             |
| Input default          | `surface`, `textPrimary`, and `borderControl`                                                        |
| Input focus            | `focusRing` plus persistent label; do not indicate focus by color alone                              |
| Card                   | `surface`; subtle border/shadow only where grouping requires it                                      |
| Task budget            | Navy text with optional small yellow accent; yellow must not reduce readability                      |
| Verification badge     | Purple soft/primary for verified identity; icon and “Verified” label required                        |
| Notification badge     | Error for urgent unread count; yellow for non-urgent opportunity highlight                           |
| Map task pin           | Purple as default; selected pin may use yellow with navy center/icon                                 |
| Admin table            | Neutral surfaces; semantic colors only in labeled status chips                                       |

## 9. Marketplace and financial status mapping

| Domain status                        | Recommended treatment                                                            |
| ------------------------------------ | -------------------------------------------------------------------------------- |
| Open/available task                  | Purple soft chip with Purple 700 label                                           |
| Offer pending                        | Warning soft chip with explicit “Pending” label                                  |
| Booking confirmed                    | Information soft chip with explicit “Confirmed” label                            |
| In progress                          | Purple primary/soft treatment with progress icon                                 |
| Completion requested                 | Warning treatment                                                                |
| Completed                            | Success treatment                                                                |
| Payment protected/pending release    | Information treatment; do not imply legal escrow solely through color or wording |
| Earnings available                   | Success treatment                                                                |
| Withdrawal processing                | Warning treatment                                                                |
| Refunded                             | Information or neutral treatment according to context                            |
| Verification rejected/payment failed | Error treatment                                                                  |
| Disputed/frozen                      | Error treatment plus clear restriction text                                      |
| Cancelled/expired                    | Neutral 500/100 treatment                                                        |

Charts and map legends must add labels, patterns, icons, or direct values; never depend on purple/yellow/red/green distinction alone.

## 10. Accessibility rules

### 10.1 Verified contrast pairs

| Foreground/background |    Contrast | Guidance                                                   |
| --------------------- | ----------: | ---------------------------------------------------------- |
| `#6E20DF` / `#FFFFFF` |  **7.15:1** | Source purple as text on white, or white on primary button |
| `#42209D` / `#FFFFFF` | **10.91:1** | Strong purple/pressed state                                |
| `#FDBE17` / `#030815` | **11.96:1** | Navy text on wordmark amber                                |
| `#FECE32` / `#030815` | **13.43:1** | Navy text on icon yellow                                   |
| `#030815` / `#FFFFFF` | **20.01:1** | Primary light-theme content                                |
| `#596274` / `#FFFFFF` |  **6.13:1** | Secondary body text                                        |
| `#7B35E8` / `#FFFFFF` |  **5.97:1** | Dark-theme primary button with white text                  |
| `#C39CFF` / `#0D1424` |  **8.33:1** | Dark secondary/tertiary button label on surface            |
| `#B4233B` / `#FFFFFF` |  **6.47:1** | White text on destructive solid fill                       |
| `#8B7C9E` / `#FFFFFF` |  **3.84:1** | Light interactive-control boundary                         |
| `#6B5E7C` / `#030815` |  **3.35:1** | Dark interactive-control boundary                          |

### 10.2 Mandatory rules

- Normal text should meet at least **4.5:1**; large text and meaningful UI boundaries should meet at least **3:1**.
- Use **navy**, never white, for text/icons on yellow or amber.
- In dark mode, use `link` (`#C39CFF`) for normal-size purple labels; reserve `primary` (`#7B35E8`) for filled controls and large graphical emphasis.
- Purple 50–400 and Yellow 50–300 are not automatically safe with white text.
- `borderSubtle` is decorative. Inputs and actionable boundaries use `borderControl` or another tested 3:1 boundary.
- Focus must remain visible and should include shape/outline, not only a color shift.
- Error, success, warning, verification, and payment status require words/icons in addition to color.
- Disabled colors must not be used for active information.
- Test actual components after font weight, opacity, overlays, gradients, and device rendering are applied.

## 11. Logo placement rules relevant to color

- Keep the supplied app-icon artwork in its original source colors.
- Use the current navy wordmark only on white or sufficiently light neutral/lavender surfaces.
- Until an approved inverse wordmark exists, place the supplied wordmark on a solid `#FFFFFF` logo plate or use the app icon alone on dark surfaces.
- If an inverse wordmark is later produced, approve and store it as a separate source asset; do not recolor the supplied PNG at runtime.
- Do not place the logo over busy photography or uncontrolled gradients.
- Do not replace the yellow rays with semantic warning/error colors.
- Preserve clear space around the rays and letterforms so accent colors remain visible.

## 12. Implementation token example

React Native and Next.js should consume the same stable semantic contract. Every theme must provide every key, even where two keys intentionally share a value.

```ts
export type ThemeColors = {
  background: string;
  surface: string;
  surfaceElevated: string;
  surfaceSubtle: string;
  surfaceBrand: string;
  surfaceAccent: string;
  logoSurface: string;
  textPrimary: string;
  textSecondary: string;
  textInverse: string;
  primary: string;
  primaryHover: string;
  primaryPressed: string;
  primarySoft: string;
  onPrimary: string;
  accent: string;
  accentHighlight: string;
  accentSoft: string;
  onAccent: string;
  link: string;
  borderSubtle: string;
  borderControl: string;
  focusRing: string;
  disabledBackground: string;
  disabledForeground: string;
  overlay: string;
  shadow: string;
  successSolid: string;
  successSoft: string;
  successOnSoft: string;
  warningSolid: string;
  warningSoft: string;
  warningOnSoft: string;
  errorSolid: string;
  errorSoft: string;
  errorOnSoft: string;
  infoSolid: string;
  infoSoft: string;
  infoOnSoft: string;
};

export const lightTheme = {
  background: "#F8F7FC",
  surface: "#FFFFFF",
  surfaceElevated: "#FFFFFF",
  surfaceSubtle: "#F4F0FB",
  surfaceBrand: "#F7F2FF",
  surfaceAccent: "#FFF9E6",
  logoSurface: "#FFFFFF",
  textPrimary: "#030815",
  textSecondary: "#596274",
  textInverse: "#FFFFFF",
  primary: "#6E20DF",
  primaryHover: "#5B18C2",
  primaryPressed: "#42209D",
  primarySoft: "#EDE3FF",
  onPrimary: "#FFFFFF",
  accent: "#FDBE17",
  accentHighlight: "#FECE32",
  accentSoft: "#FFF1B8",
  onAccent: "#030815",
  link: "#5B18C2",
  borderSubtle: "#E5DEEF",
  borderControl: "#8B7C9E",
  focusRing: "#6E20DF",
  disabledBackground: "#ECEEF3",
  disabledForeground: "#8793A7",
  overlay: "rgba(3, 8, 21, 0.56)",
  shadow: "rgba(3, 8, 21, 0.12)",
  successSolid: "#137A50",
  successSoft: "#E9F8F1",
  successOnSoft: "#0F6B46",
  warningSolid: "#8A5A00",
  warningSoft: "#FFF5D6",
  warningOnSoft: "#6B4500",
  errorSolid: "#B4233B",
  errorSoft: "#FDECEF",
  errorOnSoft: "#9F1833",
  infoSolid: "#1D4ED8",
  infoSoft: "#EAF0FF",
  infoOnSoft: "#173EA6",
} satisfies ThemeColors;

export const darkTheme = {
  background: "#030815",
  surface: "#0D1424",
  surfaceElevated: "#17142B",
  surfaceSubtle: "#111929",
  surfaceBrand: "#2A174A",
  surfaceAccent: "#3B300C",
  logoSurface: "#FFFFFF",
  textPrimary: "#F9F7FF",
  textSecondary: "#B8B3C7",
  textInverse: "#030815",
  primary: "#7B35E8",
  primaryHover: "#8947EC",
  primaryPressed: "#6E20DF",
  primarySoft: "#2A174A",
  onPrimary: "#FFFFFF",
  accent: "#FECE32",
  accentHighlight: "#FECE32",
  accentSoft: "#3B300C",
  onAccent: "#030815",
  link: "#C39CFF",
  borderSubtle: "#312A45",
  borderControl: "#6B5E7C",
  focusRing: "#FDBE17",
  disabledBackground: "#1F2433",
  disabledForeground: "#7F8494",
  overlay: "rgba(1, 3, 10, 0.72)",
  shadow: "rgba(0, 0, 0, 0.40)",
  successSolid: "#137A50",
  successSoft: "#0E2B22",
  successOnSoft: "#65D6A1",
  warningSolid: "#8A5A00",
  warningSoft: "#312509",
  warningOnSoft: "#FFD64A",
  errorSolid: "#B4233B",
  errorSoft: "#35121C",
  errorOnSoft: "#FF8CA0",
  infoSolid: "#1D4ED8",
  infoSoft: "#102145",
  infoOnSoft: "#8DB6FF",
} satisfies ThemeColors;
```

Store the brand scales and semantic themes in one shared package. Platform adapters may map these values to React Native theme objects and CSS custom properties, but components must not introduce independent hex values.

## 13. Approval baseline

The recommended canonical identity is:

- **Primary:** `#6E20DF`
- **Primary strong:** `#42209D`
- **Accent:** `#FDBE17`
- **Accent highlight:** `#FECE32`
- **Ink/dark canvas:** `#030815`
- **Light surface:** `#FFFFFF`

Any future palette change should update this document, shared code tokens, design-library styles, contrast tests, screenshots, and logo-usage guidance together.
