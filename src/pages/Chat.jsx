// src/pages/Chat.jsx
import React, { useState, useRef, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import "../assets/styles/index.css";
import { Chatbox } from "../components/Chatbox";
import { ROLE, Can } from "../utils/permissions";

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
    const name = (p.name || "You").toString().trim();
    return { id: name, name };
  } catch {
    return { id: "you", name: "You" };
  }
}

const norm = (s) => (s ?? "").toString().trim().toLowerCase();

function whoAmI(committee, me) {
  if (!committee) return { role: ROLE.OBSERVER };
  const meName = norm(me.name);

  const match = (committee.members || []).find((m) => norm(m.name) === meName);
  if (match?.role) return { role: match.role, member: match };

  const ownerId = norm(committee.ownerId);
  if (ownerId && ownerId === meName) return { role: ROLE.OWNER };

  const ownerMember = (committee.members || []).find(
    (m) => m.role === ROLE.OWNER && norm(m.name) === meName
  );
  if (ownerMember) return { role: ROLE.OWNER, member: ownerMember };

  return { role: ROLE.MEMBER };
}

const keyOf = (m) => (m.id || m.name || "").toString();

function resolveMemberRole(member, committee) {
  const k = norm(member.name);
  const isOwner =
    (committee.ownerId || "").toLowerCase() === k || member.role === ROLE.OWNER;
  if (isOwner) return ROLE.OWNER;
  return member.role || ROLE.MEMBER;
}

function groupMembersByRole(committee) {
  const groups = {
    [ROLE.OWNER]: [],
    [ROLE.CHAIR]: [],
    [ROLE.MEMBER]: [],
    [ROLE.OBSERVER]: [],
  };
  (committee.members || []).forEach((m) => {
    const r = resolveMemberRole(m, committee);
    groups[r].push({ ...m, _resolvedRole: r });
  });
  return groups;
}

