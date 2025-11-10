// src/components/Navbar.jsx
import "../assets/styles/index.css";
import { Link, useLocation } from "react-router-dom";
import { useAuth0 } from "@auth0/auth0-react";

export default function Navbar() {
  const location = useLocation();
  const { logout } = useAuth0();

  const hideNavbar = ["/signin", "/create-account", "/callback"];
  if (hideNavbar.includes(location.pathname)) return null;

  const isActive = (path) => location.pathname === path;

  const toggleMotionsPanel = (e) => {
    e.preventDefault(); // stop navigation
    const panel = document.querySelector(".left-main");
    if (panel) {
      panel.classList.toggle("hidden-panel");
    }
  };
  const handleSignOut = () => {
    logout({
      logoutParams: { returnTo: `${window.location.origin}/` },
    });
  };

  return (
    <aside className="left-rail" role="navigation" aria-label="Primary">
      <div className="nav-rail">
        {/* Motions */}
        <button
          to="/discussion"
          onClick={toggleMotionsPanel}
          className={`nav-item ${isActive("/discussion") ? "is-active" : ""}`}
          title="Motions"
          aria-label="Motions"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            width="24"
            height="24"
            fill="currentColor"
          >
            <path d="M4 4h16v10H6l-2 2V4zm2 4h12v2H6V8zm0 4h8v2H6v-2z" />
          </svg>
        </button>

        {/* Create Committee */}
        <Link
          to="/create-committee"
          className={`nav-item ${
            isActive("/create-committee") ? "is-active" : ""
          }`}
          title="Create Committee"
          aria-label="Create Committee"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            width="24"
            height="24"
            fill="currentColor"
          >
            <path
              d="M12 2C6.48 2 2 6.48 2 12s4.48 
              10 10 10 10-4.48 10-10S17.52 2 
              12 2zm5 11h-4v4h-2v-4H7v-2h4V7h2v4h4v2z"
            />
          </svg>
        </Link>

        {/* Profile */}
        <Link
          to="/edit-profile"
          className={`nav-item ${isActive("/edit-profile") ? "is-active" : ""}`}
          title="Profile"
          aria-label="Profile"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            width="24"
            height="24"
            fill="currentColor"
          >
            <path
              d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 
              1.79-4 4 1.79 4 4 4zm0 
              2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"
            />
          </svg>
        </Link>

        {/* Sign Out (Auth0) */}
        <button
          type="button"
          className="nav-item"
          title="Sign Out"
          aria-label="Sign Out"
          onClick={handleSignOut}
          style={{
            background: "none",
            border: 0,
            padding: 0,
            cursor: "pointer",
          }}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            width="24"
            height="24"
            fill="currentColor"
          >
            <path d="M0 0h24v24H0z" fill="none" />
            <path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z" />
          </svg>
        </button>
      </div>
    </aside>
  );
}
