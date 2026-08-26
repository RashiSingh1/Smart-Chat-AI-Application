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

    return Number.isNaN(value)
      ? 0
      : value;
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

    // Unix seconds
    if (value < 100000000000) {
      return value * 1000;
    }

    // Unix milliseconds
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

  const rawTimestamp =
    getMessageTimestamp(contact);

  const timestamp =
    normalizeTimestamp(rawTimestamp);

  // ===================================================
  // NO TIMESTAMP
  //
  // If backend already provides lastMessageTime
  // such as "19:00", keep it.
  // ===================================================

  if (!timestamp) {
    return contact.lastMessageTime || "";
  }

  const messageDate =
    new Date(timestamp);

  const now = new Date();

  // ===================================================
  // TODAY
  // ===================================================

  const isToday =
    messageDate.getFullYear() ===
      now.getFullYear() &&
    messageDate.getMonth() ===
      now.getMonth() &&
    messageDate.getDate() ===
      now.getDate();

  if (isToday) {
    return messageDate.toLocaleTimeString(
      [],
      {
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }
    );
  }

  // ===================================================
  // YESTERDAY
  // ===================================================

  const yesterday =
    new Date(now);

  yesterday.setHours(
    0,
    0,
    0,
    0
  );

  yesterday.setDate(
    yesterday.getDate() - 1
  );

  const messageDay =
    new Date(messageDate);

  messageDay.setHours(
    0,
    0,
    0,
    0
  );

  if (
    messageDay.getTime() ===
    yesterday.getTime()
  ) {
    return "Yesterday";
  }

  // ===================================================
  // OLDER DATE
  // ===================================================

  const isSameYear =
    messageDate.getFullYear() ===
    now.getFullYear();

  return messageDate.toLocaleDateString(
    [],
    {
      day: "2-digit",
      month: "short",
      ...(isSameYear
        ? {}
        : {
            year: "numeric",
          }),
    }
  );
}

// =====================================================
// CHECK MUTED STATUS (FALLBACK ONLY)
//
// This is only used when the parent (Sidebar) does not
// pass an explicit `isMuted` prop. The authoritative
// source of truth is Chat.jsx's `mutedUserIds` set,
// forwarded down via Sidebar -> UserCard as a prop.
//
// Supports all currently possible field names:
//
// isMuted
// is_muted
// muted
//
// Also supports string/number values that may come
// from backend normalization.
// =====================================================

function getMutedStatusFromContact(contact) {
  if (!contact) {
    return false;
  }

  return (
    contact.isMuted === true ||
    contact.is_muted === true ||
    contact.muted === true ||

    // Some backend responses may return 1/"1"
    contact.isMuted === 1 ||
    contact.is_muted === 1 ||
    contact.muted === 1 ||

    contact.isMuted === "true" ||
    contact.is_muted === "true" ||
    contact.muted === "true" ||

    contact.isMuted === "1" ||
    contact.is_muted === "1" ||
    contact.muted === "1"
  );
}

// =====================================================
// MUTED AVATAR SLASH OVERLAY
// Single diagonal line across the avatar, matching the
// ChatHeader's muted-avatar treatment (no emoji, no icon).
// =====================================================

function MutedAvatarSlash() {
  return (
    <span
      aria-label="Muted"
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        overflow: "hidden",
        borderRadius: "inherit",
      }}
    >
      <span
        style={{
          position: "absolute",
          top: "45%",
          left: "50%",
          width: "100%",
          height: "1.5px",
          background: "rgba(255,255,255,0.85)",
          transform: "translate(-50%, -50%) rotate(-45deg)",
        }}
      />
    </span>
  );
}

// =====================================================
// USER CARD
// =====================================================

export default function UserCard({
  contact,
  selected,
  isMuted: isMutedProp,
  onClick,
}) {
  if (!contact) {
    return null;
  }

  // ===================================================
  // DISPLAY NAME
  // ===================================================

  const displayName =
    contact.username ||
    contact.name ||
    "Unknown";

  const initial =
    displayName
      .charAt(0)
      .toUpperCase();

  // ===================================================
  // SIDEBAR TIME
  // ===================================================

  const sidebarTime =
    getSidebarTimeLabel(contact);

  // ===================================================
  // MUTED STATUS
  //
  // Prefer the explicit prop passed down from Sidebar
  // (backed by Chat.jsx's mutedUserIds set). Fall back
  // to reading it off the contact object only if the
  // prop was never provided.
  // ===================================================

  const isMuted =
    typeof isMutedProp === "boolean"
      ? isMutedProp
      : getMutedStatusFromContact(contact);

  return (
    <div
      className={`user-card ${
        selected
          ? "selected"
          : ""
      }`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (
          event.key === "Enter" ||
          event.key === " "
        ) {
          event.preventDefault();
          onClick?.();
        }
      }}
    >
      {/* ================================================= */}
      {/* AVATAR */}
      {/* ================================================= */}

      <div
        className="user-card-avatar-wrapper"
        style={{
          position: "relative",
          width: "46px",
          height: "46px",
          flexShrink: 0,
        }}
      >
        <div
          className="user-card-avatar"
          style={{
            position: "relative",
            width: "100%",
            height: "100%",
          }}
        >
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

          {/* ================================================= */}
          {/* ONLINE DOT */}
          {/* ================================================= */}

          {contact.isOnline === true && (
            <span className="online-dot" />
          )}

          {/* ================================================= */}
          {/* MUTED SLASH */}
          {/* ================================================= */}

          {isMuted && <MutedAvatarSlash />}
        </div>
      </div>

      {/* ================================================= */}
      {/* CONTENT */}
      {/* ================================================= */}

      <div className="user-card-content">

        {/* ================================================= */}
        {/* NAME + TIME */}
        {/* ================================================= */}

        <div className="user-card-top">
          <h4>
            {displayName}
          </h4>

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

            {/* ================================================= */}
            {/* AI CATEGORY */}
            {/* ================================================= */}

            {contact.aiCategory && (
              <span
                className={`ai-tag-dot ${contact.aiCategory.toLowerCase()}`}
                title={
                  contact.aiCategory
                }
              />
            )}

            {/* ================================================= */}
            {/* UNREAD COUNT */}
            {/* ================================================= */}

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