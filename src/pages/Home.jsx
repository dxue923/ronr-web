import React from "react";
import "../assets/styles/index.css";
import { Link } from "react-router-dom";
import { useAuth0 } from "@auth0/auth0-react";

export default function Home() {
  const { isAuthenticated } = useAuth0();

  // If the user is already signed in, send sign-up/get-started links to create-committee
  const signupTarget = isAuthenticated ? "/create-committee" : "/signup";
  const getStartedTarget = isAuthenticated ? "/create-committee" : "/signup";

  return (
    <div className="home-page">
      <header className="home-header">
        <h1 className="home-title">e-motions</h1>
        <div className="home-buttons">
          <Link to="/signin" className="btn btn-login">
            Log In
          </Link>
          <Link to={signupTarget} className="btn btn-signup">
            Sign Up
          </Link>
        </div>
      </header>

      <main className="home-main">
        <section className="home-hero">
          <h2 className="home-description fade-in-delay-1">
            Meet, discuss, and decide on ideas efficiently and transparently.
          </h2>

          <div className="home-cta fade-in-delay-2">
            <Link to={getStartedTarget} className="btn btn-primary">
              Get Started
            </Link>
          </div>

          <ul
            className="home-features fade-in-delay-3"
            aria-label="Key features"
          >
            <li>✓ Create and manage committees</li>
            <li>✓ Raise motions and track discussions</li>
            <li>✓ Vote transparently and view results instantly</li>
          </ul>
        </section>
      </main>
    </div>
  );
}
