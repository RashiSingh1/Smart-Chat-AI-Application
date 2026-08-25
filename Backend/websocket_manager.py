from fastapi import WebSocket


class ConnectionManager:

    def __init__(self):
        # user_id -> websocket connection
        self.active_connections: dict[int, WebSocket] = {}

    # =====================================================
    # CONNECT USER
    # =====================================================

    async def connect(
        self,
        user_id: int,
        websocket: WebSocket,
    ):

        await websocket.accept()

        self.active_connections[user_id] = websocket

        print(f"🟢 User {user_id} connected")

        await self.broadcast(
            {
                "type": "online_status",
                "user_id": user_id,
                "is_online": True,
            }
        )

    # =====================================================
    # DISCONNECT USER
    # =====================================================

    async def disconnect(
        self,
        user_id: int,
        websocket: WebSocket | None = None,
    ):

        current_socket = self.active_connections.get(user_id)

        if (
            current_socket is not None
            and (
                websocket is None
                or current_socket is websocket
            )
        ):

            del self.active_connections[user_id]

            print(f"🔴 User {user_id} disconnected")

            await self.broadcast(
                {
                    "type": "online_status",
                    "user_id": user_id,
                    "is_online": False,
                }
            )

    # =====================================================
    # CHECK ONLINE
    # =====================================================

    def is_online(self, user_id: int) -> bool:

        return user_id in self.active_connections

    # =====================================================
    # GET ONLINE USERS
    # =====================================================

    def get_online_users(self):

        return list(self.active_connections.keys())

    # =====================================================
    # SEND PERSONAL MESSAGE
    # =====================================================

    async def send_personal_message(
        self,
        receiver_id: int,
        message: dict,
    ):

        websocket = self.active_connections.get(receiver_id)

        if websocket:

            try:

                await websocket.send_json(message)

            except Exception:

                await self.disconnect(
                    receiver_id,
                    websocket,
                )

    # =====================================================
    # BROADCAST
    # =====================================================

    async def broadcast(
        self,
        message: dict,
    ):

        disconnected_users = []

        for (
            user_id,
            websocket,
        ) in list(self.active_connections.items()):

            try:

                await websocket.send_json(message)

            except Exception:

                disconnected_users.append(
                    (
                        user_id,
                        websocket,
                    )
                )

        # Remove broken connections
        for (
            user_id,
            websocket,
        ) in disconnected_users:

            await self.disconnect(
                user_id,
                websocket,
            )


# =========================================================
# GLOBAL MANAGER
# =========================================================

manager = ConnectionManager()