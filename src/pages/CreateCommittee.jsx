// src/pages/CreateCommittee.jsx
import React, { useMemo, useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import "../assets/styles/index.css";
import { ROLE } from "../utils/permissions";

/* ---------- storage helpers ---------- */
function loadCommittees() {
  try {
    return JSON.parse(localStorage.getItem("committees") || "[]");
  } catch {
    return [];
  }
}
function saveCommittees(list) {
  localStorage.setItem("committees", JSON.stringify(list));
}
const uid = () =>
  globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2, 10);

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

// we will render a real circle when blank
const AVATAR_SIZE = 54;
const norm = (s) => (s ?? "").toString().trim().toLowerCase();

function resolveMemberRole(member, committee) {
  const mk = norm(member.username || member.id || member.name);
  if (norm(committee.ownerId || "") === mk || member.role === ROLE.OWNER)
    return ROLE.OWNER;
  return member.role || ROLE.MEMBER;
}

function whoAmI(committee, me) {
  if (!committee) return { role: ROLE.OBSERVER };
  const meKey = norm(me.username || me.name);
  if (norm(committee.ownerId || "") === meKey) return { role: ROLE.OWNER };
  const m = (committee.members || []).find(
    (x) => norm(x.username || x.id || x.name) === meKey
  );
  return m
    ? { role: resolveMemberRole(m, committee) }
    : { role: ROLE.OBSERVER };
}

