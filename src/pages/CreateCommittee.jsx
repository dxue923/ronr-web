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
import { fetchProfile, findProfileByUsername } from "../api/profile";

const AVATAR_SIZE = 40;
// Avatar component at top level for use in all subcomponents
function Avatar({ src, alt }) {
  const [imgError, setImgError] = React.useState(false);
  const hasImage =
    src && typeof src === "string" && src.trim().length > 0 && !imgError;
  if (hasImage) {
    return (
      <img
        src={src}
        alt={alt || "avatar"}
        className="member-avatar"
        style={{
          width: AVATAR_SIZE,
          height: AVATAR_SIZE,
          borderRadius: "9999px",
          objectFit: "cover",
          border: "1px solid #d1d5db", // default gray border
          background: "#e5e7eb",
          flexShrink: 0,
        }}
        onError={() => setImgError(true)}
        title={src}
      />
    );
  }
  // fallback: blank avatar
  return (
    <div
      className="member-avatar"
      style={{
        width: AVATAR_SIZE,
        height: AVATAR_SIZE,
        borderRadius: "9999px",
        background: "#e5e7eb",
        border: imgError ? "2px solid #f87171" : "1px solid #d1d5db", // red border if error
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#9ca3af",
        fontSize: 18,
      }}
      title={imgError ? "Avatar failed to load" : "No avatar"}
    >
      {imgError ? "!" : null}
    </div>
  );
}

function MemberProfileCard({ member, onRemove }) {
  if (!member) return null;

  return (
    <div className="member-item" id={`member-${member.username}`}>
      <div className="member-left">
        <Avatar src={member.avatarUrl} alt={member.name || member.username} />
        <div className="member-meta">
          <p className="member-name">{member.name || member.username}</p>
          <p className="member-username">({member.username})</p>
        </div>
      </div>
      {onRemove && (
        <button
          className="pill danger"
          onClick={() => onRemove(member.username)}
          title="Remove member"
        >
          ✕
        </button>
      )}
    </div>
  );
}

// Component to always show latest profile info for the owner
// Owner card: always display current user's profile info from state
function OwnerProfileCard({ user }) {
  if (!user) return null;
  return (
    <div className="member-item" id={`member-${user.username}`}>
      <div className="member-left">
        <Avatar src={user.avatarUrl} alt={user.name || user.username || ""} />
        <div className="member-meta">
          <p className="member-name">
            {user.name || user.username}
          </p>
          <p className="member-username">{user.username}</p>
        </div>
      </div>
    </div>
  );
}
import { useAuth0 } from "@auth0/auth0-react";

/* ---------- id helper (client-side only for new until server returns) ---------- */
const uid = () =>
  globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2, 10);

/* ---------- current user (backend/auth0-derived) ---------- */
function deriveUserFromEmail(email = "") {
  const local = (email || "").split("@")[0] || "";
  // Do not prefill name or avatar from email; keep blank until user sets
  return { id: local || "", username: local || "", name: "", avatarUrl: "" };
}

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

// Backend lookup: given idToken + username → profile or null
async function lookupProfileByUsername(idToken, username) {
  if (!username) return null;
  try {
    const fn = await findProfileByUsername(username); // returns a function
    if (typeof fn === "function") {
      const profile = await fn(idToken); // pass token so Netlify can auth
      return profile || null;
    }
    return fn || null;
  } catch {
    return null;
  }
}

