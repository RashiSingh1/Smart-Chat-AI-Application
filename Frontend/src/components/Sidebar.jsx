import React, { useEffect, useMemo, useState } from "react";
import API from "../services/api";
import UserCard from "./UserCard";

// =====================================================
// NORMALIZE TIMESTAMP
// Supports:
// - Unix seconds
// - Unix milliseconds
// - ISO date strings
// - Date-compatible strings
// =====================================================

function normalizeTimestamp(timestamp) {
  if (
    timestamp === null ||
    timestamp === undefined ||
    timestamp === ""
  ) {
    return 0;
  }

  if (timestamp instanceof Date) {
    const time = timestamp.getTime();
    return Number.isNaN(time) ? 0 : time;
  }

  if (typeof timestamp === "number") {
    if (timestamp <= 0) {
      return 0;
    }

    if (timestamp < 100000000000) {
      return timestamp * 1000;
    }

    return timestamp;
  }

  if (
    typeof timestamp === "string" &&
    /^\d+$/.test(timestamp.trim())
  ) {
    const numericTimestamp = Number(timestamp);

    if (numericTimestamp <= 0) {
      return 0;
    }

    if (numericTimestamp < 100000000000) {
      return numericTimestamp * 1000;
    }

    return numericTimestamp;
  }

  const parsedDate = new Date(timestamp);
  const time = parsedDate.getTime();

  return Number.isNaN(time) ? 0 : time;
}

// =====================================================
// SIDEBAR TIME / DATE LABEL
//
// Today     -> 19:00
// Yesterday -> Yesterday
// Older     -> 21 Aug
// Older year -> 21 Aug 2025
// =====================================================

export function getSidebarTimeLabel(timestamp) {
  const normalizedTimestamp =
    normalizeTimestamp(timestamp);

  if (!normalizedTimestamp) {
    return "";
  }

  const date = new Date(normalizedTimestamp);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const now = new Date();

  // ===================================================
  // TODAY
  // ===================================================

  const isToday =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  if (isToday) {
    return date.toLocaleTimeString([], {
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

  const messageDay = new Date(date);

  messageDay.setHours(0, 0, 0, 0);

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
    date.getFullYear() ===
    now.getFullYear();

  return date.toLocaleDateString([], {
    day: "2-digit",
    month: "short",
    ...(isSameYear
      ? {}
      : { year: "numeric" }),
  });
}

// =====================================================
// GET LAST MESSAGE TIMESTAMP
// Handles multiple backend field names
// =====================================================

function getLastMessageTimestamp(item) {
  if (!item) {
    return 0;
  }

  return (
    item.lastMessageTimestamp ??
    item.last_message_timestamp ??
    item.lastMessageAt ??
    item.last_message_at ??
    item.lastMessageDate ??
    item.last_message_date ??
    item.lastMessageTime ??
    item.last_message_time ??
    0
  );
}

// =====================================================
// NORMALIZE USER
// =====================================================

function normalizeUser(user) {
  if (!user || user.id == null) {
    return null;
  }

  return {
    ...user,

    id: Number(user.id),

    username:
      user.username ||
      user.name ||
      "User",

    name:
      user.name ||
      user.username ||
      "User",

    email:
      user.email ||
      "",

    avatarUrl:
      user.avatarUrl ||
      user.avatar_url ||
      "",

    isOnline:
      user.is_online === true ||
      user.isOnline === true,

    lastMessage:
      user.lastMessage ||
      user.last_message ||
      "",

    lastMessageTimestamp:
      normalizeTimestamp(
        getLastMessageTimestamp(user)
      ),
  };
}

// =====================================================
// MUTED AVATAR SLASH OVERLAY
// Single diagonal line across the avatar, matching
// the ChatHeader's muted-avatar treatment (no emoji).
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
          top: "50%",
          left: "50%",
          width: "140%",
          height: "1.5px",
          background: "rgba(255,255,255,0.85)",
          transform: "translate(-50%, -50%) rotate(-45deg)",
        }}
      />
    </span>
  );
}

