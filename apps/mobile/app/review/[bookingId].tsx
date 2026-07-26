import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import type { BookingId } from "@dizkarte/domain";
import { Screen } from "../../src/components/ui/Screen";
import { Button } from "../../src/components/ui/Button";
import { TextField } from "../../src/components/ui/TextField";
import { StatusBadge } from "../../src/components/ui/StatusBadge";
import { LoadingState, ErrorState, DeniedState } from "../../src/components/ui/AsyncState";
import { useSession } from "../../src/providers/SessionProvider";
import { useMarketplace } from "../../src/providers/MarketplaceProvider";
import type { ReviewPairView } from "../../src/services/marketplace/types";
import { theme, spacing, fontSize, radii } from "../../src/theme";

type LoadState = "loading" | "loaded" | "denied" | "error";

/**
 * Blind bilateral review submit/reveal.
 *
 * The counterpart's review content is never fetched/rendered until both
 * sides have submitted, or the documented development reveal deadline has
 * passed (`getReviewPair` enforces this server-side in the synthetic
 * repository, not just in this component).
 */
export default function ReviewScreen() {
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const { session } = useSession();
  const { repository, notifyChanged } = useMarketplace();
  const [pair, setPair] = useState<ReviewPairView | null>(null);
  const [state, setState] = useState<LoadState>("loading");
  const [score, setScore] = useState(5);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!session) return;
    setState("loading");
    repository
      .getReviewPair(bookingId as BookingId, session.userId)
      .then((result) => {
        if (!result) {
          setState("denied");
          return;
        }
        setPair(result);
        setState("loaded");
      })
      .catch(() => setState("error"));
  }, [bookingId, repository, session]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSubmit = useCallback(async () => {
    if (!session) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const result = await repository.submitReview(
        { bookingId: bookingId as BookingId, score, comment },
        session.userId,
      );
      if (!result.ok) {
        setSubmitError(
          result.reason === "ALREADY_SUBMITTED"
            ? "You have already submitted a review for this booking."
            : result.reason === "NOT_COMPLETED"
              ? "Reviews can only be submitted after the booking is completed."
              : "You cannot submit a review for this booking.",
        );
        return;
      }
      notifyChanged();
      load();
    } finally {
      setSubmitting(false);
    }
  }, [session, bookingId, score, comment, repository, notifyChanged, load]);

  if (!session) return <DeniedState description="Sign in to leave a review." />;
  if (state === "loading") return <LoadingState label="Loading review status" />;
  if (state === "error") return <ErrorState onRetry={load} />;
  if (state === "denied" || !pair) {
    return (
      <DeniedState
        title="Not available"
        description="This booking's reviews are not available to you."
      />
    );
  }

  return (
    <Screen>
      <Stack.Screen options={{ headerShown: true, title: "Review" }} />

      {!pair.myReview ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Your review</Text>
          <ScoreSelector value={score} onChange={setScore} />
          <TextField
            label="Comment"
            multiline
            value={comment}
            onChangeText={setComment}
            description="Your review stays hidden until both sides submit."
          />
          {submitError ? (
            <Text
              style={styles.errorText}
              accessibilityRole="alert"
              accessibilityLiveRegion="polite"
            >
              {submitError}
            </Text>
          ) : null}
          <Button label="Submit review" onPress={handleSubmit} loading={submitting} fullWidth />
        </View>
      ) : (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Your review</Text>
          <StatusBadge tone="brand" icon="star" label={`${pair.myReview.score}`} />
          <Text style={styles.body}>{pair.myReview.comment}</Text>
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Counterpart's review</Text>
        {pair.counterpartReview ? (
          <>
            <StatusBadge tone="brand" icon="star" label={`${pair.counterpartReview.score}`} />
            <Text style={styles.body}>{pair.counterpartReview.comment}</Text>
          </>
        ) : (
          <>
            <StatusBadge tone="neutral" label="Hidden until reveal" />
            <Text style={styles.body}>
              {pair.bothSubmitted
                ? "Revealing…"
                : pair.revealDeadline
                  ? `This will reveal once both reviews are submitted, or automatically by ${new Date(pair.revealDeadline).toLocaleString()} in development.`
                  : "This will reveal once both sides have submitted a review."}
            </Text>
          </>
        )}
      </View>
    </Screen>
  );
}

function ScoreSelector({
  value,
  onChange,
}: {
  readonly value: number;
  readonly onChange: (n: number) => void;
}) {
  return (
    <View style={styles.scoreRow} accessibilityRole="radiogroup" accessibilityLabel="Score, 1 to 5">
      {[1, 2, 3, 4, 5].map((n) => (
        <Pressable
          key={n}
          onPress={() => onChange(n)}
          accessibilityRole="radio"
          accessibilityLabel={`${n} star${n === 1 ? "" : "s"}`}
          accessibilityState={{ selected: value === n }}
          style={[styles.scoreButton, value === n ? styles.scoreButtonSelected : null]}
        >
          <Text style={value === n ? styles.scoreTextSelected : styles.scoreText}>{n}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
    borderRadius: radii.md,
    padding: spacing.lg,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  sectionTitle: { fontSize: fontSize.md, fontWeight: "700", color: theme.textPrimary },
  body: { fontSize: fontSize.sm, color: theme.textPrimary },
  scoreRow: { flexDirection: "row", gap: spacing.sm },
  scoreButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: theme.borderControl,
    backgroundColor: theme.surface,
  },
  scoreButtonSelected: { backgroundColor: theme.primary, borderColor: theme.primary },
  scoreText: { color: theme.textPrimary, fontWeight: "700" },
  scoreTextSelected: { color: theme.onPrimary, fontWeight: "700" },
  errorText: {
    color: theme.errorOnSoft,
    backgroundColor: theme.errorSoft,
    padding: spacing.md,
    borderRadius: radii.sm,
    fontWeight: "600",
  },
});
