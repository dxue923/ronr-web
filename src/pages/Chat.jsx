// src/pages/Chat.jsx
import React, { useState, useRef, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { ROLE } from "../utils/permissions";
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
function saveCommittees(list) {
  localStorage.setItem("committees", JSON.stringify(list));
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
  const [showManagePanel, setShowManagePanel] = useState(false);
  const [memberInput, setMemberInput] = useState("");
  const [newMemberRole, setNewMemberRole] = useState("member");
  // bump to force re-read of committee from localStorage after edits
  const [membersRev, setMembersRev] = useState(0);
  // collapse participants on narrow screens to save vertical space
  const initialMembersCollapsed =
    typeof window !== "undefined" ? window.innerWidth <= 1199 : false;
  const [membersCollapsed, setMembersCollapsed] = useState(
    initialMembersCollapsed
  );
  // collapse motions on narrow screens (parity with participants)
  const initialMotionsCollapsed =
    typeof window !== "undefined" ? window.innerWidth <= 1199 : false;
  const [motionsCollapsed, setMotionsCollapsed] = useState(
    initialMotionsCollapsed
  );
  const me = getCurrentUser();
  // stance selection for composer
  const [composerStance, setComposerStance] = useState("neutral");

  // add-motion modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [newMotionTitle, setNewMotionTitle] = useState("");
  const [newMotionDesc, setNewMotionDesc] = useState("");
  const [editingMotionId, setEditingMotionId] = useState(null);
  const [showManageMotions, setShowManageMotions] = useState(false);
  // responsive: split layout when viewport <= 1199px
  const [isSplit, setIsSplit] = useState(
    typeof window !== "undefined" ? window.innerWidth <= 1199 : false
  );
  // decision summary draft (only used when a motion is closed and chair wants to record rationale)
  const [decisionSummary, setDecisionSummary] = useState("");
  const [decisionPros, setDecisionPros] = useState("");
  const [decisionCons, setDecisionCons] = useState("");
  const [savingDecision, setSavingDecision] = useState(false);
  // edit decision summary state (when manager wants to revise rationale)
  const [editingDecision, setEditingDecision] = useState(false);
  const [editDecisionSummary, setEditDecisionSummary] = useState("");
  const [editDecisionPros, setEditDecisionPros] = useState("");
  const [editDecisionCons, setEditDecisionCons] = useState("");
  const [savingEditDecision, setSavingEditDecision] = useState(false);
  const [showChairMenu, setShowChairMenu] = useState(false);

  // find active motion object
  const activeMotion = motions.find((m) => m.id === activeMotionId) || null;
  // whether the current session for the active motion is paused
  const sessionPaused = activeMotion?.state === "paused";
  const [showFinalOverlay, setShowFinalOverlay] = useState(false);
  // Close-motion modal state + handlers (chair records final decision when closing)
  // Declared here so effects that reference `showCloseDecisionModal` do not
  // run into TDZ (temporal dead zone) when evaluated during render.
  const [showCloseDecisionModal, setShowCloseDecisionModal] = useState(false);
  const [closeDecisionSummary, setCloseDecisionSummary] = useState("");
  const [closeDecisionPros, setCloseDecisionPros] = useState("");
  const [closeDecisionCons, setCloseDecisionCons] = useState("");
  const [savingCloseDecision, setSavingCloseDecision] = useState(false);

  // auto-show final decision overlay when a motion with decisionDetails becomes active
  useEffect(() => {
    // Only show the final-decision overlay when a motion with decisionDetails
    // becomes active _and_ the close-decision modal is not currently open.
    // When the user opens the close modal to edit the decision we want to
    // avoid highlighting other UI elements — the modal alone should be the
    // focus. Including `showCloseDecisionModal` in deps keeps this in sync.
    if (
      activeMotion &&
      activeMotion.decisionDetails &&
      !showCloseDecisionModal
    ) {
      setShowFinalOverlay(true);
    } else {
      setShowFinalOverlay(false);
    }
  }, [activeMotion?.id, activeMotion?.decisionDetails, showCloseDecisionModal]);

  // ensure we have motions in state if ls changes
  useEffect(() => {
    if (!committee) return;
    setMotions(loadMotionsForCommittee(committee.id));
  }, [committee?.id]);

  // ensure members collapsed state follows resize (expand on wide screens)
  useEffect(() => {
    function handleResizeMembers() {
      if (window.innerWidth > 1199) setMembersCollapsed(false);
    }
    window.addEventListener("resize", handleResizeMembers);
    return () => window.removeEventListener("resize", handleResizeMembers);
  }, []);

  // keep motions expanded on wide screens
  useEffect(() => {
    function handleResizeMotions() {
      if (window.innerWidth > 1199) setMotionsCollapsed(false);
    }
    window.addEventListener("resize", handleResizeMotions);
    return () => window.removeEventListener("resize", handleResizeMotions);
  }, []);

  // track split layout breakpoint
  useEffect(() => {
    function handleSplitResize() {
      setIsSplit(window.innerWidth <= 1199);
    }
    window.addEventListener("resize", handleSplitResize);
    // initialize on mount
    handleSplitResize();
    return () => window.removeEventListener("resize", handleSplitResize);
  }, []);

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

  const myMembership = members.find((m) => m.id === me.id);
  const amIManager =
    myMembership?.role === ROLE.OWNER ||
    myMembership?.role === ROLE.CHAIR ||
    committee.ownerId === me.id ||
    committee.owner === me.id;

  // persist members to committee in localStorage and trigger re-render
  const persistMembers = (nextMembers) => {
    const list = loadCommittees();
    const updatedList = list.map((c) =>
      c.id === committee.id ? { ...c, memberships: nextMembers } : c
    );
    saveCommittees(updatedList);
    setMembersRev((r) => r + 1);
  };

  const handleAddMember = () => {
    const raw = memberInput.trim();
    if (!raw) return;
    const id = raw
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    const name = raw;
    const exists = (members || []).some(
      (m) =>
        (m.id || "").toString() === id ||
        (m.name || "").toLowerCase() === raw.toLowerCase()
    );
    if (exists) {
      setMemberInput("");
      return;
    }
    const newMember = { id, name, role: newMemberRole || "member" };
    const next = [...(members || []), newMember];
    persistMembers(next);
    setMemberInput("");
    setNewMemberRole("member");
  };

  const handleRemoveMember = (memberId) => {
    const ownerId = committee.ownerId || committee.owner;
    if (ownerId && memberId === ownerId) return; // cannot remove owner
    const next = (members || []).filter((m) => m.id !== memberId);
    persistMembers(next);
  };

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
            stance: composerStance,
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
    setEditingMotionId(null);
    setNewMotionTitle("");
    setNewMotionDesc("");
    setShowAddModal(true);
  };

  const handleCreateMotion = (e) => {
    e && e.preventDefault();
    const title = newMotionTitle.trim();
    if (!title) return;
    const desc = newMotionDesc.trim();
    if (editingMotionId) {
      const updated = motions.map((m) =>
        m.id === editingMotionId ? { ...m, title, description: desc } : m
      );
      setMotions(updated);
      saveMotionsForCommittee(committee.id, updated);
      setShowAddModal(false);
      setEditingMotionId(null);
      setNewMotionTitle("");
      setNewMotionDesc("");
    } else {
      const newMotion = {
        id: crypto.randomUUID
          ? crypto.randomUUID()
          : Math.random().toString(36).slice(2, 10),
        title,
        description: desc,
        state: "discussion",
        messages: [],
        decisionLog: [],
      };
      const updated = [newMotion, ...motions];
      setMotions(updated);
      saveMotionsForCommittee(committee.id, updated);
      setActiveMotionId(newMotion.id);
      setShowAddModal(false);
      setNewMotionTitle("");
      setNewMotionDesc("");
    }
  };

  const handleCancelCreateMotion = () => {
    setShowAddModal(false);
    setEditingMotionId(null);
    setNewMotionTitle("");
    setNewMotionDesc("");
  };

  const openEditMotion = (motion) => {
    if (!motion) return;
    setEditingMotionId(motion.id);
    setNewMotionTitle(motion.title || "");
    setNewMotionDesc(motion.description || "");
    setShowAddModal(true);
  };

  const handleDeleteMotion = (motionId) => {
    const ok = window.confirm("Delete this motion? This cannot be undone.");
    if (!ok) return;
    const updated = motions.filter((m) => m.id !== motionId);
    setMotions(updated);
    saveMotionsForCommittee(committee.id, updated);
    if (activeMotionId === motionId) {
      setActiveMotionId(updated[0]?.id || null);
    }
  };

  const changeMotionState = (next) => {
    if (!activeMotion) return;
    const updated = motions.map((m) => {
      if (m.id !== activeMotion.id) return m;
      const noteMap = {
        discussion: "Session has resumed",
        paused: "Session is paused",
        voting: "Session has moved to vote",
        closed: "Session is closed",
      };
      return {
        ...m,
        state: next,
        votes: next === "voting" ? m.votes || [] : m.votes || [],
        decisionNote: noteMap[next] || `State changed to ${next}`,
      };
    });
    setMotions(updated);
    saveMotionsForCommittee(committee.id, updated);
  };

  const handleSaveDecisionSummary = (e) => {
    e && e.preventDefault();
    if (!activeMotion || activeMotion.state !== "closed") return;
    if (!amIManager) return;
    const summary = decisionSummary.trim();
    const pros = decisionPros.trim();
    const cons = decisionCons.trim();
    if (!summary && !pros && !cons) return; // require at least one field
    setSavingDecision(true);
    const updated = motions.map((m) => {
      if (m.id !== activeMotion.id) return m;
      const detail = {
        summary,
        pros: pros
          ? pros
              .split(/\n+/)
              .map((s) => s.trim())
              .filter(Boolean)
          : [],
        cons: cons
          ? cons
              .split(/\n+/)
              .map((s) => s.trim())
              .filter(Boolean)
          : [],
        recordedAt: new Date().toISOString(),
        recordedBy: me.id,
      };
      return {
        ...m,
        decisionDetails: detail,
        decisionLog: Array.isArray(m.decisionLog)
          ? [...m.decisionLog, detail]
          : [detail],
      };
    });
    setMotions(updated);
    saveMotionsForCommittee(committee.id, updated);
    setSavingDecision(false);
  };

  // start editing an existing decision summary
  const handleStartEditDecision = () => {
    if (!activeMotion || !activeMotion.decisionDetails) return;
    setEditDecisionSummary(activeMotion.decisionDetails.summary || "");
    setEditDecisionPros((activeMotion.decisionDetails.pros || []).join("\n"));
    setEditDecisionCons((activeMotion.decisionDetails.cons || []).join("\n"));
    setEditingDecision(true);
  };

  const handleCancelEditDecision = () => {
    setEditingDecision(false);
    setEditDecisionSummary("");
    setEditDecisionPros("");
    setEditDecisionCons("");
    setSavingEditDecision(false);
  };

  const handleSaveEditedDecision = (e) => {
    e && e.preventDefault();
    if (!activeMotion || !activeMotion.decisionDetails) return;
    const summary = editDecisionSummary.trim();
    const prosRaw = editDecisionPros.trim();
    const consRaw = editDecisionCons.trim();
    if (!summary && !prosRaw && !consRaw) return; // require at least one field
    setSavingEditDecision(true);
    const updated = motions.map((m) => {
      if (m.id !== activeMotion.id) return m;
      const revision = {
        summary,
        pros: prosRaw
          ? prosRaw
              .split(/\n+/)
              .map((s) => s.trim())
              .filter(Boolean)
          : [],
        cons: consRaw
          ? consRaw
              .split(/\n+/)
              .map((s) => s.trim())
              .filter(Boolean)
          : [],
        recordedAt: new Date().toISOString(),
        recordedBy: me.id,
        revisionOf: m.decisionDetails?.recordedAt || null,
      };
      return {
        ...m,
        decisionDetails: revision,
        decisionLog: Array.isArray(m.decisionLog)
          ? [...m.decisionLog, revision]
          : [revision],
      };
    });
    setMotions(updated);
    saveMotionsForCommittee(committee.id, updated);
    setSavingEditDecision(false);
    setEditingDecision(false);
  };

  const handleOpenCloseModal = () => {
    setShowChairMenu(false);
    // If the active motion already has recorded decision details, prefill
    // the close modal so the user can edit the existing decision instead
    // of starting from an empty form.
    if (activeMotion?.decisionDetails) {
      setCloseDecisionSummary(activeMotion.decisionDetails.summary || "");
      setCloseDecisionPros(
        (activeMotion.decisionDetails.pros || []).join("\n")
      );
      setCloseDecisionCons(
        (activeMotion.decisionDetails.cons || []).join("\n")
      );
    } else {
      setCloseDecisionSummary("");
      setCloseDecisionPros("");
      setCloseDecisionCons("");
    }
    setShowCloseDecisionModal(true);
  };

  const handleCancelCloseModal = () => {
    setShowCloseDecisionModal(false);
    setCloseDecisionSummary("");
    setCloseDecisionPros("");
    setCloseDecisionCons("");
  };

  const handleConfirmCloseMotion = (e) => {
    e && e.preventDefault();
    if (!activeMotion) return;
    setSavingCloseDecision(true);
    const updated = motions.map((m) => {
      if (m.id !== activeMotion.id) return m;
      const summary = closeDecisionSummary.trim();
      const pros = closeDecisionPros.trim();
      const cons = closeDecisionCons.trim();
      const detail = {
        summary,
        pros: pros
          ? pros
              .split(/\n+/)
              .map((s) => s.trim())
              .filter(Boolean)
          : [],
        cons: cons
          ? cons
              .split(/\n+/)
              .map((s) => s.trim())
              .filter(Boolean)
          : [],
        recordedAt: new Date().toISOString(),
        recordedBy: me.id,
      };
      return {
        ...m,
        state: "closed",
        decisionDetails: detail,
        decisionLog: Array.isArray(m.decisionLog)
          ? [...m.decisionLog, detail]
          : [detail],
        decisionNote: "Session is closed",
      };
    });
    setMotions(updated);
    saveMotionsForCommittee(committee.id, updated);
    setSavingCloseDecision(false);
    setShowCloseDecisionModal(false);
  };

  // compute tally from votes array: [{ voterId, choice }]
  const computeTally = (votes = []) => {
    const tally = { yes: 0, no: 0, abstain: 0 };
    for (const v of votes) {
      const c = (v.choice || "").toString().toLowerCase();
      if (c === "yes") tally.yes += 1;
      else if (c === "no") tally.no += 1;
      else tally.abstain += 1;
    }
    return tally;
  };

  // whether chair may close the current motion (disabled when already closed)
  const canChairClose = activeMotion && activeMotion.state !== "closed";

  // handle user voting (everyone can vote while motion is in 'voting')
  const handleVote = (choice) => {
    if (!activeMotion || activeMotion.state !== "voting") return;
    const updated = motions.map((m) => {
      if (m.id !== activeMotion.id) return m;
      const votes = Array.isArray(m.votes) ? [...m.votes] : [];
      // remove existing vote by this user
      const filtered = votes.filter((v) => v.voterId !== me.id);
      // add new vote
      filtered.push({
        voterId: me.id,
        choice: (choice || "").toString().toLowerCase(),
      });
      return { ...m, votes: filtered };
    });
    setMotions(updated);
    saveMotionsForCommittee(committee.id, updated);
  };

  return (
    <div
      className={`discussion-shell ${
        activeMotion?.state === "closed" ? "motion-closed" : ""
      }`}
    >
      {showAddModal && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h3>{editingMotionId ? "Edit Motion" : "New Motion"}</h3>
            <form onSubmit={handleCreateMotion} className="modal-form">
              <label htmlFor="motion-title">Title</label>
              <input
                id="motion-title"
                value={newMotionTitle}
                onChange={(e) => setNewMotionTitle(e.target.value)}
                placeholder="Enter motion title"
                required
              />
              <label htmlFor="motion-desc">Description</label>
              <textarea
                id="motion-desc"
                value={newMotionDesc}
                onChange={(e) => setNewMotionDesc(e.target.value)}
                placeholder="Add a short description"
                rows={4}
              />
              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={handleCancelCreateMotion}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  {editingMotionId ? "Save Changes" : "Add Motion"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {showCloseDecisionModal && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div
            className="modal-card"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 640 }}
          >
            <h3>Close Motion — Final Decision</h3>
            <form onSubmit={handleConfirmCloseMotion} className="modal-form">
              <label htmlFor="close-decision-summary">
                Summary / Rationale
              </label>
              <textarea
                id="close-decision-summary"
                value={closeDecisionSummary}
                onChange={(e) => setCloseDecisionSummary(e.target.value)}
                placeholder="Summary of outcome and rationale"
                rows={4}
              />

              <label htmlFor="close-decision-pros">Pros (one per line)</label>
              <textarea
                id="close-decision-pros"
                value={closeDecisionPros}
                onChange={(e) => setCloseDecisionPros(e.target.value)}
                placeholder="Positive impacts or advantages..."
                rows={3}
              />

              <label htmlFor="close-decision-cons">Cons (one per line)</label>
              <textarea
                id="close-decision-cons"
                value={closeDecisionCons}
                onChange={(e) => setCloseDecisionCons(e.target.value)}
                placeholder="Trade-offs or downsides..."
                rows={3}
              />

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={handleCancelCloseModal}
                  disabled={savingCloseDecision}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={savingCloseDecision}
                >
                  {savingCloseDecision
                    ? "Saving..."
                    : "Close Motion & Save Decision"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* LEFT: motions + participants */}
      <aside className="discussion-left">
        {!showCloseDecisionModal && (
          <div className="discussion-left-header">
            <h2>{committee.name || "Committee"}</h2>
            <button onClick={handleAddMotion} className="primary-icon-btn">
              +
            </button>
          </div>
        )}
        {/* Chair controls moved to composer icon — left-panel panel removed */}
        <div className="discussion-left-content">
          <div className="motions-header-row">
            <h3 className="motions-header">Motions</h3>
            <div className="motions-header-controls">
              <button
                className="motions-collapse-toggle"
                onClick={() => setMotionsCollapsed((s) => !s)}
                aria-controls="motion-list-body"
                aria-expanded={!motionsCollapsed}
                title={motionsCollapsed ? "Show motions" : "Hide motions"}
              >
                {motionsCollapsed ? "▴" : "▾"}
              </button>
              {amIManager && (
                <button
                  className="motions-toggle-btn"
                  onClick={() => setShowManageMotions((s) => !s)}
                  aria-expanded={showManageMotions}
                  title="Manage motions"
                >
                  ⋮
                </button>
              )}
            </div>
          </div>

          <div
            id="motion-list-body"
            className={`motion-list-body ${
              motionsCollapsed ? "collapsed" : ""
            }`}
            aria-hidden={motionsCollapsed}
          >
            <div className="motion-list">
              {motions.length === 0 && (
                <p className="empty">No motions yet. Add one.</p>
              )}
              {motions.map((m) =>
                showManageMotions ? (
                  <div key={m.id} className="motion-manage">
                    <div className="motion-manage-controls">
                      {(() => {
                        // compute permission locally so JSX stays tidy
                        const canClose = m && m.state !== "closed";
                        return (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                setActiveMotionId(m.id);
                                changeMotionState("discussion");
                                setShowManageMotions(false);
                              }}
                            >
                              Resume Discussion
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setActiveMotionId(m.id);
                                changeMotionState("paused");
                                setShowManageMotions(false);
                              }}
                            >
                              Pause Discussion
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setActiveMotionId(m.id);
                                changeMotionState("voting");
                                setShowManageMotions(false);
                              }}
                            >
                              Move to Vote
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (!canClose || showCloseDecisionModal) return; // guard
                                setActiveMotionId(m.id);
                                // open modal to record final decision before closing
                                handleOpenCloseModal();
                                setShowManageMotions(false);
                              }}
                              disabled={!canClose || showCloseDecisionModal}
                              title={
                                canClose && !showCloseDecisionModal
                                  ? "Close motion"
                                  : showCloseDecisionModal
                                  ? "Decision modal open"
                                  : "Close disabled — resume discussion first"
                              }
                            >
                              Close Motion
                            </button>
                          </>
                        );
                      })()}
                    </div>
                  </div>
                ) : (
                  <button
                    key={m.id}
                    className={
                      "motion-list-item " +
                      (m.id === activeMotionId ? "motion-active" : "")
                    }
                    onClick={() => setActiveMotionId(m.id)}
                  >
                    <span className="motion-title">{m.title}</span>
                    <span
                      className={`status-pill status-${
                        m.state || "discussion"
                      }`}
                    >
                      {m.state || "discussion"}
                    </span>
                  </button>
                )
              )}
            </div>
          </div>

          {isSplit && (
            <div className="member-list">
              <div className="member-list-header">
                <h3>Participants</h3>
                <button
                  className="participants-collapse-toggle"
                  onClick={() => setMembersCollapsed((s) => !s)}
                  aria-expanded={!membersCollapsed}
                  title={
                    membersCollapsed ? "Show participants" : "Hide participants"
                  }
                >
                  {membersCollapsed ? "▴" : "▾"}
                </button>
                {amIManager && (
                  <button
                    className="participants-toggle-btn"
                    onClick={() => setShowManagePanel((s) => !s)}
                    aria-expanded={showManagePanel}
                    title="Manage participants"
                  >
                    ⋮
                  </button>
                )}
              </div>

              {showManagePanel && amIManager && (
                <div className="participants-tools visible">
                  <div className="participant-add-row">
                    <input
                      value={memberInput}
                      onChange={(e) => setMemberInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleAddMember();
                        }
                      }}
                      placeholder="Add participant"
                    />
                    <select
                      className="member-role-select"
                      value={newMemberRole}
                      onChange={(e) => setNewMemberRole(e.target.value)}
                      aria-label="Membership role"
                    >
                      <option value="member">Member</option>
                      <option value="observer">Observer</option>
                    </select>
                    <button
                      type="button"
                      className="add-member-btn"
                      onClick={handleAddMember}
                    >
                      Add
                    </button>
                  </div>
                </div>
              )}

              <div
                className={`member-list-body ${
                  membersCollapsed ? "collapsed" : ""
                }`}
              >
                {members.map((p) => (
                  <div key={p.id || p.name} className="member-row">
                    <div className="avatar-circle">
                      {(p.name || p.id || "?").slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <div className="member-name">{p.name || p.id}</div>
                      <RoleBadge role={p.role} />
                    </div>
                    {showManagePanel &&
                      amIManager &&
                      p.id !== (committee.ownerId || committee.owner) && (
                        <button
                          type="button"
                          className="remove-member-btn"
                          title="Remove participant"
                          onClick={() => handleRemoveMember(p.id)}
                        >
                          ×
                        </button>
                      )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* MIDDLE: thread */}
      <main
        className={`discussion-main ${
          showFinalOverlay ? "final-decision-active" : ""
        } ${activeMotion?.state === "voting" ? "voting-active" : ""}`}
      >
        {activeMotion ? (
          <>
            <header className="discussion-main-header">
              <div>
                <h1>{activeMotion.title}</h1>
                {activeMotion.description ? (
                  <p className="motion-desc">{activeMotion.description}</p>
                ) : null}
              </div>
              {/* (tallies are shown in a larger panel below the thread) */}
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
                        <span className="stance-dot-wrapper" title={msg.stance}>
                          <span
                            className={
                              "stance-dot " +
                              (msg.stance === "pro"
                                ? "dot-pro"
                                : msg.stance === "con"
                                ? "dot-con"
                                : "dot-neutral")
                            }
                          />
                        </span>
                      ) : null}
                    </div>

                    {/* stance options moved to composer; inline controls removed */}

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

            {/* current decision message centered below the thread (only when not closed)
                and hidden while the close-decision modal is open so the modal
                remains the only visible focus. */}
            {activeMotion.decisionNote &&
              activeMotion.state !== "closed" &&
              !showCloseDecisionModal && (
                <div className="decision-current">
                  <span
                    className={
                      "decision-pill is-" + (activeMotion.state || "discussion")
                    }
                  >
                    {activeMotion.decisionNote}
                  </span>
                </div>
              )}

            {/* Final decision (moved below vote tally) will render after the tally */}

            {/* Large vote tally box (visible during voting or after closed) */}
            {(activeMotion.state === "voting" ||
              activeMotion.state === "closed") && (
              <div className="vote-tally-panel">
                {(() => {
                  const votes = activeMotion?.votes || [];
                  const tally = computeTally(votes);
                  const myVote = votes.find((v) => v.voterId === me.id)?.choice;
                  const votingOpen = activeMotion?.state === "voting";
                  const closed = activeMotion?.state === "closed";
                  return (
                    <div className="vote-tally-inner">
                      <button
                        type="button"
                        className={
                          "vote-tally-choice " +
                          (myVote === "yes" ? "is-active" : "")
                        }
                        onClick={() => handleVote("yes")}
                        disabled={!votingOpen}
                        aria-pressed={myVote === "yes"}
                        title={votingOpen ? "Vote Yes" : "Voting closed"}
                      >
                        <div className="vote-tally-num">{tally.yes}</div>
                        <div className="vote-tally-label">Yes</div>
                      </button>

                      <button
                        type="button"
                        className={
                          "vote-tally-choice " +
                          (myVote === "no" ? "is-active" : "")
                        }
                        onClick={() => handleVote("no")}
                        disabled={!votingOpen}
                        aria-pressed={myVote === "no"}
                        title={votingOpen ? "Vote No" : "Voting closed"}
                      >
                        <div className="vote-tally-num">{tally.no}</div>
                        <div className="vote-tally-label">No</div>
                      </button>

                      <button
                        type="button"
                        className={
                          "vote-tally-choice " +
                          (myVote === "abstain" ? "is-active" : "")
                        }
                        onClick={() => handleVote("abstain")}
                        disabled={!votingOpen}
                        aria-pressed={myVote === "abstain"}
                        title={votingOpen ? "Abstain" : "Voting closed"}
                      >
                        <div className="vote-tally-num">{tally.abstain}</div>
                        <div className="vote-tally-label">Abstain</div>
                      </button>

                      <div className="vote-tally-state">
                        {closed ? "Final Tally" : "Live Tally"}
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Final decision box: render beneath the vote tally (inline, no overlay).
                When a tally is present (voting/closed) we add `floating` so CSS
                can position it visually centered within the discussion area
                while keeping it after the tally in source order. */}
            {activeMotion?.decisionDetails &&
              !showCloseDecisionModal &&
              activeMotion?.state !== "voting" && (
                <>
                  <div
                    className={
                      "final-decision-box" +
                      (activeMotion.state === "voting" ||
                      activeMotion.state === "closed"
                        ? " floating"
                        : "")
                    }
                  >
                    <h3 className="decision-final-heading">Final Decision</h3>
                    {activeMotion.decisionDetails.summary && (
                      <div className="decision-final-summary">
                        {activeMotion.decisionDetails.summary}
                      </div>
                    )}
                    <div className="decision-final-grid">
                      {activeMotion.decisionDetails.pros?.length > 0 && (
                        <div className="decision-final-column">
                          <h4>Pros</h4>
                          <ul>
                            {activeMotion.decisionDetails.pros.map((p, i) => (
                              <li key={`p-${i}`}>{p}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {activeMotion.decisionDetails.cons?.length > 0 && (
                        <div className="decision-final-column">
                          <h4>Cons</h4>
                          <ul>
                            {activeMotion.decisionDetails.cons.map((c, i) => (
                              <li key={`c-${i}`}>{c}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                    <div style={{ marginTop: 12, textAlign: "right" }}>
                      {amIManager && (
                        <button
                          type="button"
                          className="decision-edit-btn"
                          onClick={() => {
                            handleStartEditDecision();
                          }}
                        >
                          Edit Decision
                        </button>
                      )}
                    </div>
                  </div>

                  {/* If motion is closed, render the decision pill below the summary box */}
                  {activeMotion.decisionNote &&
                    activeMotion.state === "closed" && (
                      <div className="decision-current">
                        <span
                          className={
                            "decision-pill is-" +
                            (activeMotion.state || "discussion")
                          }
                        >
                          {activeMotion.decisionNote}
                        </span>
                      </div>
                    )}
                </>
              )}

            <form
              className={
                "discussion-composer " +
                (showCloseDecisionModal ? "modal-background" : "")
              }
              onSubmit={handleSend}
            >
              {amIManager && activeMotion && (
                <div className="composer-chair">
                  <button
                    type="button"
                    className="chair-icon-btn"
                    aria-haspopup="true"
                    aria-expanded={showChairMenu}
                    onClick={() => setShowChairMenu((s) => !s)}
                    title="Chair controls"
                  >
                    ⚙
                  </button>
                  {showChairMenu && (
                    <div className="chair-menu" role="menu">
                      <button
                        type="button"
                        onClick={() => {
                          changeMotionState("discussion");
                          setShowChairMenu(false);
                        }}
                      >
                        Resume Discussion
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          changeMotionState("paused");
                          setShowChairMenu(false);
                        }}
                      >
                        Pause Discussion
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          changeMotionState("voting");
                          setShowChairMenu(false);
                        }}
                      >
                        Move to Vote
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (!canChairClose || showCloseDecisionModal) return;
                          // open modal to record final decision before closing
                          handleOpenCloseModal();
                        }}
                        disabled={!canChairClose || showCloseDecisionModal}
                        title={
                          canChairClose && !showCloseDecisionModal
                            ? "Close motion"
                            : showCloseDecisionModal
                            ? "Decision modal open"
                            : "Close disabled — resume discussion first"
                        }
                      >
                        Close Motion
                      </button>
                    </div>
                  )}
                </div>
              )}
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={
                  sessionPaused
                    ? "Session paused"
                    : activeMotion
                    ? `Write a comment for ${activeMotion.title}…`
                    : "Select a motion to comment"
                }
                disabled={sessionPaused || !activeMotion}
                aria-disabled={sessionPaused || !activeMotion}
                title={sessionPaused ? "Session paused" : undefined}
              />
              <div className="composer-controls">
                <div className="composer-stance">
                  <button
                    type="button"
                    className={
                      "stance-inline-btn " +
                      (composerStance === "pro" ? "is-active" : "")
                    }
                    onClick={() => setComposerStance("pro")}
                    aria-pressed={composerStance === "pro"}
                    disabled={sessionPaused || !activeMotion}
                    aria-disabled={sessionPaused || !activeMotion}
                    aria-label="Pro stance"
                    title="Pro stance"
                  >
                    <span className="stance-dot dot-pro" />
                  </button>
                  <button
                    type="button"
                    className={
                      "stance-inline-btn " +
                      (composerStance === "con" ? "is-active" : "")
                    }
                    onClick={() => setComposerStance("con")}
                    aria-pressed={composerStance === "con"}
                    disabled={sessionPaused || !activeMotion}
                    aria-disabled={sessionPaused || !activeMotion}
                    aria-label="Con stance"
                    title="Con stance"
                  >
                    <span className="stance-dot dot-con" />
                  </button>
                  <button
                    type="button"
                    className={
                      "stance-inline-btn " +
                      (composerStance === "neutral" ? "is-active" : "")
                    }
                    onClick={() => setComposerStance("neutral")}
                    aria-pressed={composerStance === "neutral"}
                    disabled={sessionPaused || !activeMotion}
                    aria-disabled={sessionPaused || !activeMotion}
                    aria-label="Neutral stance"
                    title="Neutral stance"
                  >
                    <span className="stance-dot dot-neutral" />
                  </button>
                </div>
              </div>
              <button
                type="submit"
                className="send-btn"
                aria-label="Send"
                disabled={sessionPaused || !activeMotion || !input.trim()}
                aria-disabled={sessionPaused || !activeMotion || !input.trim()}
                title={sessionPaused ? "Session paused" : undefined}
              >
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

      {/* RIGHT: participants (only on wide screens) */}
      <aside className="discussion-right">
        {!isSplit && (
          <div className="member-list">
            <div className="member-list-header">
              <h3>Participants</h3>
              {/* collapse toggle visible on narrow screens */}
              <button
                className="participants-collapse-toggle"
                onClick={() => setMembersCollapsed((s) => !s)}
                aria-expanded={!membersCollapsed}
                title={
                  membersCollapsed ? "Show participants" : "Hide participants"
                }
              >
                {membersCollapsed ? "▴" : "▾"}
              </button>
              {amIManager && (
                <button
                  className="participants-toggle-btn"
                  onClick={() => setShowManagePanel((s) => !s)}
                  aria-expanded={showManagePanel}
                  title="Manage participants"
                >
                  ⋮
                </button>
              )}
            </div>

            {/* manage tools: add member input; visible only in manage mode for managers */}
            {showManagePanel && amIManager && (
              <div className="participants-tools visible">
                <div className="participant-add-row">
                  <input
                    value={memberInput}
                    onChange={(e) => setMemberInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddMember();
                      }
                    }}
                    placeholder="Add participant"
                  />
                  <select
                    className="member-role-select"
                    value={newMemberRole}
                    onChange={(e) => setNewMemberRole(e.target.value)}
                    aria-label="Membership role"
                  >
                    <option value="member">Member</option>
                    <option value="observer">Observer</option>
                  </select>
                  <button
                    type="button"
                    className="add-member-btn"
                    onClick={handleAddMember}
                  >
                    Add
                  </button>
                </div>
              </div>
            )}

            <div
              className={`member-list-body ${
                membersCollapsed ? "collapsed" : ""
              }`}
            >
              {members.map((p) => (
                <div key={p.id || p.name} className="member-row">
                  <div className="avatar-circle">
                    {(p.name || p.id || "?").slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <div className="member-name">{p.name || p.id}</div>
                    <RoleBadge role={p.role} />
                  </div>
                  {showManagePanel &&
                    amIManager &&
                    p.id !== (committee.ownerId || committee.owner) && (
                      <button
                        type="button"
                        className="remove-member-btn"
                        title="Remove participant"
                        onClick={() => handleRemoveMember(p.id)}
                      >
                        ×
                      </button>
                    )}
                </div>
              ))}
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
