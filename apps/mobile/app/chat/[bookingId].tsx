import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Redirect, router, Stack, useLocalSearchParams } from "expo-router";
import type { BookingId, ConversationId } from "@dizkarte/domain";
import { formatPhp } from "@dizkarte/domain";
import { Screen } from "../../src/components/ui/Screen";
import { Button } from "../../src/components/ui/Button";
import { Icon } from "../../src/components/ui/Icon";
import { LoadingState, ErrorState, DeniedState } from "../../src/components/ui/AsyncState";
import { useSession } from "../../src/providers/SessionProvider";
import { useMarketplace } from "../../src/providers/MarketplaceProvider";
import { useConnectivity } from "../../src/providers/ConnectivityProvider";
import type { BookingRecord, MessageRecord } from "../../src/services/marketplace/types";
import { MediaPicker } from "../../src/components/media/MediaPicker";
import { SignedImage } from "../../src/components/media/SignedImage";
import type { UploadedObject } from "../../src/services/storage/upload";
import {
  MAX_CHAT_ATTACHMENTS,
  validateChatMessageInput,
} from "../../src/services/marketplace/chat-message-validation";
import { AttachmentLabel } from "../../src/components/ui/AttachmentLabel";
import { RebookSheet } from "../../src/components/task/RebookSheet";
import { ReportSheet } from "../../src/components/safety/ReportSheet";
import { Collapsible } from "../../src/components/ui/Collapsible";
import {
  theme,
  spacing,
  fontSize,
  lineHeight,
  radii,
  MIN_TOUCH_TARGET,
  noWebOutline,
} from "../../src/theme";
import { MOTION_DURATION, MOTION_EASING, MOTION_NATIVE_DRIVER } from "../../src/theme/motion";

type LoadState = "loading" | "loaded" | "denied" | "error";

/** A small status dot + label reads calmer here than a filled pill badge. */
const STATUS_DOT_COLOR: Record<BookingRecord["status"], string> = {
  PAYMENT_PENDING: theme.warningSolid,
  PAYMENT_FAILED: theme.errorSolid,
  CONFIRMED: theme.infoSolid,
  IN_PROGRESS: theme.infoSolid,
  COMPLETION_REQUESTED: theme.warningSolid,
  COMPLETED: theme.successSolid,
  CANCELLED: theme.textSecondary,
  DISPUTED: theme.errorSolid,
  REFUNDED: theme.textSecondary,
};
const STATUS_LABEL: Record<BookingRecord["status"], string> = {
  PAYMENT_PENDING: "Payment pending",
  PAYMENT_FAILED: "Payment failed",
  CONFIRMED: "Confirmed",
  IN_PROGRESS: "In progress",
  COMPLETION_REQUESTED: "Completion requested",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  DISPUTED: "Disputed",
  REFUNDED: "Refunded",
};

/** "Today" / "Yesterday" / a short date, for the centered separator between message groups. */
function dayLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOf(now) - startOf(d)) / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString(
    [],
    sameYear
      ? { weekday: "short", month: "short", day: "numeric" }
      : { year: "numeric", month: "short", day: "numeric" },
  );
}

type ChatRow =
  | { readonly kind: "separator"; readonly key: string; readonly label: string }
  | {
      readonly kind: "message";
      readonly key: string;
      readonly message: MessageRecord;
      readonly grouped: boolean;
    };

/** Interleave day separators and mark consecutive same-sender messages so they can sit closer together. */
function buildChatRows(messages: ReadonlyArray<MessageRecord>): ReadonlyArray<ChatRow> {
  const rows: ChatRow[] = [];
  let lastDay: string | null = null;
  let lastSender: string | null = null;
  for (const message of messages) {
    const label = dayLabel(message.createdAt);
    if (label !== lastDay) {
      rows.push({ kind: "separator", key: `sep-${label}-${message.id}`, label });
      lastDay = label;
      lastSender = null;
    }
    rows.push({
      kind: "message",
      key: message.id,
      message,
      grouped: lastSender === message.senderId,
    });
    lastSender = message.senderId;
  }
  return rows;
}

const CHAT_NEAR_END_THRESHOLD = 80;

