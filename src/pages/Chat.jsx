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

  // Keep track of which motion is selected currently
  const [motions, setMotions] = useState(
    data.committeePage.motions.length
      ? data.committeePage.motions
      : [
          { name: "Motion A", discussion: [] },
          { name: "Motion B", discussion: [] },
        ]
  );

  const [activeMotionIndex, setActiveMotionIndex] = useState(0);

  // Adding new motion states
  const [addingMotion, setAddingMotion] = useState(false);
  const [newMotion, setNewMotion] = useState("");

  // Motion with empty discussion page
  const handleAddMotion = () => {
    const trimmed = newMotion.trim();
    if (!trimmed) return;

    setMotions((prev) => [...prev, { name: trimmed, discussion: [] }]);

    setNewMotion("");
    setAddingMotion(false);
  };

  // Handle new chat entries
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

    // Commenting on active motion’s page
    setMotions((prev) =>
      prev.map((m, i) =>
        i === activeMotionIndex
          ? { ...m, discussion: [...m.discussion, newComment] }
          : m
      )
    );

    setInput("");
  };

  // Automatically scroll to the latest message
  const threadEndRef = useRef(null);
  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [motions[activeMotionIndex].discussion.length]);

  // Persist discussion data in localStorage whenever it changes
  useEffect(() => {
    setData((prev) => ({
      ...prev,
      committeePage: {
        ...prev.committeePage,
        motions,
      },
    }));
  }, [motions]);

  useEffect(() => {
    localStorage.setItem("discussionData", JSON.stringify(data));
  }, [data]);

  return (
    <>
      <div className="app-layout">
        {/* LEFT: Motions + People */}
        <div className="left-main">
          <div className="motions-header">
            <h3 className="motions">Motions</h3>
            <button
              className="add-motion-btn"
              aria-label="Add motion"
              onClick={() => setAddingMotion(true)}
            >
              +
            </button>
          </div>

          <nav className="motion-list">
            <ul>
              {motions.map((m, idx) => (
                <li key={idx}>
                  <a
                    href="#"
                    className={idx === activeMotionIndex ? "active" : ""}
                    onClick={() => setActiveMotionIndex(idx)}
                  >
                    {m.name}
                  </a>
                </li>
              ))}
              {addingMotion && (
                <li>
                  <input
                    type="text"
                    className="new-motion-input"
                    placeholder="Enter motion name..."
                    value={newMotion}
                    onChange={(e) => setNewMotion(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleAddMotion();
                    }}
                  />
                </li>
              )}
            </ul>
          </nav>

          {/* Divider */}
          <div
            className="sidebar-divider"
            role="separator"
            aria-hidden="true"
          />

          {/* People section moved here */}
          <div className="sidebar-people">
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
              <span>Member 2</span>
            </div>

            <h4>Observers</h4>
            <div className="observer">
              <img src="#" alt="" className="avatar" />
              <span>Observer 1</span>
            </div>
          </div>
        </div>

        {/* CENTER stays the same */}
        <div className="center-main">
          <div className="discussion-thread">
            {motions[activeMotionIndex].discussion.map((c) => (
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
                placeholder={`Write a comment for ${motions[activeMotionIndex].name}...`}
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
      </div>
    </>
  );
}
