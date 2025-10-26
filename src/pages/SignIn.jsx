import { useEffect } from "react";
import { useAuth0 } from "@auth0/auth0-react";
// import "../assets/styles/index.css";

export default function SignIn() {
  const { isAuthenticated, isLoading, loginWithRedirect } = useAuth0();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      loginWithRedirect();
    }
  }, []);
  // useEffect(() => {
  //   if (localStorage.getItem("auth") === "true") {
  //     navigate("/chat", { replace: true });
  //   }
  // }, [navigate]);

  function handleSubmit(e) {
    e.preventDefault();

    const savedEmail = localStorage.getItem("accountEmail");
    const savedPassword = localStorage.getItem("accountPassword");

    if (email.trim() === savedEmail && password === savedPassword) {
      if (remember) {
        localStorage.setItem("rememberEmail", email.trim());
      } else {
        localStorage.removeItem("rememberEmail");
      }
      localStorage.setItem("auth", "true");
      navigate("/discussion", { replace: true });
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
  }, [isLoading, isAuthenticated, loginWithRedirect]);

  return null;
}