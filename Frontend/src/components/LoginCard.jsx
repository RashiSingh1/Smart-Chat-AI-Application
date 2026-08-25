import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import API from "../services/api";
import "../styles/auth.css";

function LoginCard() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) {
      alert("Please fill all fields");
      return;
    }

    try {
      setLoading(true);

      const response = await API.post("/login", {
        email,
        password,
      });

      localStorage.setItem(
        "token",
        response.data.access_token
      );

      localStorage.setItem(
        "user_id",
        response.data.user_id
      );

      alert("Login Successful!");

      navigate("/chat");
    } catch (error) {
      console.log(error);

      if (error.response) {
        alert(
          error.response.data.detail ||
          "Login failed"
        );
      } else {
        alert("Unable to connect to server");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-card">

      <div className="auth-card-header">
        <h1>Welcome Back</h1>
        <p>Login to your account</p>
      </div>

      <div className="auth-form">

        <input
          className="auth-input"
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) =>
            setEmail(e.target.value)
          }
        />

        <input
          className="auth-input"
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) =>
            setPassword(e.target.value)
          }
        />

        <button
          className="auth-button"
          onClick={handleLogin}
          disabled={loading}
        >
          {loading ? "Logging in..." : "Login"}
        </button>

      </div>

      <div className="auth-footer">
        <span>Don't have an account?</span>

        <Link to="/signup">
          Sign Up
        </Link>
      </div>

    </div>
  );
}

export default LoginCard;