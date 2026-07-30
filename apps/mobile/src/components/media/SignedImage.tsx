import { useEffect, useState } from "react";
import { Image, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { createSignedUrl } from "../../services/storage/upload";
import type { StorageBucket } from "../../services/storage/object-paths";
import { theme, fontSize, radii } from "../../theme";

export type SignedImageProps = {
  readonly bucket: StorageBucket;
  readonly path: string;
  readonly accessibilityLabel: string;
  readonly width?: number;
  readonly height?: number;
  readonly style?: StyleProp<ViewStyle>;
};

/**
 * Render an object from a private bucket.
 *
 * Every media bucket in `supabase/migrations/0010` is private, so there is no
 * durable URL to put in an `Image` source. A short-lived signed URL is requested
 * per mount instead; it expires quickly, so a URL that leaks out of a screenshot
 * or a log stops working.
 *
 * The URL is fetched on mount rather than cached in a provider because the
 * expiry makes a cache a source of broken images, and because a signed URL is
 * cheap to mint.
 */
export function SignedImage({
  bucket,
  path,
  accessibilityLabel,
  width = 160,
  height = 120,
  style,
}: SignedImageProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    setUrl(null);
    setFailed(false);
    void createSignedUrl(bucket, path).then((signed) => {
      if (!active) return;
      if (signed) setUrl(signed);
      else setFailed(true);
    });
    return () => {
      active = false;
    };
  }, [bucket, path]);

  if (failed) {
    return (
      <View style={[styles.placeholder, { width, height }, style]}>
        <Text style={styles.placeholderText}>Preview unavailable</Text>
      </View>
    );
  }

  if (!url) {
    return <View style={[styles.placeholder, { width, height }, style]} />;
  }

  return (
    <Image
      source={{ uri: url }}
      style={[styles.image, { width, height }]}
      accessibilityLabel={accessibilityLabel}
      accessible
      resizeMode="cover"
      onError={() => setFailed(true)}
    />
  );
}

const styles = StyleSheet.create({
  image: { borderRadius: radii.sm, backgroundColor: theme.surfaceSubtle },
  placeholder: {
    borderRadius: radii.sm,
    backgroundColor: theme.surfaceSubtle,
    alignItems: "center",
    justifyContent: "center",
  },
  placeholderText: { fontSize: fontSize.xs, color: theme.textSecondary },
});
