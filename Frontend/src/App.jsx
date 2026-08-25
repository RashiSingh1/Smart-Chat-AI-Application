import { Routes, Route, Navigate, Outlet } from "react-router-dom";

import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Chat from "./pages/Chat";

function ProtectedRoute() {
  const token = localStorage.getItem("token");
  const userId = localStorage.getItem("user_id");

  if (!token || !userId) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}

function App() {
  return (
    <Routes>
      <Route
        path="/"
        element={<Navigate to="/login" replace />}
      />

      <Route
        path="/login"
        element={<Login />}
      />

      <Route
        path="/signup"
        element={<Signup />}
      />

      <Route element={<ProtectedRoute />}>
        <Route
          path="/chat"
          element={<Chat />}
        />
      </Route>
    </Routes>
  );
}

export default App;