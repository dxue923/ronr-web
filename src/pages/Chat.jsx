// src/pages/Chat.jsx
import React, { useState, useRef, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import "../assets/styles/index.css";

/* ---------- storage helpers ---------- */
function loadCommittees() {
  try {
    return JSON.parse(localStorage.getItem("committees") || "[]");
  } catch {
    return [];
  }
}
function findCommitteeById(id) {
  return loadCommittees().find((c) => c.id === id);
}
function loadMotionsForCommittee(id) {
  try {
    return JSON.parse(localStorage.getItem(`committee:${id}:motions`) || "[]");
  } catch {
    return [];
  }
}
function saveMotionsForCommittee(id, motions) {
  localStorage.setItem(`committee:${id}:motions`, JSON.stringify(motions));
}

/* ---------- current user ---------- */
function getCurrentUser() {
  try {
    const p = JSON.parse(localStorage.getItem("profileData") || "{}");
    const username = (p.username || p.name || "you").toString().trim();
    const name = (p.name || p.username || "You").toString().trim();
    return { id: username, username, name, avatarUrl: p.avatarUrl || "" };
  } catch {
    return { id: "you", username: "you", name: "You", avatarUrl: "" };
  }
}

/* quick role badge helper */
function RoleBadge({ role }) {
  if (!role) return null;
  const map = {
    owner: "Owner",
    chair: "Chair",
    member: "Member",
    observer: "Observer",
  };
  return <span className={`role-badge role-${role}`}>{map[role] || role}</span>;
}

export default function Chat() {
  const { id } = useParams(); // committee id
  const committee = findCommitteeById(id);
  const [motions, setMotions] = useState(() =>
    committee ? loadMotionsForCommittee(committee.id) : []
  );
  const [activeMotionId, setActiveMotionId] = useState(
    () => motions[0]?.id || null
  );
  const [input, setInput] = useState("");
  const scrollRef = useRef(null);
  const me = getCurrentUser();

  // find active motion object
  const activeMotion = motions.find((m) => m.id === activeMotionId) || null;

  // ensure we have motions in state if ls changes
  useEffect(() => {
    if (!committee) return;
    setMotions(loadMotionsForCommittee(committee.id));
  }, [committee?.id]);

  // scroll to bottom when messages change
  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [activeMotion]);

  if (!committee) {
    return (
      <div className="discussion-shell">
        <p>Committee not found.</p>
        <Link to="/">Back</Link>
      </div>
    );
  }

  // temp members on the committee
  const members = committee.memberships ||
    committee.members || [
      {
        id: committee.ownerId || committee.owner || "owner",
        name: committee.ownerName || "Owner",
        role: "owner",
      },
    ];

  const handleSend = (e) => {
    e && e.preventDefault();
    if (!input.trim() || !activeMotion) return;

    const updated = motions.map((m) => {
      if (m.id !== activeMotion.id) return m;
      const msgs = m.messages || [];
      return {
        ...m,
        messages: [
          ...msgs,
          {
            id: Date.now().toString(),
            authorId: me.id,
            authorName: me.name,
            text: input.trim(),
            time: new Date().toISOString(),
            stance: "neutral", // default, user change after sending
          },
        ],
      };
    });
    setMotions(updated);
    saveMotionsForCommittee(committee.id, updated);
    setInput("");
  };

  // change stance of an individual message
  const handleChangeMessageStance = (messageId, nextStance) => {
    if (!activeMotion) return;
    const updated = motions.map((m) => {
      if (m.id !== activeMotion.id) return m;
      const msgs = (m.messages || []).map((msg) =>
        msg.id === messageId ? { ...msg, stance: nextStance } : msg
      );
      return { ...m, messages: msgs };
    });
    setMotions(updated);
    saveMotionsForCommittee(committee.id, updated);
  };

  const handleAddMotion = () => {
    const title = prompt("Motion title?");
    if (!title) return;
    const desc = prompt("Short description (optional)?") || "";
    const newMotion = {
      id: crypto.randomUUID
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2, 10),
      title,
      description: desc,
      state: "discussion", // discussion | paused | voting | closed
      messages: [],
      decisionLog: [],
    };
    const updated = [newMotion, ...motions];
    setMotions(updated);
    saveMotionsForCommittee(committee.id, updated);
    setActiveMotionId(newMotion.id);
  };

  const changeMotionState = (next) => {
    if (!activeMotion) return;
    const updated = motions.map((m) =>
      m.id === activeMotion.id ? { ...m, state: next } : m
    );
    setMotions(updated);
    saveMotionsForCommittee(committee.id, updated);
  };

  return (
    <div className="discussion-shell">
      {/* LEFT: motions + participants */}
      <aside className="discussion-left">
        <div className="discussion-left-header">
          <h2>{committee.name || "Committee"}</h2>
          <button onClick={handleAddMotion} className="primary-icon-btn">
            +
          </button>
        </div>

        <div className="motion-list">
          {motions.length === 0 && (
            <p className="empty">No motions yet. Add one.</p>
          )}
          {motions.map((m) => (
            <button
              key={m.id}
              className={
                "motion-list-item " +
                (m.id === activeMotionId ? "motion-active" : "")
              }
              onClick={() => setActiveMotionId(m.id)}
            >
              <span className="motion-title">{m.title}</span>
              <span className={`status-pill status-${m.state || "discussion"}`}>
                {m.state || "discussion"}
              </span>
            </button>
          ))}
        </div>

        <div className="member-list">
          <h3>Participants</h3>
          {members.map((p) => (
            <div key={p.id || p.name} className="member-row">
              <div className="avatar-circle">
                {(p.name || p.id || "?").slice(0, 2).toUpperCase()}
              </div>
              <div>
                <div className="member-name">{p.name || p.id}</div>
                <RoleBadge role={p.role} />
              </div>
            </div>
          ))}
          <Link to="/" className="back-link">
            ← Back to Committees
          </Link>
        </div>
      </aside>

      {/* MIDDLE: thread */}
      <main className="discussion-main">
        {activeMotion ? (
          <>
            <header className="discussion-main-header">
              <div>
                <h1>{activeMotion.title}</h1>
                {activeMotion.description ? (
                  <p className="motion-desc">{activeMotion.description}</p>
                ) : null}
              </div>
              <span
                className={`status-pill status-${
                  activeMotion.state || "discussion"
                }`}
              >
                {activeMotion.state || "discussion"}
              </span>
            </header>

            <div className="discussion-thread" ref={scrollRef}>
              {(activeMotion.messages || []).map((msg) => {
                const isMine = msg.authorId === me.id;
                return (
                  <div
                    key={msg.id}
                    className={"message-row " + (isMine ? "mine" : "")}
                  >
                    {/* top line: name + chosen stance */}
                    <div className="message-header">
                      <span className="message-author">{msg.authorName}</span>
                      {msg.stance ? (
                        <span className={`stance-tag stance-${msg.stance}`}>
                          {msg.stance}
                        </span>
                      ) : null}
                    </div>

                    {/* stance options: only show when no stance yet */}
                    {!msg.stance && (
                      <div
                        className={`message-stance-inline ${
                          !msg.stance ? "show" : ""
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() =>
                            handleChangeMessageStance(msg.id, "pro")
                          }
                          className={
                            "stance-inline-btn " +
                            (msg.stance === "pro" ? "is-active" : "")
                          }
                        >
                          Pro
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            handleChangeMessageStance(msg.id, "con")
                          }
                          className={
                            "stance-inline-btn " +
                            (msg.stance === "con" ? "is-active" : "")
                          }
                        >
                          Con
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            handleChangeMessageStance(msg.id, "neutral")
                          }
                          className={
                            "stance-inline-btn " +
                            (msg.stance === "neutral" ? "is-active" : "")
                          }
                        >
                          Neutral
                        </button>
                      </div>
                    )}

                    {/* actual text bubble */}
                    <div className="message-bubble">{msg.text}</div>

                    {/* time */}
                    <div className="message-time">
                      {new Date(msg.time).toLocaleTimeString([], {
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </div>
                  </div>
                );
              })}

              {(activeMotion.messages || []).length === 0 && (
                <p className="empty-thread">No discussion yet.</p>
              )}
            </div>

            <form className="discussion-composer" onSubmit={handleSend}>
              {/* choose stance after sending message */}
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={`Write a comment for ${activeMotion.title}…`}
              />
              <button type="submit" className="send-btn" aria-label="Send">
                ➤
              </button>
            </form>
          </>
        ) : (
          <div className="no-motion-selected">
            <h2>Select a motion to view its discussion</h2>
          </div>
        )}
      </main>

      {/* RIGHT: chair controls, vote, decision log */}
      <aside className="discussion-right">
        <section className="panel">
          <h3>Chair Controls</h3>
          <p className="sub">Toggle meeting mode and move the motion along.</p>
          <div className="panel-actions">
            <button onClick={() => changeMotionState("discussion")}>
              Resume Discussion
            </button>
            <button onClick={() => changeMotionState("paused")}>
              Pause Discussion
            </button>
            <button onClick={() => changeMotionState("voting")}>
              Move to Vote
            </button>
            <button onClick={() => changeMotionState("closed")}>
              Close Motion
            </button>
          </div>
        </section>

        <section className="panel">
          <h3>Vote on Motion</h3>
          <div className="vote-grid">
            <button>Yes</button>
            <button>No</button>
            <button>Abstain</button>
          </div>
        </section>

        <section className="panel">
          <h3>Decision Log</h3>
          <p className="sub">short record of outcome & rationale.</p>
          <ul className="log-list">
            <li>No decisions recorded yet.</li>
          </ul>
        </section>
      </aside>
    </div>
  );
}
