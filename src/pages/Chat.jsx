// src/pages/Discussion.jsx
import React, { useState } from "react";
import "../assets/styles/index.css";

export default function Discussion() {
  // ✅ Step 1: Define committee data
  const committees = {
    "Committee A": {
      motion: { text: "Motion to Increase Budget", author: "Alice" },
      description: "Proposal to increase the budget by 10%.",
      comments: [
        { user: "Bob", text: "I think this is a good idea." },
        { user: "Clara", text: "We should check feasibility first." },
      ],
      chair: "Chairman 1",
      members: ["Member 1", "Member 2"],
      observers: ["Observer 1"],
    },
    "Committee B": {
      motion: { text: "Motion to Reduce Hours", author: "David" },
      description: "Proposal to reduce meeting hours by 30 minutes.",
      comments: [
        { user: "Eve", text: "Finally! Less time in meetings!" },
        { user: "Frank", text: "We might miss discussions though." },
      ],
      chair: "Chairman 2",
      members: ["Member 3", "Member 4"],
      observers: ["Observer 2"],
    },
    "Committee C": {
      motion: { text: "Motion to Adopt New Software", author: "Grace" },
      description: "Proposal to adopt a new project management tool.",
      comments: [{ user: "Hank", text: "I prefer our current tool." }],
      chair: "Chairman 3",
      members: ["Member 5", "Member 6"],
      observers: ["Observer 3"],
    },
  };

  // ✅ Step 2: Track which committee is active
  const [selectedCommittee, setSelectedCommittee] = useState("Committee A");
  const data = committees[selectedCommittee];

  return (
    <>
      {/* LEFT SIDE */}
      <div className="left-main">
        <h3 className="committees">Committees</h3>
        <nav className="committee">
          <ul>
            {Object.keys(committees).map((name) => (
              <li key={name}>
                <a
                  href="#"
                  className={selectedCommittee === name ? "active" : ""}
                  onClick={(e) => {
                    e.preventDefault();
                    setSelectedCommittee(name);
                  }}
                >
                  {name}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      {/* CENTER */}
      <div className="center-main">
        <div className="title-row">
          <h2>{selectedCommittee}</h2>
        </div>

        <section className="card">
          <span className="label">{data.motion.text}</span> – {data.motion.author}
          <div>{data.description}</div>
        </section>

        {data.comments.map((comment, i) => (
          <section className="comment" key={i}>
            <div className="meta">Discussion – {comment.user}</div>
            <div className="placeholder">{comment.text}</div>
          </section>
        ))}

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
            <button className="submit" type="submit" aria-label="Submit comment">
              <i className="fa fa-arrow-up" aria-hidden="true"></i>
            </button>
          </form>
        </section>
      </div>

      {/* RIGHT SIDE */}
      <div className="right-main">
        <h4>Chair</h4>
        <div className="chair">
          <img src="#" alt="" className="avatar" />
          <span>{data.chair}</span>
        </div>

        <h4>Members</h4>
        {data.members.map((m, i) => (
          <div className="member" key={i}>
            <img src="#" alt="" className="avatar" />
            <span>{m}</span>
          </div>
        ))}

        <h4>Observers</h4>
        {data.observers.map((o, i) => (
          <div className="observer" key={i}>
            <img src="#" alt="" className="avatar" />
            <span>{o}</span>
          </div>
        ))}
      </div>
    </>
  );
}
