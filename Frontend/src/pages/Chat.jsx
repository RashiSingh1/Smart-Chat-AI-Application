import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import API, {
  getCached,
  invalidateCache,
} from "../services/api";

import {
  connectSocket,
  disconnectSocket,
  sendTyping,
} from "../services/socket";

import Sidebar from "../components/Sidebar";
import ChatArea from "../components/ChatArea";
import AIPanel from "../components/AIPanel";

import "../styles/chat.css";

// =====================================================
// CONVERSATION DATE HELPERS
// =====================================================

function getConversationDateKey(dateValue) {
  if (!dateValue) return null;

  const date = new Date(dateValue);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return `${date.getFullYear()}-${String(
    date.getMonth() + 1
  ).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;
}

function getConversationDateLabel(dateValue) {
  if (!dateValue) return "";

  const date = new Date(dateValue);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const today = new Date();

  const todayKey = getConversationDateKey(today);
  const messageKey = getConversationDateKey(date);

  if (messageKey === todayKey) {
    return "Today";
  }

  const yesterday = new Date(today);

  yesterday.setDate(today.getDate() - 1);

  if (
    messageKey ===
    getConversationDateKey(yesterday)
  ) {
    return "Yesterday";
  }

  return date.toLocaleDateString([], {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

// =====================================================
// SIDEBAR DATE / TIME LABEL
// =====================================================

function getSidebarDateLabel(dateValue) {
  if (!dateValue) {
    return "";
  }

  const date = new Date(dateValue);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const now = new Date();

  const todayKey = getConversationDateKey(now);
  const messageKey = getConversationDateKey(date);

  // ===================================================
  // TODAY → TIME
  // ===================================================

  if (messageKey === todayKey) {
    return date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  // ===================================================
  // YESTERDAY
  // ===================================================

  const yesterday = new Date(now);

  yesterday.setDate(now.getDate() - 1);

  if (
    messageKey ===
    getConversationDateKey(yesterday)
  ) {
    return "Yesterday";
  }

  // ===================================================
  // WITHIN LAST 7 DAYS → DAY
  // ===================================================

  const differenceInMs =
    now.getTime() - date.getTime();

  const differenceInDays =
    differenceInMs /
    (1000 * 60 * 60 * 24);

  if (
    differenceInDays >= 0 &&
    differenceInDays < 7
  ) {
    return date.toLocaleDateString([], {
      weekday: "long",
    });
  }

  // ===================================================
  // SAME YEAR → DATE
  // ===================================================

  if (
    date.getFullYear() ===
    now.getFullYear()
  ) {
    return date.toLocaleDateString([], {
      day: "numeric",
      month: "short",
    });
  }

  // ===================================================
  // DIFFERENT YEAR
  // ===================================================

  return date.toLocaleDateString([], {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// =====================================================
// DATE SEPARATORS FOR CHAT
// =====================================================

function decorateMessagesWithDateSeparators(
  messageList
) {
  if (
    !Array.isArray(messageList) ||
    messageList.length === 0
  ) {
    return [];
  }

  return messageList.map(
    (message, index) => {
      const currentKey =
        getConversationDateKey(
          message.created_at
        );

      const previousKey =
        index > 0
          ? getConversationDateKey(
              messageList[index - 1]
                .created_at
            )
          : null;

      const showDateSeparator =
        index === 0 ||
        currentKey !== previousKey;

      return {
        ...message,
        showDateSeparator,
        dateLabel: showDateSeparator
          ? getConversationDateLabel(
              message.created_at
            )
          : "",
      };
    }
  );
}

// =====================================================
// CHAT
// =====================================================

export default function Chat() {
  // =====================================================
  // CURRENT USER
  // =====================================================

  const currentUserId = Number(
    localStorage.getItem("user_id")
  );

  const authToken =
    localStorage.getItem("token");

  // =====================================================
  // USER CHAT STATES
  // =====================================================

  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] =
    useState(null);

  const [isMuted, setIsMuted] =
    useState(false);

  // =====================================================
  // MESSAGE STATES
  // =====================================================

  const [messages, setMessages] =
    useState([]);

  const [analysis, setAnalysis] =
    useState(null);

  const [isTyping, setIsTyping] =
    useState(false);

  // =====================================================
  // IMPORTANT CONTACTS
  // =====================================================

  const [
    importantContacts,
    setImportantContacts,
  ] = useState([]);

  // =====================================================
  // MOBILE STATES
  // =====================================================

  const [
    mobileChatOpen,
    setMobileChatOpen,
  ] = useState(false);

  const [
    showMobileAIPanel,
    setShowMobileAIPanel,
  ] = useState(false);

  // =====================================================
  // AI ANALYTICS
  // =====================================================

  const [
    activeAnalyticsCategory,
    setActiveAnalyticsCategory,
  ] = useState(null);

  // =====================================================
  // AI ROBOT NOTIFICATION
  // =====================================================

  const [showAIRobot, setShowAIRobot] =
    useState(false);

  const [
    aiMessageNotification,
    setAiMessageNotification,
  ] = useState(null);

  // =====================================================
  // GROUP STATES
  // =====================================================

  const [groups, setGroups] = useState([]);

  const [
    selectedGroup,
    setSelectedGroup,
  ] = useState(null);

  const [
    groupMembers,
    setGroupMembers,
  ] = useState([]);

  const [chatType, setChatType] =
    useState("user");

  const [
    isGroupMuted,
    setIsGroupMuted,
  ] = useState(false);

  // =====================================================
  // REFS
  // =====================================================

  const selectedUserRef =
    useRef(selectedUser);

  const selectedGroupRef =
    useRef(selectedGroup);

  const usersRef = useRef(users);

  const groupsRef = useRef(groups);

  const chatTypeRef =
    useRef(chatType);

  // =====================================================
  // NOTIFICATION / TYPING REFS
  // IMPORTANT:
  // These MUST be inside Chat component.
  // =====================================================

  const notificationTimerRef =
    useRef(null);

  const groupNotificationTimerRef =
    useRef(null);

  const typingTimerRef =
    useRef(null);

  // =====================================================
  // DUPLICATE MESSAGE PREVENTION
  // =====================================================

  const processedMessageIdsRef =
    useRef(new Set());

  // =====================================================
  // COMPONENT MOUNT REF
  // =====================================================

  const isMountedRef =
    useRef(true);

  // =====================================================
  // SYNC REFS
  // =====================================================

  useEffect(() => {
    selectedUserRef.current =
      selectedUser;
  }, [selectedUser]);

  useEffect(() => {
    selectedGroupRef.current =
      selectedGroup;
  }, [selectedGroup]);

  useEffect(() => {
    usersRef.current = users;
  }, [users]);

  useEffect(() => {
    groupsRef.current = groups;
  }, [groups]);

  useEffect(() => {
    chatTypeRef.current = chatType;
  }, [chatType]);

  // =====================================================
  // COMPONENT CLEANUP
  // =====================================================

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;

      if (notificationTimerRef.current) {
        clearTimeout(
          notificationTimerRef.current
        );

        notificationTimerRef.current = null;
      }

      if (
        groupNotificationTimerRef.current
      ) {
        clearTimeout(
          groupNotificationTimerRef.current
        );

        groupNotificationTimerRef.current =
          null;
      }

      if (typingTimerRef.current) {
        clearTimeout(
          typingTimerRef.current
        );

        typingTimerRef.current = null;
      }

      processedMessageIdsRef.current.clear();
    };
  }, []);

  // =====================================================
  // DUPLICATE MESSAGE PROTECTION
  // =====================================================

  function markMessageAsProcessed(
    message
  ) {
    if (!message) {
      return false;
    }

    // =================================================
    // PRIMARY KEY → BACKEND MESSAGE ID
    // =================================================

    const messageId = message.id;

    if (
      messageId !== undefined &&
      messageId !== null &&
      messageId !== ""
    ) {
      const key = String(messageId);

      if (
        processedMessageIdsRef.current.has(
          key
        )
      ) {
        return false;
      }

      processedMessageIdsRef.current.add(
        key
      );

      // Keep memory bounded.
      if (
        processedMessageIdsRef.current
          .size > 5000
      ) {
        const firstKey =
          processedMessageIdsRef.current
            .values()
            .next().value;

        if (firstKey) {
          processedMessageIdsRef.current.delete(
            firstKey
          );
        }
      }

      return true;
    }

    // =================================================
    // FALLBACK KEY
    // =================================================

    const fallbackKey = [
      message.group_id ?? "",
      message.sender_id ?? "",
      message.receiver_id ?? "",
      message.created_at ?? "",
      message.text ?? "",
      message.media_url ?? "",
      message.media_type ??
        message.mediaType ??
        "",
    ].join("|");

    if (
      processedMessageIdsRef.current.has(
        fallbackKey
      )
    ) {
      return false;
    }

    processedMessageIdsRef.current.add(
      fallbackKey
    );

    // Keep fallback memory bounded too.
    if (
      processedMessageIdsRef.current
        .size > 5000
    ) {
      const firstKey =
        processedMessageIdsRef.current
          .values()
          .next().value;

      if (firstKey) {
        processedMessageIdsRef.current.delete(
          firstKey
        );
      }
    }

    return true;
  }

  // =====================================================
  // RESET ANALYTICS WHEN CHAT CHANGES
  // =====================================================

  useEffect(() => {
    setActiveAnalyticsCategory(null);
    setShowMobileAIPanel(false);
  }, [
    selectedUser,
    selectedGroup,
  ]);

  // =====================================================
  // BROWSER NOTIFICATION PERMISSION
  // =====================================================

  useEffect(() => {
    if (
      "Notification" in window &&
      Notification.permission === "default"
    ) {
      Notification.requestPermission().catch(
        (error) => {
          console.log(
            "Notification permission error:",
            error
          );
        }
      );
    }
  }, []);

  // =====================================================
  // BROWSER NOTIFICATION
  // =====================================================

  function showBrowserNotification(
    title,
    messageText
  ) {
    if (
      !("Notification" in window) ||
      Notification.permission !== "granted"
    ) {
      return;
    }

    try {
      const notification =
        new Notification(title, {
          body:
            messageText ||
            "You received an important message.",
          icon: "/favicon.ico",
          tag: `chat-notification-${Date.now()}`,
        });

      notification.onclick = () => {
        window.focus();
        notification.close();
      };
    } catch (error) {
      console.log(
        "Unable to show browser notification:",
        error
      );
    }
  }

  // =====================================================
  // AI USER NOTIFICATION
  // =====================================================

  function showAINotification(
    message,
    contact
  ) {
    if (!isMountedRef.current) {
      return;
    }

    if (notificationTimerRef.current) {
      clearTimeout(
        notificationTimerRef.current
      );

      notificationTimerRef.current = null;
    }

    setShowAIRobot(true);

    notificationTimerRef.current =
      setTimeout(() => {
        if (!isMountedRef.current) {
          return;
        }

        setShowAIRobot(false);

        setAiMessageNotification({
          senderName:
            contact?.username ||
            contact?.name ||
            "Someone",

          text:
            message.text ??
            message.message ??
            message.content ??
            "Important message",
        });

        notificationTimerRef.current =
          setTimeout(() => {
            if (!isMountedRef.current) {
              return;
            }

            setAiMessageNotification(null);

            if (contact) {
              handleSelectContact(contact);
            }
          }, 1500);
      }, 2000);
  }

  // =====================================================
  // AI GROUP NOTIFICATION
  // =====================================================

  function showAIGroupNotification(
    message,
    group
  ) {
    if (!isMountedRef.current) {
      return;
    }

    if (
      groupNotificationTimerRef.current
    ) {
      clearTimeout(
        groupNotificationTimerRef.current
      );

      groupNotificationTimerRef.current =
        null;
    }

    const senderName =
      message.sender_username ||
      message.sender_name ||
      "Someone";

    const groupName =
      group?.name || "Group";

    const text =
      message.text ??
      message.message ??
      message.content ??
      "Important message";

    setShowAIRobot(true);

    groupNotificationTimerRef.current =
      setTimeout(() => {
        if (!isMountedRef.current) {
          return;
        }

        setShowAIRobot(false);

        setAiMessageNotification({
          senderName:
            `${senderName} • ${groupName}`,

          text,
        });

        groupNotificationTimerRef.current =
          setTimeout(() => {
            if (!isMountedRef.current) {
              return;
            }

            setAiMessageNotification(null);

            if (group) {
              handleSelectGroup(group);
            }
          }, 1500);
      }, 2000);
  }

  // =====================================================
  // INCOMING USER NOTIFICATION
  // =====================================================

  function handleIncomingNotification(
    message,
    contact
  ) {
    if (
      Number(message.sender_id) ===
      currentUserId
    ) {
      return;
    }

    const category =
      message.ai_category ??
      message.aiCategory ??
      message.category ??
      null;

    if (category !== "notify") {
      return;
    }

    const current =
      selectedUserRef.current;

    const isCurrentConversation =
      current &&
      Number(current.id) ===
        Number(message.sender_id);

    const isTabVisible =
      document.visibilityState ===
      "visible";

    if (
      isCurrentConversation &&
      isTabVisible
    ) {
      return;
    }

    const senderName =
      contact?.username ||
      contact?.name ||
      "Someone";

    const messageText =
      message.text ??
      message.message ??
      message.content ??
      "Important message";

    if (!isTabVisible) {
      showBrowserNotification(
        `Important message from ${senderName}`,
        messageText
      );
    } else {
      showAINotification(
        message,
        contact
      );
    }
  }

  // =====================================================
  // INCOMING GROUP NOTIFICATION
  // =====================================================

  function handleIncomingGroupNotification(
    message
  ) {
    if (
      Number(message.sender_id) ===
      currentUserId
    ) {
      return;
    }

    const category =
      message.ai_category ??
      message.aiCategory ??
      message.category ??
      null;

    if (category !== "notify") {
      return;
    }

    const currentGroup =
      selectedGroupRef.current;

    const isCurrentGroup =
      currentGroup &&
      Number(currentGroup.id) ===
        Number(message.group_id);

    const isTabVisible =
      document.visibilityState ===
      "visible";

    if (
      isCurrentGroup &&
      isTabVisible
    ) {
      return;
    }

    const senderName =
      message.sender_username ||
      message.sender_name ||
      "Someone";

    const groupObj =
      groupsRef.current.find(
        (group) =>
          Number(group.id) ===
          Number(message.group_id)
      ) || currentGroup;

    const groupName =
      groupObj?.name || "Group";

    const messageText =
      message.text ??
      message.message ??
      message.content ??
      "Important message";

    if (!isTabVisible) {
      showBrowserNotification(
        `Important message in ${groupName}`,
        `${senderName}: ${messageText}`
      );
    } else {
      showAIGroupNotification(
        message,
        groupObj
      );
    }
  }

  // =====================================================
  // INITIAL LOAD
  // =====================================================

  useEffect(() => {
    if (!currentUserId) {
      return;
    }

    loadUsers();
    loadGroups();
  }, [currentUserId]);

  // =====================================================
  // LOAD USERS
  // CHANGED: was GET /users + one GET /messages/{id} PER
  // CONTACT (N+1). Now a single GET /conversations call
  // returns every contact with their last message and AI
  // category already attached, in one DB round trip.
  // =====================================================

  async function loadUsers() {
    try {
      const res =
        await API.get("/conversations");

      const contacts =
        (res.data || []).map((user) => {
          const timestamp =
            user.last_message_created_at
              ? new Date(
                  user.last_message_created_at
                ).getTime()
              : 0;

          return {
            id: Number(user.id),

            username: user.username,

            name: user.username,

            avatarUrl: "",

            isOnline:
              user.is_online === true,

            lastMessage:
              user.last_message || "",

            lastMessageTime:
              user.last_message_created_at
                ? getSidebarDateLabel(
                    user.last_message_created_at
                  )
                : "",

            lastMessageTimestamp:
              timestamp,

            unreadCount: 0,

            aiCategory:
              user.ai_category ?? null,
          };
        });

      contacts.sort(
        (a, b) =>
          (b.lastMessageTimestamp || 0) -
          (a.lastMessageTimestamp || 0)
      );

      setUsers(contacts);

      // =================================================
      // IMPORTANT CONTACTS
      // =================================================

      try {
        const importantRes =
          await API.get(
            "/important-contacts"
          );

        const savedImportant =
          new Map(
            (importantRes.data || []).map(
              (item) => [
                Number(
                  item.contact_id
                ),
                item.always_notify ===
                  true,
              ]
            )
          );

        setImportantContacts(
          contacts.map(
            (contact) => ({
              id: Number(
                contact.id
              ),

              name:
                contact.username,

              alwaysNotify:
                savedImportant.get(
                  Number(
                    contact.id
                  )
                ) === true,
            })
          )
        );
      } catch (error) {
        setImportantContacts(
          contacts.map(
            (contact) => ({
              id: Number(
                contact.id
              ),

              name:
                contact.username,

              alwaysNotify: false,
            })
          )
        );
      }

      // =================================================
      // SELECT FIRST USER
      // =================================================

      if (
        contacts.length > 0 &&
        !selectedUserRef.current
      ) {
        setSelectedUser(
          contacts[0]
        );
      }
    } catch (error) {
      console.log(
        "Unable to load users:",
        error
      );
    }
  }

  // =====================================================
  // LOAD GROUPS
  // CHANGED: was GET /groups + one GET /groups/{id}/messages
  // PER GROUP (N+1). Now a single GET /group-conversations
  // call returns every group with its last message already
  // attached, in one DB round trip.
  // =====================================================

  async function loadGroups() {
    try {
      const res =
        await API.get("/group-conversations");

      const normalizedGroups =
        (res.data || []).map(
          (group) => {
            const timestamp =
              group.last_message_created_at
                ? new Date(
                    group.last_message_created_at
                  ).getTime()
                : 0;

            return {
              ...group,

              id: Number(group.id),

              lastMessage:
                group.last_message || "",

              lastMessageTime:
                group.last_message_created_at
                  ? getSidebarDateLabel(
                      group.last_message_created_at
                    )
                  : "",

              lastMessageTimestamp:
                timestamp,
            };
          }
        );

      normalizedGroups.sort(
        (a, b) =>
          (b.lastMessageTimestamp || 0) -
          (a.lastMessageTimestamp || 0)
      );

      setGroups(
        normalizedGroups
      );
    } catch (error) {
      console.log(
        "Unable to load groups:",
        error
      );
    }
  }

  // =====================================================
  // LOAD GROUP MEMBERS
  // =====================================================

  async function loadGroupMembers(
    groupId
  ) {
    try {
      const res =
        await API.get(
          `/groups/${groupId}/members`
        );

      const members =
        (res.data || []).map(
          (member) => ({
            id: Number(
              member.id
            ),

            username:
              member.username,

            email:
              member.email,

            isOnline:
              member.is_online ===
                true ||
              member.isOnline ===
                true,
          })
        );

      setGroupMembers(
        members
      );

      return members;
    } catch (error) {
      setGroupMembers([]);
      return [];
    }
  }

  // =====================================================
  // USER SELECTION EFFECT
  // =====================================================

  useEffect(() => {
    if (!selectedUser) {
      return;
    }

    loadMessages(
      selectedUser.id
    );

    loadMuteStatus(
      selectedUser.id
    );
  }, [selectedUser]);

  // =====================================================
  // USER MUTE STATUS
  // =====================================================

  async function loadMuteStatus(
    userId
  ) {
    try {
      const res =
        await API.get(
          `/mute/${userId}`
        );

      setIsMuted(
        res.data?.is_muted ===
          true
      );
    } catch (error) {
      setIsMuted(false);
    }
  }

  // =====================================================
  // GROUP MUTE STATUS
  // =====================================================

  async function loadGroupMuteStatus(
    groupId
  ) {
    try {
      const res =
        await API.get(
          `/mute/group/${groupId}`
        );

      setIsGroupMuted(
        res.data?.is_muted ===
          true
      );
    } catch (error) {
      setIsGroupMuted(false);
    }
  }

  // =====================================================
  // TOGGLE GROUP MUTE
  // =====================================================

  async function toggleGroupMute() {
    if (!selectedGroup) {
      return;
    }

    try {
      const groupId =
        Number(
          selectedGroup.id
        );

      if (isGroupMuted) {
        await API.delete(
          `/mute/group/${groupId}`
        );

        setIsGroupMuted(false);
      } else {
        await API.put(
          `/mute/group/${groupId}`
        );

        setIsGroupMuted(true);
      }
    } catch (error) {
      alert(
        error.response?.data
          ?.detail ||
          "Unable to update group mute status"
      );
    }
  }

  // =====================================================
  // TOGGLE USER MUTE
  // =====================================================

  async function toggleMute() {
    if (!selectedUser) {
      return;
    }

    try {
      const userId =
        Number(
          selectedUser.id
        );

      if (isMuted) {
        await API.delete(
          `/mute/${userId}`
        );

        setIsMuted(false);
      } else {
        await API.put(
          `/mute/${userId}`
        );

        setIsMuted(true);
      }
    } catch (error) {
      alert(
        error.response?.data
          ?.detail ||
          "Unable to update mute status"
      );
    }
  }

  // =====================================================
  // LOAD USER MESSAGES
  // =====================================================

  async function loadMessages(
    userId
  ) {
    try {
      const res =
        await getCached(
          `/messages/${userId}`
        );

      const rawMessages =
        res.data || [];

      // =================================================
      // REGISTER ALREADY LOADED MESSAGE IDS
      // =================================================

      rawMessages.forEach(
        (message) => {
          markMessageAsProcessed(
            message
          );
        }
      );

      // =================================================
      // PREVENT STALE RESPONSE
      // =================================================

      if (
        selectedUserRef.current &&
        Number(
          selectedUserRef.current.id
        ) !== Number(userId)
      ) {
        return;
      }

      const mapped =
        rawMessages.map(
          (m) => ({
            id: m.id,

            group_id: m.group_id,

            sender_id: m.sender_id,

            sender_username:
              m.sender_username ||
              m.sender_name ||
              "",

            receiver_id: m.receiver_id,

            text:
              m.text ??
              m.message ??
              m.content ??
              "",

            media_type:
              m.media_type ??
              m.mediaType ??
              null,

            media_url:
              m.media_url ??
              m.mediaUrl ??
              null,

            time: m.created_at
              ? new Date(
                  m.created_at
                ).toLocaleTimeString(
                  [],
                  {
                    hour: "2-digit",
                    minute:
                      "2-digit",
                  }
                )
              : "",

            created_at:
              m.created_at,

            isSent:
              Number(
                m.sender_id
              ) ===
              currentUserId,

            aiCategory:
              m.ai_category ??
              m.aiCategory ??
              m.category ??
              null,

            aiReason:
              m.ai_reason ??
              m.aiReason ??
              m.reason ??
              "",

            aiConfidence:
              Number(
                m.ai_confidence ??
                m.aiConfidence ??
                0
              ),
          })
        );

      setMessages(mapped);

      updateContactPreview(
        userId,
        mapped
      );
    } catch (error) {
      console.log(
        "Unable to load messages:",
        error
      );
    }
  }

  // =====================================================
  // LOAD GROUP MESSAGES
  // =====================================================

  async function loadGroupMessages(
    groupId,
    members = []
  ) {
    try {
      const res =
        await getCached(
          `/groups/${groupId}/messages`
        );

      const rawMessages =
        res.data || [];

      // =================================================
      // REGISTER ALREADY LOADED GROUP MESSAGE IDS
      // =================================================

      rawMessages.forEach(
        (message) => {
          markMessageAsProcessed(
            message
          );
        }
      );

      // =================================================
      // MEMBER MAP
      // =================================================

      const memberMap =
        new Map(
          members.map(
            (member) => [
              Number(member.id),
              member.username,
            ]
          )
        );

      // =================================================
      // MAP GROUP MESSAGES
      // =================================================

      const mapped =
        rawMessages.map(
          (m) => ({
            id: m.id,

            sender_id:
              m.sender_id,

            receiver_id:
              m.receiver_id,

            group_id:
              m.group_id,

            sender_username:
              m.sender_username ||
              memberMap.get(
                Number(
                  m.sender_id
                )
              ) ||
              "Unknown",

            text:
              m.text ?? "",

            media_type:
              m.media_type ??
              m.mediaType ??
              null,

            media_url:
              m.media_url ??
              m.mediaUrl ??
              null,

            time: m.created_at
              ? new Date(
                  m.created_at
                ).toLocaleTimeString(
                  [],
                  {
                    hour: "2-digit",
                    minute:
                      "2-digit",
                  }
                )
              : "",

            created_at:
              m.created_at,

            isSent:
              Number(
                m.sender_id
              ) ===
              currentUserId,

            aiCategory:
              m.ai_category ??
              m.aiCategory ??
              m.category ??
              null,

            aiReason:
              m.ai_reason ??
              m.aiReason ??
              m.reason ??
              "",

            aiConfidence:
              Number(
                m.ai_confidence ??
                m.aiConfidence ??
                0
              ),
          })
        );

      setMessages(mapped);

      // =================================================
      // UPDATE GROUP SIDEBAR PREVIEW
      // =================================================

      if (mapped.length > 0) {
        updateGroupPreview(
          groupId,
          mapped[
            mapped.length - 1
          ]
        );
      }
    } catch (error) {
      console.log(
        "Unable to load group messages:",
        error
      );
    }
  }

  // =====================================================
  // AI ANALYSIS
  // =====================================================

  useEffect(() => {
    if (!messages || messages.length === 0) {
      setAnalysis(null);
      return;
    }

    // ===================================================
    // GROUP CHAT AI ANALYSIS
    // ===================================================

    if (chatType === "group") {
      const receivedMessages = messages.filter(
        (message) =>
          Number(message.sender_id) !==
          Number(currentUserId)
      );

      if (receivedMessages.length === 0) {
        setAnalysis(null);
        return;
      }

      const lastReceivedMessage =
        receivedMessages[receivedMessages.length - 1];

      setAnalysis({
        category:
          lastReceivedMessage.aiCategory ||
          lastReceivedMessage.ai_category ||
          null,

        reason:
          lastReceivedMessage.aiReason ||
          lastReceivedMessage.ai_reason ||
          "No AI analysis available.",

        confidence: Number(
          lastReceivedMessage.aiConfidence ??
          lastReceivedMessage.ai_confidence ??
          0
        ),

        senderName:
          lastReceivedMessage.sender_username ||
          lastReceivedMessage.senderName ||
          "",
      });

      return;
    }

    // ===================================================
    // 1-TO-1 AI ANALYSIS
    // ===================================================

    const receivedMessages = messages.filter(
      (message) =>
        Number(message.sender_id) !==
        Number(currentUserId)
    );

    if (receivedMessages.length === 0) {
      setAnalysis(null);
      return;
    }

    const lastReceivedMessage =
      receivedMessages[receivedMessages.length - 1];

    setAnalysis({
      category:
        lastReceivedMessage.aiCategory ||
        lastReceivedMessage.ai_category ||
        null,

      reason:
        lastReceivedMessage.aiReason ||
        lastReceivedMessage.ai_reason ||
        "No AI analysis available.",

      confidence: Number(
        lastReceivedMessage.aiConfidence ??
        lastReceivedMessage.ai_confidence ??
        0
      ),
    });
  }, [
    messages,
    chatType,
    currentUserId,
  ]);

  // =====================================================
  // CONTACT PREVIEW
  // =====================================================

  function updateContactPreview(
    userId,
    messageList
  ) {
    if (
      !messageList ||
      messageList.length === 0
    ) {
      return;
    }

    const lastMessage =
      messageList[
        messageList.length - 1
      ];

    const timestamp =
      lastMessage.created_at
        ? new Date(
            lastMessage.created_at
          ).getTime()
        : Date.now();

    const isImage =
      lastMessage.media_type?.startsWith(
        "image/"
      ) ||
      lastMessage.mediaType?.startsWith(
        "image/"
      );

    const isAudio =
      lastMessage.media_type?.startsWith(
        "audio/"
      ) ||
      lastMessage.mediaType?.startsWith(
        "audio/"
      );

    setUsers((prev) => {
      const updated =
        prev.map((contact) =>
          Number(contact.id) ===
          Number(userId)
            ? {
                ...contact,

                lastMessage:
                  isImage
                    ? "📷 Image"
                    : isAudio
                    ? "🎙️ Voice message"
                    : lastMessage.text ??
                      lastMessage.message ??
                      lastMessage.content ??
                      "",

                lastMessageTime:
                  getSidebarDateLabel(
                    lastMessage.created_at
                  ),

                lastMessageTimestamp:
                  timestamp,

                aiCategory:
                  lastMessage.aiCategory ??
                  lastMessage.ai_category ??
                  lastMessage.category ??
                  null,
              }
            : contact
        );

      return [...updated].sort(
        (a, b) =>
          (b.lastMessageTimestamp ||
            0) -
          (a.lastMessageTimestamp ||
            0)
      );
    });
  }

  // =====================================================
  // GROUP PREVIEW
  // =====================================================

  function updateGroupPreview(
    groupId,
    message
  ) {
    if (!message) {
      return;
    }

    const timestamp =
      message.created_at
        ? new Date(
            message.created_at
          ).getTime()
        : Date.now();

    const isImage =
      message.media_type?.startsWith(
        "image/"
      ) ||
      message.mediaType?.startsWith(
        "image/"
      );

    const isAudio =
      message.media_type?.startsWith(
        "audio/"
      ) ||
      message.mediaType?.startsWith(
        "audio/"
      );

    const lastMessage =
      isImage
        ? "📷 Image"
        : isAudio
        ? "🎙️ Voice message"
        : message.text ??
          message.message ??
          message.content ??
          "";

    const lastMessageTime =
      message.created_at
        ? getSidebarDateLabel(
            message.created_at
          )
        : "";

    setGroups((prev) => {
      const updated =
        prev.map((group) =>
          Number(group.id) ===
          Number(groupId)
            ? {
                ...group,

                lastMessage,

                lastMessageTime,

                lastMessageTimestamp:
                  timestamp,
              }
            : group
        );

      return [...updated].sort(
        (a, b) =>
          (b.lastMessageTimestamp ||
            0) -
          (a.lastMessageTimestamp ||
            0)
      );
    });
  }

  // =====================================================
  // WEBSOCKET
  // =====================================================

  useEffect(() => {
    if (
      !currentUserId ||
      !authToken
    ) {
      return;
    }

    connectSocket(
      currentUserId,
      authToken,
      (message) => {
        // =================================================
        // SAFETY
        // =================================================

        if (!message) {
          return;
        }

        // =================================================
        // TYPING
        // =================================================

        if (
          message.type ===
          "typing"
        ) {
          if (typingTimerRef.current) {
            clearTimeout(
              typingTimerRef.current
            );
          }

          setIsTyping(true);

          typingTimerRef.current =
            setTimeout(() => {
              if (
                !isMountedRef.current
              ) {
                return;
              }

              setIsTyping(false);

              typingTimerRef.current =
                null;
            }, 1500);

          return;
        }

        // =================================================
        // ONLINE STATUS
        // =================================================

        if (
          message.type ===
          "online_status"
        ) {
          const changedUserId =
            Number(
              message.user_id
            );

          const isOnline =
            message.is_online ===
              true ||
            message.isOnline ===
              true;

          setUsers((prev) =>
            prev.map((user) =>
              Number(user.id) ===
              changedUserId
                ? {
                    ...user,
                    isOnline,
                  }
                : user
            )
          );

          setSelectedUser((prev) => {
            if (!prev) {
              return prev;
            }

            if (
              Number(prev.id) !==
              changedUserId
            ) {
              return prev;
            }

            return {
              ...prev,
              isOnline,
            };
          });

          setGroupMembers((prev) =>
            prev.map((member) =>
              Number(member.id) ===
              changedUserId
                ? {
                    ...member,
                    isOnline,
                  }
                : member
            )
          );

          return;
        }

        // =================================================
        // GROUP MESSAGE
        // =================================================

        if (
          message.type ===
          "group_message"
        ) {
          // ===============================================
          // DUPLICATE PROTECTION
          // ===============================================

          if (
            !markMessageAsProcessed(
              message
            )
          ) {
            return;
          }

          invalidateCache(
            `/groups/${message.group_id}/messages`
          );

          const groupMessage = {
            ...message,

            created_at:
              message.created_at ||
              new Date().toISOString(),
          };

          updateGroupPreview(
            message.group_id,
            groupMessage
          );

          const currentGroup =
            selectedGroupRef.current;

          if (
            currentGroup &&
            Number(
              currentGroup.id
            ) ===
              Number(
                message.group_id
              )
          ) {
            const mappedMessage = {
              id:
                message.id ??
                Date.now(),

              sender_id:
                message.sender_id,

              receiver_id:
                null,

              group_id:
                message.group_id,

              sender_username:
                message.sender_username ||
                message.sender_name ||
                "Unknown",

              text:
                message.text ??
                message.message ??
                message.content ??
                "",

              media_type:
                message.media_type ??
                message.mediaType ??
                null,

              media_url:
                message.media_url ??
                message.mediaUrl ??
                null,

              time:
                new Date(
                  message.created_at ||
                    Date.now()
                ).toLocaleTimeString(
                  [],
                  {
                    hour: "2-digit",
                    minute:
                      "2-digit",
                  }
                ),

              created_at:
                message.created_at ||
                new Date().toISOString(),

              isSent:
                Number(
                  message.sender_id
                ) ===
                currentUserId,

              aiCategory:
                message.ai_category ??
                message.aiCategory ??
                message.category ??
                null,

              aiReason:
                message.ai_reason ??
                message.aiReason ??
                message.reason ??
                "",

              aiConfidence:
                message.ai_confidence ??
                message.aiConfidence ??
                message.confidence ??
                null,
            };

            setMessages(
              (prev) => [
                ...prev,
                mappedMessage,
              ]
            );
          }

          handleIncomingGroupNotification(
            message
          );

          return;
        }

        // =================================================
        // NORMAL USER MESSAGE
        // =================================================

        // IMPORTANT:
        // Prevent WebSocket echo / duplicate messages.
        if (
          !markMessageAsProcessed(
            message
          )
        ) {
          return;
        }

        const senderId =
          Number(
            message.sender_id
          );

        const receiverId =
          Number(
            message.receiver_id
          );

        const contactId =
          senderId ===
          currentUserId
            ? receiverId
            : senderId;

        if (!contactId) {
          return;
        }

        invalidateCache(
          `/messages/${contactId}`
        );

        const contact =
          usersRef.current.find(
            (user) =>
              Number(user.id) ===
              Number(contactId)
          );

        handleIncomingNotification(
          message,
          contact
        );

        // =================================================
        // UPDATE SIDEBAR
        // =================================================

        const incomingTimestamp =
          message.created_at
            ? new Date(
                message.created_at
              ).getTime()
            : Date.now();

        const isImage =
          message.media_type?.startsWith(
            "image/"
          ) ||
          message.mediaType?.startsWith(
            "image/"
          );

        const isAudio =
          message.media_type?.startsWith(
            "audio/"
          ) ||
          message.mediaType?.startsWith(
            "audio/"
          );

        setUsers((prev) => {
          const updated =
            prev.map((user) =>
              Number(user.id) ===
              Number(contactId)
                ? {
                    ...user,

                    lastMessage:
                      isImage
                        ? "📷 Image"
                        : isAudio
                        ? "🎙️ Voice message"
                        : message.text ??
                          message.message ??
                          message.content ??
                          "",

                    lastMessageTime:
                      getSidebarDateLabel(
                        message.created_at ||
                          new Date().toISOString()
                      ),

                    lastMessageTimestamp:
                      incomingTimestamp,

                    aiCategory:
                      message.ai_category ??
                      message.aiCategory ??
                      message.category ??
                      null,
                  }
                : user
            );

          return [...updated].sort(
            (a, b) =>
              (b.lastMessageTimestamp ||
                0) -
              (a.lastMessageTimestamp ||
                0)
          );
        });

        // =================================================
        // ADD TO CURRENT CONVERSATION
        // =================================================

        const current =
          selectedUserRef.current;

        const isCurrentConversation =
          current &&
          (Number(current.id) ===
            senderId ||
            Number(current.id) ===
              receiverId);

        if (
          isCurrentConversation
        ) {
          const mappedMessage = {
            id:
              message.id ??
              Date.now(),

            sender_id:
              senderId,

            receiver_id:
              receiverId,

            text:
              message.text ??
              message.message ??
              message.content ??
              "",

            media_type:
              message.media_type ??
              message.mediaType ??
              null,

            media_url:
              message.media_url ??
              message.mediaUrl ??
              null,

            time:
              new Date(
                message.created_at ||
                  Date.now()
              ).toLocaleTimeString(
                [],
                {
                  hour: "2-digit",
                  minute:
                    "2-digit",
                }
              ),

            created_at:
              message.created_at ||
              new Date().toISOString(),

            isSent:
              senderId ===
              currentUserId,

            aiCategory:
              message.ai_category ??
              message.aiCategory ??
              message.category ??
              null,

            aiReason:
              message.ai_reason ??
              message.aiReason ??
              message.reason ??
              "",

            aiConfidence:
              message.ai_confidence ??
              message.aiConfidence ??
              message.confidence ??
              null,
          };

          setMessages(
            (prev) => [
              ...prev,
              mappedMessage,
            ]
          );
        }
      }
    );

    return () => {
      disconnectSocket();
    };
  }, [
    currentUserId,
    authToken,
  ]);

  // =====================================================
  // SEND MESSAGE
  // =====================================================

async function sendMessage(text) {
  if (!selectedUser || !text.trim()) {
    return;
  }

  const trimmedText = text.trim();

  const now = new Date();
  const temporaryId = `temp-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}`;

  // =====================================================
  // OPTIMISTIC MESSAGE
  // SHOW IMMEDIATELY
  // =====================================================

  const optimisticMessage = {
    id: temporaryId,

    sender_id: currentUserId,

    receiver_id: Number(selectedUser.id),

    text: trimmedText,

    media_type: null,

    media_url: null,

    time: now.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    }),

    created_at: now.toISOString(),

    isSent: true,

    aiCategory: null,

    aiReason: "",

    aiConfidence: null,

    // temporary flag
    isOptimistic: true,
  };

  // =====================================================
  // SHOW MESSAGE IMMEDIATELY
  // =====================================================

  setMessages((prev) => [
    ...prev,
    optimisticMessage,
  ]);

  // =====================================================
  // UPDATE SIDEBAR IMMEDIATELY
  // =====================================================

  updateContactPreview(
    selectedUser.id,
    [optimisticMessage]
  );

  // =====================================================
  // SEND TO BACKEND IN BACKGROUND
  // =====================================================

  try {
    invalidateCache(
      `/messages/${selectedUser.id}`
    );

    const response = await API.post(
      "/messages",
      {
        receiver_id: selectedUser.id,
        text: trimmedText,
      }
    );

    const serverMessage = {
      ...optimisticMessage,

      id:
        response.data?.id ??
        optimisticMessage.id,

      sender_id:
        response.data?.sender_id ??
        currentUserId,

      receiver_id:
        response.data?.receiver_id ??
        selectedUser.id,

      text:
        response.data?.text ??
        trimmedText,

      created_at:
        response.data?.created_at ??
        optimisticMessage.created_at,

      time: new Date(
        response.data?.created_at ??
          optimisticMessage.created_at
      ).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),

      aiCategory:
        response.data?.ai_category ??
        null,

      aiReason:
        response.data?.ai_reason ??
        "",

      aiConfidence:
        response.data?.ai_confidence ??
        null,

      isOptimistic: false,
    };

    // ===================================================
    // REGISTER REAL SERVER MESSAGE
    // BEFORE WEBSOCKET ECHO
    // ===================================================

    markMessageAsProcessed(
      serverMessage
    );

    // ===================================================
    // REPLACE TEMP MESSAGE WITH SERVER MESSAGE
    // ===================================================

    setMessages((prev) =>
      prev.map((message) =>
        message.id === temporaryId
          ? serverMessage
          : message
      )
    );

    updateContactPreview(
      selectedUser.id,
      [serverMessage]
    );
  } catch (error) {
    console.log(
      "Send message error:",
      error
    );

    // ===================================================
    // OPTIONAL:
    // MARK MESSAGE AS FAILED
    // ===================================================

    setMessages((prev) =>
      prev.map((message) =>
        message.id === temporaryId
          ? {
              ...message,
              sendFailed: true,
            }
          : message
      )
    );
  }
}

  // =====================================================
  // SEND IMAGE
  // =====================================================

  // =====================================================
// SEND IMAGE MESSAGE — OPTIMISTIC / INSTANT UI
// =====================================================

async function sendImageMessage({
  media_type,
  media_url,
  text = "",
}) {
  if (
    !selectedUser ||
    !media_type ||
    !media_url
  ) {
    return;
  }

  const receiverId =
    Number(selectedUser.id);

  const now = new Date();

  const temporaryId =
    `temp-image-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}`;

  // =====================================================
  // CREATE OPTIMISTIC IMAGE MESSAGE
  // =====================================================

  const optimisticMessage = {
    id: temporaryId,

    sender_id: currentUserId,

    receiver_id: receiverId,

    text: text?.trim() || "",

    media_type,

    media_url,

    time: now.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    }),

    created_at: now.toISOString(),

    isSent: true,

    aiCategory: null,

    aiReason: "",

    aiConfidence: null,

    isOptimistic: true,

    sendFailed: false,
  };

  // =====================================================
  // SHOW IMAGE IMMEDIATELY
  // =====================================================

  setMessages((prev) => [
    ...prev,
    optimisticMessage,
  ]);

  // =====================================================
  // SIDEBAR IMMEDIATELY
  // =====================================================

  updateContactPreview(
    receiverId,
    [optimisticMessage]
  );

  // =====================================================
  // SEND TO BACKEND
  // =====================================================

  try {
    invalidateCache(
      `/messages/${receiverId}`
    );

    const formData =
      new FormData();

    formData.append(
      "receiver_id",
      String(receiverId)
    );

    formData.append(
      "media_type",
      media_type
    );

    formData.append(
      "media_url",
      media_url
    );

    formData.append(
      "text",
      text?.trim() || ""
    );

    const response =
      await API.post(
        "/messages/image",
        formData
      );

    const createdAt =
      response.data?.created_at ||
      optimisticMessage.created_at;

    // ===================================================
    // REAL SERVER MESSAGE
    // ===================================================

    const serverMessage = {
      ...optimisticMessage,

      id:
        response.data?.id ??
        temporaryId,

      sender_id:
        response.data?.sender_id ??
        currentUserId,

      receiver_id:
        response.data?.receiver_id ??
        receiverId,

      text:
        response.data?.text ??
        text?.trim() ??
        "",

      media_type:
        response.data?.media_type ??
        media_type,

      media_url:
        response.data?.media_url ??
        media_url,

      created_at:
        createdAt,

      time: new Date(
        createdAt
      ).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),

      aiCategory:
        response.data?.ai_category ??
        response.data?.aiCategory ??
        null,

      aiReason:
        response.data?.ai_reason ??
        response.data?.aiReason ??
        "",

      aiConfidence:
        Number(
          response.data?.ai_confidence ??
          response.data?.aiConfidence ??
          0
        ),

      isOptimistic: false,

      sendFailed: false,
    };

    // ===================================================
    // REGISTER SERVER MESSAGE
    // ===================================================

    markMessageAsProcessed(
      serverMessage
    );

    // ===================================================
    // REPLACE TEMP IMAGE
    // ===================================================

    setMessages((prev) =>
      prev.map((message) =>
        message.id === temporaryId
          ? serverMessage
          : message
      )
    );

    updateContactPreview(
      receiverId,
      [serverMessage]
    );
  } catch (error) {
    console.log(
      "Send image message error:",
      error
    );

    setMessages((prev) =>
      prev.map((message) =>
        message.id === temporaryId
          ? {
              ...message,
              isOptimistic: false,
              sendFailed: true,
            }
          : message
      )
    );
  }
}

 // =====================================================
// SEND VOICE MESSAGE — OPTIMISTIC / INSTANT UI
// =====================================================

async function sendVoiceMessage({
  media_type,
  media_url,
}) {
  if (
    !selectedUser ||
    !media_type ||
    !media_url
  ) {
    return;
  }

  const receiverId =
    Number(selectedUser.id);

  const now = new Date();

  const temporaryId =
    `temp-voice-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}`;

  // =====================================================
  // CREATE OPTIMISTIC VOICE MESSAGE
  // =====================================================

  const optimisticMessage = {
    id: temporaryId,

    sender_id: currentUserId,

    receiver_id: receiverId,

    text: "",

    media_type,

    media_url,

    time: now.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    }),

    created_at: now.toISOString(),

    isSent: true,

    aiCategory: "muted",

    aiReason: "Voice message",

    aiConfidence: 100,

    isOptimistic: true,

    sendFailed: false,
  };

  // =====================================================
  // SHOW VOICE MESSAGE IMMEDIATELY
  // =====================================================

  setMessages((prev) => [
    ...prev,
    optimisticMessage,
  ]);

  // =====================================================
  // SIDEBAR IMMEDIATELY
  // =====================================================

  updateContactPreview(
    receiverId,
    [optimisticMessage]
  );

  // =====================================================
  // BACKEND REQUEST
  // =====================================================

  try {
    invalidateCache(
      `/messages/${receiverId}`
    );

    const formData =
      new FormData();

    formData.append(
      "receiver_id",
      String(receiverId)
    );

    formData.append(
      "media_type",
      media_type
    );

    formData.append(
      "media_url",
      media_url
    );

    const response =
      await API.post(
        "/messages/audio",
        formData
      );

    const createdAt =
      response.data?.created_at ||
      optimisticMessage.created_at;

    // ===================================================
    // REAL SERVER MESSAGE
    // ===================================================

    const serverMessage = {
      ...optimisticMessage,

      id:
        response.data?.id ??
        temporaryId,

      sender_id:
        response.data?.sender_id ??
        currentUserId,

      receiver_id:
        response.data?.receiver_id ??
        receiverId,

      text: "",

      media_type:
        response.data?.media_type ??
        media_type,

      media_url:
        response.data?.media_url ??
        media_url,

      created_at:
        createdAt,

      time: new Date(
        createdAt
      ).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),

      aiCategory:
        response.data?.ai_category ??
        response.data?.aiCategory ??
        "muted",

      aiReason:
        response.data?.ai_reason ??
        response.data?.aiReason ??
        "Voice message",

      aiConfidence:
        response.data?.ai_confidence ??
        response.data?.aiConfidence ??
        100,

      isOptimistic: false,

      sendFailed: false,
    };

    // ===================================================
    // REGISTER REAL MESSAGE
    // ===================================================

    markMessageAsProcessed(
      serverMessage
    );

    // ===================================================
    // REPLACE TEMP VOICE MESSAGE
    // ===================================================

    setMessages((prev) =>
      prev.map((message) =>
        message.id === temporaryId
          ? serverMessage
          : message
      )
    );

    updateContactPreview(
      receiverId,
      [serverMessage]
    );
  } catch (error) {
    console.log(
      "Send voice message error:",
      error
    );

    setMessages((prev) =>
      prev.map((message) =>
        message.id === temporaryId
          ? {
              ...message,
              isOptimistic: false,
              sendFailed: true,
            }
          : message
      )
    );
  }
}
  // =====================================================
// SEND GROUP MESSAGE — OPTIMISTIC / INSTANT UI
// =====================================================

async function sendGroupMessage(text) {
  if (
    !selectedGroup ||
    !text.trim()
  ) {
    return;
  }

  const trimmedText =
    text.trim();

  const groupId =
    Number(selectedGroup.id);

  const now = new Date();

  const temporaryId =
    `temp-group-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}`;

  // =====================================================
  // CREATE OPTIMISTIC GROUP MESSAGE
  // =====================================================

  const optimisticMessage = {
    id: temporaryId,

    sender_id: currentUserId,

    receiver_id: null,

    group_id: groupId,

    sender_username: "You",

    text: trimmedText,

    media_type: null,

    media_url: null,

    time: now.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    }),

    created_at:
      now.toISOString(),

    isSent: true,

    aiCategory: null,

    aiReason: "",

    aiConfidence: null,

    isOptimistic: true,

    sendFailed: false,
  };

  // =====================================================
  // SHOW GROUP MESSAGE IMMEDIATELY
  // =====================================================

  setMessages((prev) => [
    ...prev,
    optimisticMessage,
  ]);

  // =====================================================
  // UPDATE GROUP SIDEBAR IMMEDIATELY
  // =====================================================

  updateGroupPreview(
    groupId,
    optimisticMessage
  );

  // =====================================================
  // BACKEND REQUEST
  // =====================================================

  try {
    invalidateCache(
      `/groups/${groupId}/messages`
    );

    const response =
      await API.post(
        `/groups/${groupId}/messages`,
        {
          text: trimmedText,
        }
      );

    const createdAt =
      response.data?.created_at ||
      optimisticMessage.created_at;

    // ===================================================
    // REAL SERVER GROUP MESSAGE
    // ===================================================

    const serverMessage = {
      ...optimisticMessage,

      id:
        response.data?.id ??
        temporaryId,

      sender_id:
        response.data?.sender_id ??
        currentUserId,

      receiver_id: null,

      group_id:
        response.data?.group_id ??
        groupId,

      sender_username:
        response.data?.sender_username ||
        response.data?.sender_name ||
        "You",

      text:
        response.data?.text ??
        trimmedText,

      created_at:
        createdAt,

      time: new Date(
        createdAt
      ).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),

      aiCategory:
        response.data?.ai_category ??
        response.data?.aiCategory ??
        null,

      aiReason:
        response.data?.ai_reason ??
        response.data?.aiReason ??
        "",

      aiConfidence:
        Number(
          response.data?.ai_confidence ??
          response.data?.aiConfidence ??
          0
        ),

      isOptimistic: false,

      sendFailed: false,
    };

    // ===================================================
    // REGISTER REAL MESSAGE BEFORE WS ECHO
    // ===================================================

    markMessageAsProcessed(
      serverMessage
    );

    // ===================================================
    // REPLACE TEMP GROUP MESSAGE
    // ===================================================

    setMessages((prev) =>
      prev.map((message) =>
        message.id === temporaryId
          ? serverMessage
          : message
      )
    );

    updateGroupPreview(
      groupId,
      serverMessage
    );
  } catch (error) {
    console.log(
      "Send group message error:",
      error
    );

    setMessages((prev) =>
      prev.map((message) =>
        message.id === temporaryId
          ? {
              ...message,
              isOptimistic: false,
              sendFailed: true,
            }
          : message
      )
    );
  }
}
 
  // =====================================================
  // MEDIA SEND ROUTERS
  // =====================================================
  // MessageInput is shared by 1-to-1 and group chats.
  // Route image/voice to the correct sender based on chatType.

  function handleSendImage(media) {
    if (chatType === "group") {
      return sendGroupImageMessage(media);
    }

    return sendImageMessage(media);
  }

  function handleSendVoice(media) {
    if (chatType === "group") {
      return sendGroupVoiceMessage(media);
    }

    return sendVoiceMessage(media);
  }

  // =====================================================
  // HANDLE SEND
  // =====================================================

  function handleSend(text) {
    if (
      chatType === "group"
    ) {
      sendGroupMessage(text);
    } else {
      sendMessage(text);
    }
  }

  // =====================================================
  // TODAY'S ANALYTICS — RECEIVED MESSAGES ONLY
  // =====================================================
  // The AI analytics counters must represent messages received
  // from the other person / group members only. Messages sent
  // by the current user are excluded from ALL four counters.

  const analytics = useMemo(() => {
    const today = new Date();

    const todayReceivedMessages = messages.filter((message) => {
      if (!message.created_at) return false;

      // Exclude messages sent by the current user.
      if (Number(message.sender_id) === Number(currentUserId)) {
        return false;
      }

      const messageDate = new Date(message.created_at);

      if (Number.isNaN(messageDate.getTime())) {
        return false;
      }

      return (
        messageDate.getFullYear() === today.getFullYear() &&
        messageDate.getMonth() === today.getMonth() &&
        messageDate.getDate() === today.getDate()
      );
    });

    return {
      // Received messages today only
      total: todayReceivedMessages.length,

      // Received messages classified as notify
      notify: todayReceivedMessages.filter(
        (message) =>
          (message.aiCategory || message.ai_category) ===
          "notify"
      ).length,

      // Received messages classified as digest
      digest: todayReceivedMessages.filter(
        (message) =>
          (message.aiCategory || message.ai_category) ===
          "digest"
      ).length,

      // Received messages classified as muted
      muted: todayReceivedMessages.filter(
        (message) =>
          (message.aiCategory || message.ai_category) ===
          "muted"
      ).length,
    };
  }, [messages, currentUserId]);

  // =====================================================
  // AI ANALYTICS CATEGORY CLICK
  // =====================================================
  // Desktop: keep the AI panel visible.
  // Mobile: apply the category highlight and close the
  // AI panel immediately so the highlighted messages are visible.
  // AIPanel already handles same-category toggle by passing null.
  // =====================================================

  function handleAnalyticsCategoryClick(category) {
    setActiveAnalyticsCategory(category);
    setShowMobileAIPanel(false);
  }

  // =====================================================
  // SELECT CONTACT
  // =====================================================

  function handleSelectContact(
    contact
  ) {
    if (!contact) {
      return;
    }

    setActiveAnalyticsCategory(
      null
    );

    const updatedContact = {
      ...contact,

      id: Number(
        contact.id
      ),

      isOnline:
        contact.isOnline === true ||
        contact.is_online === true,

      unreadCount: 0,
    };

    setChatType("user");

    setSelectedGroup(null);

    setGroupMembers([]);

    setIsGroupMuted(false);

    setMessages([]);

    setSelectedUser(
      updatedContact
    );

    setMobileChatOpen(true);
  }
// =====================================================
// SEND GROUP IMAGE MESSAGE — OPTIMISTIC / INSTANT UI
// =====================================================

async function sendGroupImageMessage({
  media_type,
  media_url,
  text = "",
}) {
  if (!selectedGroup || !media_type || !media_url) {
    return;
  }

  const groupId = Number(selectedGroup.id);
  const now = new Date();
  const temporaryId = `temp-group-image-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const optimisticMessage = {
    id: temporaryId,
    sender_id: currentUserId,
    receiver_id: null,
    group_id: groupId,
    sender_username: "You",
    text: text?.trim() || "",
    media_type,
    media_url,
    time: now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    created_at: now.toISOString(),
    isSent: true,
    aiCategory: "digest",
    aiReason: "Image message",
    aiConfidence: 100,
    isOptimistic: true,
    sendFailed: false,
  };

  setMessages((prev) => [...prev, optimisticMessage]);
  updateGroupPreview(groupId, optimisticMessage);

  try {
    invalidateCache(`/groups/${groupId}/messages`);

    const formData = new FormData();
    formData.append("media_type", media_type);
    formData.append("media_url", media_url);
    formData.append("text", text?.trim() || "");

    const response = await API.post(
      `/groups/${groupId}/messages/image`,
      formData
    );

    const createdAt = response.data?.created_at || optimisticMessage.created_at;

    const serverMessage = {
      ...optimisticMessage,
      id: response.data?.id ?? temporaryId,
      sender_id: response.data?.sender_id ?? currentUserId,
      receiver_id: null,
      group_id: response.data?.group_id ?? groupId,
      sender_username: response.data?.sender_username || response.data?.sender_name || "You",
      text: response.data?.text ?? text?.trim() ?? "",
      media_type: response.data?.media_type ?? media_type,
      media_url: response.data?.media_url ?? media_url,
      created_at: createdAt,
      time: new Date(createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      aiCategory: response.data?.ai_category ?? response.data?.aiCategory ?? "digest",
      aiReason: response.data?.ai_reason ?? response.data?.aiReason ?? "Image message",
      aiConfidence: response.data?.ai_confidence ?? response.data?.aiConfidence ?? 100,
      isOptimistic: false,
      sendFailed: false,
    };

    markMessageAsProcessed(serverMessage);
    setMessages((prev) => prev.map((message) => message.id === temporaryId ? serverMessage : message));
    updateGroupPreview(groupId, serverMessage);
  } catch (error) {
    console.log("Send group image message error:", error);
    console.log("Backend response:", error.response?.data);

    setMessages((prev) =>
      prev.map((message) =>
        message.id === temporaryId
          ? { ...message, isOptimistic: false, sendFailed: true }
          : message
      )
    );
  }
}

