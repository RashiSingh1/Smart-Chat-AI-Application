import React, { useState } from "react";

export default function ChatHeader({
  contact,
  group,
  chatType,
  onBack,

  isMuted,
  onToggleMute,

  isGroupMuted,
  onToggleGroupMute,

  onOpenAnalysis,

  // IMPORTANT CONTACT
  isImportant = false,
  onToggleImportant,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [infoModalOpen, setInfoModalOpen] = useState(false);

  // =====================================================
  // NO CONTACT
  // =====================================================

  if (!contact) {
    return null;
  }

  // =====================================================
  // CHAT TYPE
  // =====================================================

  const isGroup =
    chatType === "group" ||
    contact.isGroup === true ||
    group != null;

  const isOneToOne = !isGroup;

  // =====================================================
  // DISPLAY NAME
  // =====================================================

  const displayName =
    contact.username ||
    contact.name ||
    group?.name ||
    "Unknown";

  const initial = displayName.charAt(0).toUpperCase();

  // =====================================================
  // MEMBERS
  // =====================================================

  const members = Array.isArray(contact.members)
    ? contact.members
    : Array.isArray(group?.members)
      ? group.members
      : [];

  // =====================================================
  // IMPORTANT STATUS
  // =====================================================

  const importantStatus = Boolean(isImportant);

  // =====================================================
  // MUTE
  // =====================================================

  const handleMuteClick = async () => {
    setMenuOpen(false);

    if (isGroup) {
      if (onToggleGroupMute) {
        await onToggleGroupMute();
      }
      return;
    }

    if (onToggleMute) {
      await onToggleMute();
    }
  };

  // =====================================================
  // IMPORTANT CONTACT
  // =====================================================

  const handleImportantClick = async () => {
    console.log(
      "⭐ Important Contact clicked:",
      contact?.id,
      importantStatus
    );

    setMenuOpen(false);

    if (!isOneToOne) {
      return;
    }

    if (onToggleImportant) {
      await onToggleImportant();
    } else {
      console.warn(
        "⚠️ onToggleImportant was not passed to ChatHeader"
      );
    }
  };

  // =====================================================
  // OPEN GROUP INFO
  // =====================================================

  const handleOpenInfo = () => {
    setMenuOpen(false);
    setInfoModalOpen(true);
  };

  // =====================================================
  // OPEN AI ANALYSIS
  // =====================================================

  const handleOpenAnalysis = () => {
    console.log("🤖 Open AI Analysis clicked");

    setMenuOpen(false);

    if (onOpenAnalysis) {
      onOpenAnalysis();
    }
  };

  return (
    <>
      {/* ================================================= */}
      {/* CHAT HEADER */}
      {/* ================================================= */}

      <div className="chat-header">

        {/* ================= LEFT ================= */}

        <div className="chat-header-left">

          {/* BACK BUTTON */}

          <button
            className="chat-header-back"
            onClick={onBack}
            aria-label="Back"
            type="button"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
            >
              <path
                d="M15 18l-6-6 6-6"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>

          {/* ================================================= */}
          {/* AVATAR */}
          {/* ================================================= */}

          <div
            className="user-card-avatar"
            onClick={
              isGroup
                ? handleOpenInfo
                : undefined
            }
            style={{
              cursor: isGroup
                ? "pointer"
                : "default",
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

            {!isGroup && contact.isOnline && (
              <span className="online-dot" />
            )}
          </div>

          {/* ================================================= */}
          {/* USER INFO */}
          {/* ================================================= */}

          <div className="chat-header-info">

            <h2
              onClick={
                isGroup
                  ? handleOpenInfo
                  : undefined
              }
              style={{
                cursor: isGroup
                  ? "pointer"
                  : "default",
              }}
            >
              {displayName}

              {/* ================================================= */}
              {/* IMPORTANT INDICATOR */}
              {/* ================================================= */}

              {isOneToOne && importantStatus && (
                <span
                  style={{
                    marginLeft: "8px",
                    fontSize: "0.85rem",
                  }}
                  title="Important contact"
                >
                  ⭐
                </span>
              )}

              {/* ================================================= */}
              {/* MUTED INDICATOR */}
              {/* ================================================= */}

              {isOneToOne && isMuted && (
                <span
                  style={{
                    marginLeft: "8px",
                    fontSize: "0.85rem",
                  }}
                  title="Muted"
                >
                  🔕
                </span>
              )}

              {isGroup && isGroupMuted && (
                <span
                  style={{
                    marginLeft: "8px",
                    fontSize: "0.85rem",
                  }}
                  title="Muted"
                >
                  🔕
                </span>
              )}
            </h2>

            {/* ================================================= */}
            {/* SUBTITLE */}
            {/* ================================================= */}

            {isGroup ? (
              <span
                style={{
                  fontSize: "0.82rem",
                  color: "#888",
                }}
              >
                {members.length}{" "}
                {members.length === 1
                  ? "member"
                  : "members"}{" "}
                • Tap for info
              </span>
            ) : (
              <span>
                {contact.isOnline
                  ? "Active now"
                  : "Offline"}
              </span>
            )}

          </div>
        </div>

        {/* ================================================= */}
        {/* RIGHT */}
        {/* ================================================= */}

        <div className="chat-header-actions">

          {/* ================================================= */}
          {/* AI ANALYSIS BUTTON */}
          {/* ================================================= */}

          <button
            className="ai-analysis-header-button"
            onClick={handleOpenAnalysis}
            type="button"
            aria-label="Open AI Analysis"
          >
            <img
              src="/robotLogo.png"
              alt="AI"
              className="ai-analysis-icon"
            />

            <span>AI Analysis</span>

            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
            >
              <path
                d="M6 9l6 6 6-6"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>

          {/* ================================================= */}
          {/* THREE DOT MENU */}
          {/* ================================================= */}

          <div
            className="chat-menu-container"
            style={{
              position: "relative",
            }}
          >

            {/* THREE DOT BUTTON */}

            <button
              className="header-icon-button"
              aria-label="More options"
              type="button"
              onClick={() =>
                setMenuOpen((prev) => !prev)
              }
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
              >
                <circle
                  cx="12"
                  cy="5"
                  r="1.6"
                  fill="currentColor"
                />

                <circle
                  cx="12"
                  cy="12"
                  r="1.6"
                  fill="currentColor"
                />

                <circle
                  cx="12"
                  cy="19"
                  r="1.6"
                  fill="currentColor"
                />
              </svg>
            </button>

            {/* ================================================= */}
            {/* DROPDOWN */}
            {/* ================================================= */}

            {menuOpen && (
              <>
                {/* BACKDROP */}

                <div
                  className="chat-dropdown-backdrop"
                  style={{
                    position: "fixed",
                    inset: 0,
                    zIndex: 999,
                    background: "transparent",
                  }}
                  onClick={() =>
                    setMenuOpen(false)
                  }
                />

                {/* MENU */}

                <div
                  className="chat-dropdown"
                  style={{
                    position: "absolute",
                    top: "calc(100% + 6px)",
                    right: 0,
                    zIndex: 1000,
                    pointerEvents: "auto",
                  }}
                >

                  {/* ================================================= */}
                  {/* AI ANALYSIS */}
                  {/* ================================================= */}

                  <button
                    className="chat-dropdown-item"
                    onClick={handleOpenAnalysis}
                    type="button"
                    style={{
                      position: "relative",
                      zIndex: 1001,
                    }}
                  >
                    <img
                      src="/robotLogo.png"
                      alt="AI"
                      className="ai-analysis-dropdown-icon"
                    />

                    <span>
                      Open AI Analysis
                    </span>
                  </button>

                  {/* ================================================= */}
                  {/* IMPORTANT CONTACT */}
                  {/* ALWAYS VISIBLE FOR 1-TO-1 */}
                  {/* ================================================= */}

                  {isOneToOne && (
                    <button
                      type="button"
                      className="chat-dropdown-item"
                      onClick={handleImportantClick}
                      style={{
                        position: "relative",
                        zIndex: 1001,
                        cursor: "pointer",
                      }}
                    >
                      <span
                        style={{
                          width: "22px",
                          display: "inline-flex",
                          justifyContent: "center",
                          alignItems: "center",
                          fontSize: "16px",
                        }}
                      >
                        📌
                      </span>

                      <span>
                        {importantStatus
                          ? "Remove from important contacts"
                          : "Add to important contacts"}
                      </span>
                    </button>
                  )}

                  {/* ================================================= */}
                  {/* GROUP INFO */}
                  {/* ================================================= */}

                  {isGroup && (
                    <button
                      className="chat-dropdown-item"
                      onClick={handleOpenInfo}
                      type="button"
                      style={{
                        position: "relative",
                        zIndex: 1001,
                      }}
                    >
                      <span>👥</span>

                      <span>
                        View group info
                      </span>
                    </button>
                  )}

                  {/* ================================================= */}
                  {/* MUTE */}
                  {/* ================================================= */}

                  <button
                    onClick={handleMuteClick}
                    className="chat-dropdown-item"
                    type="button"
                    style={{
                      position: "relative",
                      zIndex: 1001,
                    }}
                  >
                    <span>
                      {(isGroup
                        ? isGroupMuted
                        : isMuted)
                        ? "🔔"
                        : "🔕"}
                    </span>

                    <span>
                      {(isGroup
                        ? isGroupMuted
                        : isMuted)
                        ? isGroup
                          ? "Unmute notifications"
                          : "Unmute conversation"
                        : isGroup
                          ? "Mute notifications"
                          : "Mute conversation"}
                    </span>
                  </button>

                </div>
              </>
            )}

          </div>
        </div>
      </div>

      {/* ===================================================== */}
      {/* GROUP INFO MODAL */}
      {/* ===================================================== */}

      {infoModalOpen && (
        <div
          className="group-info-overlay"
          onClick={() =>
            setInfoModalOpen(false)
          }
        >

          <div
            className="group-info-modal"
            onClick={(e) =>
              e.stopPropagation()
            }
          >

            {/* ================================================= */}
            {/* HEADER */}
            {/* ================================================= */}

            <div className="group-info-header">

              <h3>Group Info</h3>

              <button
                className="group-info-close"
                onClick={() =>
                  setInfoModalOpen(false)
                }
                type="button"
                aria-label="Close group info"
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                >
                  <path
                    d="M6 6l12 12M18 6L6 18"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  />
                </svg>
              </button>

            </div>

            {/* ================================================= */}
            {/* GROUP DETAILS */}
            {/* ================================================= */}

            <div className="group-info-content">

              {/* PROFILE */}

              <div className="group-info-profile">

                <div className="group-info-avatar">

                  {contact.avatarUrl ? (
                    <img
                      src={contact.avatarUrl}
                      alt={displayName}
                    />
                  ) : (
                    <span>
                      {initial}
                    </span>
                  )}

                </div>

                <h2>
                  {displayName}
                </h2>

                <p>
                  Group •{" "}
                  {members.length}{" "}
                  {members.length === 1
                    ? "Member"
                    : "Members"}
                </p>

              </div>

              {/* ================================================= */}
              {/* MUTE GROUP */}
              {/* ================================================= */}

              <div className="group-info-mute">

                <div className="group-info-mute-text">

                  <div className="group-info-mute-title">
                    Mute Group
                  </div>

                  <div className="group-info-mute-description">
                    Important messages will still
                    trigger analysis & alerts
                  </div>

                </div>

                <button
                  className={`group-info-mute-button ${
                    isGroupMuted
                      ? "is-muted"
                      : ""
                  }`}
                  onClick={handleMuteClick}
                  type="button"
                >
                  {isGroupMuted
                    ? "Unmute"
                    : "Mute"}
                </button>

              </div>

              {/* ================================================= */}
              {/* MEMBERS */}
              {/* ================================================= */}

              <div className="group-info-members-section">

                <div className="group-info-members-title">
                  {members.length}{" "}
                  {members.length === 1
                    ? "MEMBER"
                    : "MEMBERS"}
                </div>

                <div className="group-info-members-list">

                  {members.map((member) => {

                    const online =
                      member.isOnline === true ||
                      member.is_online === true;

                    const isCreator =
                      Number(member.id) ===
                      Number(contact.created_by);

                    const memberName =
                      member.username ||
                      member.name ||
                      "Unknown";

                    const memberInitial =
                      memberName
                        .charAt(0)
                        .toUpperCase();

                    return (
                      <div
                        key={member.id}
                        className="group-info-member"
                      >

                        {/* MEMBER LEFT */}

                        <div className="group-info-member-left">

                          <div className="group-info-member-avatar-wrapper">

                            <div className="group-info-member-avatar">

                              {member.avatarUrl ? (
                                <img
                                  src={member.avatarUrl}
                                  alt={memberName}
                                />
                              ) : (
                                <span>
                                  {memberInitial}
                                </span>
                              )}

                            </div>

                            <span
                              className={`group-info-status ${
                                online
                                  ? "online"
                                  : "offline"
                              }`}
                            />

                          </div>

                          <div className="group-info-member-details">

                            <div className="group-info-member-name">
                              {memberName}
                            </div>

                            <div
                              className={`group-info-member-status ${
                                online
                                  ? "online"
                                  : ""
                              }`}
                            >
                              {online
                                ? "Online"
                                : "Offline"}
                            </div>

                          </div>

                        </div>

                        {/* ADMIN */}

                        {isCreator && (
                          <span className="group-info-admin">
                            Admin
                          </span>
                        )}

                      </div>
                    );
                  })}

                </div>
              </div>

            </div>
          </div>
        </div>
      )}

    </>
  );
}