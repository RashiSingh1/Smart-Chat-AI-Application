import React from "react";

const CATEGORY_LABEL = {
  notify: "Notify",
  digest: "Digest",
  muted: "Muted",
};

export default function AIPanel({
  analysis,
  senderName = "",
  isGroupChat = false,

  importantContacts = [],
  onToggleImportant,

  analytics = {
    total: 0,
    notify: 0,
    digest: 0,
    muted: 0,
  },

  activeCategory = null,
  onCategoryClick,
}) {
  // =========================================================
  // SAFE AI VALUES
  // =========================================================

  const category = analysis?.category || null;

  const reason =
    analysis?.reason ||
    "No AI analysis available.";

  const confidence = Math.min(
    100,
    Math.max(
      0,
      Number(analysis?.confidence) || 0
    )
  );

  // =========================================================
  // SENDER NAME
  // =========================================================

  const displaySenderName = isGroupChat
    ? analysis?.senderName || senderName || ""
    : "";

  // =========================================================
  // CATEGORY CLICK HANDLER
  // =========================================================

  const handleCategoryClick = (categoryName) => {
    if (typeof onCategoryClick !== "function") {
      console.warn(
        "AIPanel: onCategoryClick is not connected in Chat.jsx"
      );
      return;
    }

    if (activeCategory === categoryName) {
      onCategoryClick(null);
      return;
    }

    onCategoryClick(categoryName);
  };

  // =========================================================
  // IMPORTANT CONTACT HANDLER
  // =========================================================

  const handleImportantContactClick = (contactId) => {
    if (typeof onToggleImportant !== "function") {
      console.warn(
        "AIPanel: onToggleImportant is not connected in Chat.jsx"
      );
      return;
    }

    onToggleImportant(contactId);
  };

  // =========================================================
  // IMPORTANT CONTACTS TO DISPLAY
  // IMPORTANT:
  // Only contacts whose toggle is ON are rendered.
  // If alwaysNotify becomes false, the complete row disappears.
  // =========================================================

  const activeImportantContacts = importantContacts.filter(
    (contact) => contact?.alwaysNotify === true
  );

  // =========================================================
  // RENDER
  // =========================================================

  return (
    <aside className="ai-panel">

      {/* ================================================= */}
      {/* AI ANALYSIS */}
      {/* ================================================= */}

      <h2>AI Analysis</h2>

      {analysis ? (
        <div className="ai-card">

          {/* ================================================= */}
          {/* CATEGORY BADGE */}
          {/* ================================================= */}

          <span
            className={`ai-card-badge ${
              category || "notify"
            }`}
          >
            <span className="badge-dot" />
            {CATEGORY_LABEL[category] || "Notify"}
          </span>

          {/* ================================================= */}
          {/* REASON */}
          {/* ================================================= */}

          <div className="ai-card-row">
            <span className="label">
              Reason
            </span>

            <span className="value">
              {displaySenderName && (
                <span
                  className="ai-sender-name"
                  style={{
                    fontWeight: 700,
                    color: "#ffffff",
                    marginRight: "6px",
                  }}
                >
                  {displaySenderName} —
                </span>
              )}

              {reason}
            </span>
          </div>

          {/* ================================================= */}
          {/* CONFIDENCE */}
          {/* ================================================= */}

          <div className="ai-card-row">
            <span className="label">
              Confidence
            </span>

            <span className="value">
              {confidence}%
            </span>
          </div>

          {/* ================================================= */}
          {/* CONFIDENCE BAR */}
          {/* ================================================= */}

          <div className="confidence-bar-track">
            <div
              className="confidence-bar-fill"
              style={{
                width: `${confidence}%`,
              }}
            />
          </div>
        </div>
      ) : (
        <div className="ai-empty">
          No received messages yet. AI analysis will appear
          when a message is received.
        </div>
      )}

      {/* ================================================= */}
      {/* IMPORTANT CONTACTS */}
      {/* ================================================= */}

      <h3>
        Important Contacts
      </h3>

      <div className="important-contacts">
        {activeImportantContacts.length === 0 ? (
          <div className="ai-empty">
            No important contacts.
          </div>
        ) : (
          activeImportantContacts.map((contact) => (
            <div
              className="important-contact-row"
              key={contact.id}
            >
              <span>
                {contact.name}
              </span>

              <button
                type="button"
                className="toggle-pill on"
                onClick={() =>
                  handleImportantContactClick(
                    contact.id
                  )
                }
                aria-label={`Turn off always notify for ${contact.name}`}
                aria-pressed={true}
              >
                <span className="knob" />
              </button>
            </div>
          ))
        )}
      </div>

      {/* ================================================= */}
      {/* TODAY IN THIS CHAT */}
      {/* ================================================= */}

      <h3>
        Today In This Chat
      </h3>

      <div className="analytics-grid">

        {/* ================================================= */}
        {/* ALL / MESSAGES */}
        {/* ================================================= */}

        <button
          type="button"
          className={`analytics-cell ${
            activeCategory === "all"
              ? "active"
              : ""
          }`}
          onClick={() =>
            handleCategoryClick("all")
          }
        >
          <div className="num">
            {Number(analytics.total) || 0}
          </div>

          <div className="lbl">
            Messages
          </div>
        </button>

        {/* ================================================= */}
        {/* NOTIFY */}
        {/* ================================================= */}

        <button
          type="button"
          className={`analytics-cell notify-card ${
            activeCategory === "notify"
              ? "active"
              : ""
          }`}
          onClick={() =>
            handleCategoryClick("notify")
          }
          aria-pressed={
            activeCategory === "notify"
          }
        >
          <div className="num">
            {Number(analytics.notify) || 0}
          </div>

          <div className="lbl">
            Notify
          </div>
        </button>

        {/* ================================================= */}
        {/* DIGEST */}
        {/* ================================================= */}

        <button
          type="button"
          className={`analytics-cell digest-card ${
            activeCategory === "digest"
              ? "active"
              : ""
          }`}
          onClick={() =>
            handleCategoryClick("digest")
          }
          aria-pressed={
            activeCategory === "digest"
          }
        >
          <div className="num">
            {Number(analytics.digest) || 0}
          </div>

          <div className="lbl">
            Digest
          </div>
        </button>

        {/* ================================================= */}
        {/* MUTED */}
        {/* ================================================= */}

        <button
          type="button"
          className={`analytics-cell muted-card ${
            activeCategory === "muted"
              ? "active"
              : ""
          }`}
          onClick={() =>
            handleCategoryClick("muted")
          }
          aria-pressed={
            activeCategory === "muted"
          }
        >
          <div className="num">
            {Number(analytics.muted) || 0}
          </div>

          <div className="lbl">
            Muted
          </div>
        </button>

      </div>

    </aside>
  );
}