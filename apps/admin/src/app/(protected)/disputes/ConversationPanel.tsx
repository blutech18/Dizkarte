"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/Button";
import type { ConversationMessage } from "@/lib/repository/types";
import { readDisputeConversationAction } from "./actions";

export type ConversationPanelProps = {
  readonly disputeId: string;
  readonly disabled: boolean;
};

/**
 * On-demand transcript of the booking conversation behind a dispute.
 *
 * Deliberately not loaded with the page. `admin_read_conversation_messages`
 * writes an audit entry before returning anything, so a passive render would
 * log a privacy-sensitive read that nobody asked for. The Admin states a reason
 * and presses the button; that reason lands in the audit trail.
 *
 * Attachments are reported as a count only — the bytes stay behind
 * `admin_authorize_object_read`.
 */
export function ConversationPanel({ disputeId, disabled }: ConversationPanelProps) {
  const reasonId = useId();
  const [reason, setReason] = useState("");
  const [messages, setMessages] = useState<ReadonlyArray<ConversationMessage> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleRead() {
    if (reason.trim().length === 0) {
      setError("State why you need to read this conversation.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await readDisputeConversationAction({ disputeId, reason });
      if (result.ok) {
        setMessages(result.messages);
      } else {
        setMessages(null);
        setError(result.message);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div role="group" aria-label="Booking conversation">
      <p className="dk-muted" style={{ marginTop: 0 }}>
        Reading this conversation is recorded against your Admin account together with the reason you
        give. Only the Admin assigned to this dispute may read it.
      </p>
      <div className="dk-field" style={{ maxWidth: 420 }}>
        <label className="dk-label" htmlFor={reasonId}>
          Reason for reading
        </label>
        <input
          id={reasonId}
          className="dk-input"
          type="text"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          disabled={disabled || loading}
        />
      </div>
      <Button
        variant="secondary"
        onClick={() => void handleRead()}
        disabled={disabled || loading}
        loading={loading}
      >
        Read conversation
      </Button>
      {error ? (
        <p className="dk-field-error" role="alert">
          {error}
        </p>
      ) : null}
      {messages ? (
        messages.length === 0 ? (
          <p className="dk-muted">This conversation has no messages.</p>
        ) : (
          <table className="dk-table">
            <caption className="dk-visually-hidden">Booking conversation</caption>
            <thead>
              <tr>
                <th scope="col">Sent</th>
                <th scope="col">Sender</th>
                <th scope="col">Message</th>
                <th scope="col">Attachments</th>
              </tr>
            </thead>
            <tbody>
              {messages.map((message) => (
                <tr key={message.id}>
                  <td>{new Date(message.sentAt).toLocaleString("en-PH")}</td>
                  <td>{message.senderDisplayName}</td>
                  <td>{message.body ?? "No text"}</td>
                  <td>{message.attachmentCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      ) : null}
    </div>
  );
}