export default function CreateCommittee() {
  // Username validation state
  const [memberInputError, setMemberInputError] = useState("");

  const navigate = useNavigate();
  const { user, getAccessTokenSilently, isAuthenticated, getIdTokenClaims } =
    useAuth0();

  const [currentUser, setCurrentUser] = useState({
    ...deriveUserFromEmail(user?.email || ""),
    email: user?.email || "",
  });

  const authToken = (() => {
    try {
      return localStorage.getItem("authToken") || null;
    } catch {
      return null;
    }
  })();

  // Bearer token for authenticated profile lookups (owner + members)
  const [idToken, setIdToken] = useState(null);

  /* ---------- load backend profile to prefer updated name/avatar ---------- */
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        if (!isAuthenticated) {
          setCurrentUser(deriveUserFromEmail(user?.email || ""));
          return;
        }

        const claims = await getIdTokenClaims().catch(() => null);
        const rawIdToken = claims?.__raw || null;
        setIdToken(rawIdToken);

        if (!rawIdToken) {
          setCurrentUser(deriveUserFromEmail(user?.email || ""));
          return;
        }

        const profile = await fetchProfile(rawIdToken);

        const emailLocal =
          (profile?.email || user?.email || "").split("@")[0] || "";

        const profileName = (profile?.name || "").toString().trim();
        const displayName = profileName || emailLocal;
        const profileUsername = (profile?.username || "").toString().trim();

        if (!cancelled) {
          setCurrentUser({
            id: emailLocal,
            // Always prefer the username returned by the Profile GET
            username: profileUsername || emailLocal,
            name: displayName,
            avatarUrl: profile?.avatarUrl || "",
            email: profile?.email || user?.email || "",
          });
        }
      } catch {
        if (!cancelled) {
          setCurrentUser(deriveUserFromEmail(user?.email || ""));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.email, isAuthenticated, getAccessTokenSilently]);

  /* ---------- committees list (remote only) ---------- */
  const [committees, setCommittees] = useState([]);
  const [loadingCommittees, setLoadingCommittees] = useState(false);
  const [errorCommittees, setErrorCommittees] = useState("");
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  // Seed with cached committees so we show content while fetching
  useEffect(() => {
    try {
      const cached = JSON.parse(localStorage.getItem("committees") || "[]");
      if (Array.isArray(cached) && cached.length) {
        setCommittees(cached);
      }
    } catch {}
  }, []);

  // Initial fetch
  useEffect(() => {
    if (!currentUser.username) return; // wait until profile loaded
    let cancelled = false;
    (async () => {
      setLoadingCommittees(true);
      setErrorCommittees("");
      try {
        const memberOverride = currentUser.username;
        const remote = await apiGetCommittees(memberOverride);
        if (!cancelled) setCommittees(Array.isArray(remote) ? remote : []);
      } catch (err) {
        if (!cancelled)
          setErrorCommittees(err.message || "Failed to load committees");
      } finally {
        if (!cancelled) {
          setLoadingCommittees(false);
          setHasLoadedOnce(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentUser.username]);

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

  // Keep staged owner row in sync when currentUser or owner id changes
  useEffect(() => {
    setStagedMembers((prev) => {
      // Remove any previous owner row and always insert the latest profile info
      const others = prev.filter(
        (m) =>
          m.role !== ROLE.OWNER &&
          norm(m.username) !== norm(currentUser.username)
      );
      return [
        {
          name: currentUser.name,
          username: currentUser.username,
          role: ROLE.OWNER,
          avatarUrl: currentUser.avatarUrl || "",
        },
        ...others,
      ];
    });
    // Always sync owner id to current user
    setStagedOwnerId(currentUser.username);
  }, [
    currentUser.name,
    currentUser.username,
    currentUser.avatarUrl,
    stagedOwnerId,
  ]);

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
    setStagedMembers([]); // Start with no members; only explicit adds allowed
    setStagedOwnerId("");
    setLastAddedId(null);
  };

  /* ---------- helpers ---------- */
  const clearForm = () => {
    resetToBlankCommittee();
    setShowForm(false);
  };

  const gotoChat = (id) => navigate(`/committees/${id}/chat`);

  const addMember = async () => {
    const raw = memberInput.trim();
    if (!raw) return;

    const username = raw;
    const exists =
      stagedMembers.some((m) => norm(m.username) === norm(username)) ||
      norm(username) === norm(stagedOwnerId);
    if (exists) {
      setMemberInput("");
      setMemberInputError("");
      return;
    }

    const chosenRole = memberRoleInput;

    // Validate against backend: only allow real users (existing profiles with email)
    let profile = null;
    try {
      if (!idToken) {
        setMemberInputError(
          "Unable to verify user. Please sign in again and try."
        );
        return;
      }

      profile = await lookupProfileByUsername(idToken, username);

      // ❗ Only treat as invalid if there's no profile OR no email
      if (!profile || !profile.email) {
        setMemberInputError(
          "User not found. Only registered users can be added."
        );
        return;
      }

      setMemberInputError("");
    } catch (e) {
      setMemberInputError("Unable to verify user. Please try again.");
      return;
    }

    const memberData = {
      name: profile.name || profile.username,
      username: profile.username,
      role: chosenRole,
      avatarUrl: profile.avatarUrl || "",
    };

    // owner / chair / normal add logic stays the same...
    // (your existing code for ROLE.OWNER, ROLE.CHAIR, etc.)

    // handle new owner
    if (chosenRole === ROLE.OWNER) {
      // Automatically transfer ownership; no confirmation prompt.
      const demoted = stagedMembers.map((m) =>
        norm(m.username) === norm(stagedOwnerId)
          ? { ...m, role: ROLE.MEMBER }
          : m
      );
      setStagedMembers([...demoted, { ...memberData, role: ROLE.OWNER }]);
      setStagedOwnerId(profile.username);
      setMemberInput("");
      setMemberRoleInput(ROLE.MEMBER);
      setLastAddedId(profile.username);
      return;
    }

    if (chosenRole === ROLE.CHAIR) {
      // Enforce single chair: demote any existing chairs before adding new one.
      const demoted = stagedMembers.map((m) =>
        m.role === ROLE.CHAIR && norm(m.username) !== norm(stagedOwnerId)
          ? { ...m, role: ROLE.MEMBER }
          : m
      );
      setStagedMembers([...demoted, { ...memberData, role: ROLE.CHAIR }]);
      setMemberInput("");
      setMemberRoleInput(ROLE.MEMBER);
      setLastAddedId(profile.username);
      return;
    }

    // normal add
    setStagedMembers((prev) => [...prev, memberData]);
    setMemberInput("");
    setMemberRoleInput(ROLE.MEMBER);
    setLastAddedId(profile.username);
    setMemberInputError("");
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
    if (!currentUser.username) return;
    try {
      const memberOverride = currentUser.username;
      const remote = await apiGetCommittees(memberOverride);
      setCommittees(Array.isArray(remote) ? remote : []);
    } catch {}
  };

  // Simple retry if committees load empty on first load
  useEffect(() => {
    if (loadingCommittees) return;
    if ((committees || []).length > 0) return;
    const t = setTimeout(() => {
      refreshCommittees();
    }, 2000);
    return () => clearTimeout(t);
  }, [loadingCommittees, committees?.length]);

  // Listen for profile updates across the app and refresh current user + committees
  useEffect(() => {
    const handler = async () => {
      try {
        if (!isAuthenticated) return;

        const token = await getAccessTokenSilently().catch(() => null);
        if (!token) return;

        const profile = await fetchProfile(token);
        const emailLocal =
          (profile?.email || user?.email || "").split("@")[0] || "";

        const profileName = (profile?.name || "").toString().trim();
        const displayName = profileName || emailLocal;

        setCurrentUser((prev) => ({
          id: emailLocal || prev.id,
          username: emailLocal || prev.username, // keep slug stable
          name: displayName || prev.name,
          avatarUrl: profile?.avatarUrl || prev.avatarUrl || "",
        }));
      } catch {
        // ignore errors, just skip update
      }
      refreshCommittees();
    };

    window.addEventListener("profile-updated", handler);

    const onStorage = (e) => {
      if (e.key === "profileUpdatedAt") handler();
    };
    window.addEventListener("storage", onStorage);

    return () => {
      window.removeEventListener("profile-updated", handler);
      window.removeEventListener("storage", onStorage);
    };
  }, [isAuthenticated, getAccessTokenSilently, user?.email]);

  const handleCreate = async () => {
    const name = committeeName.trim();
    if (!name) return;

    // Force reload of profile before creating committee
    let latestProfile = null;
    try {
      const token = await getAccessTokenSilently().catch(() => null);
      if (token) {
        latestProfile = await fetchProfile(token);
      }
    } catch {}

    // Update currentUser with latest profile info if available
    if (latestProfile) {
      const emailLocal =
        (latestProfile?.email || user?.email || "").split("@")[0] || "";
      const profileName = (latestProfile?.name || "").toString().trim();
      const displayName = profileName || emailLocal;
      setCurrentUser({
        id: emailLocal,
        username: emailLocal,
        name: displayName,
        avatarUrl: latestProfile?.avatarUrl || "",
      });
    }

    // Wait for state update to propagate (React setState is async)
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Use the latest currentUser for committee creation
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
    // The owner sync effect will run next and overwrite the owner row
    // with currentUser.name/avatar to keep it consistent with Profile.
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
              hasLoadedOnce &&
              sortedCommittees.length === 0}
            {!loadingCommittees &&
              !errorCommittees &&
              sortedCommittees.length > 0 &&
              sortedCommittees.map((c) => {
                const visibleCount = (c.members || []).filter((m) => {
                  const u = (m?.username || m?.id || "")
                    .toString()
                    .trim()
                    .toLowerCase();
                  return u && u !== "guest" && u !== "anon";
                }).length;
                return (
                  <div
                    key={c.id}
                    className="committee-tile committee-tile-row"
                    onClick={() => gotoChat(c.id)}
                    title={`Open ${c.name}`}
                  >
                    <div className="tile-body">
                      <div className="tile-title">{c.name}</div>
                      <div className="tile-sub">
                        {visibleCount} member
                        {visibleCount === 1 ? "" : "s"}
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
                );
              })}
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

                <div style={{ position: "relative", width: "100%" }}>
                  <input
                    className="member-search-input"
                    type="text"
                    value={memberInput}
                    style={{
                      width: "100%",
                      minWidth: "180px",
                      marginRight: "8px",
                      boxSizing: "border-box",
                    }}
                    onChange={(e) => {
                      setMemberInput(e.target.value);
                      // Clear error while editing; we only validate on Add/Enter
                      setMemberInputError("");
                    }}
                    onKeyDown={async (e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        await addMember();
                      }
                    }}
                    placeholder="Enter username"
                    aria-invalid={!!memberInputError}
                    aria-describedby={
                      memberInputError ? "member-input-error" : undefined
                    }
                  />

                  {memberInputError && (
                    <div
                      id="member-input-error"
                      style={{
                        position: "absolute",
                        top: "100%",
                        left: 0,
                        background: "#fee2e2",
                        color: "#b91c1c",
                        border: "1px solid #fca5a5",
                        borderRadius: 4,
                        padding: "2px 8px",
                        fontSize: 13,
                        marginTop: 2,
                        zIndex: 10,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {memberInputError}
                    </div>
                  )}
                </div>

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
                        <OwnerProfileCard user={currentUser} />
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
                          <MemberProfileCard
                            key={m.username}
                            member={m}
                            onRemove={removeStaged}
                          />
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
                          <MemberProfileCard
                            key={m.username}
                            member={m}
                            onRemove={removeStaged}
                          />
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
                          <MemberProfileCard
                            key={m.username}
                            member={m}
                            onRemove={removeStaged}
                          />
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
          <h1>Welcome to e-motions</h1>
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
