import { useCallback, useEffect, useRef, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import type { BookingId, ConversationId } from "@dizkarte/domain";
import { Screen } from "../../src/components/ui/Screen";
import { Button } from "../../src/components/ui/Button";
import { TextField } from "../../src/components/ui/TextField";
import {
  LoadingState,
  ErrorState,
  DeniedState,
  EmptyState,
} from "../../src/components/ui/AsyncState";
import { useSession } from "../../src/providers/SessionProvider";
import { useMarketplace } from "../../src/providers/MarketplaceProvider";
import { useConnectivity } from "../../src/providers/ConnectivityProvider";
import type { MessageRecord } from "../../src/services/marketplace/types";
import {
  ChatMediaAttachmentPicker,
  validateAttachments,
  type PendingAttachment,
} from "../../src/components/task/ChatMediaAttachmentPicker";
import { AttachmentLabel } from "../../src/components/ui/AttachmentLabel";
import { theme, spacing, fontSize, radii, MIN_TOUCH_TARGET } from "../../src/theme";

type LoadState = "loading" | "loaded" | "denied" | "error";

/**
 * Confirmed-booking text + media chat with send/retry/loading/empty/offline
 * states.
 *
 * Media attachments carry deterministic metadata only (name/type/size — see
 * `MessageMediaAttachment`); there is no real upload in this pass. Access is
 * enforced by `getConversationForBooking`/`sendMessage` in the repository,
 * which only allow a participant of a communication-unlocked (i.e.
 * authoritatively payment-confirmed) booking — never by this screen alone.
 *
 * Assigned-Admin access to a booking's conversation is governed entirely by
 * backend RLS/capability policy (task 9.4) and is Admin-app surface area.
 * This mobile screen never simulates or grants that access itself.
 */
export default function ChatScreen() {
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const { session } = useSession();
  const { repository } = useMarketplace();
  const { isAppActive } = useConnectivity();
  const [conversationId, setConversationId] = useState<ConversationId | null>(null);
  const [messages, setMessages] = useState<ReadonlyArray<MessageRecord>>([]);
  const [state, setState] = useState<LoadState>("loading");
  const [draft, setDraft] = useState("");
  const [attachments, setAttachments] = useState<ReadonlyArray<PendingAttachment>>([]);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const nonceCounter = useRef(0);

  const load = useCallback(() => {
    if (!session) return;
    setState("loading");
    repository
      .getConversationForBooking(bookingId as BookingId, session.userId)
      .then(async (conversation) => {
        if (!conversation) {
          setState("denied");
          return;
        }
        setConversationId(conversation.id);
        const list = await repository.listMessages(conversation.id, session.userId);
        setMessages(list);
        setState("loaded");
      })
      .catch(() => setState("error"));
  }, [bookingId, repository, session]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSend = useCallback(async () => {
    if (!session || !conversationId) return;
    const trimmedBody = draft.trim();
    if (trimmedBody.length === 0 && attachments.length === 0) return;
    const attachmentError = validateAttachments(attachments);
    if (attachmentError) {
      setSendError(attachmentError);
      return;
    }
    if (!isAppActive) return;
    setSendError(null);
    setSending(true);
    nonceCounter.current += 1;
    const clientNonce = `${session.userId}-${Date.now()}-${nonceCounter.current}`;
    const bodyToSend = trimmedBody.length > 0 ? trimmedBody : null;
    const mediaToSend = attachments.map((a) => ({
      kind: a.kind,
      fileName: a.fileName,
      sizeBytes: a.sizeBytes,
      mimeType: a.mimeType,
    }));
    // The draft/attachments are only cleared once the send is accepted by
    // the repository — a thrown error (validation or access denial) leaves
    // the unsent draft and attachments intact so nothing is silently lost.
    try {
      const sent = await repository.sendMessage(
        conversationId,
        session.userId,
        bodyToSend,
        clientNonce,
        mediaToSend,
      );
      setDraft("");
      setAttachments([]);
      setMessages((prev) => [...prev.filter((m) => m.clientNonce !== clientNonce), sent]);
    } catch {
      setSendError("Message could not be sent. Check your draft and try again.");
    } finally {
      setSending(false);
    }
  }, [session, conversationId, draft, attachments, repository, isAppActive]);

  const handleRetry = useCallback(
    async (message: MessageRecord) => {
      if (!session || !conversationId) return;
      setSendError(null);
      try {
        const retried = await repository.retryMessage(
          conversationId,
          message.clientNonce,
          session.userId,
        );
        if (retried) {
          setMessages((prev) =>
            prev.map((m) => (m.clientNonce === retried.clientNonce ? retried : m)),
          );
        } else {
          setSendError("This message could not be retried.");
        }
      } catch {
        setSendError("This message could not be retried.");
      }
    },
    [session, conversationId, repository],
  );

  if (!session) return <DeniedState description="Sign in to open chat." />;
  if (state === "loading") return <LoadingState label="Loading conversation" />;
  if (state === "error") return <ErrorState onRetry={load} />;
  if (state === "denied") {
    return (
      <DeniedState
        title="Chat is not available"
        description="Chat opens only after payment is authoritatively confirmed for this booking, and only for the two booking participants."
      />
    );
  }

  const canSend = (draft.trim().length > 0 || attachments.length > 0) && !sending && isAppActive;

  return (
    <Screen scroll={false}>
      <Stack.Screen options={{ headerShown: true, title: "Chat" }} />
      {!isAppActive ? (
        <View style={styles.offlineBanner} accessibilityRole="alert">
          <Text style={styles.offlineText}>You appear to be offline. Messages will not send.</Text>
        </View>
      ) : null}
      {messages.length === 0 ? (
        <EmptyState title="No messages yet" description="Say hello to get started." />
      ) : (
        <FlatList
          data={messages}
          keyExtractor={(item) => item.clientNonce}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <MessageBubble
              message={item}
              mine={item.senderId === session.userId}
              onRetry={() => handleRetry(item)}
            />
          )}
        />
      )}
      <View style={styles.composer}>
        <ChatMediaAttachmentPicker
          attachments={attachments}
          onChange={setAttachments}
          disabled={sending}
        />
        {sendError ? (
          <Text
            style={styles.composerError}
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
          >
            {sendError}
          </Text>
        ) : null}
        <View style={styles.composerRow}>
          <View style={styles.composerField}>
            <TextField
              label="Message"
              value={draft}
              onChangeText={setDraft}
              description={undefined}
            />
          </View>
          <Button label="Send" onPress={handleSend} loading={sending} disabled={!canSend} />
        </View>
      </View>
    </Screen>
  );
}

