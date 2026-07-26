import Svg, { Path, Rect, Circle, type SvgProps } from "react-native-svg";

/**
 * Small, dependency-free real vector icon set (react-native-svg).
 *
 * No emoji is used anywhere in the app — status, navigation, and section
 * glyphs are all real stroke icons so they render identically across every
 * device/font and are never subject to emoji-font/platform rendering
 * differences. Mirrors the equivalent icon set in the Admin app
 * (`apps/admin/src/components/shell/icons.tsx`) so the same concept uses the
 * same glyph across both apps.
 */

export type IconName =
  | "home"
  | "briefcase"
  | "calendar"
  | "bell"
  | "user"
  | "search"
  | "filter"
  | "map-pin"
  | "image"
  | "video"
  | "note"
  | "star"
  | "arrow-right"
  | "shield"
  | "chat"
  | "wallet"
  | "check-circle"
  | "close"
  | "log-out"
  | "eye"
  | "eye-off";

export type IconProps = {
  readonly name: IconName;
  readonly size?: number;
  readonly color?: string;
};

const STROKE_PROPS = {
  fill: "none" as const,
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function Frame({
  size = 20,
  color = "currentColor",
  children,
}: {
  readonly size?: number;
  readonly color?: string;
  readonly children: SvgProps["children"];
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" stroke={color}>
      {children}
    </Svg>
  );
}

/** Real vector icon, selected by semantic name. Never an emoji glyph. */
export function Icon({ name, size = 20, color = "currentColor" }: IconProps) {
  switch (name) {
    case "home":
      return (
        <Frame size={size} color={color}>
          <Path {...STROKE_PROPS} stroke={color} d="M4 11l8-7 8 7v9a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1v-9z" />
        </Frame>
      );
    case "briefcase":
      return (
        <Frame size={size} color={color}>
          <Rect {...STROKE_PROPS} stroke={color} x="3" y="8" width="18" height="11" rx="2" />
          <Path {...STROKE_PROPS} stroke={color} d="M8 8V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          <Path {...STROKE_PROPS} stroke={color} d="M3 13h18" />
        </Frame>
      );
    case "calendar":
      return (
        <Frame size={size} color={color}>
          <Rect {...STROKE_PROPS} stroke={color} x="3" y="5" width="18" height="16" rx="2" />
          <Path {...STROKE_PROPS} stroke={color} d="M3 10h18M8 3v4M16 3v4" />
        </Frame>
      );
    case "bell":
      return (
        <Frame size={size} color={color}>
          <Path
            {...STROKE_PROPS}
            stroke={color}
            d="M6 10a6 6 0 1 1 12 0v4l1.5 3h-15L6 14v-4z"
          />
          <Path {...STROKE_PROPS} stroke={color} d="M10 20a2 2 0 0 0 4 0" />
        </Frame>
      );
    case "user":
      return (
        <Frame size={size} color={color}>
          <Circle {...STROKE_PROPS} stroke={color} cx="12" cy="8" r="3.5" />
          <Path {...STROKE_PROPS} stroke={color} d="M4.5 20a7.5 7.5 0 0 1 15 0" />
        </Frame>
      );
    case "search":
      return (
        <Frame size={size} color={color}>
          <Circle {...STROKE_PROPS} stroke={color} cx="11" cy="11" r="6.5" />
          <Path {...STROKE_PROPS} stroke={color} d="M20 20l-4.3-4.3" />
        </Frame>
      );
    case "filter":
      return (
        <Frame size={size} color={color}>
          <Path {...STROKE_PROPS} stroke={color} d="M4 5h16M7 12h10M10 19h4" />
        </Frame>
      );
    case "map-pin":
      return (
        <Frame size={size} color={color}>
          <Path
            {...STROKE_PROPS}
            stroke={color}
            d="M12 21s7-6.5 7-11.5A7 7 0 0 0 5 9.5C5 14.5 12 21 12 21z"
          />
          <Circle {...STROKE_PROPS} stroke={color} cx="12" cy="9.5" r="2.2" />
        </Frame>
      );
    case "image":
      return (
        <Frame size={size} color={color}>
          <Rect {...STROKE_PROPS} stroke={color} x="3" y="4" width="18" height="16" rx="2" />
          <Circle cx="8.5" cy="9.5" r="1.4" fill={color} stroke="none" />
          <Path {...STROKE_PROPS} stroke={color} d="M4 17l5-5 3.5 3.5L17 11l4 4" />
        </Frame>
      );
    case "video":
      return (
        <Frame size={size} color={color}>
          <Rect {...STROKE_PROPS} stroke={color} x="3" y="6" width="13" height="12" rx="2" />
          <Path {...STROKE_PROPS} stroke={color} d="M16 10l5-3v10l-5-3" />
        </Frame>
      );
    case "note":
      return (
        <Frame size={size} color={color}>
          <Rect {...STROKE_PROPS} stroke={color} x="5" y="3" width="14" height="18" rx="2" />
          <Path {...STROKE_PROPS} stroke={color} d="M9 8h6M9 12h6M9 16h4" />
        </Frame>
      );
    case "star":
      return (
        <Frame size={size} color={color}>
          <Path
            {...STROKE_PROPS}
            stroke={color}
            fill={color}
            d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8-4.3-4.1 5.9-.9L12 3.5z"
          />
        </Frame>
      );
    case "arrow-right":
      return (
        <Frame size={size} color={color}>
          <Path {...STROKE_PROPS} stroke={color} d="M4 12h16M13 5l7 7-7 7" />
        </Frame>
      );
    case "shield":
      return (
        <Frame size={size} color={color}>
          <Path {...STROKE_PROPS} stroke={color} d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" />
          <Path {...STROKE_PROPS} stroke={color} d="M9 12l2.2 2.2L15 10" />
        </Frame>
      );
    case "chat":
      return (
        <Frame size={size} color={color}>
          <Path {...STROKE_PROPS} stroke={color} d="M4 5h16v10H8l-4 4V5z" />
        </Frame>
      );
    case "wallet":
      return (
        <Frame size={size} color={color}>
          <Rect {...STROKE_PROPS} stroke={color} x="3" y="6" width="18" height="13" rx="2" />
          <Path {...STROKE_PROPS} stroke={color} d="M3 10h18" />
          <Circle cx="16.5" cy="14" r="1" fill={color} stroke="none" />
        </Frame>
      );
    case "check-circle":
      return (
        <Frame size={size} color={color}>
          <Circle {...STROKE_PROPS} stroke={color} cx="12" cy="12" r="9" />
          <Path {...STROKE_PROPS} stroke={color} d="M8.5 12.5l2.3 2.3L16 9.5" />
        </Frame>
      );
    case "close":
      return (
        <Frame size={size} color={color}>
          <Path {...STROKE_PROPS} stroke={color} d="M6 6l12 12M18 6L6 18" />
        </Frame>
      );
    case "log-out":
      return (
        <Frame size={size} color={color}>
          <Path {...STROKE_PROPS} stroke={color} d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
        </Frame>
      );
    case "eye":
      return (
        <Frame size={size} color={color}>
          <Path {...STROKE_PROPS} stroke={color} d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
          <Circle {...STROKE_PROPS} stroke={color} cx="12" cy="12" r="3" />
        </Frame>
      );
    case "eye-off":
      return (
        <Frame size={size} color={color}>
          <Path {...STROKE_PROPS} stroke={color} d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24M1 1l22 22" />
        </Frame>
      );
    default:
      return null;
  }
}
