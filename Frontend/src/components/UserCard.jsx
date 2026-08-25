import React from "react";

// =====================================================
// GET RAW MESSAGE TIMESTAMP
// =====================================================

function getMessageTimestamp(contact) {
  if (!contact) {
    return null;
  }

  return (
    contact.lastMessageTimestamp ??
    contact.last_message_timestamp ??
    contact.lastMessageAt ??
    contact.last_message_at ??
    contact.lastMessageDate ??
    contact.last_message_date ??
    null
  );
}

// =====================================================
// NORMALIZE TIMESTAMP
// =====================================================

function normalizeTimestamp(timestamp) {
  if (
    timestamp === null ||
    timestamp === undefined ||
    timestamp === ""
  ) {
    return 0;
  }

  // Date object
  if (timestamp instanceof Date) {
    const value = timestamp.getTime();
    return Number.isNaN(value) ? 0 : value;
  }

  // Number
  if (typeof timestamp === "number") {
    if (timestamp <= 0) {
      return 0;
    }

    // Unix seconds
    if (timestamp < 100000000000) {
      return timestamp * 1000;
    }

    // Unix milliseconds
    return timestamp;
  }

  // Numeric string
  if (
    typeof timestamp === "string" &&
    /^\d+$/.test(timestamp.trim())
  ) {
    const value = Number(timestamp);

    if (value <= 0) {
      return 0;
    }

    if (value < 100000000000) {
      return value * 1000;
    }

    return value;
  }

  // ISO date string
  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    return 0;
  }

  return date.getTime();
}

// =====================================================
// SIDEBAR LABEL
//
// TODAY      -> 19:00
// YESTERDAY  -> Yesterday
// OLDER      -> 21 Aug
// OTHER YEAR -> 21 Aug 2025
// =====================================================

function getSidebarTimeLabel(contact) {
  if (!contact) {
    return "";
  }

  const rawTimestamp = getMessageTimestamp(contact);
  const timestamp = normalizeTimestamp(rawTimestamp);

  // ===================================================
  // IMPORTANT:
  // If there is no real timestamp but backend already
  // gives us lastMessageTime such as "19:00", keep it.
  // ===================================================

  if (!timestamp) {
    return contact.lastMessageTime || "";
  }

  const messageDate = new Date(timestamp);
  const now = new Date();

  // ===================================================
  // TODAY
  // ===================================================

  const isToday =
    messageDate.getFullYear() === now.getFullYear() &&
    messageDate.getMonth() === now.getMonth() &&
    messageDate.getDate() === now.getDate();

  if (isToday) {
    return messageDate.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
  }

  // ===================================================
  // YESTERDAY
  // ===================================================

  const yesterday = new Date(now);

  yesterday.setHours(0, 0, 0, 0);
  yesterday.setDate(yesterday.getDate() - 1);

  const messageDay = new Date(messageDate);
  messageDay.setHours(0, 0, 0, 0);

  if (messageDay.getTime() === yesterday.getTime()) {
    return "Yesterday";
  }

  // ===================================================
  // OLDER DATE
  // ===================================================

  const isSameYear =
    messageDate.getFullYear() === now.getFullYear();

  return messageDate.toLocaleDateString([], {
    day: "2-digit",
    month: "short",
    ...(isSameYear
      ? {}
      : { year: "numeric" }),
  });
}

export default function UserCard({
  contact,
  selected,
  onClick,
}) {
  if (!contact) {
    return null;
  }

  const displayName =
    contact.username ||
    contact.name ||
    "Unknown";

  const initial = displayName
    .charAt(0)
    .toUpperCase();

  // =====================================================
  // CALCULATE SIDEBAR TIME DIRECTLY HERE
  // =====================================================

  const sidebarTime = getSidebarTimeLabel(contact);

  return (
    <div
      className={`user-card ${
        selected ? "selected" : ""
      }`}
      onClick={onClick}
      role="button"
      tabIndex={0}
    >
      {/* ================================================= */}
      {/* AVATAR */}
      {/* ================================================= */}

      <div className="user-card-avatar">
        {contact.avatarUrl ? (
          <img
            src={contact.avatarUrl}
            alt={displayName}
          />
        ) : (
          <div className="avatar-fallback">
            {initial}
          </div>
        )}

        {contact.isOnline === true && (
          <span className="online-dot" />
        )}
      </div>

      {/* ================================================= */}
      {/* CONTENT */}
      {/* ================================================= */}

      <div className="user-card-content">

        {/* ================================================= */}
        {/* NAME + TIME */}
        {/* ================================================= */}

        <div className="user-card-top">
          <h4>{displayName}</h4>

          {sidebarTime && (
            <span className="user-card-time">
              {sidebarTime}
            </span>
          )}
        </div>

        {/* ================================================= */}
        {/* MESSAGE */}
        {/* ================================================= */}

        <div className="user-card-bottom">
          <p>
            {contact.lastMessage ||
              "Start Conversation"}
          </p>

          <div className="user-card-meta">

            {contact.aiCategory && (
              <span
                className={`ai-tag-dot ${contact.aiCategory.toLowerCase()}`}
                title={contact.aiCategory}
              />
            )}

            {contact.unreadCount > 0 && (
              <span className="unread-count">
                {contact.unreadCount}
              </span>
            )}

          </div>
        </div>

      </div>
    </div>
  );
}