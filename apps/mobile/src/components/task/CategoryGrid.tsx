import { Image, Pressable, StyleSheet, Text, View, type ImageSourcePropType } from "react-native";
import { router } from "expo-router";
import { useCategories } from "../../providers/CategoriesProvider";
import { LoadingState } from "../ui/AsyncState";
import { hasCategoryArt, type CategoryArtSlug } from "./categoryArt";
import { theme, spacing, fontSize, lineHeight, radii } from "../../theme";

/**
 * Category illustrations, keyed by slug.
 *
 * Typed as a total record over `CategoryArtSlug`, so the slug list and the
 * assets can never drift: adding a slug without an image fails the build.
 * `require` is used because Metro needs a static literal to bundle an asset.
 */
/* eslint-disable @typescript-eslint/no-require-imports -- static asset requires are standard RN */
const CATEGORY_ART: Readonly<Record<CategoryArtSlug, ImageSourcePropType>> = {
  gardening: require("../../../assets/icons/gardening.png"),
  painting: require("../../../assets/icons/painting.png"),
  cleaning: require("../../../assets/icons/cleaning.png"),
  removals: require("../../../assets/icons/removals.png"),
  "repairs-installations": require("../../../assets/icons/repairs-installations.png"),
  copywriting: require("../../../assets/icons/copywriting.png"),
  "data-entry": require("../../../assets/icons/data-entry.png"),
  "furniture-assembly": require("../../../assets/icons/furniture-assembly.png"),
};
/* eslint-enable @typescript-eslint/no-require-imports */

export type CategoryGridProps = {
  /** How many tiles to show. Omit for the whole catalog. */
  readonly limit?: number;
};

/**
 * "Need something done?" category grid.
 *
 * Tapping a tile opens task creation with that category already chosen, so the
 * Client starts from what they want done instead of an empty form. Categories
 * come from the live catalog, so the tiles always match what the picker offers.
 *
 * A category with no illustration is skipped rather than rendered with a
 * placeholder — a half-drawn tile reads as a bug, whereas the grid is explicitly
 * a shortcut surface and the full catalog remains available in the form.
 */
export function CategoryGrid({ limit }: CategoryGridProps) {
  const { categories, loading } = useCategories();

  if (loading && categories.length === 0) {
    return <LoadingState label="Loading categories" />;
  }

  const illustrated = categories.filter((category) => hasCategoryArt(category.slug));
  if (illustrated.length === 0) return null;

  const shown = typeof limit === "number" ? illustrated.slice(0, limit) : illustrated;

  const handleCategoryPress = (categoryId: string) => {
    requestAnimationFrame(() => {
      router.push({
        pathname: "/task/create",
        params: { category: categoryId },
      });
    });
  };

  return (
    <View style={styles.section}>
      <Text style={styles.title}>Need something done?</Text>
      <Text style={styles.subtitle}>Browse our top trending categories</Text>

      <View style={styles.grid}>
        {shown.map((category) => (
          <Pressable
            key={category.id}
            accessibilityRole="button"
            accessibilityLabel={`Post a ${category.name} task`}
            accessibilityHint="Opens the task form with this category selected"
            onPress={() => handleCategoryPress(category.id)}
            style={({ pressed }) => [styles.tile, pressed ? styles.tilePressed : null]}
          >
            <Image
              source={CATEGORY_ART[category.slug as CategoryArtSlug]}
              style={styles.art}
              resizeMode="contain"
              // The label already names the category, so the image is decorative.
              accessibilityIgnoresInvertColors
            />
            <Text style={styles.tileLabel} numberOfLines={2}>
              {category.name}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // No outer margin: the Home screen positions this section using a
  // consistent gap between top-level sections instead of a component-owned
  // margin, so the rhythm stays uniform regardless of what renders before it.
  section: {},
  title: {
    fontSize: fontSize.xxl,
    fontWeight: "800",
    color: theme.textPrimary,
    letterSpacing: -0.4,
  },
  subtitle: {
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
    color: theme.textSecondary,
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
  },
  tile: {
    // Two per row, allowing for the row gap.
    flexBasis: "47%",
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs + 2,
    paddingVertical: spacing.md + 4,
    paddingHorizontal: spacing.sm + 2,
    backgroundColor: theme.surfaceSubtle,
    borderRadius: radii.md + 2,
  },
  tilePressed: {
    backgroundColor: theme.surfaceBrand,
    opacity: 0.92,
    transform: [{ scale: 0.97 }],
  },
  art: {
    width: 38,
    height: 38,
  },
  tileLabel: {
    fontSize: fontSize.sm,
    fontWeight: "700",
    color: theme.textPrimary,
    textAlign: "center",
  },
});
