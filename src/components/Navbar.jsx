import { useState } from "react";
import { Link } from "react-router-dom";
import "../assets/styles/index.css";
import { useLocation } from "react-router-dom";
import SignOutButton from "./SignOutButton";
import { useAuth0 } from "@auth0/auth0-react";

export default function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const location = useLocation();
  const { isAuthenticated, isLoading } = useAuth0();
  const toggleMenu = () => {
    setIsOpen((prev) => !prev);
  };
  const hideNavbar = ["/signin", "/create-account"];
  if (hideNavbar.includes(location.pathname)) {
    return null;
  }

  return (
    <div className="navbar-container">
      <div id="navbar-menu" className={`navbar-menu ${isOpen ? "open" : ""}`}>
        <nav className="navbar-links" role="navigation">
          {/* Create comittee button */}
          <Link
            className="navbar-link"
            to="/create-committee"
            title="Create Committee"
            aria-label="Create new committee"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="currentColor"
              width="24"
              height="24"
            >
              <path
                d="M12 2C6.48 2 2 6.48 2 12s4.48 
                       10 10 10 10-4.48 10-10S17.52 2 
                       12 2zm5 11h-4v4h-2v-4H7v-2h4V7h2v4h4v2z"
              />
            </svg>
          </Link>
          {/* Edit profile button */}
          <Link className="navbar-link" to="/edit-profile" title="Profile">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="currentColor"
              width="24"
              height="24"
            >
              <path
                d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 
                       1.79-4 4 1.79 4 4 4zm0 
                       2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"
              />
            </svg>
          </Link>

          {/* Sign out button */}
          <Link className="navbar-link" to="/signin" title="Sign Out">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="currentColor"
              width="24"
              height="24"
            >
              <path d="M0 0h24v24H0z" fill="none" />
              <path
                d="M17 7l-1.41 1.41L18.17 
                       11H8v2h10.17l-2.58 2.58L17 
                       17l5-5zM4 5h8V3H4c-1.1 
                       0-2 .9-2 2v14c0 1.1.9 2 
                       2 2h8v-2H4V5z"
              />
            </svg>
          </Link>
        </nav>
      </div>
      <div className="right">
        {!isLoading && isAuthenticated && <SignOutButton />}
      </div>

      {/* Menu toggle button */}
      <button
        id="navbar-toggle"
        className="navbar-link"
        title="Actions"
        type="button"
        onClick={toggleMenu}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="currentColor"
          width="24"
          height="24"
        >
          <path d="M0 0h24v24H0V0z" fill="none" />
          <path
            d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 
                   .9-2 2 .9 2 2 2zm0 2c-1.1 
                   0-2 .9-2 2s.9 2 2 2 2-.9 
                   2-2-.9-2-2-2zm0 6c-1.1 
                   0-2 .9-2 2s.9 2 2 2 2-.9 
                   2-2-.9-2-2-2z"
          />
        </svg>
      </button>
    </div>
  );
}
