let socket = null;

// ----------------------------
// Connect Socket
// ----------------------------

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
  // Create WebSocket
  // ----------------------------

  const encodedToken =
    encodeURIComponent(token);

  const wsUrl =
    `ws://127.0.0.1:8000/ws/${userId}?token=${encodedToken}`;

  console.log(
    "🔌 Connecting WebSocket..."
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
}


// ----------------------------
// Send Message
// ----------------------------

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
    socket.readyState !== WebSocket.OPEN
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
}


// ----------------------------
// Send Typing
// ----------------------------

export function sendTyping(
  receiverId
) {
  if (
    !socket ||
    socket.readyState !== WebSocket.OPEN
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
}


// ----------------------------
// Disconnect
// ----------------------------

export function disconnectSocket() {
  if (!socket) {
    return;
  }

  console.log(
    "🔌 Closing WebSocket..."
  );

  socket.close();

  socket = null;
}


// ----------------------------
// Get Socket
// ----------------------------

export function getSocket() {
  return socket;
}