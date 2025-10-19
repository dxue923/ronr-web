import React from "react";
import "../assets/styles/index.css";

export function Chatbox({
  message,
  author,
  timestamp,
  isOwn = false,
  avatarUrl,
}) {
  const ts = formatTimestamp(timestamp);
  return (
    <div className={`chatbox-container ${isOwn ? "own" : "other"}`}>
      {!isOwn && <Avatar name={author} avatarUrl={avatarUrl} />}

      <div className="chatbox-content">
        {author && <div className="chatbox-author">{author}</div>}
        <div className={`chatbox ${isOwn ? "own-box" : "other-box"}`}>
          <p>{message}</p>
        </div>
        {ts && <div className="chatbox-time">{ts}</div>}
      </div>

      {isOwn && <Avatar name={author} avatarUrl={avatarUrl} />}
    </div>
  );
}

// --- helpers ---
function Avatar({ name, avatarUrl }) {
  return (
    <div className="chat-avatar">
      {avatarUrl ? (
        <img src={avatarUrl} alt={name ? `${name}'s avatar` : "Avatar"} />
      ) : (
        <span>{initials(name)}</span>
      )}
    </div>
  );
}

function initials(name) {
  if (!name) return "";
  return name
    .split(/\s+/)
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function formatTimestamp(ts) {
  if (!ts) return "";
  try {
    const d = typeof ts === "string" ? new Date(ts) : ts;
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    return sameDay
      ? d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
      : d.toLocaleDateString();
  } catch {
    return "";
  }
}