// =====================================================
// SIDEBAR
// =====================================================

export default function Sidebar({
  contacts = [],
  groups = [],
  selectedId,
  selectedGroupId,
  chatType,
  onSelectContact,
  onSelectGroup,
  onCreateGroup,

  // =====================================================
  // MUTED CHAT IDS
  // =====================================================

  mutedUserIds = new Set(),
  mutedGroupIds = new Set(),

  // Optional externally supplied search data
  searchResults:
    externalSearchResults = [],

  searchLoading:
    externalSearchLoading = false,

  onSearchUsers,
  onClearSearch,
}) {
  // ===================================================
  // CREATE GROUP STATE
  // ===================================================

  const [showGroupModal, setShowGroupModal] =
    useState(false);

  const [groupName, setGroupName] =
    useState("");

  const [selectedMemberIds, setSelectedMemberIds] =
    useState([]);

  const [groupCreateSubmitting, setGroupCreateSubmitting] =
    useState(false);

  const [groupCreateError, setGroupCreateError] =
    useState("");

  // ===================================================
  // GROUP MEMBER SEARCH
  // ===================================================

  const [groupMemberSearch, setGroupMemberSearch] =
    useState("");

  const [groupMemberResults, setGroupMemberResults] =
    useState([]);

  const [groupMemberSearchLoading, setGroupMemberSearchLoading] =
    useState(false);

  const [groupMemberSearchError, setGroupMemberSearchError] =
    useState("");

  // ===================================================
  // USER SEARCH
  // ===================================================

  const [searchQuery, setSearchQuery] =
    useState("");

  const [internalSearchResults, setInternalSearchResults] =
    useState([]);

  const [internalSearchLoading, setInternalSearchLoading] =
    useState(false);

  const [searchError, setSearchError] =
    useState("");

  // ===================================================
  // GROUP MEMBER SEARCH
  //
  // IMPORTANT:
  // This uses ONLY:
  //
  // GET /users/search?q=...
  //
  // It does NOT call /users.
  // ===================================================

  useEffect(() => {
    const query =
      groupMemberSearch.trim();

    if (!query) {
      setGroupMemberResults([]);
      setGroupMemberSearchError("");
      setGroupMemberSearchLoading(false);
      return;
    }

    let cancelled = false;

    const timer = setTimeout(
      async () => {
        try {
          setGroupMemberSearchLoading(true);
          setGroupMemberSearchError("");

          const response =
            await API.get(
              "/users/search",
              {
                params: {
                  q: query,
                },
              }
            );

          if (cancelled) {
            return;
          }

          const results =
            Array.isArray(response.data)
              ? response.data
                  .map(normalizeUser)
                  .filter(Boolean)
              : [];

          setGroupMemberResults(
            results
          );
        } catch (error) {
          if (cancelled) {
            return;
          }

          console.error(
            "Unable to search group members:",
            error
          );

          setGroupMemberResults([]);

          setGroupMemberSearchError(
            error?.response?.data?.detail ||
              "Unable to search users"
          );
        } finally {
          if (!cancelled) {
            setGroupMemberSearchLoading(
              false
            );
          }
        }
      },
      300
    );

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [groupMemberSearch]);

  // ===================================================
  // USER SEARCH
  //
  // IMPORTANT:
  // No automatic GET /users request.
  //
  // Only GET /users/search?q=...
  // ===================================================

  useEffect(() => {
    const query =
      searchQuery.trim();

    if (!query) {
      setInternalSearchResults([]);
      setSearchError("");
      setInternalSearchLoading(false);

      if (typeof onClearSearch === "function") {
        onClearSearch();
      }

      return;
    }

    let cancelled = false;

    const timer = setTimeout(
      async () => {
        try {
          setInternalSearchLoading(true);
          setSearchError("");

          // =================================================
          // PARENT SEARCH HANDLER
          // =================================================

          if (
            typeof onSearchUsers ===
            "function"
          ) {
            await onSearchUsers(query);

            if (!cancelled) {
              setInternalSearchLoading(false);
            }

            return;
          }

          // =================================================
          // DIRECT SEARCH
          // =================================================

          const response =
            await API.get(
              "/users/search",
              {
                params: {
                  q: query,
                },
              }
            );

          if (cancelled) {
            return;
          }

          const results =
            Array.isArray(response.data)
              ? response.data
                  .map(normalizeUser)
                  .filter(Boolean)
              : [];

          setInternalSearchResults(
            results
          );
        } catch (error) {
          if (cancelled) {
            return;
          }

          console.error(
            "Unable to search users:",
            error
          );

          setInternalSearchResults([]);

          setSearchError(
            error?.response?.data?.detail ||
              "Unable to search users"
          );
        } finally {
          if (!cancelled) {
            setInternalSearchLoading(
              false
            );
          }
        }
      },
      300
    );

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    searchQuery,
    onSearchUsers,
    onClearSearch,
  ]);

  // ===================================================
  // FINAL SEARCH RESULTS
  // ===================================================

  const searchResults =
    typeof onSearchUsers ===
    "function"
      ? externalSearchResults || []
      : internalSearchResults;

  const searchLoading =
    typeof onSearchUsers ===
    "function"
      ? externalSearchLoading
      : internalSearchLoading;

  // ===================================================
  // SEARCH INPUT
  // ===================================================

  function handleSearchChange(event) {
    setSearchQuery(
      event.target.value
    );
  }

  // ===================================================
  // CLEAR SEARCH
  // ===================================================

  function clearUserSearch() {
    setSearchQuery("");
    setInternalSearchResults([]);
    setSearchError("");

    if (
      typeof onClearSearch ===
      "function"
    ) {
      onClearSearch();
    }
  }

  // ===================================================
  // SELECT SEARCH USER
  // ===================================================

  function handleSearchUserSelect(user) {
    if (!user) {
      return;
    }

    clearUserSearch();

    onSelectContact?.({
      ...normalizeUser(user),

      lastMessageTimestamp:
        normalizeTimestamp(
          getLastMessageTimestamp(
            user
          )
        ),
    });
  }

  // ===================================================
  // OPEN GROUP MODAL
  // ===================================================

  function openGroupModal() {
    setGroupName("");
    setSelectedMemberIds([]);

    setGroupMemberSearch("");
    setGroupMemberResults([]);
    setGroupMemberSearchError("");

    setGroupCreateError("");
    setGroupCreateSubmitting(false);

    setShowGroupModal(true);
  }

  // ===================================================
  // CLOSE GROUP MODAL
  // ===================================================

  function closeGroupModal() {
    if (groupCreateSubmitting) {
      return;
    }

    setShowGroupModal(false);

    setGroupMemberSearch("");
    setGroupMemberResults([]);
    setGroupMemberSearchError("");

    setGroupCreateError("");
    setGroupCreateSubmitting(false);
  }

  // ===================================================
  // TOGGLE GROUP MEMBER
  // ===================================================

  function toggleMember(contactId) {
    const id = Number(contactId);

    if (!Number.isFinite(id)) {
      return;
    }

    setSelectedMemberIds((previous) => {
      if (previous.includes(id)) {
        return previous.filter(
          (memberId) =>
            memberId !== id
        );
      }

      return [
        ...previous,
        id,
      ];
    });
  }

  // ===================================================
  // CREATE GROUP
  // ===================================================

  async function handleCreateGroupSubmit() {
    const trimmedName =
      groupName.trim();

    setGroupCreateError("");

    if (!trimmedName) {
      setGroupCreateError(
        "Group name is required"
      );
      return;
    }

    if (
      selectedMemberIds.length ===
      0
    ) {
      setGroupCreateError(
        "Select at least one member"
      );
      return;
    }

    if (
      typeof onCreateGroup !==
      "function"
    ) {
      setGroupCreateError(
        "Create group is not connected."
      );
      return;
    }

    try {
      setGroupCreateSubmitting(true);

      await onCreateGroup(
        trimmedName,
        selectedMemberIds
      );

      setShowGroupModal(false);
      setGroupName("");
      setSelectedMemberIds([]);

      setGroupMemberSearch("");
      setGroupMemberResults([]);
      setGroupMemberSearchError("");
      setGroupCreateError("");
    } catch (error) {
      console.error(
        "Unable to create group:",
        error
      );

      setGroupCreateError(
        error?.response?.data?.detail ||
          error?.message ||
          "Unable to create group"
      );
    } finally {
      setGroupCreateSubmitting(false);
    }
  }

  // ===================================================
  // NORMALIZE CONTACTS
  // ===================================================

  const normalizedContacts =
  contacts
    .filter(
      (contact) =>
        contact &&
        contact.id != null
    )
    .map((contact) => {
      const timestamp =
        getLastMessageTimestamp(
          contact
        );

      return {
        ...contact,

        id: Number(contact.id),

        lastMessageTimestamp:
          normalizeTimestamp(
            timestamp
          ),

        sidebarTimeLabel:
          getSidebarTimeLabel(
            timestamp
          ),
      };
    });

  // ===================================================
  // NORMALIZE GROUPS
  // ===================================================

 const normalizedGroups =
  groups
    .filter(
      (group) =>
        group &&
        group.id != null
    )
    .map((group) => {
      const timestamp =
        getLastMessageTimestamp(
          group
        );

      return {
        ...group,

        id: Number(group.id),

        lastMessageTimestamp:
          normalizeTimestamp(
            timestamp
          ),

        sidebarTimeLabel:
          getSidebarTimeLabel(
            timestamp
          ),
      };
    });

  // ===================================================
  // MERGE + SORT
  // ===================================================

  const combinedList =
    useMemo(() => {
      const list = [
        ...normalizedGroups.map(
          (group) => ({
            type: "group",
            id: Number(
              group.id
            ),
            data: group,
            timestamp:
              group.lastMessageTimestamp ||
              0,
          })
        ),

        ...normalizedContacts.map(
          (contact) => ({
            type: "user",
            id: Number(
              contact.id
            ),
            data: contact,
            timestamp:
              contact.lastMessageTimestamp ||
              0,
          })
        ),
      ];

      return list.sort(
        (a, b) =>
          b.timestamp -
          a.timestamp
      );
    }, [
      normalizedGroups,
      normalizedContacts,
    ]);

  // ===================================================
  // RENDER
  // ===================================================

  return (
    <aside
      className="sidebar"
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        height: "100%",
      }}
    >
      {/* ================================================= */}
      {/* CREATE GROUP */}
      {/* ================================================= */}

      <div
        className="create-group-item"
        onClick={openGroupModal}
        style={{
          flexShrink: 0,
        }}
      >
        <div className="create-group-avatar">
          +
        </div>

        <div className="create-group-info">
          <div className="create-group-title">
            Create Group
          </div>

          <div className="create-group-subtitle">
            Start a new group chat
          </div>
        </div>
      </div>

      {/* ================================================= */}
      {/* USER SEARCH */}
      {/* ================================================= */}

      <div
        className="sidebar-user-search"
        style={{
          position: "relative",
          padding:
            "10px 8px 8px",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "0 12px",
            height: "42px",
            border:
              "1px solid rgba(255,255,255,0.10)",
            borderRadius: "12px",
            background:
              "rgba(255,255,255,0.035)",
          }}
        >
          <span
            style={{
              opacity: 0.65,
              fontSize: "15px",
            }}
          >
            ⌕
          </span>

          <input
            type="text"
            value={searchQuery}
            onChange={
              handleSearchChange
            }
            placeholder="Search users by name or email..."
            aria-label="Search registered users"
            style={{
              width: "100%",
              border: 0,
              outline: 0,
              background:
                "transparent",
              color: "inherit",
              fontSize: "13px",
            }}
          />

          {searchQuery && (
            <button
              type="button"
              onClick={
                clearUserSearch
              }
              aria-label="Clear user search"
              style={{
                border: 0,
                background:
                  "transparent",
                color: "inherit",
                opacity: 0.65,
                cursor:
                  "pointer",
                fontSize: "16px",
              }}
            >
              ×
            </button>
          )}
        </div>

        {/* ================================================= */}
        {/* SEARCH RESULTS */}
        {/* ================================================= */}

        {searchQuery.trim() && (
          <div
            className="sidebar-search-results"
            style={{
              margin:
                "6px 0 0",
              border:
                "1px solid rgba(255,255,255,0.08)",
              borderRadius: "12px",
              background:
                "#111214",
              overflow: "hidden",
              maxHeight:
                "280px",
              overflowY:
                "auto",
              position:
                "relative",
              zIndex: 100,
            }}
          >
            {searchLoading ? (
              <div
                style={{
                  padding:
                    "14px",
                  opacity: 0.65,
                  fontSize:
                    "13px",
                  textAlign:
                    "center",
                }}
              >
                Searching...
              </div>
            ) : searchError ? (
              <div
                style={{
                  padding:
                    "14px",
                  opacity: 0.65,
                  fontSize:
                    "13px",
                  textAlign:
                    "center",
                }}
              >
                {searchError}
              </div>
            ) : searchResults.length ===
              0 ? (
              <div
                style={{
                  padding:
                    "14px",
                  opacity: 0.65,
                  fontSize:
                    "13px",
                  textAlign:
                    "center",
                }}
              >
                No registered user found
              </div>
            ) : (
              searchResults.map(
                (user) => {
                  const normalized =
                    normalizeUser(
                      user
                    );

                  if (!normalized) {
                    return null;
                  }

                  const username =
                    normalized.username;

                  const email =
                    normalized.email;

                  const isOnline =
                    normalized.isOnline;

                  return (
                    <button
                      key={`search-${normalized.id}`}
                      type="button"
                      onClick={() =>
                        handleSearchUserSelect(
                          normalized
                        )
                      }
                      style={{
                        width:
                          "100%",
                        display:
                          "flex",
                        alignItems:
                          "center",
                        gap: "10px",
                        padding:
                          "10px 12px",
                        border: 0,
                        borderBottom:
                          "1px solid rgba(255,255,255,0.06)",
                        background:
                          "transparent",
                        color:
                          "inherit",
                        textAlign:
                          "left",
                        cursor:
                          "pointer",
                      }}
                    >
                      <span
                        style={{
                          width:
                            "34px",
                          height:
                            "34px",
                          borderRadius:
                            "50%",
                          display:
                            "grid",
                          placeItems:
                            "center",
                          background:
                            "rgba(255,255,255,0.08)",
                          flexShrink: 0,
                          fontWeight:
                            600,
                          position:
                            "relative",
                        }}
                      >
                        {username
                          .charAt(
                            0
                          )
                          .toUpperCase()}

                        {isOnline && (
                          <span
                            style={{
                              position:
                                "absolute",
                              right:
                                "-1px",
                              bottom:
                                "-1px",
                              width:
                                "9px",
                              height:
                                "9px",
                              borderRadius:
                                "50%",
                              background:
                                "#4ade80",
                              border:
                                "2px solid #111214",
                            }}
                          />
                        )}
                      </span>

                      <span
                        style={{
                          minWidth: 0,
                          flex: 1,
                        }}
                      >
                        <span
                          style={{
                            display:
                              "block",
                            fontWeight:
                              600,
                            fontSize:
                              "13px",
                            whiteSpace:
                              "nowrap",
                            overflow:
                              "hidden",
                            textOverflow:
                              "ellipsis",
                          }}
                        >
                          {username}
                        </span>

                        {email ? (
                          <span
                            style={{
                              display:
                                "block",
                              opacity:
                                0.55,
                              fontSize:
                                "11px",
                              marginTop:
                                "2px",
                              whiteSpace:
                                "nowrap",
                              overflow:
                                "hidden",
                              textOverflow:
                                "ellipsis",
                            }}
                          >
                            {email}
                          </span>
                        ) : (
                          <span
                            style={{
                              display:
                                "block",
                              opacity:
                                0.55,
                              fontSize:
                                "11px",
                              marginTop:
                                "2px",
                            }}
                          >
                            {isOnline
                              ? "Online"
                              : "Start conversation"}
                          </span>
                        )}
                      </span>
                    </button>
                  );
                }
              )
            )}
          </div>
        )}
      </div>

      {/* ================================================= */}
      {/* CHAT LIST */}
      {/* ================================================= */}

      <div
        className="sidebar-chats"
        style={{
          flex:
            "1 1 auto",
          minHeight: 0,
          overflowY:
            "auto",
          overflowX:
            "hidden",
          scrollbarWidth:
            "thin",
        }}
      >
        {combinedList.map(
          (item) => {
            // =================================================
            // GROUP
            // =================================================

            if (
              item.type ===
              "group"
            ) {
              const group =
                item.data;

              const isSelected =
                chatType ===
                  "group" &&
                Number(
                  group.id
                ) ===
                  Number(
                    selectedGroupId
                  );

              const isGroupMutedNow =
                mutedGroupIds.has(
                  Number(group.id)
                );

              return (
                <div
                  key={`group-${group.id}`}
                  className={`group-card ${
                    isSelected
                      ? "selected"
                      : ""
                  }`}
                  onClick={() =>
                    onSelectGroup?.(
                      group
                    )
                  }
                >
                  <div
                    className="sidebar-avatar-wrapper"
                    style={{
                      position:
                        "relative",
                      width:
                        "46px",
                      height:
                        "46px",
                      flexShrink: 0,
                    }}
                  >
                    <div
                      className="group-avatar"
                      style={{
                        position: "relative",
                        width: "100%",
                        height: "100%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        overflow: "hidden",
                      }}
                    >
                      {group.name
                        ?.charAt(0)
                        ?.toUpperCase() || "G"}

                      {isGroupMutedNow && (
                        <MutedAvatarSlash />
                      )}
                    </div>
                  </div>

                  <div className="group-info">
                    <div className="group-info-top">
                      <div className="group-name">
                        {group.name}
                      </div>

                      {group.lastMessageTimestamp >
                        0 && (
                        <span className="group-card-time">
                          {getSidebarTimeLabel(
                            group.lastMessageTimestamp
                          )}
                        </span>
                      )}
                    </div>

                    <div className="group-label">
                      {group.lastMessage ||
                        "Group"}
                    </div>
                  </div>
                </div>
              );
            }

            // =================================================
            // USER
            // =================================================

            const contact =
              item.data;

            return (
              <UserCard
                key={`user-${contact.id}`}
                contact={contact}
                selected={
                  chatType === "user" &&
                  Number(contact.id) === Number(selectedId)
                }
                isMuted={mutedUserIds.has(Number(contact.id))}
                onClick={() =>
                  onSelectContact?.(contact)
                }
              />
            );
          }
        )}

        {/* ================================================= */}
        {/* EMPTY STATE */}
        {/* ================================================= */}

        {combinedList.length ===
          0 &&
          !searchQuery.trim() && (
            <div
              className="sidebar-empty-state"
              style={{
                padding:
                  "20px 12px",
                textAlign:
                  "center",
                opacity:
                  0.55,
                fontSize:
                  "13px",
              }}
            >
              No conversations yet
            </div>
          )}
      </div>

      {/* ================================================= */}
      {/* CREATE GROUP MODAL */}
      {/* ================================================= */}

      {showGroupModal && (
        <div
          className="group-modal-overlay"
          onClick={
            closeGroupModal
          }
        >
          <div
            className="group-modal"
            onClick={(e) =>
              e.stopPropagation()
            }
          >
            {/* HEADER */}

            <div className="group-modal-header">
              <span>
                New Group
              </span>

              <button
                className="group-modal-close"
                onClick={
                  closeGroupModal
                }
                disabled={
                  groupCreateSubmitting
                }
              >
                ✕
              </button>
            </div>

            {/* GROUP NAME */}

            <input
              className="group-name-input"
              type="text"
              placeholder="Group name"
              value={groupName}
              onChange={(e) =>
                setGroupName(
                  e.target.value
                )
              }
              autoFocus
            />

            {/* MEMBERS LABEL */}

            <div className="group-members-label">
              Add members (
              {
                selectedMemberIds.length
              }{" "}
              selected)
            </div>

            {/* MEMBER SEARCH */}

            <div
              style={{
                position:
                  "relative",
                margin:
                  "0 16px 10px",
                flexShrink: 0,
              }}
            >
              <span
                style={{
                  position:
                    "absolute",
                  left:
                    "13px",
                  top:
                    "50%",
                  transform:
                    "translateY(-50%)",
                  color:
                    "#8b8b92",
                  fontSize:
                    "15px",
                  pointerEvents:
                    "none",
                }}
              >
                ⌕
              </span>

              <input
                type="text"
                value={
                  groupMemberSearch
                }
                onChange={(e) =>
                  setGroupMemberSearch(
                    e.target.value
                  )
                }
                placeholder="Search members by name or email..."
                aria-label="Search members"
                style={{
                  width:
                    "100%",
                  height:
                    "44px",
                  boxSizing:
                    "border-box",
                  padding:
                    "0 38px",
                  border:
                    "1px solid rgba(255,255,255,0.10)",
                  borderRadius:
                    "12px",
                  outline:
                    "none",
                  background:
                    "rgba(255,255,255,0.035)",
                  color:
                    "#eeeeee",
                  fontSize:
                    "13px",
                }}
              />

              {groupMemberSearch && (
                <button
                  type="button"
                  onClick={() => {
                    setGroupMemberSearch(
                      ""
                    );
                    setGroupMemberResults(
                      []
                    );
                    setGroupMemberSearchError(
                      ""
                    );
                  }}
                  aria-label="Clear member search"
                  style={{
                    position:
                      "absolute",
                    right:
                      "9px",
                    top:
                      "50%",
                    transform:
                      "translateY(-50%)",
                    border: 0,
                    background:
                      "transparent",
                    color:
                      "#999aa1",
                    cursor:
                      "pointer",
                    fontSize:
                      "17px",
                    padding:
                      "2px",
                  }}
                >
                  ×
                </button>
              )}
            </div>

            {/* MEMBER LIST */}

            <div
              className="group-members-list"
              style={{
                flex:
                  "1 1 auto",
                minHeight:
                  0,
                overflowY:
                  "auto",
                overflowX:
                  "hidden",
              }}
            >
              {!groupMemberSearch.trim() ? (
                <div
                  style={{
                    padding:
                      "28px 16px",
                    opacity:
                      0.55,
                    textAlign:
                      "center",
                    fontSize:
                      "13px",
                  }}
                >
                  Search for a member to add
                </div>
              ) : groupMemberSearchLoading ? (
                <div
                  style={{
                    padding:
                      "28px 16px",
                    opacity:
                      0.6,
                    textAlign:
                      "center",
                    fontSize:
                      "13px",
                  }}
                >
                  Searching...
                </div>
              ) : groupMemberSearchError ? (
                <div
                  style={{
                    padding:
                      "28px 16px",
                    opacity:
                      0.6,
                    textAlign:
                      "center",
                    fontSize:
                      "13px",
                  }}
                >
                  {
                    groupMemberSearchError
                  }
                </div>
              ) : groupMemberResults.length ===
                0 ? (
                <div
                  style={{
                    padding:
                      "28px 16px",
                    opacity:
                      0.6,
                    textAlign:
                      "center",
                    fontSize:
                      "13px",
                  }}
                >
                  No registered user found
                </div>
              ) : (
                groupMemberResults.map(
                  (contact) => {
                    const contactId =
                      Number(
                        contact.id
                      );

                    const checked =
                      selectedMemberIds.includes(
                        contactId
                      );

                    const username =
                      contact.username ||
                      contact.name ||
                      "User";

                    const email =
                      contact.email ||
                      "";

                    return (
                      <div
                        key={contactId}
                        className={`group-member-row ${
                          checked
                            ? "checked"
                            : ""
                        }`}
                        onClick={() =>
                          toggleMember(
                            contactId
                          )
                        }
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (
                            e.key ===
                              "Enter" ||
                            e.key ===
                              " "
                          ) {
                            e.preventDefault();

                            toggleMember(
                              contactId
                            );
                          }
                        }}
                        style={{
                          display:
                            "flex",
                          alignItems:
                            "center",
                          gap:
                            "10px",
                          width:
                            "100%",
                          boxSizing:
                            "border-box",
                          padding:
                            "10px 12px",
                          cursor:
                            "pointer",
                        }}
                      >
                        <div
                          className="group-member-avatar"
                          style={{
                            flexShrink: 0,
                          }}
                        >
                          {username
                            .charAt(
                              0
                            )
                            .toUpperCase()}
                        </div>

                        <div
                          className="group-member-name"
                          style={{
                            minWidth: 0,
                            flex: 1,
                          }}
                        >
                          <div
                            style={{
                              overflow:
                                "hidden",
                              textOverflow:
                                "ellipsis",
                              whiteSpace:
                                "nowrap",
                            }}
                          >
                            {
                              username
                            }
                          </div>

                          {email && (
                            <div
                              style={{
                                marginTop:
                                  "2px",
                                fontSize:
                                  "11px",
                                opacity:
                                  0.5,
                                overflow:
                                  "hidden",
                                textOverflow:
                                  "ellipsis",
                                whiteSpace:
                                  "nowrap",
                              }}
                            >
                              {email}
                            </div>
                          )}
                        </div>

                        <input
                          type="checkbox"
                          checked={
                            checked
                          }
                          readOnly
                          className="group-member-checkbox"
                        />
                      </div>
                    );
                  }
                )
              )}
            </div>

            {/* CREATE ERROR */}

            {groupCreateError && (
              <div
                style={{
                  margin:
                    "0 16px 10px",
                  padding:
                    "8px 12px",
                  borderRadius:
                    "8px",
                  background:
                    "rgba(248, 113, 113, 0.12)",
                  color:
                    "#f87171",
                  fontSize:
                    "12px",
                  textAlign:
                    "center",
                }}
              >
                {
                  groupCreateError
                }
              </div>
            )}

            {/* ACTIONS */}

            <div className="group-modal-actions">
              <button
                className="group-modal-cancel"
                onClick={
                  closeGroupModal
                }
                disabled={
                  groupCreateSubmitting
                }
              >
                Cancel
              </button>

              <button
                className="group-modal-create"
                disabled={
                  !groupName.trim() ||
                  selectedMemberIds.length ===
                    0 ||
                  groupCreateSubmitting
                }
                onClick={
                  handleCreateGroupSubmit
                }
              >
                {groupCreateSubmitting
                  ? "Creating..."
                  : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}