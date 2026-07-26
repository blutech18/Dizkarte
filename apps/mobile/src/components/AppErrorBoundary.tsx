import { Component, type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { theme, spacing, fontSize } from "../theme";
import { Button } from "./ui/Button";

type Props = { readonly children: ReactNode };
type State = { readonly hasError: boolean };

/**
 * Top-level error boundary. Renders a safe recovery screen instead of a blank
 * crash. Never surfaces stack traces, secrets, or provider internals to the
 * user.
 */
export class AppErrorBoundary extends Component<Props, State> {
  override state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  override componentDidCatch(): void {
    // Intentionally no console logging of the raw error object here to avoid
    // leaking any sensitive state in captured logs.
  }

  private reset = () => this.setState({ hasError: false });

  override render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container} accessibilityRole="alert">
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.caption}>
            Please try again. If this keeps happening, contact support.
          </Text>
          <Button label="Try again" onPress={this.reset} />
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xxl,
    gap: spacing.md,
    backgroundColor: theme.background,
  },
  title: {
    fontSize: fontSize.lg,
    fontWeight: "700",
    color: theme.textPrimary,
  },
  caption: {
    fontSize: fontSize.md,
    color: theme.textSecondary,
    textAlign: "center",
  },
});
