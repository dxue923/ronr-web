// src/pages/Discussion.jsx
import React from "react";
import "../assets/styles/index.css";

export default function Discussion() {
  return (
    <>
      <div className="left-main">
        <h3 className="committees">Committees</h3>
        <nav className="committee">
          <ul>
            <li><a href="#" className="active">Committee A</a></li>
            <li><a href="#">Committee B</a></li>
            <li><a href="#">Committee C</a></li>
          </ul>
        </nav>
      </div>

      <div className="center-main">
        <div className="title-row">
          <h2>Committee Name</h2>
        </div>
        <section className="card">
          <span className="label">Motion</span> – Username
          <div>[description of motion]</div>
        </section>
        <section className="comment">
          <div className="meta">Discussion – Username</div>
          <div className="placeholder">[thoughts in favor]</div>
        </section>
        <section className="vote push-right">
          <h4>Vote</h4>
          <button className="chip">Pass Motion</button>
          <button className="chip">Reject Motion</button>
        </section>
        <section className="composer">
          <button className="plus-btn" aria-label="More options">+</button>
          <form className="comment-form" onSubmit={(e) => e.preventDefault()}>
            <input className="input" placeholder="Write a comment..." />
            <button className="submit" type="submit" aria-label="Submit comment">
              <i className="fa fa-arrow-up" aria-hidden="true"></i>
            </button>
          </form>
        </section>
      </div>

      <div className="site-header--topright">
        <div id="collapsible-menu" className="collapsible-menu">
          <nav className="tabs-inline" role="navigation" aria-label="Sections">
            <a className="icon-link" href="../CreateCommittee/index.html" title="Create Committee" aria-label="Create new committee">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm5 11h-4v4h-2v-4H7v-2h4V7h2v4h4v2z" />
              </svg>
            </a>
            <a className="icon-link" href="../EditProfile/index.html" title="Profile" aria-label="Profile">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
                <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
              </svg>
            </a>
            <a className="icon-link" href="../Signin/signin.html" title="Sign Out" aria-label="Sign out">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
                <path d="M0 0h24v24H0z" fill="none" />
                <path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z" />
              </svg>
            </a>
          </nav>
        </div>
        <button id="menu-toggle" className="icon-link" title="Actions" aria-label="Open actions menu" type="button">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
            <path d="M0 0h24v24H0V0z" fill="none" />
            <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
          </svg>
        </button>
      </div>

      <div className="right-main">
        <h4>Chair</h4>
        <div className="chair">
          <img src="#" alt="" className="avatar" />
          <span>Chairman 1</span>
        </div>
        <h4>Members</h4>
        <div className="member">
          <img src="#" alt="" className="avatar" />
          <span>Member 1</span>
        </div>
        <div className="member">
          <img src="#" alt="" className="avatar" />
          <span>Member2</span>
        </div>
        <h4>Observers</h4>
        <div className="observer">
          <img src="#" alt="" className="avatar" />
          <span>Observer 1</span>
        </div>
      </div>
    </>
  );
}