function MessageBubble({
  message,
  mine,
  onRetry,
}: {
  readonly message: MessageRecord;
  readonly mine: boolean;
  readonly onRetry: () => void;
}) {
  return (
    <View style={[styles.bubbleRow, mine ? styles.bubbleRowMine : null]}>
      <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
        {message.body ? (
          <Text style={mine ? styles.bubbleTextMine : styles.bubbleTextTheirs}>{message.body}</Text>
        ) : null}
        {message.media.length > 0 ? (
          <View style={styles.mediaList} accessibilityRole="list">
            {message.media.map((item) => (
              <AttachmentLabel
                key={item.id}
                kind={item.kind}
                text={`${item.fileName} (${Math.round(item.sizeBytes / 1000)} KB)`}
                color={mine ? theme.onPrimary : theme.textPrimary}
                accessibilityLabel={`${item.kind === "image" ? "Image" : "Video"} attachment ${item.fileName}, ${item.mimeType}, ${Math.round(item.sizeBytes / 1000)} kilobytes`}
              />
            ))}
          </View>
        ) : null}
        <Text style={styles.bubbleStatus}>
          {message.deliveryStatus === "sending"
            ? "Sending…"
            : message.deliveryStatus === "failed"
              ? "Failed to send"
              : new Date(message.createdAt).toLocaleTimeString()}
        </Text>
        {message.deliveryStatus === "failed" ? (
          <Button label="Retry" onPress={onRetry} variant="text" />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  offlineBanner: {
    backgroundColor: theme.warningSoft,
    padding: spacing.sm,
    borderRadius: radii.sm,
    marginBottom: spacing.sm,
  },
  offlineText: { color: theme.warningOnSoft, fontSize: fontSize.xs, textAlign: "center" },
  listContent: { paddingVertical: spacing.md, gap: spacing.sm },
  bubbleRow: { flexDirection: "row", justifyContent: "flex-start" },
  bubbleRowMine: { justifyContent: "flex-end" },
  bubble: {
    maxWidth: "80%",
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.xs,
  },
  bubbleMine: { backgroundColor: theme.primary },
  bubbleTheirs: { backgroundColor: theme.surfaceSubtle },
  bubbleTextMine: { color: theme.onPrimary, fontSize: fontSize.md },
  bubbleTextTheirs: { color: theme.textPrimary, fontSize: fontSize.md },
  bubbleStatus: { fontSize: fontSize.xs, color: theme.textSecondary, marginTop: spacing.xs },
  mediaList: { gap: spacing.xs, marginTop: spacing.xs },
  composer: {
    gap: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: theme.borderSubtle,
  },
  composerRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.sm,
  },
  composerError: {
    color: theme.errorOnSoft,
    backgroundColor: theme.errorSoft,
    padding: spacing.sm,
    borderRadius: radii.sm,
    fontSize: fontSize.xs,
    fontWeight: "600",
  },
  composerField: { flex: 1, minHeight: MIN_TOUCH_TARGET },
});