/** Respect the platform's reduced-motion preference for message entry and list scrolling. */
function useReducedMotionPreference(): boolean {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (active) setReduceMotion(enabled);
      })
      .catch(() => undefined);
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduceMotion);
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  return reduceMotion;
}

export default function ChatScreen() {
  const params = useLocalSearchParams<{ bookingId: string; rebook?: string }>();

  const { session, status } = useSession();
  const { repository, notifyChanged } = useMarketplace();
  const { isAppActive } = useConnectivity();
  const [booking, setBooking] = useState<BookingRecord | null>(null);
  const [conversationId, setConversationId] = useState<ConversationId | null>(null);
  const [messages, setMessages] = useState<ReadonlyArray<MessageRecord>>([]);
  const [state, setState] = useState<LoadState>("loading");
  const [draft, setDraft] = useState("");
  const [attachments, setAttachments] = useState<ReadonlyArray<UploadedObject>>([]);
  const [attachmentsOpen, setAttachmentsOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [rebookOpen, setRebookOpen] = useState(false);
  const [reportMessageId, setReportMessageId] = useState<string | null>(null);
  const nonceCounter = useRef(0);
  const autoOpenedRebook = useRef(false);
  const listRef = useRef<FlatList<ChatRow>>(null);
  const messagesRef = useRef<ReadonlyArray<MessageRecord>>([]);
  const knownMessageIds = useRef<Set<string>>(new Set());
  const enteringMessageIds = useRef<Set<string>>(new Set());
  const pendingScrollToEnd = useRef(false);
  const postSendScrollGeneration = useRef(0);
  const postSendScrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messageContentHeight = useRef(0);
  const messageViewportHeight = useRef(0);
  const isNearListEnd = useRef(true);
  const reduceMotion = useReducedMotionPreference();

  // Counterpart identity and task context come from the real booking, never a
  // route param or a placeholder name.
  const isClientViewer = booking ? booking.clientId === session?.userId : false;
  const counterpartName = booking
    ? (isClientViewer ? booking.taskerDisplayName : booking.clientDisplayName) || "Dizkarte user"
    : "";
  const firstName = counterpartName.split(" ")[0] || counterpartName;
  const counterpartInitials = counterpartName.slice(0, 2).toUpperCase() || "?";

  /**
   * Commit a message snapshot while marking only IDs that were not already in
   * this conversation. Initial history and delivery-status refreshes therefore
   * stay still; actual sent/received inserts get the entry transition once.
   */
  const applyMessageList = useCallback(
    (
      nextMessages: ReadonlyArray<MessageRecord>,
      animateNew: boolean,
      scrollToEnd: "never" | "if-new" | "always",
    ) => {
      let hasNewMessage = false;
      for (const message of nextMessages) {
        const messageId = String(message.id);
        if (knownMessageIds.current.has(messageId)) continue;
        knownMessageIds.current.add(messageId);
        if (animateNew) {
          enteringMessageIds.current.add(messageId);
          hasNewMessage = true;
        }
      }

      messagesRef.current = nextMessages;
      setMessages(nextMessages);
      if (scrollToEnd === "always" || (scrollToEnd === "if-new" && hasNewMessage)) {
        pendingScrollToEnd.current = true;
      }
    },
    [],
  );

  const handleMessageEntryComplete = useCallback((messageId: string) => {
    enteringMessageIds.current.delete(messageId);
  }, []);

  const handleListScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const distanceFromEnd = contentSize.height - contentOffset.y - layoutMeasurement.height;
    isNearListEnd.current = distanceFromEnd <= CHAT_NEAR_END_THRESHOLD;
  }, []);

  const scrollToLatestMessage = useCallback(
    (animated = true) => {
      const list = listRef.current;
      if (!list) return;

      const contentHeight = messageContentHeight.current;
      const viewportHeight = messageViewportHeight.current;
      if (contentHeight > 0 && viewportHeight > 0) {
        // Use measured dimensions instead of FlatList's estimated final frame.
        // The extra logical pixel is clamped by the scroll view and avoids a
        // fractional-pixel shortfall on scaled React Native Web viewports.
        list.scrollToOffset({
          offset: Math.max(0, contentHeight - viewportHeight + 1),
          animated: animated && !reduceMotion,
        });
        return;
      }
      list.scrollToEnd({ animated: animated && !reduceMotion });
    },
    [reduceMotion],
  );

  const handleListContentSizeChange = useCallback(
    (_width: number, height: number) => {
      messageContentHeight.current = height;
      if (!pendingScrollToEnd.current && !isNearListEnd.current) return;
      pendingScrollToEnd.current = false;
      scrollToLatestMessage();
    },
    [scrollToLatestMessage],
  );

  const handleListLayout = useCallback(
    (event: LayoutChangeEvent) => {
      messageViewportHeight.current = event.nativeEvent.layout.height;
      if (!pendingScrollToEnd.current && !isNearListEnd.current) return;
      scrollToLatestMessage();
    },
    [scrollToLatestMessage],
  );

  /**
   * Re-scroll after React commits and once more after the 240ms bubble/composer
   * motion window. This covers realtime-before-send races, responsive viewport
   * resizing, keyboard/composer layout changes, and RN Web fractional sizing.
   */
  const schedulePostSendScroll = useCallback(() => {
    if (postSendScrollTimer.current) clearTimeout(postSendScrollTimer.current);
    const generation = postSendScrollGeneration.current + 1;
    postSendScrollGeneration.current = generation;

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (postSendScrollGeneration.current !== generation) return;
        scrollToLatestMessage();
      });
    });

    postSendScrollTimer.current = setTimeout(() => {
      if (postSendScrollGeneration.current !== generation) return;
      // The final non-animated correction guarantees the exact end after all
      // responsive/animated layout changes without a second visible glide.
      scrollToLatestMessage(false);
      pendingScrollToEnd.current = false;
      postSendScrollTimer.current = null;
    }, MOTION_DURATION.open + 100);
  }, [scrollToLatestMessage]);

  const load = useCallback(() => {
    if (!session) return;
    setState("loading");
    messagesRef.current = [];
    knownMessageIds.current.clear();
    enteringMessageIds.current.clear();
    pendingScrollToEnd.current = false;
    postSendScrollGeneration.current += 1;
    if (postSendScrollTimer.current) clearTimeout(postSendScrollTimer.current);
    postSendScrollTimer.current = null;
    messageContentHeight.current = 0;
    messageViewportHeight.current = 0;
    isNearListEnd.current = true;
    Promise.all([
      repository.getBooking(params.bookingId as BookingId, session.userId),
      repository.getConversationForBooking(params.bookingId as BookingId, session.userId),
    ])
      .then(async ([bookingRecord, conversation]) => {
        setBooking(bookingRecord);
        if (!conversation) {
          // Chat unlocks only after payment confirms the booking; before that
          // there is no conversation to show.
          setState("denied");
          return;
        }
        setConversationId(conversation.id);
        const list = await repository.listMessages(conversation.id, session.userId);
        applyMessageList(list, false, "never");
        setState("loaded");
      })
      .catch(() => setState("error"));
  }, [applyMessageList, params.bookingId, repository, session]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(
    () => () => {
      postSendScrollGeneration.current += 1;
      if (postSendScrollTimer.current) clearTimeout(postSendScrollTimer.current);
    },
    [],
  );

  // Arrived via a "Rebook" action: let the conversation render first, then slide
  // the "Book again" sheet up — once, so a manual close is not immediately undone.
  useEffect(() => {
    if (autoOpenedRebook.current) return;
    if (state !== "loaded" || !booking || params.rebook !== "1") return;
    autoOpenedRebook.current = true;
    const timer = setTimeout(() => setRebookOpen(true), 350);
    return () => clearTimeout(timer);
  }, [state, booking, params.rebook]);

  useEffect(() => {
    if (!session || !conversationId) return;
    const viewerId = session.userId;
    const unsubscribe = repository.subscribeToConversation(conversationId, viewerId, () => {
      void repository
        .listMessages(conversationId, viewerId)
        .then((list) => applyMessageList(list, true, isNearListEnd.current ? "if-new" : "never"))
        .catch(() => undefined);
    });
    return unsubscribe;
  }, [applyMessageList, conversationId, repository, session]);

  /**
   * Clear this conversation's unread state.
   *
   * Runs when the thread is open and again whenever a message arrives while it
   * is open — reading a message the user is literally looking at should not leave
   * a badge behind. `notifyChanged()` refreshes the Bookings list badge without
   * that screen having to poll.
   *
   * Failures are swallowed: the mark is a convenience, and the messages
   * themselves are already displayed.
   */
  useEffect(() => {
    if (!session || !conversationId || state !== "loaded") return;
    let active = true;
    void repository
      .markConversationRead(conversationId, session.userId)
      .then(() => {
        if (active) notifyChanged();
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [conversationId, messages.length, notifyChanged, repository, session, state]);

  const handleSend = useCallback(async () => {
    if (!session || !conversationId) return;
    const trimmedBody = draft.trim();
    if (trimmedBody.length === 0 && attachments.length === 0) return;
    const mediaToSend = attachments.map((a) => ({
      kind: a.kind === "video" ? ("video" as const) : ("image" as const),
      fileName: a.fileName,
      sizeBytes: a.sizeBytes,
      mimeType: a.mimeType,
      storagePath: a.path,
    }));
    const validation = validateChatMessageInput({ body: trimmedBody, media: mediaToSend });
    if (!validation.ok) {
      setSendError(validation.reason);
      return;
    }
    if (!isAppActive) return;
    setSendError(null);
    setSending(true);
    nonceCounter.current += 1;
    const clientNonce = `${session.userId}-${Date.now()}-${nonceCounter.current}`;
    const bodyToSend = trimmedBody.length > 0 ? trimmedBody : null;
    try {
      const sent = await repository.sendMessage(
        conversationId,
        session.userId,
        bodyToSend,
        clientNonce,
        mediaToSend,
      );
      applyMessageList(
        [
          ...messagesRef.current.filter(
            (message) => message.id !== sent.id && message.clientNonce !== clientNonce,
          ),
          sent,
        ],
        true,
        "always",
      );
      setDraft("");
      setAttachments([]);
      setAttachmentsOpen(false);
      schedulePostSendScroll();
    } catch {
      setSendError("Message could not be sent. Check your draft and try again.");
    } finally {
      setSending(false);
    }
  }, [
    applyMessageList,
    schedulePostSendScroll,
    session,
    conversationId,
    draft,
    attachments,
    repository,
    isAppActive,
  ]);

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
          applyMessageList(
            messagesRef.current.map((message) =>
              message.clientNonce === retried.clientNonce ? retried : message,
            ),
            false,
            "never",
          );
        }
      } catch {
        setSendError("This message could not be retried.");
      }
    },
    [applyMessageList, session, conversationId, repository],
  );

  const insets = useSafeAreaInsets();
  const rows = useMemo(() => buildChatRows(messages), [messages]);

  if (status === "loading") return <LoadingState label="Loading" />;
  if (!session) return <Redirect href="/(auth)/welcome" />;
  if (state === "loading") return <LoadingState label="Loading conversation" />;
  if (state === "denied")
    return <DeniedState description="Chat opens once payment confirms this booking." />;
  if (state === "error") return <ErrorState onRetry={load} />;

  const canSend = (draft.trim().length > 0 || attachments.length > 0) && !sending && isAppActive;

  return (
    <Screen
      scroll={false}
      padded={false}
      subPageTitle={counterpartName ? `Chat with ${counterpartName}` : "Chat"}
    >
      <Stack.Screen options={{ headerShown: false }} />

      <KeyboardAvoidingView
        style={styles.chatContainer}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.chatTopSection}>
          {!isAppActive ? (
            <View style={styles.offlineBanner} accessibilityRole="alert">
              <Icon name="alert-circle" size={14} color={theme.warningOnSoft} />
              <Text style={styles.offlineText}>You're offline. Messages will not send.</Text>
            </View>
          ) : null}

          {booking ? (
            <View style={styles.contextCard}>
              <Pressable
                style={({ pressed }) => [styles.contextRow, pressed ? styles.contextRowPressed : null]}
                onPress={() => router.push({ pathname: "/booking/[id]", params: { id: booking.id } })}
                accessibilityRole="button"
                accessibilityLabel={`Open booking with ${counterpartName}, ${STATUS_LABEL[booking.status]}`}
              >
                <View style={styles.avatarCircle}>
                  <Text style={styles.avatarText}>{counterpartInitials}</Text>
                </View>
                <View style={styles.contextTextGroup}>
                  <View style={styles.contextTopLine}>
                    <Text style={styles.contextName} numberOfLines={1}>
                      {counterpartName}
                    </Text>
                    <Icon name="chevron-right" size={16} color={theme.textSecondary} />
                  </View>
                  <Text style={styles.contextTaskTitle} numberOfLines={1}>
                    {booking.taskTitle}
                  </Text>
                  <View style={styles.contextMetaRow}>
                    <View style={styles.statusRow}>
                      <View
                        style={[
                          styles.statusDot,
                          { backgroundColor: STATUS_DOT_COLOR[booking.status] },
                        ]}
                      />
                      <Text style={[styles.statusLabel, { color: STATUS_DOT_COLOR[booking.status] }]}>
                        {STATUS_LABEL[booking.status]}
                      </Text>
                    </View>
                    <Text style={styles.contextAmount}>{formatPhp(booking.agreedCentavos)}</Text>
                  </View>
                </View>
              </Pressable>

              <View style={styles.contextDivider} />

              <Pressable
                style={({ pressed }) => [styles.rebookBtn, pressed ? styles.rebookBtnPressed : null]}
                onPress={() => setRebookOpen(true)}
                accessibilityRole="button"
                accessibilityLabel={`Rebook ${firstName}`}
              >
                <Text style={styles.rebookBtnText}>Rebook {firstName}</Text>
              </Pressable>
            </View>
          ) : null}
        </View>

      <FlatList
        ref={listRef}
        style={styles.messageList}
        data={rows}
        keyExtractor={(row) => row.key}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        onScroll={handleListScroll}
        scrollEventThrottle={16}
        onLayout={handleListLayout}
        onContentSizeChange={handleListContentSizeChange}
        ListEmptyComponent={
          <View style={styles.emptyChat}>
            <View style={styles.emptyChatIconCircle}>
              <Icon name="chat" size={22} color={theme.primary} />
            </View>
            <Text style={styles.emptyChatTitle}>No messages yet</Text>
            <Text style={styles.emptyChatText}>
              Send the first message to {firstName || "your counterpart"} to coordinate the work.
            </Text>
          </View>
        }
        renderItem={({ item }) =>
          item.kind === "separator" ? (
            <View style={styles.daySeparatorRow}>
              <View style={styles.daySeparatorLine} />
              <Text style={styles.daySeparatorLabel}>{item.label}</Text>
              <View style={styles.daySeparatorLine} />
            </View>
          ) : (
            <MessageBubble
              message={item.message}
              mine={item.message.senderId === session.userId}
              grouped={item.grouped}
              animateEntry={
                !reduceMotion && enteringMessageIds.current.has(String(item.message.id))
              }
              onEntryAnimationComplete={handleMessageEntryComplete}
              onRetry={() => handleRetry(item.message)}
              {...(item.message.senderId === session.userId
                ? {}
                : { onReport: () => setReportMessageId(String(item.message.id)) })}
            />
          )
        }
      />

        <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
          {sendError ? (
            <Text
              style={styles.composerError}
              accessibilityRole="alert"
              accessibilityLiveRegion="polite"
            >
              {sendError}
            </Text>
          ) : null}

          {conversationId ? (
            <Collapsible expanded={attachmentsOpen} maxHeight={340} style={styles.attachmentsPanel}>
              <MediaPicker
                bucket="chat-media"
                userId={session.userId}
                scopeId={conversationId}
                value={attachments}
                onChange={setAttachments}
                label="Attachments"
                allowVideo
                maxCount={MAX_CHAT_ATTACHMENTS}
                disabled={sending}
              />
            </Collapsible>
          ) : null}

          <View style={styles.composerRow}>
            <Pressable
              onPress={() => setAttachmentsOpen((open) => !open)}
              accessibilityRole="button"
              accessibilityLabel={attachmentsOpen ? "Hide attachments" : "Add attachments"}
              accessibilityState={{ expanded: attachmentsOpen }}
              style={({ pressed }) => [
                styles.attachToggle,
                attachmentsOpen ? styles.attachToggleActive : null,
                pressed ? { opacity: 0.85 } : null,
              ]}
            >
              <Icon
                name="image"
                size={19}
                color={attachmentsOpen ? theme.onPrimary : theme.primary}
              />
              {attachments.length > 0 ? (
                <View style={styles.attachBadge}>
                  <Text style={styles.attachBadgeText}>{attachments.length}</Text>
                </View>
              ) : null}
            </Pressable>

            <View style={styles.composerInputWrapper}>
              <TextInput
                style={[styles.composerTextInput, noWebOutline]}
                placeholder={`Message ${firstName || "your counterpart"}…`}
                placeholderTextColor={theme.textSecondary}
                value={draft}
                onChangeText={setDraft}
                multiline={false}
                returnKeyType="send"
                onSubmitEditing={handleSend}
                spellCheck={false}
              />
            </View>

            <Pressable
              onPress={handleSend}
              disabled={!canSend}
              accessibilityRole="button"
              accessibilityLabel="Send message"
              accessibilityState={{ disabled: !canSend, busy: sending }}
              style={({ pressed }) => [
                styles.sendButton,
                !canSend ? styles.sendButtonDisabled : null,
                pressed && canSend ? styles.sendButtonPressed : null,
              ]}
            >
              {sending ? (
                <ActivityIndicator size="small" color={theme.onPrimary} />
              ) : (
                <Icon
                  name="send"
                  size={17}
                  color={canSend ? theme.onPrimary : theme.disabledForeground}
                />
              )}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>

      {booking ? (
        <RebookSheet
          visible={rebookOpen}
          booking={booking}
          taskerName={counterpartName}
          onClose={() => setRebookOpen(false)}
        />
      ) : null}

      {session && reportMessageId ? (
        <ReportSheet
          visible
          reporterId={session.userId}
          resourceType="message"
          resourceId={reportMessageId}
          subjectLabel="this message"
          onClose={() => setReportMessageId(null)}
        />
      ) : null}
    </Screen>
  );
}

