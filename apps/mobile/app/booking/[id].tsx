import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Redirect, Stack, router, useLocalSearchParams } from "expo-router";
import type { BookingId } from "@dizkarte/domain";
import { isCommunicationUnlocked } from "@dizkarte/domain";
import { Screen } from "../../src/components/ui/Screen";
import { LoadingState, ErrorState, DeniedState } from "../../src/components/ui/AsyncState";
import { useSession } from "../../src/providers/SessionProvider";
import { useMarketplace } from "../../src/providers/MarketplaceProvider";
import type { BookingRecord } from "../../src/services/marketplace/types";
import { BookingStatusWorkspace } from "../../src/components/booking/BookingStatusWorkspace";
import {
  statusPresentationFor,
  type BookingRole,
} from "../../src/components/booking/bookingStatusPresentation";

type LoadState = "loading" | "loaded" | "denied" | "error";

function BookingPageShell({ children }: { readonly children: ReactNode }) {
  return (
    <Screen subPageTitle="Booking">
      <Stack.Screen options={{ headerShown: false }} />
      {children}
    </Screen>
  );
}

/**
 * Booking detail route/controller.
 *
 * This screen owns route params, the participant-only booking retrieval
 * (`getBooking(id, viewerId)`), repository mutations with pending/error state,
 * navigation, authoritative role determination, and the `isCommunicationUnlocked`
 * privacy gate. All status-specific presentation lives in
 * `BookingStatusWorkspace` + `bookingStatusPresentation`; this file only decides
 * *what a given action does*, never re-deriving privacy or payment state in the UI.
 *
 * Exact location/contact/chat stay gated to authoritative confirmed-or-later
 * participants via the domain `isCommunicationUnlocked(status)`; a privacy
 * explanation is shown before confirmation so the gate is understandable.
 */
export default function BookingDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session, status } = useSession();
  const { repository, notifyChanged } = useMarketplace();
  const [booking, setBooking] = useState<BookingRecord | null>(null);
  const [state, setState] = useState<LoadState>("loading");
  const [actionPending, setActionPending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!session) return;
    setState("loading");
    repository
      .getBooking(id as BookingId, session.userId)
      .then((result) => {
        if (!result) {
          setState("denied");
          return;
        }
        setBooking(result);
        setState("loaded");
      })
      .catch(() => setState("error"));
  }, [id, repository, session]);

  useEffect(() => {
    load();
  }, [load]);

  const runAction = useCallback(
    async (action: () => Promise<{ ok: boolean }>) => {
      setActionPending(true);
      setActionError(null);
      try {
        const result = await action();
        if (!result.ok) {
          setActionError("This action is not available for the booking's current state.");
          return;
        }
        notifyChanged();
        load();
      } finally {
        setActionPending(false);
      }
    },
    [notifyChanged, load],
  );

  if (status === "loading") {
    return (
      <BookingPageShell>
        <LoadingState label="Loading" />
      </BookingPageShell>
    );
  }
  if (!session) return <Redirect href="/(auth)/welcome" />;
  if (state === "loading") {
    return (
      <BookingPageShell>
        <LoadingState label="Loading booking" />
      </BookingPageShell>
    );
  }
  if (state === "error") {
    return (
      <BookingPageShell>
        <ErrorState onRetry={load} />
      </BookingPageShell>
    );
  }
  if (state === "denied" || !booking) {
    return (
      <BookingPageShell>
        <DeniedState
          title="Booking not found"
          description="This booking does not exist or you are not a participant."
        />
      </BookingPageShell>
    );
  }

  // Participant-only retrieval guarantees the viewer is exactly one of the two
  // parties, so a non-client viewer is the Tasker.
  const role: BookingRole = booking.clientId === session.userId ? "client" : "tasker";
  const presentation = statusPresentationFor(booking.status, role);
  const unlocked = isCommunicationUnlocked(booking.status);
  const counterpartName =
    (role === "client" ? booking.taskerDisplayName : booking.clientDisplayName).trim() ||
    "Dizkarte user";
  const counterpartContact =
    role === "client" ? booking.taskerContactMasked : booking.clientContactMasked;

  /**
   * Map the single role-appropriate primary action to its existing behavior.
   * Payment/completion-request/review navigate; start-work and confirm-release
   * are repository mutations guarded by `runAction` (pending + not-available
   * error). `none` states never render a primary button, so this is a no-op.
   */
  const handlePrimaryAction = () => {
    switch (presentation.primaryAction) {
      case "continue-payment":
      case "retry-payment":
        router.push({ pathname: "/payment/[bookingId]", params: { bookingId: booking.id } });
        break;
      case "start-work":
        void runAction(() => repository.startWork(booking.id, session.userId));
        break;
      case "request-completion":
        router.push({ pathname: "/booking/[id]/complete", params: { id: booking.id } });
        break;
      case "confirm-release":
        void runAction(() => repository.confirmCompletion(booking.id, session.userId));
        break;
      case "leave-review":
        router.push({ pathname: "/review/[bookingId]", params: { bookingId: booking.id } });
        break;
      case "none":
        break;
    }
  };

  return (
    <BookingPageShell>
      <BookingStatusWorkspace
        booking={booking}
        role={role}
        unlocked={unlocked}
        counterpartName={counterpartName}
        counterpartContact={counterpartContact}
        actionPending={actionPending}
        actionError={actionError}
        onPrimaryAction={handlePrimaryAction}
        onOpenReceipt={() =>
          router.push({ pathname: "/receipt/[bookingId]", params: { bookingId: booking.id } })
        }
        onOpenChat={() =>
          router.push({ pathname: "/chat/[bookingId]", params: { bookingId: booking.id } })
        }
        onOpenDispute={() =>
          router.push({ pathname: "/dispute/[bookingId]", params: { bookingId: booking.id } })
        }
        onReportProblem={() =>
          router.push({
            pathname: "/support",
            params: { subjectType: "booking", subjectId: booking.id },
          })
        }
      />
    </BookingPageShell>
  );
}
