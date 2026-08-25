let socket = null;

// =====================================================
// WEBSOCKET BASE URL
// =====================================================
//
// Local:
//   VITE_API_URL=http://127.0.0.1:8000
//
// Production:
//   VITE_API_URL=https://smart-chat-ai-application.onrender.com
//
// Automatically converts:
//   http://  -> ws://
//   https:// -> wss://
// =====================================================

const API_URL =
  import.meta.env.VITE_API_URL ||
  "http://127.0.0.1:8000";

const WS_URL = API_URL
  .replace(/^http:\/\//, "ws://")
  .replace(/^https:\/\//, "wss://");

// =====================================================
// CONNECT SOCKET
// =====================================================

export function connectSocket(
  userId,
  token,
  onMessage
) {
  // ----------------------------
  // Validate user
  // ----------------------------

  if (!userId) {
    console.error(
      "❌ WebSocket user ID is missing"
    );
    return;
  }

  // ----------------------------
  // Validate token
  // ----------------------------

  if (!token) {
    console.error(
      "❌ WebSocket token is missing"
    );
    return;
  }

  // ----------------------------
  // Don't create duplicate
  // connections
  // ----------------------------

  if (
    socket &&
    (
      socket.readyState === WebSocket.OPEN ||
      socket.readyState === WebSocket.CONNECTING
    )
  ) {
    console.log(
      "⚠️ WebSocket already connected/connecting"
    );

    return;
  }

  // ----------------------------
  // Encode token
  // ----------------------------

  const encodedToken =
    encodeURIComponent(token);

  // ----------------------------
  // Create WebSocket URL
  // ----------------------------

  const wsUrl =
    `${WS_URL}/ws/${userId}?token=${encodedToken}`;

  console.log(
    "🔌 Connecting WebSocket...",
    wsUrl
  );

  socket = new WebSocket(wsUrl);

  // ----------------------------
  // Connected
  // ----------------------------

  socket.onopen = () => {
    console.log(
      "✅ WebSocket Connected"
    );
  };

  // ----------------------------
  // Incoming Message
  // ----------------------------

  socket.onmessage = (event) => {
    try {
      const message =
        JSON.parse(event.data);

      console.log(
        "📩 Incoming WebSocket Message:",
        message
      );

      if (onMessage) {
        onMessage(message);
      }

    } catch (error) {
      console.error(
        "❌ WebSocket JSON Parse Error:",
        error
      );
    }
  };

  // ----------------------------
  // Error
  // ----------------------------

  socket.onerror = (error) => {
    console.error(
      "❌ WebSocket Error:",
      error
    );
  };

  // ----------------------------
  // Connection Closed
  // ----------------------------

  socket.onclose = (event) => {
    console.log(
      "🔌 WebSocket Disconnected",
      {
        code: event.code,
        reason: event.reason,
      }
    );

    socket = null;
  };
};

// =====================================================
// SEND SOCKET MESSAGE
// =====================================================

export function sendSocketMessage(
  message
) {
  if (!socket) {
    console.error(
      "❌ WebSocket is not connected."
    );
    return false;
  }

  if (
    socket.readyState !==
    WebSocket.OPEN
  ) {
    console.error(
      "❌ WebSocket is not open."
    );
    return false;
  }

  try {
    socket.send(
      JSON.stringify(message)
    );

    return true;

  } catch (error) {
    console.error(
      "❌ Failed to send WebSocket message:",
      error
    );

    return false;
  }
};

// =====================================================
// SEND TYPING
// =====================================================

export function sendTyping(
  receiverId
) {
  if (
    !socket ||
    socket.readyState !==
      WebSocket.OPEN
  ) {
    return;
  }

  if (!receiverId) {
    return;
  }

  try {
    socket.send(
      JSON.stringify({
        type: "typing",
        receiver_id: Number(receiverId),
      })
    );

  } catch (error) {
    console.error(
      "❌ Failed to send typing event:",
      error
    );
  }
};

// =====================================================
// DISCONNECT
// =====================================================

export function disconnectSocket() {
  if (!socket) {
    return;
  }

  console.log(
    "🔌 Closing WebSocket..."
  );

  socket.close();

  socket = null;
};

// =====================================================
// GET SOCKET
// =====================================================

export function getSocket() {
  return socket;
};