export default function CreateCommittee() {
  const navigate = useNavigate();
  const currentUser = getCurrentUser();

  /* ---------- committees list ---------- */
  const [committees, setCommittees] = useState(() => loadCommittees());
  useEffect(() => {
    saveCommittees(committees);
  }, [committees]);

  const sortedCommittees = useMemo(
    () => [...committees].sort((a, b) => b.createdAt - a.createdAt),
    [committees]
  );

  /* ---------- form state ---------- */
  const [committeeName, setCommitteeName] = useState("");
  const [memberInput, setMemberInput] = useState("");
  const [memberRoleInput, setMemberRoleInput] = useState(ROLE.MEMBER);
  const [editingId, setEditingId] = useState(null);
  const isEditing = Boolean(editingId);

  // always start with self in stagedMembers
  const [stagedMembers, setStagedMembers] = useState(() => [
    {
      name: currentUser.name,
      username: currentUser.username,
      role: ROLE.OWNER,
      avatarUrl: currentUser.avatarUrl || "", // real user may have avatar
    },
  ]);
  const [stagedOwnerId, setStagedOwnerId] = useState(currentUser.username);

  const roleSelectRef = useRef(null);

  /* ---------- tiny helper to render avatar ---------- */
  const Avatar = ({ src, alt }) => {
    const hasImage = src && src.trim().length > 0;
    if (hasImage) {
      return (
        <img
          src={src}
          alt={alt}
          className="member-avatar"
          style={{
            width: AVATAR_SIZE,
            height: AVATAR_SIZE,
            borderRadius: "9999px",
            objectFit: "cover",
            border: "1px solid #d1d5db",
            background: "#e5e7eb",
            flexShrink: 0,
          }}
        />
      );
    }
    // blank circle
    return (
      <div
        className="member-avatar"
        style={{
          width: AVATAR_SIZE,
          height: AVATAR_SIZE,
          borderRadius: "9999px",
          background: "#e5e7eb",
          border: "1px solid #d1d5db",
          flexShrink: 0,
        }}
      />
    );
  };

  /* ---------- helpers ---------- */
  const clearForm = () => {
    setCommitteeName("");
    setMemberInput("");
    setMemberRoleInput(ROLE.MEMBER);
    setStagedMembers([
      {
        name: currentUser.name,
        username: currentUser.username,
        role: ROLE.OWNER,
        avatarUrl: currentUser.avatarUrl || "",
      },
    ]);
    setStagedOwnerId(currentUser.username);
    setEditingId(null);
  };

  const gotoChat = (id) => navigate(`/committees/${id}/chat`);

  /* ---------- staged members ops ---------- */
  const addMember = () => {
    const raw = memberInput.trim();
    if (!raw) return;

    // username slug
    const slug =
      raw
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, "")
        .slice(0, 24) || "member" + Math.random().toString(36).slice(2, 6);

    const exists =
      stagedMembers.some((m) => norm(m.username) === norm(slug)) ||
      norm(slug) === norm(stagedOwnerId);

    if (exists) {
      setMemberInput("");
      return;
    }

    const chosenRole = memberRoleInput;

    // if adding a new OWNER, transfer ownership
    if (chosenRole === ROLE.OWNER) {
      const ok = window.confirm(
        `Make ${raw} the new owner? This will demote the current owner to Member.`
      );
      if (!ok) return;

      const demoted = stagedMembers.map((m) =>
        norm(m.username) === norm(stagedOwnerId)
          ? { ...m, role: ROLE.MEMBER }
          : m
      );
      setStagedMembers([
        ...demoted,
        {
          name: raw,
          username: slug,
          role: ROLE.OWNER,
          avatarUrl: "", // new user, no picture
        },
      ]);
      setStagedOwnerId(slug);
      setMemberInput("");
      setMemberRoleInput(ROLE.MEMBER);
      return;
    }

    // normal add
    setStagedMembers((prev) => [
      ...prev,
      {
        name: raw,
        username: slug,
        role: chosenRole,
        avatarUrl: "", // no picture, show blank circle
      },
    ]);
    setMemberInput("");
    setMemberRoleInput(ROLE.MEMBER);
  };

  const removeStaged = (username) => {
    if (norm(username) === norm(stagedOwnerId)) {
      alert("Transfer ownership before removing the current owner.");
      return;
    }
    setStagedMembers((prev) => prev.filter((m) => m.username !== username));
  };

  /* ---------- normalize + create/save/delete ---------- */
  const normalizeForSave = (name) => {
    const base = stagedMembers || [];

    const hasOwnerRow = base.some(
      (m) => norm(m.username) === norm(stagedOwnerId)
    );
    const members = hasOwnerRow
      ? base
      : [
          {
            name: stagedOwnerId,
            username: stagedOwnerId,
            role: ROLE.OWNER,
            avatarUrl: currentUser.avatarUrl || "",
          },
          ...base,
        ];

    return {
      id: isEditing ? editingId : uid(),
      name,
      ownerId: stagedOwnerId,
      createdAt: isEditing
        ? committees.find((c) => c.id === editingId)?.createdAt || Date.now()
        : Date.now(),
      members,
      settings: {},
    };
  };

  const handleCreate = () => {
    const name = committeeName.trim();
    if (!name) return;

    const payload = normalizeForSave(name);
    const next = [payload, ...committees];
    saveCommittees(next);
    setCommittees(next);
    clearForm();
    navigate(`/committees/${payload.id}/chat`);
  };

  const handleSave = () => {
    if (!isEditing) return;
    const name = committeeName.trim();
    if (!name) return;

    const existing = committees.find((c) => c.id === editingId);
    if (!existing) return;

    const { role } = whoAmI(existing, currentUser);
    if (!(role === ROLE.OWNER || role === ROLE.CHAIR)) {
      alert("Only the Owner or Chair can edit this committee.");
      return;
    }

    const updated = normalizeForSave(name);
    const next = committees.map((c) => (c.id === editingId ? updated : c));
    saveCommittees(next);
    setCommittees(next);
    clearForm();
  };

  const handleDelete = () => {
    if (!isEditing) return;
    const existing = committees.find((c) => c.id === editingId);
    if (!existing) return;

    const { role } = whoAmI(existing, currentUser);
    if (!(role === ROLE.OWNER || role === ROLE.CHAIR)) {
      alert("Only the Owner or Chair can delete this committee.");
      return;
    }

    const ok = window.confirm(
      `Delete committee "${existing.name}"? This cannot be undone.`
    );
    if (!ok) return;

    const next = committees.filter((c) => c.id !== editingId);
    saveCommittees(next);
    setCommittees(next);
    clearForm();
  };

  const loadCommitteeIntoForm = (committee) => {
    setEditingId(committee.id);
    setCommitteeName(committee.name || "");
    setStagedOwnerId(committee.ownerId || "");

    const cloned = (committee.members || []).map((m) => ({
      name: m.name,
      username: m.username || m.id || m.name,
      role: resolveMemberRole(m, committee),
      // if stored committee has an avatar, keep it. otherwise blank
      avatarUrl: m.avatarUrl || "",
    }));

    const map = new Map();
    cloned.forEach((m) => map.set(norm(m.username), m));
    setStagedMembers([...map.values()]);
    setMemberRoleInput(ROLE.MEMBER);
  };

  /* ---------- group by role for display ---------- */
  const owners = stagedMembers.filter(
    (m) => norm(m.username) === norm(stagedOwnerId)
  );
  const chairs = stagedMembers.filter(
    (m) => m.role === ROLE.CHAIR && norm(m.username) !== norm(stagedOwnerId)
  );
  const members = stagedMembers.filter(
    (m) => m.role === ROLE.MEMBER && norm(m.username) !== norm(stagedOwnerId)
  );
  const observers = stagedMembers.filter(
    (m) => m.role === ROLE.OBSERVER && norm(m.username) !== norm(stagedOwnerId)
  );

  return (
    <div className="create-committee-page two-pane">
      <aside className="side-panel pane">
        <div className="card">
          <div className="side-header">
            <h2>Your Committees</h2>
          </div>

          <div className="side-list">
            {sortedCommittees.length === 0 ? (
              <div className="empty-hint">No committees yet</div>
            ) : (
              sortedCommittees.map((c) => (
                <div
                  key={c.id}
                  className="committee-tile committee-tile-row"
                  onClick={() => gotoChat(c.id)}
                  title={`Open ${c.name}`}
                >
                  <div className="tile-body">
                    <div className="tile-title">{c.name}</div>
                    <div className="tile-sub">
                      {c.members?.length || 0} member
                      {(c.members?.length || 0) === 1 ? "" : "s"}
                    </div>
                  </div>
                  <button
                    className="edit-btn"
                    aria-label="Edit committee"
                    title="Edit committee"
                    onClick={(e) => {
                      e.stopPropagation();
                      loadCommitteeIntoForm(c);
                    }}
                  >
                    ✎
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </aside>

      {/* Create / Edit panel */}
      <div className="main-content pane">
        <div className="card">
          <div className="name-committee section">
            <h1>{isEditing ? "Edit Committee" : "Create a Committee"}</h1>
            <input
              className="committee-name-input"
              type="text"
              value={committeeName}
              onChange={(e) => setCommitteeName(e.target.value)}
              placeholder="Name your committee"
            />
          </div>

          <div className="committee-members section">
            <h2>Members & Roles</h2>

            {/* role selector -> input -> add */}
            <div className="row">
              <div
                className="role-select-wrap"
                style={{ minWidth: "140px" }}
                onClick={() => {
                  const el = roleSelectRef.current;
                  if (!el) return;
                  if (typeof el.showPicker === "function") {
                    el.showPicker();
                  } else {
                    el.focus();
                    el.click();
                  }
                }}
              >
                <select
                  ref={roleSelectRef}
                  className="pill role-select"
                  value={memberRoleInput}
                  onChange={(e) => setMemberRoleInput(e.target.value)}
                >
                  <option value={ROLE.OWNER}>Owner</option>
                  <option value={ROLE.CHAIR}>Chair</option>
                  <option value={ROLE.MEMBER}>Member</option>
                  <option value={ROLE.OBSERVER}>Observer</option>
                </select>
              </div>

              <input
                className="member-search-input"
                type="text"
                value={memberInput}
                onChange={(e) => setMemberInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addMember();
                  }
                }}
                placeholder="Enter username"
              />

              <button className="submit-button" onClick={addMember}>
                Add
              </button>
            </div>

            {/* grouped list */}
            <ul className="member-list" style={{ marginTop: "16px" }}>
              {/* OWNER */}
              {owners.length > 0 && (
                <li className="role-section">
                  <div className="role-header">
                    <span>Owner</span>
                  </div>
                  <div className="role-members">
                    {owners.map((m) => (
                      <div className="member-item" key={m.username}>
                        <div className="member-left">
                          <Avatar src={m.avatarUrl} alt={m.name} />
                          <div className="member-meta">
                            <p className="member-name">{m.name}</p>
                            <p className="member-username">({m.username})</p>
                          </div>
                        </div>
                        {/* owner can't be removed */}
                      </div>
                    ))}
                  </div>
                </li>
              )}

              {/* CHAIR */}
              {chairs.length > 0 && (
                <li className="role-section">
                  <div className="role-header">
                    <span>Chair</span>
                  </div>
                  <div className="role-members">
                    {chairs.map((m) => (
                      <div className="member-item" key={m.username}>
                        <div className="member-left">
                          <Avatar src={m.avatarUrl} alt={m.name} />
                          <div className="member-meta">
                            <p className="member-name">{m.name}</p>
                            <p className="member-username">({m.username})</p>
                          </div>
                        </div>
                        <button
                          className="pill remove"
                          onClick={() => removeStaged(m.username)}
                          title="Remove member"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                </li>
              )}

              {/* MEMBER */}
              {members.length > 0 && (
                <li className="role-section">
                  <div className="role-header">
                    <span>Member</span>
                    {members.length > 0 && (
                      <span className="role-count">{members.length}</span>
                    )}
                  </div>
                  <div className="role-members">
                    {members.map((m) => (
                      <div className="member-item" key={m.username}>
                        <div className="member-left">
                          <Avatar src={m.avatarUrl} alt={m.name} />
                          <div className="member-meta">
                            <p className="member-name">{m.name}</p>
                            <p className="member-username">({m.username})</p>
                          </div>
                        </div>
                        <button
                          className="pill danger"
                          onClick={() => removeStaged(m.username)}
                          title="Remove member"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                </li>
              )}

              {/* OBSERVER */}
              {observers.length > 0 && (
                <li className="role-section">
                  <div className="role-header">
                    <span>Observer</span>
                    {observers.length > 0 && (
                      <span className="role-count">{observers.length}</span>
                    )}
                  </div>
                  <div className="role-members">
                    {observers.map((m) => (
                      <div className="member-item" key={m.username}>
                        <div className="member-left">
                          <Avatar src={m.avatarUrl} alt={m.name} />
                          <div className="member-meta">
                            <p className="member-name">{m.name}</p>
                            <p className="member-username">({m.username})</p>
                          </div>
                        </div>
                        <button
                          className="pill danger"
                          onClick={() => removeStaged(m.username)}
                          title="Remove member"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                </li>
              )}

              {owners.length === 0 &&
                chairs.length === 0 &&
                members.length === 0 &&
                observers.length === 0 && (
                  <li className="empty-hint">
                    No members yet — add someone above
                  </li>
                )}
            </ul>
          </div>

          <div className="section" style={{ display: "flex", gap: 8 }}>
            {isEditing ? (
              <>
                <button className="submit-button" onClick={handleSave}>
                  Save Changes
                </button>
                <button
                  className="submit-button"
                  onClick={clearForm}
                  style={{ background: "#6c757d" }}
                  title="Cancel editing"
                >
                  Cancel
                </button>
                <button
                  className="submit-button"
                  onClick={handleDelete}
                  style={{ background: "#dc2626" }}
                  title="Delete committee"
                >
                  Delete
                </button>
              </>
            ) : (
              <button className="submit-button" onClick={handleCreate}>
                Create Committee
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
