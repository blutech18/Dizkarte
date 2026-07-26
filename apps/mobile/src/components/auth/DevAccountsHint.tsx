import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { DEV_ACCOUNT_PASSWORD, devAccountsFor } from "@dizkarte/config";
import { getAppConfig } from "../../lib/config";
import { Icon } from "../ui/Icon";
import { theme, spacing, fontSize, radii } from "../../theme";

/**
 * Development-only list of the seeded test accounts.
 *
 * Driven by the shared roster in `@dizkarte/config` that
 * `scripts/seed-supabase.mjs` also reads, so what is shown here can never drift
 * from the accounts that actually exist in Supabase.
 *
 * Renders nothing outside a `development` or `test` environment. That check is
 * the whole safety story for this component: it must never appear in a build
 * pointed at staging or production.
 */
export function DevAccountsHint({
  onSelect,
}: {
  /** Called with an email so the sign-in form can prefill it. */
  readonly onSelect?: (email: string, password: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  let isDevelopment = false;
  try {
    const { environment } = getAppConfig();
    isDevelopment = environment === "development" || environment === "test";
  } catch {
    // A configuration failure is surfaced by the app's error boundary; this
    // convenience panel simply stays hidden.
    isDevelopment = false;
  }
  if (!isDevelopment) return null;

  const accounts = devAccountsFor("mobile");

  return (
    <View style={styles.container}>
      <Pressable
        onPress={() => setExpanded((value) => !value)}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={
          expanded ? "Hide development test accounts" : "Show development test accounts"
        }
        style={styles.header}
      >
        <Icon name="shield" size={16} color={theme.textSecondary} />
        <Text style={styles.headerText}>Development test accounts</Text>
        <Icon name={expanded ? "eye-off" : "eye"} size={16} color={theme.textSecondary} />
      </Pressable>

      {expanded ? (
        <View style={styles.body}>
          <Text style={styles.passwordLine}>
            Password for every account: <Text style={styles.password}>{DEV_ACCOUNT_PASSWORD}</Text>
          </Text>
          {accounts.map((account) => (
            <Pressable
              key={account.email}
              onPress={() => onSelect?.(account.email, DEV_ACCOUNT_PASSWORD)}
              accessibilityRole="button"
              accessibilityLabel={`Use ${account.roleLabel} account ${account.email}`}
              accessibilityHint="Fills the sign-in form with this account"
              style={({ pressed }) => [styles.account, pressed ? styles.accountPressed : null]}
            >
              <Text style={styles.roleLabel}>{account.roleLabel}</Text>
              <Text style={styles.email}>{account.email}</Text>
              <Text style={styles.purpose}>{account.purpose}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: spacing.lg,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
    borderRadius: radii.md,
    backgroundColor: theme.surfaceSubtle,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  headerText: {
    flex: 1,
    fontSize: fontSize.sm,
    fontWeight: "700",
    color: theme.textSecondary,
  },
  body: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    gap: spacing.sm,
  },
  passwordLine: {
    fontSize: fontSize.sm,
    color: theme.textSecondary,
  },
  password: {
    fontWeight: "800",
    color: theme.textPrimary,
  },
  account: {
    borderWidth: 1,
    borderColor: theme.borderSubtle,
    borderRadius: radii.sm,
    backgroundColor: theme.surface,
    padding: spacing.md,
    gap: 2,
  },
  accountPressed: {
    backgroundColor: theme.surfaceSubtle,
  },
  roleLabel: {
    fontSize: fontSize.sm,
    fontWeight: "700",
    color: theme.textPrimary,
  },
  email: {
    fontSize: fontSize.sm,
    color: theme.primary,
  },
  purpose: {
    fontSize: fontSize.xs,
    color: theme.textSecondary,
  },
});
