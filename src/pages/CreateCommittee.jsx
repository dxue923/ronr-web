// src/pages/CreateCommittee.jsx
import React, { useMemo, useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import "../assets/styles/index.css";
import { ROLE } from "../utils/permissions";
import {
  getCommittees,
  createCommittee,
  deleteCommittee,
} from "../api/committee";
import { setActiveCommittee } from "../api/activeCommittee";
import {
  createMember as apiCreateMember,
  deleteMember as apiDeleteMember,
  fetchMembers,
} from "../api/committeeMembers";
/* ---------- storage helpers (still used for members/roles) ---------- */
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

const AVATAR_SIZE = 40;
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
  // start from whatever is in localStorage (keeps existing behavior)
  const [committees, setCommittees] = useState(() => loadCommittees());

  // keep localStorage in sync with state
  useEffect(() => {
    saveCommittees(committees);
  }, [committees]);

  // one-time sync from API -> merge into local committees
  useEffect(() => {
    let cancelled = false;

    async function syncFromApi() {
      try {
        const remote = await getCommittees(); // [{id,name,createdAt}]
        const local = loadCommittees();

        const localById = new Map(local.map((c) => [c.id, c]));
        const remoteIds = new Set(remote.map((c) => c.id));
        const merged = remote.map((c) => {
          const existing = localById.get(c.id);

          let createdAtMs = existing?.createdAt;
          if (createdAtMs == null) {
            createdAtMs = Date.parse(c.createdAt) || Date.now();
          }

          if (existing) {
            // keep local members/owner/settings, but trust server for name/timestamp
            return {
              ...existing,
              name: c.name ?? existing.name,
              createdAt: createdAtMs,
            };
          }

          // committee exists on server but not locally -> create a basic local shell
          return {
            id: c.id,
            name: c.name || "Untitled committee",
            ownerId: currentUser.username,
            createdAt: createdAtMs,
            members: [
              {
                name: currentUser.name,
                username: currentUser.username,
                role: ROLE.OWNER,
                avatarUrl: currentUser.avatarUrl || "",
              },
            ],
            settings: {},
          };
        });

        // keep any purely local committees (e.g., created before API existed)
        local.forEach((c) => {
          if (!remoteIds.has(c.id)) merged.push(c);
        });

        if (!cancelled) {
          setCommittees(merged);
        }
      } catch (err) {
        console.error("Failed to load committees from API", err);
        // fall back silently to localStorage contents
      }
    }

    syncFromApi();
    return () => {
      cancelled = true;
    };
  }, []); // currentUser is effectively constant for this component

  const sortedCommittees = useMemo(
    () => [...committees].sort((a, b) => b.createdAt - a.createdAt),
    [committees]
  );

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
      memberId: null,
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
        memberId: null,
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

  const gotoChat = async (id) => {
    try {
      await setActiveCommittee(id);
    } catch (err) {
      console.error("Failed to set active committee", err);
    }
    navigate(`/committees/${id}/chat`);
  };

  /* ---------- staged members ops ---------- */
  const addMember = async () => {
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
      const ok = window.confirm(
        `Make ${raw} the new owner? This will demote the current owner to Member.`
      );
      if (!ok) return;

      const demoted = stagedMembers.map((m) =>
        norm(m.username) === norm(stagedOwnerId)
          ? { ...m, role: ROLE.MEMBER }
          : m
      );

      const newMember = {
        memberId: null,
        name: raw,
        username: slug,
        role: ROLE.OWNER,
        avatarUrl: "",
      };

      setStagedMembers([...demoted, newMember]);
      setStagedOwnerId(slug);
      setMemberInput("");
      setMemberRoleInput(ROLE.MEMBER);
      setLastAddedId(slug);

      // if editing an existing committee, mirror to API
      if (isEditing && editingId) {
        try {
          const created = await apiCreateMember({
            userId: slug,
            name: raw,
            role: ROLE.OWNER,
            committeeId: editingId,
          });
          setStagedMembers((prev) =>
            prev.map((m) =>
              m.username === slug ? { ...m, memberId: created.id } : m
            )
          );
        } catch (err) {
          console.error("Failed to create owner member", err);
        }
      }
      return;
    }

    // normal add
    const newMember = {
      memberId: null,
      name: raw,
      username: slug,
      role: chosenRole,
      avatarUrl: "",
    };

    setStagedMembers((prev) => [...prev, newMember]);
    setMemberInput("");
    setMemberRoleInput(ROLE.MEMBER);
    setLastAddedId(slug);

    // if editing an existing committee, mirror to API
    if (isEditing && editingId) {
      try {
        const created = await apiCreateMember({
          userId: slug,
          name: raw,
          role: chosenRole,
          committeeId: editingId,
        });
        setStagedMembers((prev) =>
          prev.map((m) =>
            m.username === slug ? { ...m, memberId: created.id } : m
          )
        );
      } catch (err) {
        console.error("Failed to create member", err);
      }
    }
  };

  const removeStaged = (username) => {
    if (norm(username) === norm(stagedOwnerId)) {
      alert("Transfer ownership before removing the current owner.");
      return;
    }

    const target = stagedMembers.find((m) => m.username === username);

    if (isEditing && target?.memberId) {
      apiCreateMember; // just to keep eslint from removing import if not used elsewhere
      apiDeleteMember(target.memberId).catch((err) => {
        console.error("Failed to delete committee member", err);
      });
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
  const normalizeForSave = (name, overrides = {}) => {
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
      id: overrides.id || (isEditing ? editingId : uid()),
      name,
      ownerId: stagedOwnerId,
      createdAt:
        overrides.createdAt ??
        (isEditing
          ? committees.find((c) => c.id === editingId)?.createdAt || Date.now()
          : Date.now()),
      members,
      settings: overrides.settings || {},
    };
  };

  // CREATE -> call API, then merge API data with local members/roles
  const handleCreate = async () => {
    const name = committeeName.trim();
    if (!name) return;

    try {
      // create committee on server
      const created = await createCommittee({ name });
      const createdAtMs = Date.parse(created.createdAt) || Date.now();

      const fullCommittee = normalizeForSave(created.name || name, {
        id: created.id,
        createdAt: createdAtMs,
      });

      const next = [fullCommittee, ...committees];
      setCommittees(next);

      // create all members on server (best effort; UI still works even if this fails)
      try {
        await Promise.all(
          (fullCommittee.members || []).map((m) =>
            apiCreateMember({
              userId: m.username,
              name: m.name,
              role: m.role,
              committeeId: fullCommittee.id,
            }).catch((err) => {
              console.error("Failed to create member", m.username, err);
            })
          )
        );
      } catch (err) {
        console.error("Failed to create some members", err);
      }

      // set active committee
      try {
        await setActiveCommittee(fullCommittee.id);
      } catch (err) {
        console.error("Failed to set active committee", err);
      }

      clearForm();
      navigate(`/committees/${fullCommittee.id}/chat`);
    } catch (err) {
      console.error(err);
      alert(err.message || "Failed to create committee.");
    }
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
    setCommittees(next);
    clearForm();
  };

  // DELETE -> call API, then update local state
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
      await deleteCommittee(editingId);
    } catch (err) {
      console.error(err);
      alert(
        err.message ||
          "Failed to delete committee on the server. It will be removed locally."
      );
    }

    const next = committees.filter((c) => c.id !== editingId);
    setCommittees(next);
    clearForm();
  };

  const loadCommitteeIntoForm = (committee) => {
    setShowForm(true);
    setEditingId(committee.id);
    setCommitteeName(committee.name || "");
    setStagedOwnerId(committee.ownerId || currentUser.username);

    const localMembers = (committee.members || []).map((m) => ({
      memberId: m.memberId || null,
      name: m.name,
      username: m.username || m.id || m.name,
      role: resolveMemberRole(m, committee),
      avatarUrl: m.avatarUrl || "",
    }));
    setStagedMembers(localMembers);
    setMemberRoleInput(ROLE.MEMBER);
    setLastAddedId(null);

    (async () => {
      try {
        const remote = await fetchMembers({ committeeId: committee.id });
        if (!Array.isArray(remote) || remote.length === 0) return;

        const mapped = remote.map((m) => ({
          memberId: m.id,
          name: m.name || m.userId,
          username: m.userId,
          role: m.role,
          avatarUrl: "",
        }));

        const ownerFromRemote = mapped.find((m) => m.role === ROLE.OWNER);
        if (ownerFromRemote) {
          setStagedOwnerId(ownerFromRemote.username);
        }

        setStagedMembers(mapped);
      } catch (err) {
        console.error(
          "Failed to fetch members for committee",
          committee.id,
          err
        );
      }
    })();
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
                  if (prev) return false; // closing
                  resetToBlankCommittee(); // opening -> blank form
                  return true;
                });
              }}
              title={showForm ? "Close form" : "Create a committee"}
            >
              {showForm ? "×" : "+"}
            </button>
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
