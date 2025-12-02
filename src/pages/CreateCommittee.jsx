// src/pages/CreateCommittee.jsx
import React, { useMemo, useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import "../assets/styles/index.css";
import { ROLE } from "../utils/permissions";
import {
  getCommittees as apiGetCommittees,
  createCommittee as apiCreateCommittee,
  deleteCommittee as apiDeleteCommittee,
  updateCommittee as apiUpdateCommittee,
} from "../api/committee";
import { joinCommittee } from "../api/profileMemberships";

/* ---------- id helper (client-side only for new until server returns) ---------- */
const uid = () =>
  globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2, 10);

/* ---------- current user ---------- */
function getCurrentUser() {
  try {
    const activeEmail = localStorage.getItem("activeProfileEmail") || "";
    const key = activeEmail ? `profileData:${activeEmail}` : "profileData";
    const p = JSON.parse(localStorage.getItem(key) || "{}");
    const username = (p.username || p.name || "you").toString().trim();
    const name = (p.name || p.username || "You").toString().trim();
    return { id: username, username, name, avatarUrl: p.avatarUrl || "" };
  } catch {
    return { id: "you", username: "you", name: "You", avatarUrl: "" };
  }
}

const AVATAR_SIZE = 40;
const norm = (s) => (s ?? "").toString().trim().toLowerCase();

function resolveMemberRole(member, committee) {
  const mk = norm(member.username || member.id || member.name);
  if (norm(committee.ownerId || "") === mk || member.role === ROLE.OWNER)
    return ROLE.OWNER;
  return member.role || ROLE.MEMBER;
}

function whoAmI(committee, me) {
  // Requirement: self user should always be recognized as the owner
  // Grant OWNER role regardless of stored committee data.
  return { role: ROLE.OWNER };
}

