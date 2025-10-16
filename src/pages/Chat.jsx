// src/pages/Discussion.jsx
import React from "react";
import { useState } from "react";
import "../assets/styles/index.css";
import { ChatPageData } from "../data/pageData";

export default function Discussion() {
  const [data, setData] = useState(ChatPageData);
  const [input, setInput] = useState("");

  // Handle comment submit
  const handleSubmit = (e) => {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;

    // Create a new discussion comment
    const newComment = {
      id: Date.now(),
      author: "You",
      text,
      createdAt: new Date().toISOString(),
    };

    // Append to discussion data
    setData((prev) => ({
      ...prev,
      committeePage: {
        ...prev.committeePage,
        discussion: [...prev.committeePage.discussion, newComment],
      },
    }));

    // Clear the input field
    setInput("");
  };

  return (
    <>
      <div className="app-layout">
        <div className="left-main">
          <h3 className="committees">Committees</h3>
          <nav className="committee">
            <ul>
              <li>
                <a href="#" className="active">
                  Committee A
                </a>
              </li>
              <li>
                <a href="#">Committee B</a>
              </li>
              <li>
                <a href="#">Committee C</a>
              </li>
            </ul>
          </nav>
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
          <button className="plus-btn" aria-label="More options">
            +
          </button>
          <form className="comment-form" onSubmit={handleSubmit}>
            <input
              className="input"
              placeholder="Write a comment..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
            />
            <button
              className="submit"
              type="submit"
              aria-label="Submit comment"
            >
              <i className="fa fa-arrow-up" aria-hidden="true"></i>
            </button>
          </form>
        </section>
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
            <button className="plus-btn" aria-label="More options">
              +
            </button>
            <form className="comment-form" onSubmit={(e) => e.preventDefault()}>
              <input className="input" placeholder="Write a comment..." />
              <button
                className="submit"
                type="submit"
                aria-label="Submit comment"
              >
                <i className="fa fa-arrow-up" aria-hidden="true"></i>
              </button>
            </form>
          </section>
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
      </div>
    </>
  );
}
