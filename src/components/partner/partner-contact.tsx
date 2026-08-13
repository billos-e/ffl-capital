"use client";

import { useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { ActionButton } from "@/components/ui/action-button";
import { usePartner } from "@/components/partner/partner-provider";
import { notify } from "@/lib/notify";
import {
  CONTACT_TOPICS,
  type ContactTopicValue,
} from "@/lib/partner/contact-topics";
import { DEFAULT_CONTACT_RECIPIENT_EMAIL } from "@/lib/settings/contact-recipient";
import { EnvelopeSimple, ICON_WEIGHT, PaperPlaneTilt } from "@/lib/icons/client";

export function PartnerContactView() {
  const { partner } = usePartner();
  const defaultSubject: ContactTopicValue =
    partner.status === "pending_approval" ? "activation" : "account";

  const [subject, setSubject] = useState<ContactTopicValue>(defaultSubject);
  const [customTopic, setCustomTopic] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (subject === "other" && !customTopic.trim()) {
      notify.error("Please describe your topic before sending.");
      return;
    }

    if (!message.trim()) {
      notify.error("Please enter a message before sending.");
      return;
    }

    setSending(true);
    try {
      const payload: {
        topic: ContactTopicValue;
        message: string;
        customTopic?: string;
      } = { topic: subject, message: message.trim() };
      if (subject === "other") {
        payload.customTopic = customTopic.trim();
      }

      const res = await fetch("/api/partner/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        warning?: string;
        confirmationSent?: boolean;
      };

      if (!res.ok) {
        notify.error(
          typeof data.error === "string" && data.error
            ? data.error
            : "Failed to send your message. Please try again.",
        );
        return;
      }

      setMessage("");
      setCustomTopic("");
      if (data.warning) {
        notify.success("Message sent", { description: data.warning });
      } else {
        notify.success("Message sent", {
          description: "You will receive a confirmation email shortly.",
        });
      }
    } catch {
      notify.error("Failed to send your message. Please try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Contact Us"
        subtitle="Send a message to the Capital Lead Solutions support team"
      />

      <form onSubmit={handleSubmit} className="card p-6 sm:p-8">
        <div className="space-y-5">
          <div>
            <label htmlFor="contact-subject" className="form-label">
              Topic
            </label>
            <select
              id="contact-subject"
              className="form-select"
              value={subject}
              disabled={sending}
              onChange={(e) => {
                const next = e.target.value as ContactTopicValue;
                setSubject(next);
                if (next !== "other") {
                  setCustomTopic("");
                }
              }}
            >
              {CONTACT_TOPICS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {subject === "other" && (
            <div>
              <label htmlFor="contact-custom-topic" className="form-label">
                Your topic
              </label>
              <input
                id="contact-custom-topic"
                type="text"
                className="form-input"
                placeholder="Briefly describe what your message is about"
                value={customTopic}
                maxLength={120}
                disabled={sending}
                onChange={(e) => {
                  setCustomTopic(e.target.value);
                }}
              />
            </div>
          )}

          <div>
            <label htmlFor="contact-message" className="form-label">
              Message
            </label>
            <textarea
              id="contact-message"
              className="form-input min-h-[160px] resize-y"
              placeholder={
                subject === "activation"
                  ? "Hi — I completed onboarding and would like my account activated so I can start receiving leads."
                  : "Describe your question or issue…"
              }
              value={message}
              disabled={sending}
              onChange={(e) => {
                setMessage(e.target.value);
              }}
            />
          </div>

          <div className="flex items-center justify-between gap-4 border-t border-slate-100 pt-5">
            <p className="text-xs text-slate-400">
              {partner.firstName} {partner.lastName} · {partner.email}
            </p>
            <ActionButton
              type="submit"
              icon={<PaperPlaneTilt size={15} />}
              className="flex-shrink-0"
              loading={sending}
              loadingText="Sending…"
              disabled={sending}
            >
              Send
            </ActionButton>
          </div>
        </div>
      </form>
    </div>
  );
}
