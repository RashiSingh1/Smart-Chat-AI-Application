import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import API from "../services/api";
import "../styles/auth.css";

function SignupCard() {
  const navigate = useNavigate();

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] =
    useState("");

  const handleSignup = async () => {
    if (
      !username ||
      !email ||
      !password ||
      !confirmPassword
    ) {
      alert("Please fill all fields");
      return;
    }

    if (password !== confirmPassword) {
      alert("Passwords do not match");
      return;
    }

    try {
      const response = await API.post("/signup", {
        username,
        email,
        password,
      });

      console.log(
        "Signup Success:",
        response.data
      );

      alert("Account created successfully!");

      setUsername("");
      setEmail("");
      setPassword("");
      setConfirmPassword("");

      navigate("/login");
    } catch (error) {
      console.error(error);

      if (error.response) {
        alert(
          error.response.data.detail ||
          "Signup failed"
        );
      } else {
        alert("Unable to connect to server.");
      }
    }
  };

  return (
    <div className="auth-card">

      <div className="auth-card-header">
        <h1>Create Account</h1>
        <p>Join SmartChat AI</p>
      </div>

      <div className="auth-form">

        <input
          className="auth-input"
          type="text"
          placeholder="Username"
          value={username}
          onChange={(e) =>
            setUsername(e.target.value)
          }
        />

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

        <input
          className="auth-input"
          type="password"
          placeholder="Confirm Password"
          value={confirmPassword}
          onChange={(e) =>
            setConfirmPassword(e.target.value)
          }
        />

        <button
          className="auth-button"
          onClick={handleSignup}
        >
          Sign Up
        </button>

      </div>

      <div className="auth-footer">
        <span>Already have an account?</span>

        <Link to="/login">
          Login
        </Link>
      </div>

    </div>
  );
}

export default SignupCard;