export default function CreateCommittee() {
  const navigate = useNavigate();
  const currentUser = getCurrentUser();
  const authToken = (() => {
    try {
      return localStorage.getItem("authToken") || null;
    } catch {
      return null;
    }
  })();

  /* ---------- committees list (remote only) ---------- */
  const [committees, setCommittees] = useState([]);
  const [loadingCommittees, setLoadingCommittees] = useState(false);
  const [errorCommittees, setErrorCommittees] = useState("");

  // Initial fetch
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingCommittees(true);
      setErrorCommittees("");
      try {
        const remote = await apiGetCommittees();
        if (!cancelled) setCommittees(Array.isArray(remote) ? remote : []);
      } catch (err) {
        if (!cancelled)
          setErrorCommittees(err.message || "Failed to load committees");
      } finally {
        if (!cancelled) setLoadingCommittees(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const myCommittees = useMemo(() => {
    const me = norm(currentUser.username);
    return (committees || []).filter((c) =>
      (c?.members || []).some((m) => norm(m?.username) === me)
    );
  }, [committees, currentUser.username]);

  const sortedCommittees = useMemo(() => {
    const toTs = (v) => {
      if (!v && v !== 0) return 0;
      const n = typeof v === "number" ? v : Date.parse(String(v));
      return Number.isFinite(n) ? n : 0;
    };
    return [...myCommittees].sort(
      (a, b) => toTs(b.createdAt) - toTs(a.createdAt)
    );
  }, [myCommittees]);

  /* ---------- show/hide form ---------- */
  const [showForm, setShowForm] = useState(false);

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
      avatarUrl: currentUser.avatarUrl || "",
    },
  ]);
  const [stagedOwnerId, setStagedOwnerId] = useState(currentUser.username);

  const roleSelectRef = useRef(null);
  const membersScrollRef = useRef(null);
  const [lastAddedId, setLastAddedId] = useState(null);

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

  /* ---------- handy reset for a brand-new committee ---------- */
  const resetToBlankCommittee = () => {
    setEditingId(null);
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
    setLastAddedId(null);
  };

  /* ---------- helpers ---------- */
  const clearForm = () => {
    resetToBlankCommittee();
    setShowForm(false);
  };

  const gotoChat = (id) => navigate(`/committees/${id}/chat`);

  /* ---------- staged members ops ---------- */
  const addMember = () => {
    const raw = memberInput.trim();
    if (!raw) return;

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

    // handle new owner
    if (chosenRole === ROLE.OWNER) {
      // Automatically transfer ownership; no confirmation prompt.
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
          avatarUrl: "",
        },
      ]);
      setStagedOwnerId(slug);
      setMemberInput("");
      setMemberRoleInput(ROLE.MEMBER);
      setLastAddedId(slug);
      return;
    }

    if (chosenRole === ROLE.CHAIR) {
      // Enforce single chair: demote any existing chairs before adding new one.
      const demoted = stagedMembers.map((m) =>
        m.role === ROLE.CHAIR && norm(m.username) !== norm(stagedOwnerId)
          ? { ...m, role: ROLE.MEMBER }
          : m
      );
      setStagedMembers([
        ...demoted,
        {
          name: raw,
          username: slug,
          role: ROLE.CHAIR,
          avatarUrl: "",
        },
      ]);
      setMemberInput("");
      setMemberRoleInput(ROLE.MEMBER);
      setLastAddedId(slug);
      return;
    }

    // normal add
    setStagedMembers((prev) => [
      ...prev,
      {
        name: raw,
        username: slug,
        role: chosenRole,
        avatarUrl: "",
      },
    ]);
    setMemberInput("");
    setMemberRoleInput(ROLE.MEMBER);
    setLastAddedId(slug);
  };

  const removeStaged = (username) => {
    if (norm(username) === norm(stagedOwnerId)) {
      alert("Transfer ownership before removing the current owner.");
      return;
    }
    setStagedMembers((prev) => prev.filter((m) => m.username !== username));
  };

  /* ---------- scroll to newly added member ---------- */
  useEffect(() => {
    if (!lastAddedId) return;
    const container = membersScrollRef.current;
    if (!container) return;
    const el = container.querySelector(`#member-${lastAddedId}`);
    if (el) {
      container.scrollTo({
        top: el.offsetTop - 14,
        behavior: "smooth",
      });
    }
  }, [lastAddedId]);

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

  const refreshCommittees = async () => {
    try {
      const remote = await apiGetCommittees();
      setCommittees(Array.isArray(remote) ? remote : []);
    } catch {}
  };

  const handleCreate = async () => {
    const name = committeeName.trim();
    if (!name) return;
    const local = normalizeForSave(name);
    try {
      const created = await apiCreateCommittee({
        id: local.id,
        name: local.name,
        ownerId: local.ownerId,
        members: local.members.map((m) => ({
          username: m.username,
          name: m.name,
          role: m.role === ROLE.OWNER ? "owner" : m.role.toLowerCase(),
          avatarUrl: m.avatarUrl,
        })),
        settings: local.settings,
      });
      // Ensure the creator (self) has a server-side membership set to owner
      try {
        await joinCommittee(created.id, "owner", authToken || undefined);
      } catch (e) {
        console.warn("Failed to set owner membership", e);
      }
      setCommittees((prev) => {
        const exists = prev.some((c) => c.id === created.id);
        const next = exists
          ? prev.map((c) => (c.id === created.id ? created : c))
          : [created, ...prev];
        return next;
      });
      clearForm();
      navigate(`/committees/${created.id}/chat`);
    } catch (err) {
      alert("Failed to create committee");
    }
  };

  const handleSave = async () => {
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

    const updatedLocal = normalizeForSave(name);
    try {
      const updatedRemote = await apiUpdateCommittee(editingId, {
        name: updatedLocal.name,
        ownerId: updatedLocal.ownerId,
        members: updatedLocal.members.map((m) => ({
          username: m.username,
          name: m.name,
          role: m.role === ROLE.OWNER ? "owner" : m.role.toLowerCase(),
          avatarUrl: m.avatarUrl,
        })),
        settings: updatedLocal.settings,
      });
      setCommittees((prev) =>
        prev.map((c) => (c.id === editingId ? updatedRemote : c))
      );
      clearForm();
    } catch (err) {
      alert("Failed to save committee");
    }
  };

  const handleDelete = async () => {
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

    try {
      await apiDeleteCommittee(existing.id);
      setCommittees((prev) => prev.filter((c) => c.id !== existing.id));
      clearForm();
    } catch (err) {
      alert("Failed to delete committee");
    }
  };

  const loadCommitteeIntoForm = (committee) => {
    setShowForm(true);
    setEditingId(committee.id);
    setCommitteeName(committee.name || "");
    setStagedOwnerId(committee.ownerId || "");

    const cloned = (committee.members || []).map((m) => ({
      name: m.name,
      username: m.username || m.id || m.name,
      role: resolveMemberRole(m, committee),
      avatarUrl: m.avatarUrl || "",
    }));

    // Enforce single chair when loading: keep first chair, demote others to MEMBER.
    let chairSeen = false;
    const normalized = cloned.map((m) => {
      if (m.role === ROLE.CHAIR && norm(m.username) !== norm(stagedOwnerId)) {
        if (!chairSeen) {
          chairSeen = true;
          return m; // keep first chair
        }
        return { ...m, role: ROLE.MEMBER }; // demote extra chairs
      }
      return m;
    });

    const map = new Map();
    normalized.forEach((m) => map.set(norm(m.username), m));
    setStagedMembers([...map.values()]);
    setMemberRoleInput(ROLE.MEMBER);
    setLastAddedId(null);
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
    <div
      className={`create-committee-page two-pane ${
        showForm ? "show-form" : "hide-form"
      }`}
    >
      {/* LEFT: Your Committees */}
      <aside className="side-panel pane">
        <div className="card">
          <div className="side-header">
            <h2>Your Committees</h2>
            <button
              className="add-committee-btn"
              onClick={() => {
                setShowForm((prev) => {
                  // if we are closing it, just close
                  if (prev) {
                    return false;
                  }
                  // opening -> blank form
                  resetToBlankCommittee();
                  return true;
                });
              }}
              title={showForm ? "Close form" : "Create a committee"}
            >
              {showForm ? "×" : "+"}
            </button>
          </div>

          <div className="side-list">
            {loadingCommittees && <div className="empty-hint">Loading...</div>}
            {errorCommittees && !loadingCommittees && (
              <div className="empty-hint">{errorCommittees}</div>
            )}
            {!loadingCommittees &&
              !errorCommittees &&
              sortedCommittees.length === 0 && (
                <div className="empty-hint">No committees yet</div>
              )}
            {!loadingCommittees &&
              !errorCommittees &&
              sortedCommittees.length > 0 &&
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
              ))}
          </div>
        </div>
      </aside>

      {/* RIGHT: Create / Edit panel OR welcome message */}
      {showForm ? (
        <div
          className={`main-content pane ${showForm ? "is-open" : "is-closed"}`}
        >
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

              {/* fixed add controls */}
              <div className="member-add-row">
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

              {/* scrollable members list */}
              <div className="members-scroll" ref={membersScrollRef}>
                <ul className="member-list">
                  {/* OWNER */}
                  {owners.length > 0 && (
                    <li className="role-section">
                      <div className="role-header">
                        <span>Owner</span>
                      </div>
                      <div className="role-members">
                        {owners.map((m) => (
                          <div
                            className="member-item"
                            key={m.username}
                            id={`member-${m.username}`}
                          >
                            <div className="member-left">
                              <Avatar src={m.avatarUrl} alt={m.name} />
                              <div className="member-meta">
                                <p className="member-name">{m.name}</p>
                                <p className="member-username">
                                  ({m.username})
                                </p>
                              </div>
                            </div>
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
                          <div
                            className="member-item"
                            key={m.username}
                            id={`member-${m.username}`}
                          >
                            <div className="member-left">
                              <Avatar src={m.avatarUrl} alt={m.name} />
                              <div className="member-meta">
                                <p className="member-name">{m.name}</p>
                                <p className="member-username">
                                  ({m.username})
                                </p>
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
                        <span className="role-count">{members.length}</span>
                      </div>
                      <div className="role-members">
                        {members.map((m) => (
                          <div
                            className="member-item"
                            key={m.username}
                            id={`member-${m.username}`}
                          >
                            <div className="member-left">
                              <Avatar src={m.avatarUrl} alt={m.name} />
                              <div className="member-meta">
                                <p className="member-name">{m.name}</p>
                                <p className="member-username">
                                  ({m.username})
                                </p>
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
                        <span className="role-count">{observers.length}</span>
                      </div>
                      <div className="role-members">
                        {observers.map((m) => (
                          <div
                            className="member-item"
                            key={m.username}
                            id={`member-${m.username}`}
                          >
                            <div className="member-left">
                              <Avatar src={m.avatarUrl} alt={m.name} />
                              <div className="member-meta">
                                <p className="member-name">{m.name}</p>
                                <p className="member-username">
                                  ({m.username})
                                </p>
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
      ) : (
        <div className="empty-panel-message">
          <h1>Welcome to e-motions Committees</h1>
          <p>
            Here you can organize your groups, assign roles, and manage
            discussions for each committee. To get started, click the{" "}
            <strong>+</strong> button to create your committee.
          </p>
          <p>
            Once you create a committee, you'll be able to chat, make motions,
            and collaborate with your members in one place.
          </p>
        </div>
      )}
    </div>
  );
}
