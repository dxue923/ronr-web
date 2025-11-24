// src/pages/Chat.jsx
import React, { useState, useRef, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { ROLE } from "../utils/permissions";
import "../assets/styles/index.css";

/* ---------- storage helpers ---------- */
function loadCommittees() {
  try {
    return JSON.parse(localStorage.getItem("committees") || "[]");
  } catch (e) {
    return [];
  }
}
function findCommitteeById(id) {
  return loadCommittees().find((c) => c.id === id);
}
function loadMotionsForCommittee(id) {
  try {
    return JSON.parse(localStorage.getItem(`committee:${id}:motions`) || "[]");
  } catch (e) {
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
  } catch (e) {
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

function SendIcon() {
  return (
    <svg
      viewBox="0 2 24 24"
      width="24"
      height="24"
      fill="none"
      stroke="white"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="12" y1="22" x2="12" y2="8" />
      <polyline points="8 12 12 8 16 12" />
    </svg>
  );
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
  //  force re-read of committee from localStorage after edits
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
  // view tab for middle column: 'discussion' | 'final'
  const [viewTab, setViewTab] = useState("discussion");
  // per-motion remembered tabs (remember last-opened tab per motion)
  const [motionTabs, setMotionTabs] = useState({});

  const setMotionView = (tab, motionId = activeMotionId) => {
    // debug logging to help trace per-motion tab behavior
    try {
      console.debug("setMotionView", { tab, motionId });
    } catch (e) {}
    if (motionId) {
      setMotionTabs((prev) => ({ ...prev, [motionId]: tab }));
    }
    setViewTab(tab);
  };

  // add-motion modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [newMotionTitle, setNewMotionTitle] = useState("");
  const [newMotionDesc, setNewMotionDesc] = useState("");
  const [editingMotionId, setEditingMotionId] = useState(null);
  const [overturnTarget, setOverturnTarget] = useState(null);
  const [showManageMotions, setShowManageMotions] = useState(false);
  // responsive: split layout when viewport <= 1199px
  const [isSplit, setIsSplit] = useState(
    typeof window !== "undefined" ? window.innerWidth <= 1199 : false
  );
  // decision summary draft (only used when a motion is closed and chair wants to record rationale)
  const [decisionSummary, setDecisionSummary] = useState("");
  const [decisionPros, setDecisionPros] = useState("");
  const [decisionCons, setDecisionCons] = useState("");
  const [decisionOutcome, setDecisionOutcome] = useState("");
  const [savingDecision, setSavingDecision] = useState(false);
  // edit decision summary state (when manager wants to revise rationale)
  const [editingDecision, setEditingDecision] = useState(false);
  const [editDecisionSummary, setEditDecisionSummary] = useState("");
  const [editDecisionPros, setEditDecisionPros] = useState("");
  const [editDecisionCons, setEditDecisionCons] = useState("");
  const [editDecisionOutcome, setEditDecisionOutcome] = useState("");
  const [savingEditDecision, setSavingEditDecision] = useState(false);
  const [showChairMenu, setShowChairMenu] = useState(false);
  // transient blink indicator when chair closes a motion
  const [finalBlink, setFinalBlink] = useState(false);
  // toast notification for saves (removed)

  // find active motion object
  const activeMotion = motions.find((m) => m.id === activeMotionId) || null;
  // whether the current session for the active motion is paused
  const sessionPaused = activeMotion?.state === "paused";
  // whether the current session for the active motion is closed
  const sessionClosed = activeMotion?.state === "closed";
  // whether the current user voted 'yes' on the active motion
  const userVotedYes = (activeMotion?.votes || []).some(
    (v) =>
      (v.voterId || "") === (me.id || "") &&
      (v.choice || "").toString().toLowerCase() === "yes"
  );
  const [showFinalOverlay, setShowFinalOverlay] = useState(false);

  // auto-show final decision overlay when a motion with decisionDetails becomes active
  useEffect(() => {
    if (activeMotion && activeMotion.decisionDetails) {
      setShowFinalOverlay(true);
    } else {
      setShowFinalOverlay(false);
    }
  }, [activeMotion?.id, activeMotion?.decisionDetails]);

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

  // ensure we scroll to the most recent messages when returning to Discussion view
  useEffect(() => {
    if (viewTab !== "discussion") return;
    if (!scrollRef.current) return;
    // schedule after render/layout to ensure correct scrollHeight
    const t = setTimeout(() => {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }, 0);
    return () => clearTimeout(t);
  }, [viewTab, activeMotion?.id]);

  if (!committee) {
    return (
      <div className="discussion-shell">
        <p>Committee not found.</p>
        <Link to="/">Back</Link>
      </div>
    );
  }

  // temp members on the committee

  {
    /* Status indicator shown below the final tally when the motion is closed */
  }
  {
    viewTab === "discussion" &&
      activeMotion?.state === "closed" &&
      activeMotion?.decisionNote && (
        <div className="decision-current" style={{ marginTop: 8 }}>
          <span
            className={"decision-pill is-" + (activeMotion.state || "closed")}
          >
            {activeMotion.decisionNote}
          </span>
        </div>
      );
  }
  const members = committee.memberships ||
    committee.members || [
      {
        id: committee.ownerId || committee.owner || "owner",
        name: committee.ownerName || "Owner",
      },
    ];

  // persist members to committee in localStorage and trigger re-render
  const persistMembers = (nextMembers) => {
    const list = loadCommittees();
    const updatedList = list.map((c) =>
      c.id === committee.id ? { ...c, memberships: nextMembers } : c
    );
    saveCommittees(updatedList);
    setMembersRev((r) => r + 1);
  };

  // derive current user's role and manager permissions
  const myMembership = (members || []).find(
    (m) =>
      (m.id || m.name || "").toString() ===
      (me.id || me.username || "").toString()
  );
  const myRole =
    myMembership?.role ||
    (committee.ownerId === me.id || committee.owner === me.id
      ? ROLE.OWNER
      : ROLE.MEMBER);
  const amIManager = myRole === ROLE.CHAIR || myRole === ROLE.OWNER;

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
        meta: overturnTarget ? { overturnOf: overturnTarget.id } : undefined,
      };
      const updated = [newMotion, ...motions];
      setMotions(updated);
      saveMotionsForCommittee(committee.id, updated);
      setActiveMotionId(newMotion.id);
      setMotionView("discussion", newMotion.id);
      setShowAddModal(false);
      setNewMotionTitle("");
      setNewMotionDesc("");
      setOverturnTarget(null);
    }
  };

  const handleCancelCreateMotion = () => {
    setShowAddModal(false);
    setEditingMotionId(null);
    setNewMotionTitle("");
    setNewMotionDesc("");
    setOverturnTarget(null);
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
      const nextActive = updated[0]?.id || null;
      setActiveMotionId(nextActive);
      setMotionView("discussion", nextActive);
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
    if (!summary && !pros && !cons && !decisionOutcome) return; // require at least one field
    setSavingDecision(true);
    const updated = motions.map((m) => {
      if (m.id !== activeMotion.id) return m;
      const detail = {
        outcome: decisionOutcome || undefined,
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
    // notify other windows/clients to highlight the Final Decision tab
    try {
      const key = `motionFinalBlink:${committee.id}:${activeMotion.id}`;
      localStorage.setItem(key, Date.now().toString());
    } catch (err) {
      // ignore storage errors (e.g., disabled localStorage)
    }
  };

  // start editing an existing decision summary
  const handleStartEditDecision = () => {
    if (!activeMotion || !activeMotion.decisionDetails) return;
    setEditDecisionSummary(activeMotion.decisionDetails.summary || "");
    setEditDecisionPros((activeMotion.decisionDetails.pros || []).join("\n"));
    setEditDecisionCons((activeMotion.decisionDetails.cons || []).join("\n"));
    setEditDecisionOutcome(
      activeMotion.decisionDetails?.outcome ||
        computeOutcome(activeMotion?.votes || []) ||
        ""
    );
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
        outcome: editDecisionOutcome || undefined,
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

  // Propose a new motion that seeks to overturn the currently selected final decision
  const handleProposeOverturn = () => {
    if (!activeMotion || activeMotion.state !== "closed") return;
    // Only users who voted in favor may propose an overturn
    if (!userVotedYes) {
      alert(
        "Only members who voted in favor of the original decision may propose an overturn."
      );
      return;
    }
    // Open the add-motion modal pre-filled as an overturn proposal
    openOverturnModal(activeMotion);
  };

  function openOverturnModal(targetMotion) {
    setEditingMotionId(null);
    setOverturnTarget(targetMotion);
    setNewMotionTitle(`Motion to overturn "${targetMotion.title}"`);
    setNewMotionDesc(
      `This motion proposes to overturn the previous decision on "${targetMotion.title}".`
    );
    setShowAddModal(true);
  }

  // no-op: toast logic removed

  // Close the motion immediately (no modal). The chair will fill decision
  // details on the Final Decision page after the motion is closed.
  const handleCloseMotionNow = (motionId) => {
    const updated = motions.map((m) =>
      m.id === motionId
        ? { ...m, state: "closed", decisionNote: "Session is closed" }
        : m
    );
    setMotions(updated);
    saveMotionsForCommittee(committee.id, updated);
    // ensure the closed motion is active and switch to Final view
    setActiveMotionId(motionId);
    setMotionView("final", motionId);
    // trigger a brief blink on the Final Decision tab when we close
    const before = motions.find((m) => m.id === motionId);
    if (before && !before.decisionDetails) {
      setFinalBlink(true);
      setTimeout(() => setFinalBlink(false), 1400);
    }
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

  // derive a simple outcome label from votes when an explicit outcome isn't set
  const computeOutcome = (votes = []) => {
    const tally = computeTally(votes);
    const total = tally.yes + tally.no + tally.abstain;
    if (total === 0) return "No Votes";
    if (tally.yes > tally.no) return "Adopted";
    if (tally.no > tally.yes) return "Rejected";
    return "Tied";
  };

  // map outcome text to CSS class used for colored pills
  const outcomeClassFromText = (text) => {
    if (!text) return "neutral";
    const t = text.toString().toLowerCase();
    if (t.includes("adopt") || t.includes("pass") || t.includes("passed"))
      return "passed";
    if (t.includes("reject") || t.includes("fail") || t.includes("failed"))
      return "failed";
    if (t.includes("tie") || t.includes("tied") || t.includes("no votes"))
      return "tied";
    if (t.includes("defer") || t.includes("refer") || t.includes("deferred"))
      return "deferred";
    return "neutral";
  };

  // ensure Final tab isn't selectable until motion is closed
  useEffect(() => {
    if (viewTab === "final" && activeMotion?.state !== "closed") {
      setMotionView("discussion");
    }
  }, [activeMotion?.state, viewTab]);

  // listen for final-decision notifications from other windows (chair save)
  useEffect(() => {
    function onStorage(e) {
      if (!e?.key) return;
      if (!e.key.startsWith("motionFinalBlink:")) return;
      const parts = e.key.split(":");
      // key format: motionFinalBlink:committeeId:motionId
      if (parts.length < 3) return;
      const commId = parts[1];
      const motionId = parts[2];
      if (!committee || commId !== committee.id) return;
      // only set blink for others (non-managers) and when the motion matches
      if (!amIManager && activeMotion && motionId === activeMotion.id) {
        setFinalBlink(true);
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [committee?.id, activeMotion?.id, amIManager]);

  // when the tabs are hidden (not closing modal and motion not closed),
  // ensure we return to the discussion view so no stale 'final' view remains
  useEffect(() => {
    const tabsVisible = activeMotion?.state === "closed";
    if (!tabsVisible && viewTab !== "discussion") {
      setMotionView("discussion");
    }
  }, [activeMotion?.state, viewTab]);

  // restore per-motion tab when active motion changes
  useEffect(() => {
    if (!activeMotionId) {
      setViewTab("discussion");
      return;
    }
    const tab = motionTabs[activeMotionId] || "discussion";
    try {
      console.debug("restoreMotionTab", { activeMotionId, tab, motionTabs });
    } catch (e) {}
    setViewTab(tab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMotionId, motionTabs]);

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

  // group motions for UI sections: active (not closed) and concluded (closed)
  const activeMotions = (motions || []).filter((m) => m.state !== "closed");
  const concludedMotions = (motions || []).filter((m) => m.state === "closed");

  // transient visibility for status pills: show briefly when motion/state changes
  const [showStatusPill, setShowStatusPill] = useState(false);
  useEffect(() => {
    // whenever the active motion or its state changes, show the pill briefly
    if (!activeMotion) return;
    setShowStatusPill(true);
    const t = setTimeout(() => setShowStatusPill(false), 10000); // 10s
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMotion?.id, activeMotion?.state]);

  return (
    <div
      className={`discussion-shell ${
        activeMotion?.state === "closed" ? "motion-closed" : ""
      }`}
    >
      {showAddModal && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h3>
              {editingMotionId
                ? "Edit Motion"
                : overturnTarget
                ? "Propose Overturn"
                : "New Motion"}
            </h3>
            <form onSubmit={handleCreateMotion} className="modal-form">
              <label htmlFor="motion-title">Title</label>
              <input
                id="motion-title"
                value={newMotionTitle}
                onChange={(e) => setNewMotionTitle(e.target.value)}
                placeholder="Enter motion title"
                required
                disabled={!!overturnTarget}
                readOnly={!!overturnTarget}
                aria-readonly={!!overturnTarget}
                aria-disabled={!!overturnTarget}
                title={
                  overturnTarget
                    ? "This field is prefilled for overturn"
                    : undefined
                }
              />
              <label htmlFor="motion-desc">Description</label>
              <textarea
                id="motion-desc"
                value={newMotionDesc}
                onChange={(e) => setNewMotionDesc(e.target.value)}
                placeholder="Add a short description"
                rows={4}
                disabled={!!overturnTarget}
                readOnly={!!overturnTarget}
                aria-readonly={!!overturnTarget}
                aria-disabled={!!overturnTarget}
                title={
                  overturnTarget
                    ? "This field is prefilled for overturn"
                    : undefined
                }
              />
              {overturnTarget && (
                <div
                  className="modal-note"
                  style={{ fontSize: "0.85rem", color: "#4b5563" }}
                >
                  This motion will propose overturning “{overturnTarget.title}”.
                  Fields are locked for editing.
                </div>
              )}
              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={handleCancelCreateMotion}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  {editingMotionId
                    ? "Save Changes"
                    : overturnTarget
                    ? "Propose Overturn"
                    : "Add Motion"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Close-motion modal removed: final decision is edited on the Final view */}
      {/* LEFT: motions + participants */}
      <aside className="discussion-left">
        <div className="discussion-left-header">
          <h2>{committee.name || "Committee"}</h2>
          <button onClick={handleAddMotion} className="primary-icon-btn">
            +
          </button>
        </div>
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

              {activeMotions.length > 0 && (
                <>
                  <div className="motions-section-header">
                    <strong>Active Motions</strong>
                  </div>
                  {activeMotions.map((m) => (
                    <div key={m.id} className="motion-list-row">
                      <div
                        className={
                          "motion-list-item " +
                          (m.id === activeMotionId ? "motion-active" : "")
                        }
                        role="button"
                        tabIndex={0}
                        onClick={() => {
                          setActiveMotionId(m.id);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setActiveMotionId(m.id);
                          }
                        }}
                      >
                        <div className="motion-row-content">
                          <span className="motion-title">{m.title}</span>
                          <span
                            className={`status-pill status-${
                              m.state || "discussion"
                            }`}
                          >
                            {m.state || "discussion"}
                          </span>
                        </div>

                        {showManageMotions && amIManager && (
                          <div className="motion-action-row manage-internal">
                            <button
                              type="button"
                              className="motion-action-btn danger"
                              onClick={(ev) => {
                                ev.stopPropagation();
                                handleDeleteMotion(m.id);
                              }}
                              title="Delete motion"
                            >
                              Delete
                            </button>

                            <button
                              type="button"
                              className="motion-action-btn"
                              onClick={(ev) => {
                                ev.stopPropagation();
                                openEditMotion(m);
                              }}
                              title="Edit motion"
                            >
                              Edit
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </>
              )}

              {concludedMotions.length > 0 && (
                <>
                  <div
                    className="motions-section-header"
                    style={{ marginTop: 8 }}
                  >
                    <strong>Concluded Motions</strong>
                  </div>
                  {concludedMotions.map((m) => (
                    <div key={m.id} className="motion-list-row">
                      <div
                        className={
                          "motion-list-item " +
                          (m.id === activeMotionId ? "motion-active" : "")
                        }
                        role="button"
                        tabIndex={0}
                        onClick={() => {
                          setActiveMotionId(m.id);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setActiveMotionId(m.id);
                          }
                        }}
                      >
                        <div className="motion-row-content">
                          <span className="motion-title">{m.title}</span>
                          <span
                            className={`status-pill status-${
                              m.state || "discussion"
                            }`}
                          >
                            {m.state || "discussion"}
                          </span>
                        </div>

                        {showManageMotions && amIManager && (
                          <div className="motion-action-row manage-internal">
                            <button
                              type="button"
                              className="motion-action-btn danger"
                              onClick={(ev) => {
                                ev.stopPropagation();
                                handleDeleteMotion(m.id);
                              }}
                              title="Delete motion"
                            >
                              Delete
                            </button>

                            <button
                              type="button"
                              className="motion-action-btn"
                              onClick={(ev) => {
                                ev.stopPropagation();
                                openEditMotion(m);
                              }}
                              title="Edit motion"
                            >
                              Edit
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </>
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

                {activeMotion?.state === "closed" && (
                  <div
                    className="view-tab-segment"
                    role="tablist"
                    aria-label="View"
                    style={{ marginTop: 8 }}
                  >
                    <button
                      type="button"
                      className={
                        "segment-btn " +
                        (viewTab === "discussion" ? "is-active" : "")
                      }
                      onClick={() => setMotionView("discussion")}
                      aria-pressed={viewTab === "discussion"}
                    >
                      Discussion
                    </button>
                    {activeMotion?.state === "closed" && (
                      <button
                        type="button"
                        className={
                          "segment-btn " +
                          (viewTab === "final" ? "is-active" : "") +
                          (finalBlink ? " is-blink" : "")
                        }
                        onClick={() => {
                          setMotionView("final");
                          setFinalBlink(false);
                        }}
                        aria-pressed={viewTab === "final"}
                      >
                        Final Decision
                      </button>
                    )}
                  </div>
                )}
              </div>
              {/* (tallies are shown in a larger panel below the thread) */}
            </header>

            {/* Toast notification removed */}

            {viewTab === "discussion" && (
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
                          <span
                            className="stance-dot-wrapper"
                            title={msg.stance}
                          >
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
            )}

            {/* Composer-facing status pill for non-closed states.
                Uses the same `decision-pill` class as the closed pill so sizing matches. */}
            {viewTab === "discussion" &&
              activeMotion &&
              activeMotion.state !== "closed" && (
                <div
                  className="composer-status"
                  style={{
                    marginTop: 8,
                    display: "flex",
                    justifyContent: "center",
                  }}
                >
                  <span
                    className={
                      "decision-pill is-" +
                      (activeMotion.state || "discussion") +
                      (showStatusPill ? "" : " is-hidden")
                    }
                  >
                    {(activeMotion.state === "discussion" &&
                      "Session is active") ||
                      (activeMotion.state === "paused" &&
                        "Session is paused") ||
                      (activeMotion.state === "voting" && "Voting is active") ||
                      ""}
                  </span>
                </div>
              )}

            {/* decision pill moved below the final tally panel */}

            {/* Final decision (moved below vote tally) will render after the tally */}

            {/* Large vote tally box (visible during voting or after closed) */}
            {viewTab === "discussion" &&
              (activeMotion.state === "voting" ||
                activeMotion.state === "closed") && (
                <div className="vote-tally-panel">
                  {(() => {
                    const votes = activeMotion?.votes || [];
                    const tally = computeTally(votes);
                    const myVote = votes.find(
                      (v) => v.voterId === me.id
                    )?.choice;
                    const votingOpen = activeMotion?.state === "voting";
                    const closed = activeMotion?.state === "closed";
                    return (
                      <>
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
                            <div className="vote-tally-num">
                              {tally.abstain}
                            </div>
                            <div className="vote-tally-label">Abstain</div>
                          </button>

                          <div className="vote-tally-state">
                            {closed ? "Final Tally" : "Live Tally"}
                          </div>
                        </div>

                        {closed && (
                          <div
                            className="decision-current"
                            style={{ marginTop: 8 }}
                          >
                            <span
                              className={
                                "decision-pill is-" +
                                (activeMotion.state || "closed") +
                                (showStatusPill ? "" : " is-hidden")
                              }
                            >
                              {activeMotion.decisionNote || "Session is closed"}
                            </span>
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              )}

            {/* Inline final-decision box removed from discussion view; final decision is shown via the segmented control's 'Final Decision' view. */}

            {viewTab === "discussion" ? (
              <form className={"discussion-composer "} onSubmit={handleSend}>
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
                          disabled={sessionClosed}
                          title={
                            sessionClosed
                              ? "Disabled — motion is closed"
                              : undefined
                          }
                        >
                          Pause Discussion
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            changeMotionState("voting");
                            setShowChairMenu(false);
                          }}
                          disabled={sessionClosed}
                          title={
                            sessionClosed
                              ? "Disabled — motion is closed"
                              : undefined
                          }
                        >
                          Move to Vote
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (!canChairClose) return;
                            handleCloseMotionNow(activeMotion?.id);
                          }}
                          disabled={!canChairClose}
                          title={
                            canChairClose
                              ? "Close motion"
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
                    sessionClosed
                      ? "Session closed"
                      : sessionPaused
                      ? "Session paused"
                      : activeMotion
                      ? `Write a comment for ${activeMotion.title}…`
                      : "Select a motion to comment"
                  }
                  disabled={sessionPaused || sessionClosed || !activeMotion}
                  aria-disabled={
                    sessionPaused || sessionClosed || !activeMotion
                  }
                  title={
                    sessionClosed
                      ? "Session closed"
                      : sessionPaused
                      ? "Session paused"
                      : undefined
                  }
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
                      disabled={sessionPaused || sessionClosed || !activeMotion}
                      aria-disabled={
                        sessionPaused || sessionClosed || !activeMotion
                      }
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
                      disabled={sessionPaused || sessionClosed || !activeMotion}
                      aria-disabled={
                        sessionPaused || sessionClosed || !activeMotion
                      }
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
                      disabled={sessionPaused || sessionClosed || !activeMotion}
                      aria-disabled={
                        sessionPaused || sessionClosed || !activeMotion
                      }
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
                  disabled={
                    sessionPaused ||
                    sessionClosed ||
                    !activeMotion ||
                    !input.trim()
                  }
                  aria-disabled={
                    sessionPaused ||
                    sessionClosed ||
                    !activeMotion ||
                    !input.trim()
                  }
                  title={
                    sessionClosed
                      ? "Session closed"
                      : sessionPaused
                      ? "Session paused"
                      : undefined
                  }
                >
                  <SendIcon />
                </button>
              </form>
            ) : (
              <div className={"discussion-composer final-decision-panel "}>
                {activeMotion?.decisionDetails ? (
                  <div className="final-decision-fullcard">
                    <h2 className="final-card-heading">
                      Final Decision for “{activeMotion.title}”
                    </h2>
                    <div className="final-card-body">
                      {editingDecision ? (
                        <form
                          className="decision-summary-form is-editing"
                          onSubmit={handleSaveEditedDecision}
                        >
                          <label className="decision-label">Outcome</label>
                          <div
                            className="outcome-options"
                            role="radiogroup"
                            aria-label="Outcome options"
                          >
                            {["Passed", "Failed", "Tied", "Deferred"].map(
                              (opt) => {
                                const variant = opt.toLowerCase();
                                const active = editDecisionOutcome === opt;
                                return (
                                  <button
                                    key={opt}
                                    type="button"
                                    className={`outcome-pill ${variant}${
                                      active ? " is-active" : ""
                                    }`}
                                    onClick={() => setEditDecisionOutcome(opt)}
                                    aria-pressed={active}
                                  >
                                    {opt}
                                  </button>
                                );
                              }
                            )}
                          </div>

                          <label className="decision-label">Summary</label>
                          <textarea
                            value={editDecisionSummary}
                            onChange={(e) =>
                              setEditDecisionSummary(e.target.value)
                            }
                            rows={4}
                          />

                          <label className="decision-label">
                            Pros (one per line)
                          </label>
                          <textarea
                            value={editDecisionPros}
                            onChange={(e) =>
                              setEditDecisionPros(e.target.value)
                            }
                            rows={3}
                          />

                          <label className="decision-label">
                            Cons (one per line)
                          </label>
                          <textarea
                            value={editDecisionCons}
                            onChange={(e) =>
                              setEditDecisionCons(e.target.value)
                            }
                            rows={3}
                          />

                          <div className="decision-summary-actions">
                            <button
                              type="button"
                              className="btn-secondary"
                              onClick={handleCancelEditDecision}
                              disabled={savingEditDecision}
                            >
                              Cancel
                            </button>
                            <button
                              type="submit"
                              className="btn-primary"
                              disabled={savingEditDecision}
                            >
                              {savingEditDecision ? "Saving…" : "Save"}
                            </button>
                          </div>
                        </form>
                      ) : (
                        <div className="decision-card">
                          <div className="final-outcome-row">
                            <strong>Outcome:</strong>
                            <div className="final-outcome">
                              {(() => {
                                const outcomeText =
                                  activeMotion.decisionDetails?.outcome ||
                                  computeOutcome(activeMotion?.votes || []);
                                const cls = outcomeClassFromText(outcomeText);
                                return (
                                  <span className={`outcome-pill ${cls}`}>
                                    {outcomeText}
                                  </span>
                                );
                              })()}
                            </div>
                          </div>

                          <div className="final-summary">
                            <h4>Summary</h4>
                            <div>
                              {activeMotion.decisionDetails?.summary || (
                                <em>No summary recorded.</em>
                              )}
                            </div>
                          </div>

                          {/* overturn button moved to card bottom */}

                          <div className="final-pros-cons">
                            <div>
                              <h4>Pros</h4>
                              {activeMotion.decisionDetails?.pros?.length >
                              0 ? (
                                <ul>
                                  {activeMotion.decisionDetails.pros.map(
                                    (p, i) => (
                                      <li key={`fp-${i}`}>{p}</li>
                                    )
                                  )}
                                </ul>
                              ) : (
                                <div className="empty-thread">
                                  None recorded.
                                </div>
                              )}
                            </div>
                            <div>
                              <h4>Cons</h4>
                              {activeMotion.decisionDetails?.cons?.length >
                              0 ? (
                                <ul>
                                  {activeMotion.decisionDetails.cons.map(
                                    (c, i) => (
                                      <li key={`fc-${i}`}>{c}</li>
                                    )
                                  )}
                                </ul>
                              ) : (
                                <div className="empty-thread">
                                  None recorded.
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="final-overturn-row">
                            <button
                              type="button"
                              className="propose-overturn-btn"
                              onClick={handleProposeOverturn}
                              disabled={!userVotedYes}
                              aria-disabled={!userVotedYes}
                              title={
                                userVotedYes
                                  ? "Propose a motion to overturn this decision"
                                  : "Only members who voted for this decision may propose an overturn"
                              }
                            >
                              Propose motion to overturn this decision
                            </button>
                            <div className="overturn-hint" aria-hidden>
                              Only members who voted in favor may propose an
                              overturn.
                            </div>
                          </div>
                        </div>
                      )}

                      <div className="final-tally">
                        <h4>Final Tally</h4>
                        {(() => {
                          const votes = activeMotion?.votes || [];
                          const tally = computeTally(votes);
                          // render the same vote-tally-panel used in Discussion, but non-interactive
                          return (
                            <div className="vote-tally-panel">
                              <div className="vote-tally-inner">
                                <div
                                  className={
                                    "vote-tally-choice " +
                                    (false ? "is-active" : "")
                                  }
                                  aria-hidden={true}
                                >
                                  <div className="vote-tally-num">
                                    {tally.yes}
                                  </div>
                                  <div className="vote-tally-label">Yes</div>
                                </div>

                                <div
                                  className={
                                    "vote-tally-choice " +
                                    (false ? "is-active" : "")
                                  }
                                  aria-hidden={true}
                                >
                                  <div className="vote-tally-num">
                                    {tally.no}
                                  </div>
                                  <div className="vote-tally-label">No</div>
                                </div>

                                <div
                                  className={
                                    "vote-tally-choice " +
                                    (false ? "is-active" : "")
                                  }
                                  aria-hidden={true}
                                >
                                  <div className="vote-tally-num">
                                    {tally.abstain}
                                  </div>
                                  <div className="vote-tally-label">
                                    Abstain
                                  </div>
                                </div>

                                <div className="vote-tally-state">
                                  Final Tally
                                </div>
                              </div>
                            </div>
                          );
                        })()}
                      </div>

                      {/* Status indicator intentionally hidden in Final Decision view */}

                      <div style={{ marginTop: 12, textAlign: "right" }}>
                        {amIManager && !editingDecision && (
                          <>
                            <button
                              type="button"
                              className="decision-edit-btn"
                              onClick={handleStartEditDecision}
                            >
                              Edit
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div>
                    {amIManager ? (
                      <form
                        className="decision-summary-form"
                        onSubmit={handleSaveDecisionSummary}
                      >
                        <label className="decision-label">Outcome</label>
                        <div
                          className="outcome-options"
                          role="radiogroup"
                          aria-label="Outcome options"
                        >
                          {["Passed", "Failed", "Tied", "Deferred"].map(
                            (opt) => {
                              const variant = opt.toLowerCase();
                              const active = decisionOutcome === opt;
                              return (
                                <button
                                  key={opt}
                                  type="button"
                                  className={`outcome-pill ${variant}${
                                    active ? " is-active" : ""
                                  }`}
                                  onClick={() => setDecisionOutcome(opt)}
                                  aria-pressed={active}
                                >
                                  {opt}
                                </button>
                              );
                            }
                          )}
                        </div>

                        <label className="decision-label">Summary</label>
                        <textarea
                          value={decisionSummary}
                          onChange={(e) => setDecisionSummary(e.target.value)}
                          rows={4}
                        />

                        <label className="decision-label">
                          Pros (one per line)
                        </label>
                        <textarea
                          value={decisionPros}
                          onChange={(e) => setDecisionPros(e.target.value)}
                          rows={3}
                        />

                        <label className="decision-label">
                          Cons (one per line)
                        </label>
                        <textarea
                          value={decisionCons}
                          onChange={(e) => setDecisionCons(e.target.value)}
                          rows={3}
                        />

                        <div className="decision-summary-actions">
                          <button
                            type="button"
                            className="btn-secondary"
                            onClick={() => {
                              setDecisionSummary("");
                              setDecisionPros("");
                              setDecisionCons("");
                              setDecisionOutcome("");
                            }}
                            disabled={savingDecision}
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            className="btn-primary"
                            disabled={savingDecision}
                          >
                            {savingDecision ? "Saving…" : "Save"}
                          </button>
                        </div>
                      </form>
                    ) : (
                      <div className="empty-thread">
                        No final decision recorded.
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
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
