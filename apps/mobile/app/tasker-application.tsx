import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Stack, router } from "expo-router";
import { Screen } from "../src/components/ui/Screen";
import { TextField } from "../src/components/ui/TextField";
import { Button } from "../src/components/ui/Button";
import { StatusBadge } from "../src/components/ui/StatusBadge";
import { theme, spacing, fontSize, radii } from "../src/theme";

const SPECIALTY_OPTIONS = [
  "Home cleaning",
  "Plumbing",
  "Electrical",
  "Delivery",
  "Moving",
  "Appliance repair",
];

/**
 * Tasker application form.
 *
 * Payout setup only ever captures a provider token/reference label — this
 * screen never renders a raw card/account-number input field, matching the
 * payout-token boundary invariant.
 */
export default function TaskerApplicationScreen() {
  const [specialties, setSpecialties] = useState<Set<string>>(new Set());
  const [serviceArea, setServiceArea] = useState("");
  const [bio, setBio] = useState("");
  const [experience, setExperience] = useState("");
  const [portfolioAttached, setPortfolioAttached] = useState(false);
  const [payoutLinked, setPayoutLinked] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  function toggleSpecialty(name: string) {
    setSpecialties((current) => {
      const next = new Set(current);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  async function handleSubmit() {
    if (specialties.size === 0 || serviceArea.trim().length === 0 || bio.trim().length < 20) {
      setError(
        "Select at least one specialty, enter a service area, and write at least 20 characters for your bio.",
      );
      return;
    }
    setError(undefined);
    setSubmitting(true);
    await new Promise((resolve) => setTimeout(resolve, 500));
    setSubmitting(false);
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <Screen>
        <Stack.Screen options={{ headerShown: true, title: "Tasker application" }} />
        <StatusBadge tone="warning" label="Submitted — awaiting review" />
        <Text style={styles.caption}>Admin reviews every Tasker application manually.</Text>
        <Button label="Back to profile" onPress={() => router.back()} variant="secondary" />
      </Screen>
    );
  }

  return (
    <Screen>
      <Stack.Screen options={{ headerShown: true, title: "Tasker application" }} />
      {error ? (
        <Text style={styles.errorText} accessibilityRole="alert" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}

      <Text style={styles.sectionTitle}>Specialties</Text>
      <View style={styles.chipRow}>
        {SPECIALTY_OPTIONS.map((option) => {
          const selected = specialties.has(option);
          return (
            <Button
              key={option}
              label={option}
              variant={selected ? "primary" : "secondary"}
              onPress={() => toggleSpecialty(option)}
            />
          );
        })}
      </View>

      <TextField
        label="Service area (city)"
        required
        value={serviceArea}
        onChangeText={setServiceArea}
      />
      <TextField
        label="Bio"
        required
        multiline
        description="At least 20 characters."
        value={bio}
        onChangeText={setBio}
      />
      <TextField
        label="Experience"
        required
        multiline
        value={experience}
        onChangeText={setExperience}
      />

      <View style={styles.attachRow}>
        <Text style={styles.attachLabel}>Portfolio samples</Text>
        {portfolioAttached ? (
          <StatusBadge tone="success" label="Added" />
        ) : (
          <Button label="Add" onPress={() => setPortfolioAttached(true)} variant="secondary" />
        )}
      </View>

      <View style={styles.attachRow}>
        <Text style={styles.attachLabel}>Payout method</Text>
        {payoutLinked ? (
          <StatusBadge tone="success" label="GCash token linked" />
        ) : (
          <Button
            label="Link payout method"
            onPress={() => setPayoutLinked(true)}
            variant="secondary"
          />
        )}
      </View>
      <Text style={styles.caption}>
        We only store a secure provider token reference — never your raw card or wallet number.
      </Text>

      <Button label="Submit application" onPress={handleSubmit} loading={submitting} fullWidth />
    </Screen>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    fontSize: fontSize.md,
    fontWeight: "700",
    color: theme.textPrimary,
    marginBottom: spacing.sm,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  attachRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  attachLabel: {
    fontSize: fontSize.md,
    color: theme.textPrimary,
    fontWeight: "600",
  },
  caption: {
    fontSize: fontSize.xs,
    color: theme.textSecondary,
    marginBottom: spacing.md,
  },
  errorText: {
    color: theme.errorOnSoft,
    backgroundColor: theme.errorSoft,
    padding: spacing.md,
    borderRadius: radii.sm,
    fontWeight: "600",
    marginBottom: spacing.md,
  },
});
