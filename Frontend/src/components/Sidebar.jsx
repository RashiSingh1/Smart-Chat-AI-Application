import React, { useEffect, useMemo, useState } from "react";
import API from "../services/api";
import UserCard from "./UserCard";

// =====================================================
// CONVERT ANY TIMESTAMP FORMAT INTO MILLISECONDS
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

  const yesterday = new Date(now);

  yesterday.setDate(yesterday.getDate() - 1);

  const isYesterday =
    date.getFullYear() === yesterday.getFullYear() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getDate() === yesterday.getDate();

  if (isYesterday) {
    return "Yesterday";
  }

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

  // Optional external all-users data
  allUsers = [],

  // Existing sidebar search compatibility
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
  // CREATE GROUP MEMBER SEARCH
  // =====================================================

  const [groupMemberSearch, setGroupMemberSearch] =
    useState("");

  // =====================================================
  // MAIN SIDEBAR USER SEARCH STATE
  // =====================================================

  const [searchQuery, setSearchQuery] =
    useState("");

  const [
    internalSearchResults,
    setInternalSearchResults,
  ] = useState([]);

  const [
    internalSearchLoading,
    setInternalSearchLoading,
  ] = useState(false);

  const [searchError, setSearchError] =
    useState("");

  // =====================================================
  // ALL REGISTERED USERS
  // Used for Create Group
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
      if (
        Array.isArray(allUsers) &&
        allUsers.length > 0
      ) {
        return;
      }

      try {
        setAllUsersLoading(true);

        const response = await API.get("/users");

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
  // FILTER USERS INSIDE CREATE GROUP MODAL
  // =====================================================

  const filteredGroupMembers = useMemo(() => {
    const query =
      groupMemberSearch
        .trim()
        .toLowerCase();

    if (!query) {
      return normalizedAllUsers;
    }

    return normalizedAllUsers.filter((user) => {
      const username =
        String(user.username || "")
          .toLowerCase();

      const name =
        String(user.name || "")
          .toLowerCase();

      const email =
        String(user.email || "")
          .toLowerCase();

      return (
        username.includes(query) ||
        name.includes(query) ||
        email.includes(query)
      );
    });
  }, [
    normalizedAllUsers,
    groupMemberSearch,
  ]);

  // =====================================================
  // MAIN SIDEBAR SEARCH
  // =====================================================

  useEffect(() => {
    const query =
      searchQuery.trim();

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

          if (onSearchUsers) {
            await onSearchUsers(query);
          } else {
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
          }
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
  // FINAL MAIN SEARCH RESULTS
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
  // MAIN SEARCH INPUT
  // =====================================================

  function handleSearchChange(event) {
    setSearchQuery(
      event.target.value
    );
  }

  // =====================================================
  // CLEAR MAIN SEARCH
  // =====================================================

  function clearUserSearch() {
    setSearchQuery("");

    setInternalSearchResults([]);

    setSearchError("");

    onClearSearch?.();
  }

  // =====================================================
  // SELECT USER FROM MAIN SEARCH
  // =====================================================

  function handleSearchUserSelect(user) {
    if (!user) {
      return;
    }

    clearUserSearch();

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
    setGroupMemberSearch("");
    setSelectedMemberIds([]);
    setShowGroupModal(true);
  }

  // =====================================================
  // CLOSE GROUP MODAL
  // =====================================================

  function closeGroupModal() {
    setShowGroupModal(false);
    setGroupMemberSearch("");
    setSelectedMemberIds([]);
    setGroupName("");
  }

  // =====================================================
  // TOGGLE GROUP MEMBER
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
        {/* MAIN SEARCH RESULTS */}
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
                          .charAt(0)
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
            {/* ================================================= */}
            {/* HEADER */}
            {/* ================================================= */}

            <div className="group-modal-header">
              <span>
                New Group
              </span>

              <button
                type="button"
                className="group-modal-close"
                onClick={
                  closeGroupModal
                }
                aria-label="Close group modal"
              >
                ✕
              </button>
            </div>

            {/* ================================================= */}
            {/* GROUP NAME */}
            {/* ================================================= */}

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

            {/* ================================================= */}
            {/* MEMBERS LABEL */}
            {/* ================================================= */}

            <div className="group-members-label">
              Add members (
              {
                selectedMemberIds.length
              }{" "}
              selected)
            </div>

            {/* ================================================= */}
            {/* MEMBER SEARCH */}
            {/* ================================================= */}

            <div
              className="group-member-search"
              style={{
                position:
                  "relative",
                margin:
                  "0 16px 10px",
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
                  opacity:
                    0.55,
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
                placeholder="Search members..."
                aria-label="Search members for group"
                style={{
                  width:
                    "100%",
                  height:
                    "42px",
                  boxSizing:
                    "border-box",
                  padding:
                    "0 38px",
                  border:
                    "1px solid rgba(255,255,255,0.10)",
                  borderRadius:
                    "11px",
                  outline:
                    "none",
                  background:
                    "rgba(255,255,255,0.035)",
                  color:
                    "inherit",
                  fontSize:
                    "13px",
                }}
              />

              {groupMemberSearch && (
                <button
                  type="button"
                  onClick={() =>
                    setGroupMemberSearch(
                      ""
                    )
                  }
                  aria-label="Clear member search"
                  style={{
                    position:
                      "absolute",
                    right:
                      "8px",
                    top:
                      "50%",
                    transform:
                      "translateY(-50%)",
                    border:
                      "0",
                    background:
                      "transparent",
                    color:
                      "inherit",
                    opacity:
                      0.6,
                    cursor:
                      "pointer",
                    fontSize:
                      "16px",
                  }}
                >
                  ×
                </button>
              )}
            </div>

            {/* ================================================= */}
            {/* MEMBER LIST */}
            {/* ================================================= */}

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
              ) : filteredGroupMembers.length ===
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
                  No member found
                </div>
              ) : (
                filteredGroupMembers.map(
                  (contact) => {
                    const checked =
                      selectedMemberIds.includes(
                        Number(
                          contact.id
                        )
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
                              contact.id
                            );
                          }
                        }}
                      >
                        {/* AVATAR */}

                        <div className="group-member-avatar">
                          {username
                            .charAt(
                              0
                            )
                            .toUpperCase()}
                        </div>

                        {/* USER INFO */}

                        <div
                          className="group-member-name"
                          style={{
                            minWidth:
                              0,
                            flex:
                              1,
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
                            {username}
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

                        {/* CHECKBOX */}

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

            {/* ================================================= */}
            {/* ACTIONS */}
            {/* ================================================= */}

            <div className="group-modal-actions">
              <button
                type="button"
                className="group-modal-cancel"
                onClick={
                  closeGroupModal
                }
              >
                Cancel
              </button>

              <button
                type="button"
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