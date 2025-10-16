import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import "../assets/styles/index.css";
export default function SignIn() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);

  function handleSubmit(e) {
    e.preventDefault();

    const savedEmail = localStorage.getItem("accountEmail");
    const savedPassword = localStorage.getItem("accountPassword");

    if (email.trim() === "admin@wm.edu" && password === "1234") {
      if (remember) {
        localStorage.setItem("rememberEmail", email.trim());
      } else {
        localStorage.removeItem("rememberEmail");
      }
      navigate("/create-committee");
    } else {
      alert("Incorrect email or password");
    }
  }

  return (
    <div className="signin-page">
      <div className="box">
        <div className="header">
          <p id="sign-in">Sign in</p>
          <Link id="create-account" to="/create-account">
            or create an account
          </Link>
        </div>

        <form id="loginForm" onSubmit={handleSubmit}>
          <input
            id="email"
            placeholder="Email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            id="password"
            type="password"
            placeholder="Password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          <div className="checkbox-container">
            <input
              type="checkbox"
              id="myCheckbox"
              name="myCheckbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
            />
            <label htmlFor="myCheckbox">Remember Me</label>
          </div>

          <button className="btn" type="submit">
            Sign in
          </button>
        </form>
      </div>
    </div>
  );
}
