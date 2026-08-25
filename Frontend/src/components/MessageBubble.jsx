import React, { memo } from "react";

const BADGE_TEXT = {
  notify: "Notify",
  digest: "Digest",
  muted: "Muted",
};

function MessageBubbleComponent({ message, isHighlighted }) {
  const category = message.aiCategory;
  const mediaType = message.media_type || message.mediaType || "";
  const mediaUrl = message.media_url || message.mediaUrl || "";

  const isImage = mediaType.startsWith("image/");
  const isAudio = mediaType.startsWith("audio/");

  return (
    <>
      {/* DATE SEPARATOR */}
      {message.showDateSeparator && message.dateLabel && (
        <div className="conversation-date-divider" aria-label={message.dateLabel}>
          <span>{message.dateLabel}</span>
        </div>
      )}

      <div
        className={`message-row ${message.isSent ? "sent" : "received"}${
          isHighlighted ? " filter-match" : ""
        }`}
      >
        {/* SENDER NAME (FOR GROUP CHATS) */}
        {!message.isSent && message.sender_username && (
          <div className="message-sender-name">
            {message.sender_username}
          </div>
        )}

        {/* AI INLINE BADGE */}
        {category && (
          <span
            className={`ai-inline-badge ${category.toLowerCase()}`}
            title={message.aiReason || ""}
          >
            <span className="badge-dot" />
            {BADGE_TEXT[category.toLowerCase()] || category}
          </span>
        )}

        {/* MESSAGE BUBBLE */}
        <div className="message-bubble">
          {/* IMAGE */}
          {isImage && mediaUrl && (
            <img
              src={
                mediaUrl.startsWith("http")
                  ? mediaUrl
                  : `http://localhost:8000${mediaUrl}`
              }
              alt="Sent image"
              className="chat-image"
              loading="lazy"
            />
          )}

          {/* VOICE NOTE */}
          {isAudio && mediaUrl && (
            <audio
              controls
              src={
                mediaUrl.startsWith("http")
                  ? mediaUrl
                  : `http://localhost:8000${mediaUrl}`
              }
              className="voice-audio-player"
            />
          )}

          {/* TEXT / CAPTION */}
          {message.text && message.text.trim() !== "" && (
            <div className="image-caption">{message.text}</div>
          )}
        </div>

        {/* MESSAGE META */}
        <div className="message-meta">
          <span>{message.time}</span>
        </div>
      </div>
    </>
  );
}

// React.memo ensures individual bubbles only re-render if their content
// or highlight/date state changes.
export default memo(MessageBubbleComponent, (prevProps, nextProps) => {
  return (
    prevProps.message.id === nextProps.message.id &&
    prevProps.isHighlighted === nextProps.isHighlighted &&
    prevProps.message.aiCategory === nextProps.message.aiCategory &&
    prevProps.message.showDateSeparator ===
      nextProps.message.showDateSeparator &&
    prevProps.message.dateLabel === nextProps.message.dateLabel
  );
});
