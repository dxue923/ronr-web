import React from "react";
import "../assets/styles/index.css";
import { Link } from "react-router-dom";

export default function Home() {
  return (
    <div className="home-page">
      <header className="home-header">
        <h1 className="home-title">MotionSpace</h1>
        <div className="home-buttons">
          <Link to="/signin" className="btn btn-login">
            Log In
          </Link>
          <Link to="/create-account" className="btn btn-signup">
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
            <Link to="/create-account" className="btn btn-primary">
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
