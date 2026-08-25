import React, { useEffect, useMemo, useState } from "react";
import API from "../services/api";
import UserCard from "./UserCard";

// =====================================================
// CONVERT ANY TIMESTAMP FORMAT INTO MILLISECONDS
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

  // Already a Date object
  if (timestamp instanceof Date) {
    const time = timestamp.getTime();
    return Number.isNaN(time) ? 0 : time;
  }

  // Numeric timestamp
  if (typeof timestamp === "number") {
    if (timestamp <= 0) {
      return 0;
    }

    // Unix seconds -> milliseconds
    if (timestamp < 100000000000) {
      return timestamp * 1000;
    }

    // Already milliseconds
    return timestamp;
  }

  // Numeric string
  if (
    typeof timestamp === "string" &&
    /^\d+$/.test(timestamp.trim())
  ) {
    const numericTimestamp = Number(timestamp);

    if (numericTimestamp <= 0) {
      return 0;
    }

    // Unix seconds -> milliseconds
    if (numericTimestamp < 100000000000) {
      return numericTimestamp * 1000;
    }

    return numericTimestamp;
  }

  // ISO / normal date string
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
  const normalizedTimestamp = normalizeTimestamp(timestamp);

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

  yesterday.setDate(yesterday.getDate() - 1);

  const isYesterday =
    date.getFullYear() === yesterday.getFullYear() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getDate() === yesterday.getDate();

  if (isYesterday) {
    return "Yesterday";
  }

  // ===================================================
  // OLDER DATE
  // ===================================================

  const isSameYear =
    date.getFullYear() === now.getFullYear();

  return date.toLocaleDateString([], {
    day: "2-digit",
    month: "short",
    ...(isSameYear ? {} : { year: "numeric" }),
  });
}

// =====================================================
// GET LAST MESSAGE TIMESTAMP
// Handles multiple possible backend field names
// =====================================================

