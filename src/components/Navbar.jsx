// src/components/Navbar.jsx
import "../assets/styles/index.css";
import { Link, useLocation } from "react-router-dom";

export default function Navbar() {
  const location = useLocation();
  const hideNavbar = ["/signin", "/create-account"];
  if (hideNavbar.includes(location.pathname)) return null;

  const isActive = (path) => location.pathname === path;

  // Toggle motions panel visibility (slides .left-main off/on screen)
  const toggleMotionsPanel = (e) => {
    // Keep navigation on /discussion if not already there, but always toggle panel
    const panel = document.querySelector(".left-main");
    if (panel) panel.classList.toggle("hidden-panel");
  };

  return (
    <aside className="left-rail" role="navigation" aria-label="Primary">
      <div className="nav-rail">
        {/* Motions (toggle the motions/members panel) */}
        <Link
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
            aria-hidden="true"
          >
            <path d="M4 4h16v10H6l-2 2V4zm2 4h12v2H6V8zm0 4h8v2H6v-2z" />
          </svg>
        </Link>

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
            aria-hidden="true"
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
            aria-hidden="true"
          >
            <path
              d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 
              1.79-4 4 1.79 4 4 4zm0 
              2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"
            />
          </svg>
        </Link>

        {/* Sign Out */}
        <Link
          to="/"
          className="nav-item"
          title="Sign Out"
          aria-label="Sign Out"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            width="24"
            height="24"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M0 0h24v24H0z" fill="none" />
            <path
              d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 
              17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 
              2 2h8v-2H4V5z"
            />
          </svg>
        </Link>
      </div>
    </aside>
  );
}
