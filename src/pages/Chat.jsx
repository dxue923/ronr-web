// src/pages/Discussion.jsx
import React, { useState, useRef, useEffect } from "react";
import "../assets/styles/index.css";
import { ChatPageData } from "../data/pageData";
import { Chatbox } from "../components/Chatbox";

export default function Discussion() {
  // Initialize data from localStorage or default dataset
  const [data, setData] = useState(() => {
    const saved = localStorage.getItem("discussionData");
    return saved ? JSON.parse(saved) : ChatPageData;
  });

  // Input state for the new comment field
  const [input, setInput] = useState("");

  // Add a new comment and update discussion data
  const handleSubmit = (e) => {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;

    const newComment = {
      id: Date.now(),
      author: "You",
      text,
      createdAt: new Date().toISOString(),
    };

    setData((prev) => ({
      ...prev,
      committeePage: {
        ...prev.committeePage,
        discussion: [...prev.committeePage.discussion, newComment],
      },
    }));

    setInput("");
  };

  // Ref to automatically scroll to the latest message
  const threadEndRef = useRef(null);
  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [data.committeePage.discussion.length]);

  // Persist discussion data in localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem("discussionData", JSON.stringify(data));
  }, [data]);

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

        <div className="center-main">
          <div className="discussion-thread">
            {data.committeePage.discussion.map((c) => (
              <Chatbox
                key={c.id}
                message={c.text}
                author={c.author}
                timestamp={c.createdAt}
                isOwn={c.author === "You"}
              />
            ))}
            <div ref={threadEndRef} />
          </div>
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
