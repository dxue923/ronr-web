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
        <h2 className="home-description">
          Meet, discuss, and decide on ideas efficiently and transparently.{" "}
        </h2>
      </main>
    </div>
  );
}
