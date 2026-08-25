import React, { memo } from "react";
import MessageBubble from "./MessageBubble";

function isSameDay(d1, d2) {
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
}

function formatDateLabel(dateString) {
  if (!dateString) return null;
  const date = new Date(dateString);
  const now = new Date();

  if (isSameDay(date, now)) {
    return "Today";
  }

  const yesterday = new Date();
  yesterday.setDate(now.getDate() - 1);
  if (isSameDay(date, yesterday)) {
    return "Yesterday";
  }

  return date.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
}

function MessageListComponent({ messages = [], activeCategory = null }) {
  if (!messages || messages.length === 0) {
    return null;
  }

  const isFiltering = Boolean(activeCategory && activeCategory !== "all");

  return (
    <div className={`message-list ${isFiltering ? "filtering" : ""}`}>
      {messages.map((message, index) => {
        const category = (message.aiCategory || "").toLowerCase();
        const isHighlighted =
          isFiltering && category === activeCategory.toLowerCase();

        // Check if date label divider is needed
        const prevMsg = messages[index - 1];
        const currentMsgDate = message.created_at
          ? new Date(message.created_at)
          : null;
        const prevMsgDate = prevMsg?.created_at
          ? new Date(prevMsg.created_at)
          : null;

        const showDateDivider =
          currentMsgDate &&
          (!prevMsgDate || !isSameDay(currentMsgDate, prevMsgDate));

        const dateLabel = showDateDivider
          ? formatDateLabel(message.created_at)
          : null;

        return (
          <React.Fragment key={message.id || message.created_at || index}>
            {dateLabel && (
              <div className="chat-date-separator">
                <span>{dateLabel}</span>
              </div>
            )}

            <MessageBubble
              message={message}
              isHighlighted={isHighlighted}
            />
          </React.Fragment>
        );
      })}
    </div>
  );
}

export default memo(MessageListComponent);