/* ---------- component ---------- */
export default function Chat() {
  const { id } = useParams();
  const me = getCurrentUser();

  const [committee, setCommittee] = useState(() => findCommitteeById(id));
  useEffect(() => {
    setCommittee(findCommitteeById(id));
  }, [id]);

  if (!committee) {
    return (
      <div className="page">
        <h2>Committee not found</h2>
        <Link to="/create-committee" className="link">
          ← Back
        </Link>
      </div>
    );
  }

  const { role: myRole } = whoAmI(committee, me);
  const isPrivileged = myRole === ROLE.CHAIR || myRole === ROLE.OWNER;

  /* ---------- motions & discussion ---------- */
  const [motions, setMotions] = useState(() => {
    const existing = loadMotionsForCommittee(id);
    return existing.length
      ? existing
      : [
          { name: "Motion A", discussion: [] },
          { name: "Motion B", discussion: [] },
        ];
  });
  const [activeMotionIndex, setActiveMotionIndex] = useState(0);
  const [addingMotion, setAddingMotion] = useState(false);
  const [newMotion, setNewMotion] = useState("");
  const [input, setInput] = useState("");
  const [isDiscussing, setIsDiscussing] = useState(true);

  useEffect(() => {
    saveMotionsForCommittee(id, motions);
  }, [id, motions]);

  const handleAddMotion = () => {
    if (!Can.createMotion(myRole)) return;
    const trimmed = newMotion.trim();
    if (!trimmed) return;
    setMotions((prev) => [...prev, { name: trimmed, discussion: [] }]);
    setNewMotion("");
    setAddingMotion(false);
    setActiveMotionIndex(motions.length);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!Can.comment(myRole)) return;
    const text = input.trim();
    if (!text) return;
    const newComment = {
      id: Date.now(),
      author: me.name || "You",
      text,
      createdAt: new Date().toISOString(),
    };
    setMotions((prev) =>
      prev.map((m, i) =>
        i === activeMotionIndex
          ? { ...m, discussion: [...m.discussion, newComment] }
          : m
      )
    );
    setInput("");
  };

  const threadEndRef = useRef(null);
  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [motions[activeMotionIndex]?.discussion.length]);

  const handleToggleDiscussion = () => {
    if (!Can.startDiscussion(myRole)) return;
    setIsDiscussing((s) => !s);
  };
  const handleMoveToVote = () => {
    if (!Can.moveToVote(myRole)) return;
    alert("Moved to vote (stub) — show your voting UI here.");
  };

  /* ---------- read-only participants rendering ---------- */
  const RoleBlock = ({ title, list, showCount }) => {
    if (!list.length) return null;
    return (
      <div className="role-section" style={{ marginTop: 12 }}>
        <div className="role-header">
          <strong>{title}</strong>
          {showCount && <span className="count">{list.length}</span>}
        </div>

        {/* Members listed below as separate boxes */}
        <div className="role-members">
          {list.map((m) => (
            <div className="member" key={keyOf(m)}>
              <img src="#" alt="" className="avatar" />
              <span style={{ flex: 1 }}>{m.name}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="app-layout">
      {/* LEFT: Motions + People */}
      <div className="left-main">
        <div className="motions-header">
          <h3 className="motions">{committee.name} — MOTIONS</h3>

          {isPrivileged && (
            <button
              className="add-motion-btn"
              aria-label="Add motion"
              onClick={() => setAddingMotion(true)}
              title="Add motion"
            >
              +
            </button>
          )}
        </div>

        <nav className="motion-list">
          <ul>
            {motions.map((m, idx) => (
              <li key={`${m.name}-${idx}`}>
                <a
                  href="#"
                  className={idx === activeMotionIndex ? "active" : ""}
                  onClick={(e) => {
                    e.preventDefault();
                    setActiveMotionIndex(idx);
                  }}
                >
                  {m.name}
                </a>
              </li>
            ))}
            {isPrivileged && addingMotion && (
              <li>
                <input
                  type="text"
                  className="new-motion-input"
                  placeholder="Enter motion name..."
                  value={newMotion}
                  onChange={(e) => setNewMotion(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleAddMotion();
                    if (e.key === "Escape") setAddingMotion(false);
                  }}
                  autoFocus
                />
              </li>
            )}
          </ul>
        </nav>

        <div className="sidebar-divider" role="separator" />

        {/* People (read-only). No "Participants" label per request. */}
        {(() => {
          const groups = groupMembersByRole(committee);
          return (
            <div className="sidebar-people">
              <RoleBlock
                title="Owner"
                list={groups[ROLE.OWNER]}
                showCount={false}
              />
              <RoleBlock
                title="Chair"
                list={groups[ROLE.CHAIR]}
                showCount={false}
              />
              <RoleBlock
                title="Member"
                list={groups[ROLE.MEMBER]}
                showCount={true}
              />
              <RoleBlock
                title="Observer"
                list={groups[ROLE.OBSERVER]}
                showCount={true}
              />
            </div>
          );
        })()}

        <div style={{ marginTop: 12 }}>
          <Link to="/create-committee" className="link">
            ← Back to Your Committees
          </Link>
        </div>
      </div>

      {/* CENTER: Discussion */}
      <div className="center-main">
        <div
          className="card"
          style={{ display: "flex", gap: 8, alignItems: "center" }}
        >
          <strong style={{ color: "#2358bb" }}>Chair Controls</strong>
          <button
            className="submit-button"
            onClick={handleToggleDiscussion}
            disabled={!Can.startDiscussion(myRole)}
            title={
              Can.startDiscussion(myRole)
                ? "Start/Pause discussion"
                : "Only Chair or Owner can toggle discussion"
            }
          >
            {isDiscussing ? "Pause Discussion" : "Resume Discussion"}
          </button>
          <button
            className="submit-button"
            onClick={handleMoveToVote}
            disabled={!Can.moveToVote(myRole)}
            title={
              Can.moveToVote(myRole)
                ? "Move to vote"
                : "Only Chair or Owner can move to vote"
            }
          >
            Move to Vote
          </button>
        </div>

        <div className="discussion-thread" aria-busy={!isDiscussing}>
          {motions[activeMotionIndex]?.discussion.map((c) => (
            <Chatbox
              key={c.id}
              message={c.text}
              author={c.author}
              timestamp={c.createdAt}
              isOwn={c.author === me.name || c.author === "You"}
            />
          ))}
          <div ref={threadEndRef} />
        </div>

        {/* Composer at bottom */}
        <section className="composer">
          <form className="comment-form" onSubmit={handleSubmit}>
            <input
              className="input"
              placeholder={
                Can.comment(myRole)
                  ? `Write a comment for ${
                      motions[activeMotionIndex]?.name || "this motion"
                    }…`
                  : "Observers cannot comment"
              }
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={!Can.comment(myRole)}
            />
            <button
              className="submit"
              type="submit"
              aria-label="Submit"
              disabled={!Can.comment(myRole)}
            >
              <i className="fa fa-arrow-up" aria-hidden="true"></i>
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