function getLastMessageTimestamp(item) {
  return (
    item?.lastMessageTimestamp ??
    item?.last_message_timestamp ??
    item?.lastMessageTime ??
    item?.last_message_time ??
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

export default function Sidebar({
  contacts = [],
  groups = [],
  selectedId,
  selectedGroupId,
  chatType,
  onSelectContact,
  onSelectGroup,
  onCreateGroup,

  // Optional external all-users data.
  // If not supplied, Sidebar loads /users itself.
  allUsers = [],

  // These props are kept for compatibility with your
  // previous Sidebar implementation.
  searchResults: externalSearchResults = [],
  searchLoading: externalSearchLoading = false,
  onSearchUsers,
  onClearSearch,
}) {
  // =====================================================
  // CREATE GROUP MODAL STATE
  // =====================================================

  const [showGroupModal, setShowGroupModal] =
    useState(false);

  const [groupName, setGroupName] =
    useState("");

  const [selectedMemberIds, setSelectedMemberIds] =
    useState([]);

  // =====================================================
  // USER SEARCH STATE
  // =====================================================

  const [searchQuery, setSearchQuery] =
    useState("");

  const [internalSearchResults, setInternalSearchResults] =
    useState([]);

  const [internalSearchLoading, setInternalSearchLoading] =
    useState(false);

  const [searchError, setSearchError] =
    useState("");

  // =====================================================
  // ALL REGISTERED USERS
  // Used for Create Group.
  //
  // IMPORTANT:
  // This is separate from contacts/conversations.
  // Therefore a user without any chat can still be found.
  // =====================================================

  const [loadedAllUsers, setLoadedAllUsers] =
    useState([]);

  const [allUsersLoading, setAllUsersLoading] =
    useState(false);

  // =====================================================
  // LOAD ALL REGISTERED USERS
  // =====================================================

  useEffect(() => {
    let cancelled = false;

    async function loadAllRegisteredUsers() {
      // If parent already supplied users, no need to
      // make another /users request.
      if (
        Array.isArray(allUsers) &&
        allUsers.length > 0
      ) {
        return;
      }

      try {
        setAllUsersLoading(true);

        const response =
          await API.get("/users");

        if (cancelled) {
          return;
        }

        const normalized =
          (response.data || [])
            .map(normalizeUser)
            .filter(Boolean);

        setLoadedAllUsers(normalized);
      } catch (error) {
        if (!cancelled) {
          console.log(
            "Unable to load registered users:",
            error
          );

          setLoadedAllUsers([]);
        }
      } finally {
        if (!cancelled) {
          setAllUsersLoading(false);
        }
      }
    }

    loadAllRegisteredUsers();

    return () => {
      cancelled = true;
    };
  }, [allUsers]);

  // =====================================================
  // EFFECTIVE ALL USERS
  // =====================================================

  const normalizedAllUsers = useMemo(() => {
    const source =
      Array.isArray(allUsers) &&
      allUsers.length > 0
        ? allUsers
        : loadedAllUsers;

    return source
      .map(normalizeUser)
      .filter(Boolean);
  }, [allUsers, loadedAllUsers]);

  // =====================================================
  // SEARCH USERS
  //
  // IMPORTANT:
  // This searches ALL REGISTERED USERS, not only
  // existing conversations.
  //
  // Backend endpoint:
  // GET /users/search?q=isha
  // =====================================================

  useEffect(() => {
    const query =
      searchQuery.trim();

    // Empty search
    if (!query) {
      setInternalSearchResults([]);
      setSearchError("");

      onClearSearch?.();

      return;
    }

    let cancelled = false;

    const timer = setTimeout(
      async () => {
        try {
          setInternalSearchLoading(true);
          setSearchError("");

          // If parent provides search handler,
          // preserve compatibility with it.
          if (onSearchUsers) {
            await onSearchUsers(query);
            return;
          }

          // =================================================
          // DIRECT BACKEND SEARCH
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
            (response.data || [])
              .map(normalizeUser)
              .filter(Boolean);

          setInternalSearchResults(
            results
          );
        } catch (error) {
          if (cancelled) {
            return;
          }

          console.log(
            "Unable to search users:",
            error
          );

          setInternalSearchResults([]);

          setSearchError(
            error.response?.data?.detail ||
              "Unable to search users"
          );
        } finally {
          if (!cancelled) {
            setInternalSearchLoading(false);
          }
        }
      },
      250
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

  // =====================================================
  // FINAL SEARCH RESULTS
  // =====================================================

  const searchResults =
    onSearchUsers
      ? externalSearchResults || []
      : internalSearchResults;

  const searchLoading =
    onSearchUsers
      ? externalSearchLoading
      : internalSearchLoading;

  // =====================================================
  // SEARCH INPUT
  // =====================================================

  function handleSearchChange(event) {
    setSearchQuery(
      event.target.value
    );
  }

  // =====================================================
  // CLEAR SEARCH
  // =====================================================

  function clearUserSearch() {
    setSearchQuery("");

    setInternalSearchResults([]);

    setSearchError("");

    onClearSearch?.();
  }

  // =====================================================
  // SELECT SEARCH USER
  // =====================================================

  function handleSearchUserSelect(user) {
    if (!user) {
      return;
    }

    // Close search first
    clearUserSearch();

    // Open/start 1-to-1 chat
    onSelectContact?.({
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

      isOnline:
        user.isOnline === true ||
        user.is_online === true,

      lastMessage:
        user.lastMessage ||
        "",

      lastMessageTimestamp:
        normalizeTimestamp(
          user.lastMessageTimestamp
        ),
    });
  }

  // =====================================================
  // OPEN GROUP MODAL
  // =====================================================

  function openGroupModal() {
    setGroupName("");
    setSelectedMemberIds([]);
    setShowGroupModal(true);
  }

  // =====================================================
  // CLOSE GROUP MODAL
  // =====================================================

  function closeGroupModal() {
    setShowGroupModal(false);
  }

  // =====================================================
  // TOGGLE MEMBER
  // =====================================================

  function toggleMember(contactId) {
    const id = Number(contactId);

    setSelectedMemberIds((prev) =>
      prev.includes(id)
        ? prev.filter(
            (memberId) =>
              memberId !== id
          )
        : [
            ...prev,
            id,
          ]
    );
  }

  // =====================================================
  // CREATE GROUP
  // =====================================================

  function handleCreateGroupSubmit() {
    const trimmedName =
      groupName.trim();

    if (!trimmedName) {
      return;
    }

    if (
      selectedMemberIds.length === 0
    ) {
      return;
    }

    onCreateGroup?.(
      trimmedName,
      selectedMemberIds
    );

    closeGroupModal();
  }

  // =====================================================
  // NORMALIZE CONTACTS
  // =====================================================

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

  // =====================================================
  // NORMALIZE GROUPS
  // =====================================================

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

  // =====================================================
  // MERGE GROUPS + CONTACTS
  // SORT BY LAST MESSAGE
  // =====================================================

  const combinedList = [
    ...normalizedGroups.map(
      (group) => ({
        type: "group",
        id: Number(group.id),
        data: group,
        timestamp:
          group.lastMessageTimestamp,
      })
    ),

    ...normalizedContacts.map(
      (contact) => ({
        type: "user",
        id: Number(contact.id),
        data: contact,
        timestamp:
          contact.lastMessageTimestamp,
      })
    ),
  ].sort((a, b) => {
    return (
      b.timestamp -
      a.timestamp
    );
  });

  // =====================================================
  // RENDER
  // =====================================================

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
            aria-label="Search registered users by name or email"
            style={{
              width: "100%",
              border: "0",
              outline: "0",
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
                cursor: "pointer",
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
              overflowY: "auto",
              position:
                "relative",
              zIndex: 100,
            }}
          >
            {/* SEARCHING */}

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
              /* ERROR */

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
              /* NO RESULTS */

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
              /* RESULTS */

              searchResults.map(
                (user) => {
                  const username =
                    user.username ||
                    user.name ||
                    "User";

                  const email =
                    user.email ||
                    "";

                  const isOnline =
                    user.isOnline ===
                      true ||
                    user.is_online ===
                      true;

                  return (
                    <button
                      key={`search-${user.id}`}
                      type="button"
                      onClick={() =>
                        handleSearchUserSelect(
                          user
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
                      {/* AVATAR */}

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
                          flexShrink:
                            0,
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

                        {/* ONLINE DOT */}

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

                      {/* USER INFO */}

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
          flex: "1 1 auto",
          minHeight: 0,
          overflowY: "auto",
          overflowX: "hidden",
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

              return (
                <div
                  key={`group-${group.id}`}
                  className={`group-card ${
                    chatType ===
                      "group" &&
                    Number(
                      group.id
                    ) ===
                      Number(
                        selectedGroupId
                      )
                      ? "selected"
                      : ""
                  }`}
                  onClick={() =>
                    onSelectGroup?.(
                      group
                    )
                  }
                >
                  <div className="group-avatar">
                    {group.name
                      ?.charAt(
                        0
                      )
                      ?.toUpperCase() ||
                      "G"}
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
                      {group.lastMessage
                        ? group.lastMessage
                        : "Group"}
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
                contact={
                  contact
                }
                selected={
                  chatType ===
                    "user" &&
                  Number(
                    contact.id
                  ) ===
                    Number(
                      selectedId
                    )
                }
                onClick={() =>
                  onSelectContact?.(
                    contact
                  )
                }
              />
            );
          }
        )}

        {/* ================================================= */}
        {/* EMPTY CONVERSATION STATE */}
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

            {/* MEMBER LIST */}

            <div className="group-members-list">
              {allUsersLoading ? (
                <div
                  style={{
                    padding:
                      "16px",
                    opacity:
                      0.6,
                    textAlign:
                      "center",
                    fontSize:
                      "13px",
                  }}
                >
                  Loading users...
                </div>
              ) : normalizedAllUsers.length ===
                0 ? (
                <div
                  style={{
                    padding:
                      "16px",
                    opacity:
                      0.6,
                    textAlign:
                      "center",
                    fontSize:
                      "13px",
                  }}
                >
                  No users available
                </div>
              ) : (
                normalizedAllUsers.map(
                  (contact) => {
                    const checked =
                      selectedMemberIds.includes(
                        Number(
                          contact.id
                        )
                      );

                    return (
                      <div
                        key={
                          contact.id
                        }
                        className={`group-member-row ${
                          checked
                            ? "checked"
                            : ""
                        }`}
                        onClick={() =>
                          toggleMember(
                            contact.id
                          )
                        }
                      >
                        <div className="group-member-avatar">
                          {contact.username
                            ?.charAt(
                              0
                            )
                            ?.toUpperCase() ||
                            "U"}
                        </div>

                        <div className="group-member-name">
                          {
                            contact.username
                          }
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

            {/* ACTIONS */}

            <div className="group-modal-actions">
              <button
                className="group-modal-cancel"
                onClick={
                  closeGroupModal
                }
              >
                Cancel
              </button>

              <button
                className="group-modal-create"
                disabled={
                  !groupName.trim() ||
                  selectedMemberIds.length ===
                    0
                }
                onClick={
                  handleCreateGroupSubmit
                }
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}