// =====================================================
// SEND GROUP VOICE MESSAGE — OPTIMISTIC / INSTANT UI
// =====================================================

async function sendGroupVoiceMessage({
  media_type,
  media_url,
}) {
  if (
    !selectedGroup ||
    !media_type ||
    !media_url
  ) {
    return;
  }

  const groupId = Number(selectedGroup.id);

  const now = new Date();

  const temporaryId =
    `temp-group-voice-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}`;

  // ===================================================
  // OPTIMISTIC GROUP VOICE MESSAGE
  // ===================================================

  const optimisticMessage = {
    id: temporaryId,

    sender_id: currentUserId,

    receiver_id: null,

    group_id: groupId,

    sender_username: "You",

    text: "",

    media_type,

    media_url,

    time: now.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    }),

    created_at: now.toISOString(),

    isSent: true,

    aiCategory: "muted",

    aiReason: "Voice message",

    aiConfidence: 100,

    isOptimistic: true,

    sendFailed: false,
  };

  // ===================================================
  // SHOW IMMEDIATELY
  // ===================================================

  setMessages((prev) => [
    ...prev,
    optimisticMessage,
  ]);

  // ===================================================
  // UPDATE GROUP SIDEBAR
  // ===================================================

  updateGroupPreview(
    groupId,
    optimisticMessage
  );

  // ===================================================
  // SEND TO BACKEND
  // ===================================================

  try {
    invalidateCache(
      `/groups/${groupId}/messages`
    );

    const formData = new FormData();

    formData.append(
      "media_type",
      media_type
    );

    formData.append(
      "media_url",
      media_url
    );

    const response = await API.post(
      `/groups/${groupId}/messages/audio`,
      formData
    );

    const createdAt =
      response.data?.created_at ||
      optimisticMessage.created_at;

    // ===================================================
    // SERVER MESSAGE
    // ===================================================

    const serverMessage = {
      ...optimisticMessage,

      id:
        response.data?.id ??
        temporaryId,

      sender_id:
        response.data?.sender_id ??
        currentUserId,

      receiver_id: null,

      group_id:
        response.data?.group_id ??
        groupId,

      sender_username:
        response.data?.sender_username ||
        response.data?.sender_name ||
        "You",

      text: "",

      media_type:
        response.data?.media_type ??
        media_type,

      media_url:
        response.data?.media_url ??
        media_url,

      created_at: createdAt,

      time: new Date(
        createdAt
      ).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),

      aiCategory:
        response.data?.ai_category ??
        response.data?.aiCategory ??
        "muted",

      aiReason:
        response.data?.ai_reason ??
        response.data?.aiReason ??
        "Voice message",

      aiConfidence:
        response.data?.ai_confidence ??
        response.data?.aiConfidence ??
        100,

      isOptimistic: false,

      sendFailed: false,
    };

    // ===================================================
    // REGISTER SERVER MESSAGE
    // ===================================================

    markMessageAsProcessed(
      serverMessage
    );

    // ===================================================
    // REPLACE OPTIMISTIC MESSAGE
    // ===================================================

    setMessages((prev) =>
      prev.map((message) =>
        message.id === temporaryId
          ? serverMessage
          : message
      )
    );

    updateGroupPreview(
      groupId,
      serverMessage
    );

  } catch (error) {
    console.log(
      "Send group voice message error:",
      error
    );

    console.log(
      "Backend response:",
      error.response?.data
    );

    setMessages((prev) =>
      prev.map((message) =>
        message.id === temporaryId
          ? {
              ...message,
              isOptimistic: false,
              sendFailed: true,
            }
          : message
      )
    );
  }
}

  // =====================================================
  // SELECT GROUP
  // =====================================================

  function handleSelectGroup(
    group
  ) {
    if (!group) {
      return;
    }

    setActiveAnalyticsCategory(
      null
    );

    setChatType("group");

    setSelectedGroup({
      ...group,
      id: Number(group.id),
    });

    setSelectedUser(null);

    setMessages([]);

    setMobileChatOpen(true);

    loadGroupMuteStatus(
      group.id
    );

    loadGroupMembers(
      group.id
    ).then((members) => {
      loadGroupMessages(
        group.id,
        members
      );
    });
  }

  // =====================================================
  // IMPORTANT CONTACT
  // =====================================================

  async function handleToggleImportant(
    contactId
  ) {
    const numericId =
      Number(contactId);

    try {
      const res =
        await API.put(
          `/important-contacts/${numericId}`
        );

      const updatedContact =
        res.data;

      setImportantContacts(
        (prev) =>
          prev.map(
            (contact) =>
              Number(
                contact.id
              ) === numericId
                ? {
                    ...contact,

                    alwaysNotify:
                      updatedContact
                        ?.always_notify ??
                      !contact.alwaysNotify,
                  }
                : contact
          )
      );
    } catch (error) {
      console.log(
        "Failed to toggle important contact:",
        error
      );
    }
  }

  // =====================================================
  // DISPLAY MESSAGES
  // =====================================================

  const displayMessages =
    useMemo(
      () =>
        decorateMessagesWithDateSeparators(
          messages
        ),
      [messages]
    );

  // =====================================================
  // RENDER
  // =====================================================

  return (
    <div
      className={`chat-page${
        mobileChatOpen
          ? " mobile-chat-active"
          : ""
      }`}
    >
      {/* ================================================= */}
      {/* AI ROBOT NOTIFICATION */}
      {/* ================================================= */}

      {showAIRobot && (
        <div className="ai-robot-popup">
          <video
            src="/robot_focused.mp4"
            autoPlay
            muted
            playsInline
            className="ai-robot-video"
          />
        </div>
      )}

      {/* ================================================= */}
      {/* AI MESSAGE NOTIFICATION */}
      {/* ================================================= */}

      {aiMessageNotification && (
        <div className="ai-message-popup">
          <p className="ai-message-sender">
            {
              aiMessageNotification.senderName
            }
          </p>

          <p className="ai-message-text">
            {
              aiMessageNotification.text
            }
          </p>
        </div>
      )}

      {/* ================================================= */}
      {/* SIDEBAR */}
      {/* ================================================= */}

      <Sidebar
        contacts={users}
        groups={groups}
        selectedId={
          selectedUser?.id
        }
        selectedGroupId={
          selectedGroup?.id
        }
        chatType={chatType}
        onSelectContact={
          handleSelectContact
        }
        onSelectGroup={
          handleSelectGroup
        }
        onCreateGroup={() => {}}
      />

      {/* ================================================= */}
      {/* MAIN PANEL */}
      {/* ================================================= */}

      <div className="main-panel">
       
    
<ChatArea
  contact={selectedUser}
  group={selectedGroup}
  chatType={chatType}
  currentUserId={currentUserId}
  groupMembers={groupMembers}
  messages={displayMessages}
  activeCategory={activeAnalyticsCategory}

  onSend={handleSend}
  onSendImage={handleSendImage}
  onSendVoice={handleSendVoice}

  onTyping={() => {
    if (
      chatType === "user" &&
      selectedUser?.id
    ) {
      sendTyping(selectedUser.id);
    }
  }}

  isTyping={isTyping}

  onBack={() =>
    setMobileChatOpen(false)
  }

  isMuted={isMuted}
  onToggleMute={toggleMute}

  isGroupMuted={isGroupMuted}
  onToggleGroupMute={toggleGroupMute}

  onOpenAIAnalysis={() =>
    setShowMobileAIPanel(true)
  }

  // ⭐ THIS IS THE MISSING CONNECTION
  onToggleImportant={() => {
    if (
      chatType === "user" &&
      selectedUser?.id
    ) {
      handleToggleImportant(
        selectedUser.id
      );
    }
  }}
/>

        {/* ================================================= */}
        {/* DESKTOP AI PANEL */}
        {/* ================================================= */}

        <AIPanel
          analysis={
            analysis
          }
          senderName={
            chatType === "group"
              ? selectedGroup?.name ||
                ""
              : selectedUser?.username ||
                ""
          }
          isGroupChat={
            chatType === "group"
          }
          groupName={
            selectedGroup?.name ||
            ""
          }
          analytics={
            analytics
          }
          importantContacts={
            importantContacts
          }
          onToggleImportant={
            handleToggleImportant
          }
          activeCategory={
            activeAnalyticsCategory
          }
          onCategoryClick={
            handleAnalyticsCategoryClick
          }
        />
      </div>

      {/* ================================================= */}
      {/* MOBILE AI PANEL */}
      {/* ================================================= */}

      {showMobileAIPanel && (
        <div
          className="ai-analysis-overlay"
          onClick={() =>
            setShowMobileAIPanel(
              false
            )
          }
        >
          <div
            className="ai-analysis-overlay-inner"
            onClick={(e) =>
              e.stopPropagation()
            }
          >
            <button
              type="button"
              className="ai-analysis-close"
              onClick={() =>
                setShowMobileAIPanel(
                  false
                )
              }
              aria-label="Close AI analysis"
            >
              ✕
            </button>

            <AIPanel
              analysis={
                analysis
              }
              senderName={
                chatType === "group"
                  ? selectedGroup?.name ||
                    ""
                  : selectedUser?.username ||
                    ""
              }
              isGroupChat={
                chatType ===
                "group"
              }
              groupName={
                selectedGroup?.name ||
                ""
              }
              analytics={
                analytics
              }
              importantContacts={
                importantContacts
              }
              onToggleImportant={
                handleToggleImportant
              }
              activeCategory={
                activeAnalyticsCategory
              }
              onCategoryClick={
                handleAnalyticsCategoryClick
              }
            />
          </div>
        </div>
      )}
    </div>
  );
}