function MessageBubble({
  message,
  mine,
  grouped,
  animateEntry,
  onEntryAnimationComplete,
  onRetry,
  onReport,
}: {
  readonly message: MessageRecord;
  readonly mine: boolean;
  readonly grouped: boolean;
  readonly animateEntry: boolean;
  readonly onEntryAnimationComplete: (messageId: string) => void;
  readonly onRetry: () => void;
  /** Absent for your own messages — reporting yourself is meaningless. */
  readonly onReport?: () => void;
}) {
  const messageId = String(message.id);
  const entryProgress = useRef(new Animated.Value(animateEntry ? 0 : 1)).current;
  const timeLabel = new Date(message.createdAt).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  useEffect(() => {
    if (!animateEntry) {
      entryProgress.setValue(1);
      onEntryAnimationComplete(messageId);
      return;
    }

    entryProgress.setValue(0);
    const animation = Animated.timing(entryProgress, {
      toValue: 1,
      duration: MOTION_DURATION.open,
      easing: MOTION_EASING.open,
      useNativeDriver: MOTION_NATIVE_DRIVER,
    });
    animation.start(({ finished }) => {
      if (finished) onEntryAnimationComplete(messageId);
    });
    return () => animation.stop();
  }, [animateEntry, entryProgress, messageId, onEntryAnimationComplete]);

  const translateX = entryProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [mine ? 10 : -10, 0],
  });
  const translateY = entryProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [6, 0],
  });
  const scale = entryProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0.98, 1],
  });

  return (
    <Animated.View
      style={[
        styles.bubbleRow,
        mine ? styles.bubbleRowMine : null,
        grouped ? styles.bubbleRowGrouped : null,
        {
          opacity: entryProgress,
          transform: [{ translateX }, { translateY }, { scale }],
        },
      ]}
    >
      <View
        style={[
          styles.bubble,
          mine ? styles.bubbleMine : styles.bubbleTheirs,
          mine ? styles.bubbleTailMine : styles.bubbleTailTheirs,
        ]}
      >
        {/*
          Long-press is the platform-conventional gesture for message actions, but
          it is invisible to a screen reader and to anyone who cannot hold a press,
          so the same action is also published as an accessibility action.
        */}
        <Pressable
          onLongPress={onReport}
          disabled={!onReport}
          delayLongPress={350}
          accessibilityRole={onReport ? "button" : undefined}
          accessibilityHint={onReport ? "Long press to report this message" : undefined}
          accessibilityActions={
            onReport ? [{ name: "report", label: "Report message" }] : undefined
          }
          onAccessibilityAction={(event) => {
            if (event.nativeEvent.actionName === "report") onReport?.();
          }}
          style={styles.bubblePressable}
        >
          {message.body ? (
            <Text style={mine ? styles.bubbleTextMine : styles.bubbleTextTheirs}>
              {message.body}
            </Text>
          ) : null}
          {message.media.length > 0 ? (
            <View style={styles.mediaList} accessibilityRole="list">
              {message.media.map((item) => (
                <View key={item.id} style={styles.mediaItem}>
                  {item.kind === "image" ? (
                    <SignedImage
                      bucket="chat-media"
                      path={item.storagePath}
                      accessibilityLabel={`Image attachment ${item.fileName}`}
                    />
                  ) : null}
                  <AttachmentLabel
                    kind={item.kind}
                    text={`${item.fileName} (${Math.round(item.sizeBytes / 1000)} KB)`}
                    color={mine ? theme.onPrimary : theme.textPrimary}
                    accessibilityLabel={`${item.kind === "image" ? "Image" : "Video"} attachment ${item.fileName}, ${item.mimeType}, ${Math.round(item.sizeBytes / 1000)} kilobytes`}
                  />
                </View>
              ))}
            </View>
          ) : null}
          <View style={styles.bubbleStatusRow}>
            {message.deliveryStatus === "sending" ? (
              <Text
                style={[
                  styles.bubbleStatus,
                  mine ? styles.bubbleStatusMine : styles.bubbleStatusTheirs,
                ]}
              >
                Sending…
              </Text>
            ) : message.deliveryStatus === "failed" ? (
              <>
                <Icon name="alert-circle" size={12} color={theme.errorSolid} />
                <Text style={styles.bubbleStatusFailed}>Not delivered</Text>
              </>
            ) : (
              <>
                <Text
                  style={[
                    styles.bubbleStatus,
                    mine ? styles.bubbleStatusMine : styles.bubbleStatusTheirs,
                  ]}
                >
                  {timeLabel}
                </Text>
                {mine ? <Icon name="check-circle" size={11} color="rgba(255,255,255,0.7)" /> : null}
              </>
            )}
          </View>
          {message.deliveryStatus === "failed" ? (
            <Button label="Retry" onPress={onRetry} variant="text" />
          ) : null}
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  chatContainer: {
    flex: 1,
    minHeight: 0,
    backgroundColor: theme.background,
  },
  chatTopSection: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  offlineBanner: {
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    backgroundColor: theme.warningSoft,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.sm,
    marginBottom: spacing.sm,
  },
  offlineText: { color: theme.warningOnSoft, fontSize: fontSize.xs, fontWeight: "600" },

  // Conversation context card
  contextCard: {
    flexShrink: 0,
    backgroundColor: theme.surface,
    borderRadius: radii.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    overflow: "hidden",
  },
  contextRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.md,
  },
  contextRowPressed: { backgroundColor: theme.surfaceSubtle },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: theme.onPrimary, fontSize: fontSize.md, fontWeight: "700" },
  contextTextGroup: { flex: 1, gap: 4 },
  contextTopLine: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  contextName: {
    flex: 1,
    fontSize: fontSize.md,
    fontWeight: "800",
    color: theme.textPrimary,
  },
  contextTaskTitle: { fontSize: fontSize.sm, color: theme.textSecondary },
  contextMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 2,
  },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  statusDot: { width: 7, height: 7, borderRadius: 3.5 },
  statusLabel: { fontSize: fontSize.xs, fontWeight: "600" },
  contextAmount: { fontSize: fontSize.sm, fontWeight: "800", color: theme.primary },
  contextDivider: { height: 1, backgroundColor: theme.borderSubtle },
  rebookBtn: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.primary,
    paddingVertical: spacing.sm + 3,
  },
  rebookBtnPressed: { backgroundColor: theme.primaryPressed },
  rebookBtnText: { color: theme.onPrimary, fontSize: fontSize.sm, fontWeight: "700" },

  // Message list. `minHeight: 0` lets the web flex item shrink between the
  // booking context and composer instead of retaining intrinsic content height.
  messageList: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 0,
    minHeight: 0,
  },
  listContent: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    flexGrow: 1,
  },
  daySeparatorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginVertical: spacing.sm,
  },
  daySeparatorLine: { flex: 1, height: 1, backgroundColor: theme.borderSubtle },
  daySeparatorLabel: {
    fontSize: fontSize.xs,
    fontWeight: "700",
    color: theme.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  emptyChat: { alignItems: "center", paddingVertical: spacing.xxl, gap: spacing.sm },
  emptyChatIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: theme.primarySoft,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.xs,
  },
  emptyChatTitle: { fontSize: fontSize.md, fontWeight: "700", color: theme.textPrimary },
  emptyChatText: {
    fontSize: fontSize.sm,
    color: theme.textSecondary,
    textAlign: "center",
    maxWidth: 260,
  },
  bubbleRow: { flexDirection: "row", justifyContent: "flex-start", marginTop: spacing.sm },
  bubbleRowMine: { justifyContent: "flex-end" },
  bubbleRowGrouped: { marginTop: 3 },
  bubble: {
    maxWidth: "80%",
    borderRadius: radii.md + 4,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  bubbleMine: { backgroundColor: theme.primary },
  bubbleTheirs: { backgroundColor: theme.surfaceSubtle },
  bubbleTailMine: { borderBottomRightRadius: 5 },
  bubbleTailTheirs: { borderBottomLeftRadius: 5 },
  bubbleTextMine: { color: theme.onPrimary, fontSize: fontSize.md, lineHeight: lineHeight.md },
  bubbleTextTheirs: { color: theme.textPrimary, fontSize: fontSize.md, lineHeight: lineHeight.md },
  bubblePressable: {
    // Layout-neutral: the bubble keeps its own padding and width.
    gap: 4,
  },
  bubbleStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 4,
  },
  bubbleStatus: { fontSize: 11 },
  bubbleStatusMine: { color: "rgba(255,255,255,0.7)" },
  bubbleStatusTheirs: { color: theme.textSecondary },
  bubbleStatusFailed: { fontSize: 11, color: theme.errorSolid, fontWeight: "600" },
  mediaList: { gap: spacing.sm, marginTop: spacing.xs },
  mediaItem: { gap: spacing.xs },

  // Composer
  composer: {
    flexShrink: 0,
    gap: spacing.sm,
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.borderSubtle,
    backgroundColor: theme.surface,
  },
  composerError: {
    color: theme.errorOnSoft,
    backgroundColor: theme.errorSoft,
    padding: spacing.sm,
    borderRadius: radii.sm,
    fontSize: fontSize.xs,
    fontWeight: "600",
  },
  attachmentsPanel: {
    backgroundColor: theme.surfaceSubtle,
    borderRadius: radii.md,
    padding: spacing.sm,
  },
  composerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  attachToggle: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    borderRadius: MIN_TOUCH_TARGET / 2,
    borderWidth: 1,
    borderColor: theme.borderControl,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  attachToggleActive: { backgroundColor: theme.primary, borderColor: theme.primary },
  attachBadge: {
    position: "absolute",
    top: -2,
    right: -2,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: theme.errorSolid,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  attachBadgeText: { color: "#FFFFFF", fontSize: 10, fontWeight: "800" },
  composerInputWrapper: {
    flex: 1,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.borderControl,
    borderRadius: radii.pill,
    justifyContent: "center",
    minHeight: MIN_TOUCH_TARGET,
  },
  composerTextInput: {
    fontSize: fontSize.md,
    color: theme.textPrimary,
    paddingHorizontal: spacing.md + 2,
    paddingVertical: spacing.xs + 2,
  },
  sendButton: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    borderRadius: MIN_TOUCH_TARGET / 2,
    backgroundColor: theme.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  sendButtonPressed: { backgroundColor: theme.primaryPressed, transform: [{ scale: 0.96 }] },
  sendButtonDisabled: { backgroundColor: theme.disabledBackground },
});
