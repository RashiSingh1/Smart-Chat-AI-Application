import React, {
  useEffect,
  useRef,
  useState,
} from "react";

import ChatHeader from "./ChatHeader";
import MessageInput from "./MessageInput";

const API_URL =
  import.meta.env.VITE_API_URL ||
  "http://127.0.0.1:8000";

export default function ChatArea({
  contact,
  group,
  chatType,
  currentUserId,
  groupMembers,
  messages,
  activeCategory,
  onSend,
  onSendImage,
  onSendVoice,
  onTyping,
  isTyping,
  onBack,
  isMuted,
  onToggleMute,
  isGroupMuted,
  onToggleGroupMute,
  onOpenAIAnalysis,

  // ⭐ IMPORTANT CONTACT STATUS
  isImportant = false,

  // ⭐ TOGGLE IMPORTANT CONTACT
  onToggleImportant,
}) {

  // =====================================================
  // CHAT TYPE
  // =====================================================

  const isGroupChat = chatType === "group";

  const [expandedImage, setExpandedImage] =
    useState(null);

  // =====================================================
  // MESSAGE LIST REF
  // =====================================================

  const messageListRef = useRef(null);

  // =====================================================
  // AUTO SCROLL TO LATEST MESSAGE
  // =====================================================

  useEffect(() => {

    const container = messageListRef.current;

    if (!container) {
      return;
    }

    // Wait until React finishes rendering
    // the latest messages.
    requestAnimationFrame(() => {

      if (!messageListRef.current) {
        return;
      }

      messageListRef.current.scrollTop =
        messageListRef.current.scrollHeight;

    });

  }, [
    messages,
    contact,
    group,
    chatType,
  ]);

  // =====================================================
  // CHECK EMPTY CHAT
  // =====================================================

  const isEmpty =
    isGroupChat
      ? !group
      : !contact;

  if (isEmpty) {

    return (
      <main className="chat-area empty-chat">

        <div className="chat-empty-content">

          <h2>
            Select a chat to start messaging
          </h2>

          <p>
            Your AI assistant will analyze new
            messages automatically.
          </p>

        </div>

      </main>
    );
  }

  // =====================================================
  // HEADER CONTACT
  // =====================================================

  const headerContact = isGroupChat
    ? {
        id: group?.id,
        username: group?.name || "Group",
        name: group?.name || "Group",
        isOnline: false,
        isGroup: true,
        members: groupMembers || [],
      }
    : contact;

  // =====================================================
  // BUILD IMAGE / MEDIA URL
  // =====================================================

  function getImageUrl(url) {

    if (!url) {
      return "";
    }

    // Already a complete URL
    if (
      url.startsWith("http://") ||
      url.startsWith("https://") ||
      url.startsWith("blob:")
    ) {
      return url;
    }

    // Backend returned /uploads/...
    if (url.startsWith("/")) {
      return `${API_URL}${url}`;
    }

    // Backend returned uploads/...
    return `${API_URL}/${url}`;
  }

  // =====================================================
  // GET MESSAGE TEXT / CAPTION
  // =====================================================

  function getMessageText(message) {

    return (
      message.text ??
      message.content ??
      message.caption ??
      message.message ??
      ""
    );
  }

  // =====================================================
  // GET MEDIA DATA
  // =====================================================

  function getMediaType(message) {

    return (
      message.media_type ??
      message.mediaType ??
      ""
    );
  }

  function getMediaUrl(message) {

    return (
      message.media_url ??
      message.mediaUrl ??
      message.image_url ??
      message.imageUrl ??
      ""
    );
  }

  function isAudioMessage(message) {

    const mediaType =
      getMediaType(message).toLowerCase();

    return (
      mediaType.startsWith("audio/") &&
      Boolean(getMediaUrl(message))
    );
  }

  // =====================================================
  // DATE HELPERS
  // =====================================================

  function getValidDate(createdAt) {

    if (!createdAt) {
      return null;
    }

    const date = new Date(createdAt);

    if (Number.isNaN(date.getTime())) {
      return null;
    }

    return date;
  }

  // =====================================================
  // GET LOCAL DATE KEY
  // =====================================================

  function getDateKey(createdAt) {

    const date =
      getValidDate(createdAt);

    if (!date) {
      return null;
    }

    return [
      date.getFullYear(),
      String(
        date.getMonth() + 1
      ).padStart(2, "0"),
      String(
        date.getDate()
      ).padStart(2, "0"),
    ].join("-");
  }

  // =====================================================
  // TODAY / YESTERDAY / DATE
  // =====================================================

  function getDateLabel(createdAt) {

    const date =
      getValidDate(createdAt);

    if (!date) {
      return "";
    }

    const now = new Date();

    const todayKey =
      getDateKey(now);

    const messageKey =
      getDateKey(date);

    // TODAY
    if (messageKey === todayKey) {
      return "Today";
    }

    // YESTERDAY
    const yesterday =
      new Date(now);

    yesterday.setDate(
      now.getDate() - 1
    );

    const yesterdayKey =
      getDateKey(yesterday);

    if (
      messageKey === yesterdayKey
    ) {
      return "Yesterday";
    }

    // OLDER DATE
    return date.toLocaleDateString(
      [],
      {
        day: "numeric",
        month: "long",
        year: "numeric",
      }
    );
  }

  // =====================================================
  // DATE SEPARATOR
  // =====================================================

  function shouldShowDateSeparator(index) {

    if (index === 0) {
      return true;
    }

    const currentMessage =
      messages[index];

    const previousMessage =
      messages[index - 1];

    const currentDateKey =
      getDateKey(
        currentMessage?.created_at
      );

    const previousDateKey =
      getDateKey(
        previousMessage?.created_at
      );

    if (
      currentDateKey &&
      previousDateKey
    ) {
      return (
        currentDateKey !==
        previousDateKey
      );
    }

    if (
      currentDateKey &&
      !previousDateKey
    ) {
      return true;
    }

    return false;
  }

  // =====================================================
  // CHECK AI CATEGORY HIGHLIGHT
  // =====================================================

  function isMessageCategoryHighlighted(
    category
  ) {

    if (!activeCategory) {
      return false;
    }

    // "all" means show everything normally
    if (activeCategory === "all") {
      return false;
    }

    const messageCategory =
      String(category || "")
        .trim()
        .toLowerCase();

    const selectedCategory =
      String(activeCategory || "")
        .trim()
        .toLowerCase();

    return (
      Boolean(messageCategory) &&
      messageCategory ===
        selectedCategory
    );
  }

  // =====================================================
  // RENDER MESSAGE
  // =====================================================

  function renderMessage(
    message,
    index
  ) {

    // ===================================================
    // DATE SEPARATOR
    // ===================================================

    const showDateSeparator =
      shouldShowDateSeparator(index);

    const dateLabel =
      showDateSeparator
        ? getDateLabel(
            message?.created_at
          )
        : "";

    // ===================================================
    // AI CATEGORY
    // ===================================================

    const category = String(
      message.aiCategory ??
      message.ai_category ??
      message.category ??
      ""
    )
      .trim()
      .toLowerCase();

    // ===================================================
    // MEDIA
    // ===================================================

    const mediaType =
      getMediaType(message);

    const rawImageUrl =
      getMediaUrl(message);

    const imageUrl =
      getImageUrl(rawImageUrl);

    const isImage =
      mediaType
        .toLowerCase()
        .startsWith("image/") &&
      Boolean(imageUrl);

    const isAudio =
      isAudioMessage(message);

    // ===================================================
    // MESSAGE TEXT
    // ===================================================

    const messageText =
      getMessageText(message);

    // ===================================================
    // TIME
    // ===================================================

    const messageTime =
      message.time ??
      (
        message.created_at
          ? new Date(
              message.created_at
            ).toLocaleTimeString(
              [],
              {
                hour: "2-digit",
                minute: "2-digit",
              }
            )
          : ""
      );

    // ===================================================
    // SENT / RECEIVED
    // ===================================================

    const isSent =
      Boolean(message.isSent) ||
      Number(message.sender_id) ===
        Number(currentUserId);

    // ===================================================
    // AI CATEGORY HIGHLIGHT
    // ===================================================

    const isAnalyticsHighlighted =
      isMessageCategoryHighlighted(
        category
      );

    // ===================================================
    // UNIQUE KEY
    // ===================================================

    const messageKey =
      message.id ??
      message._id ??
      `${message.sender_id}-${message.created_at}-${index}`;

    // ===================================================
    // MESSAGE UI
    // ===================================================

    return (
      <React.Fragment
        key={messageKey}
      >

        {/* ============================================= */}
        {/* DATE SEPARATOR */}
        {/* ============================================= */}

        {showDateSeparator &&
          dateLabel && (

            <div className="conversation-date-divider">

              <div className="conversation-date-line" />

              <span className="conversation-date-label">
                {dateLabel}
              </span>

              <div className="conversation-date-line" />

            </div>
          )}

        {/* ============================================= */}
        {/* MESSAGE */}
        {/* ============================================= */}

        <div
          className={`message-row ${
            isSent
              ? "sent"
              : "received"
          } ${
            !isSent &&
            isAnalyticsHighlighted
              ? "analytics-message-highlight"
              : ""
          }`}
        >

          {/* ============================================= */}
          {/* GROUP SENDER NAME */}
          {/* ============================================= */}

          {isGroupChat &&
            !isSent && (

              <div className="message-sender-name">

                {message.sender_username ||
                  message.sender_name ||
                  `User ${message.sender_id}`}

              </div>
            )}

          {/* ============================================= */}
          {/* AI CATEGORY */}
          {/* ============================================= */}

          {!isSent &&
            category && (

              <div
                className={`ai-inline-badge ${category}`}
              >

                {category ===
                  "notify" &&
                  "Notify"}

                {category ===
                  "digest" &&
                  "Digest"}

                {category ===
                  "muted" &&
                  "Muted"}

              </div>
            )}

          {/* ============================================= */}
          {/* IMAGE MESSAGE */}
          {/* ============================================= */}

          {isImage ? (

            <div className="message-bubble image-message-bubble">

              <img
                src={imageUrl}
                alt="Sent image"
                className="chat-image"
                onClick={() =>
                  setExpandedImage(
                    imageUrl
                  )
                }
                onError={(e) => {

                  console.error(
                    "Unable to load image:",
                    imageUrl
                  );

                  e.currentTarget.style.display =
                    "none";
                }}
              />

              {messageText.trim() && (

                <div className="image-caption">
                  {messageText}
                </div>

              )}

            </div>

          ) : isAudio ? (

            <div className="message-bubble voice-message-bubble">

              <div className="voice-message-label">
                🎙️ Voice message
              </div>

              <audio
                controls
                src={getImageUrl(
                  getMediaUrl(message)
                )}
                className="voice-audio-player"
              />

            </div>

          ) : (

            <div className="message-bubble">
              {messageText ||
                "Voice message"}
            </div>

          )}

          {/* ============================================= */}
          {/* TIME */}
          {/* ============================================= */}

          {messageTime && (

            <div className="message-meta">
              {messageTime}
            </div>

          )}

        </div>

      </React.Fragment>
    );
  }

  // =====================================================
  // UI
  // =====================================================

  return (

    <main className="chat-area">

      {/* ================================================= */}
      {/* HEADER */}
      {/* ================================================= */}

      <ChatHeader
  contact={headerContact}
  onBack={onBack}

  isMuted={
    isGroupChat
      ? isGroupMuted
      : isMuted
  }

  onToggleMute={
    isGroupChat
      ? onToggleGroupMute
      : onToggleMute
  }

  onOpenAnalysis={
    onOpenAIAnalysis
  }

  isImportant={
    isGroupChat
      ? false
      : isImportant
  }

  onToggleImportant={
    isGroupChat
      ? undefined
      : onToggleImportant
  }
/>

      {/* ================================================= */}
      {/* MESSAGE LIST */}
      {/* ================================================= */}

      <div
        className="message-list"
        ref={messageListRef}
      >

        {(messages || []).map(
          (message, index) =>
            renderMessage(
              message,
              index
            )
        )}

      </div>

      {/* ================================================= */}
      {/* TYPING INDICATOR */}
      {/* ================================================= */}

      {!isGroupChat &&
        isTyping && (

          <div className="typing-indicator">

            {contact?.username ||
              contact?.name}{" "}
            is typing...

          </div>

        )}

      {/* ================================================= */}
      {/* MESSAGE INPUT */}
      {/* ================================================= */}

      <MessageInput
  onSend={onSend}
  onTyping={onTyping}
  onSendImage={onSendImage}
  onSendVoice={onSendVoice}

  isGroupChat={chatType === "group"}
  groupId={group?.id}

  disabled={false}
/>

      {/* ================================================= */}
      {/* IMAGE LIGHTBOX */}
      {/* ================================================= */}

      {expandedImage && (

        <div
          className="image-lightbox-backdrop"
          onClick={() =>
            setExpandedImage(null)
          }
        >

          <div
            className="image-lightbox"
            onClick={(e) =>
              e.stopPropagation()
            }
          >

            <button
              type="button"
              className="image-lightbox-close"
              onClick={() =>
                setExpandedImage(null)
              }
              aria-label="Close image"
            >
              ×
            </button>

            <img
              src={expandedImage}
              alt="Expanded message"
              className="image-lightbox-image"
            />

          </div>

        </div>

      )}

    </main>
  );
}