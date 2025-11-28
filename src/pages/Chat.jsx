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

/* ---------- meeting helpers ---------- */
function yyyyMmDd(d = new Date()) {
  try {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  } catch (e) {
    try {
      return new Date().toISOString().slice(0, 10);
    } catch (err) {
      return "";
    }
  }
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
  const [submotionCollapsed, setSubmotionCollapsed] = React.useState({});

  const toggleSubmotions = (parentId, ev) => {
    if (ev && ev.stopPropagation) ev.stopPropagation();
    setSubmotionCollapsed((s) => ({ ...s, [parentId]: !s[parentId] }));
  };
  const { id } = useParams(); // committee id
  const committee = findCommitteeById(id);
  const [motions, setMotions] = useState(() =>
    committee ? loadMotionsForCommittee(committee.id) : []
  );
  const [activeMotionId, setActiveMotionId] = useState(
    () => motions[0]?.id || null
  );
  const [input, setInput] = useState("");
  const toggleCarryOverForMotion = (motionId) => {
    if (!amIManager) return;
    const updated = (motions || []).map((m) => {
      if (m.id !== motionId) return m;
      const nextCarry = !m.carryOver;
      // When marking a motion as carried-over/unfinished, associate it
      // with the previous meeting so it appears in the "Unfinished"
      // section (which filters motions by meetingId === previousMeetingId).
      const meetingId = nextCarry
        ? previousMeetingId || currentMeetingId
        : undefined;
      return {
        ...m,
        carryOver: nextCarry,
        meetingId,
      };
    });
    setMotions(updated);
    saveMotionsForCommittee(committee.id, updated);
  };
  const scrollRef = useRef(null);
  const [showManagePanel, setShowManagePanel] = useState(false);
  const [memberInput, setMemberInput] = useState("");
  const [newMemberRole, setNewMemberRole] = useState("member");
  //  force re-read of committee from localStorage after edits
  const [membersRev, setMembersRev] = useState(0);
  // collapse participants on narrow screens to save vertical space
  const initialMembersCollapsed =
    typeof window !== "undefined"
      ? (() => {
          try {
            const key = committee
              ? `committee:${committee.id}:membersCollapsed`
              : "ui:membersCollapsed";
            const raw = localStorage.getItem(key);
            if (raw !== null) return raw === "true";
          } catch (e) {}
          // default to visible on reloads
          return false;
        })()
      : false;
  const [membersCollapsed, setMembersCollapsed] = useState(
    initialMembersCollapsed
  );
  // collapse motions on narrow screens (parity with participants)
  const initialMotionsCollapsed =
    typeof window !== "undefined"
      ? (() => {
          try {
            const key = committee
              ? `committee:${committee.id}:motionsCollapsed`
              : "ui:motionsCollapsed";
            const raw = localStorage.getItem(key);
            if (raw !== null) return raw === "true";
          } catch (e) {}
          // default to visible on reloads
          return false;
        })()
      : false;
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
  // submotion helpers: target motion and type ('revision' | 'postpone')
  const [submotionTarget, setSubmotionTarget] = useState(null);
  const [submotionType, setSubmotionType] = useState(null);
  // postpone submotion choices
  const [postponeOption, setPostponeOption] = useState("next_meeting");
  const [postponeDateTime, setPostponeDateTime] = useState("");
  // Meeting tracking for unfinished business (scoped per committee, with legacy fallback)
  const [currentMeetingId, setCurrentMeetingId] = useState(() =>
    typeof window !== "undefined" && committee
      ? localStorage.getItem(`committee:${committee.id}:currentMeetingId`) ||
        localStorage.getItem("currentMeetingId") ||
        String(Date.now())
      : String(Date.now())
  );
  const [previousMeetingId, setPreviousMeetingId] = useState(() =>
    typeof window !== "undefined" && committee
      ? localStorage.getItem(`committee:${committee.id}:previousMeetingId`) ||
        localStorage.getItem("previousMeetingId") ||
        null
      : null
  );
  const [currentMeetingSeq, setCurrentMeetingSeq] = useState(() => {
    if (typeof window === "undefined" || !committee) return 0;
    const scoped = parseInt(
      localStorage.getItem(`committee:${committee.id}:currentMeetingSeq`) || "",
      10
    );
    const legacy = parseInt(
      localStorage.getItem("currentMeetingSeq") || "",
      10
    );
    return Number.isFinite(scoped)
      ? scoped
      : Number.isFinite(legacy)
      ? legacy
      : 0;
  });
  const [meetingActive, setMeetingActive] = useState(() =>
    typeof window !== "undefined" && committee
      ? localStorage.getItem(`committee:${committee.id}:meetingActive`) ===
        "true"
      : false
  );
  const [currentMeetingDate, setCurrentMeetingDate] = useState(() =>
    typeof window !== "undefined" && committee
      ? localStorage.getItem(`committee:${committee.id}:currentMeetingDate`) ||
        null
      : null
  );
  // small flip animation when the meeting button toggles
  const [meetingFlipAnim, setMeetingFlipAnim] = useState(false);
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
  // refer submotion: selected destination committee id
  const [referDestId, setReferDestId] = useState("");
  const [allCommittees, setAllCommittees] = useState([]);
  // special motions: meeting-level procedural flags and transient banner
  const [meetingRecessed, setMeetingRecessed] = useState(false);
  // removed: other specials not used per current scope
  const [specialBanner, setSpecialBanner] = useState("");
  const clearSpecialBannerSoon = () => {
    if (!specialBanner) return;
    const t = setTimeout(() => setSpecialBanner(""), 8000);
    return () => clearTimeout(t);
  };
  // Start an Objection to Consideration vote (only on main motion with no comments)
  const startObjectionVote = () => {
    if (!activeMotion || meetingRecessed) return;
    const isSub = !!(activeMotion.meta && activeMotion.meta.kind === "sub");
    const hasComments = (activeMotion.messages || []).length > 0;
    const inProgress = (activeMotion.state || "discussion") === "discussion";
    if (isSub || hasComments || !inProgress) return;
    const targetId = activeMotion.id;
    const next = (motions || []).map((m) => {
      if (m.id !== targetId) return m;
      const meta = m.meta ? { ...m.meta } : {};
      meta.specialVote = { type: "otc", startedAt: new Date().toISOString() };
      return { ...m, state: "voting", votes: [], meta };
    });
    setMotions(next);
    saveMotionsForCommittee(committee.id, next);
    setActiveMotionId(targetId);
    setShowChairMenu(false);
  };

  const finalizeObjectionVote = () => {
    if (!activeMotion) return;
    const target = motions.find((m) => m.id === activeMotion.id);
    if (!target) return;
    const isOTC =
      target.meta &&
      target.meta.specialVote &&
      target.meta.specialVote.type === "otc";
    if (!isOTC || target.state !== "voting") return;
    const tally = computeTally(target.votes || []);
    const passed = tally.yes > tally.no; // decide by simple majority
    const next = (motions || []).map((m) => {
      if (m.id !== target.id) return m;
      const meta = m.meta ? { ...m.meta } : {};
      delete meta.specialVote;
      if (passed) {
        return {
          ...m,
          state: "closed",
          decisionNote: "Closed (object to consideration)",
          meta: { ...meta, closedBy: "otc" },
        };
      }
      return { ...m, state: "discussion", meta };
    });
    setMotions(next);
    saveMotionsForCommittee(committee.id, next);
    setShowChairMenu(false);
  };

  // helper: detect motions closed by Objection to Consideration
  const isOtcClosed = (motion) => {
    if (!motion) return false;
    if ((motion.state || "") !== "closed") return false;
    if (motion.meta && motion.meta.closedBy === "otc") return true;
    const note = (motion.decisionNote || motion.decisionDetails?.summary || "")
      .toString()
      .toLowerCase();
    return (
      note.includes("object to consideration") ||
      note.includes("objected to consideration")
    );
  };
  // toast notification for saves (removed)

  // find active motion object
  const activeMotion = motions.find((m) => m.id === activeMotionId) || null;
  const otcClosed = isOtcClosed(activeMotion);
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

  // persist membersCollapsed preference per-committee
  useEffect(() => {
    try {
      if (!committee) return;
      const key = `committee:${committee.id}:membersCollapsed`;
      localStorage.setItem(key, membersCollapsed ? "true" : "false");
    } catch (e) {}
  }, [membersCollapsed, committee?.id]);

  // persist motionsCollapsed preference per-committee
  useEffect(() => {
    try {
      if (!committee) return;
      const key = `committee:${committee.id}:motionsCollapsed`;
      localStorage.setItem(key, motionsCollapsed ? "true" : "false");
    } catch (e) {}
  }, [motionsCollapsed, committee?.id]);

  // animate the meeting toggle button briefly when state changes
  useEffect(() => {
    setMeetingFlipAnim(true);
    const t = setTimeout(() => setMeetingFlipAnim(false), 280);
    return () => clearTimeout(t);
  }, [meetingActive]);

  // persist meeting state (per-committee), also write legacy keys for compatibility
  useEffect(() => {
    if (!committee) return;
    try {
      localStorage.setItem(
        `committee:${committee.id}:currentMeetingId`,
        currentMeetingId || ""
      );
      localStorage.setItem(
        `committee:${committee.id}:previousMeetingId`,
        previousMeetingId || ""
      );
      localStorage.setItem(
        `committee:${committee.id}:currentMeetingSeq`,
        String(currentMeetingSeq || 0)
      );
      localStorage.setItem(
        `committee:${committee.id}:meetingActive`,
        meetingActive ? "true" : "false"
      );
      if (currentMeetingDate) {
        localStorage.setItem(
          `committee:${committee.id}:currentMeetingDate`,
          currentMeetingDate
        );
      }
      // legacy/global keys
      localStorage.setItem("currentMeetingId", currentMeetingId || "");
      localStorage.setItem("currentMeetingSeq", String(currentMeetingSeq || 0));
      if (previousMeetingId !== null) {
        localStorage.setItem("previousMeetingId", previousMeetingId || "");
      }
    } catch (e) {
      // ignore storage errors
    }
  }, [
    committee?.id,
    currentMeetingId,
    previousMeetingId,
    currentMeetingSeq,
    meetingActive,
    currentMeetingDate,
  ]);

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

  // Implicit daily meeting auto-start: first time chair opens committee page that day
  useEffect(() => {
    if (!committee || !amIManager) return;
    const today = yyyyMmDd(new Date());
    // Start a new meeting if none active for today
    if (!meetingActive) {
      setPreviousMeetingId(currentMeetingId || null);
      setCurrentMeetingId(String(Date.now()));
      setCurrentMeetingDate(today);
      setCurrentMeetingSeq((s) => (Number.isFinite(s) ? s + 1 : 1));
      setMeetingActive(true);
      return;
    }
    // If active but date is from a prior day, roll to a new meeting id
    if (meetingActive && currentMeetingDate && currentMeetingDate !== today) {
      setPreviousMeetingId(currentMeetingId || null);
      setCurrentMeetingId(String(Date.now()));
      setCurrentMeetingDate(today);
      setCurrentMeetingSeq((s) => (Number.isFinite(s) ? s + 1 : 1));
    }
  }, [committee?.id, amIManager]);

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

  // Hide chair menu when switching active motion (e.g., user clicks another motion)
  useEffect(() => {
    if (showChairMenu && amIManager) setShowChairMenu(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMotionId]);

  const handleRemoveMember = (memberId) => {
    const ownerId = committee.ownerId || committee.owner;
    if (ownerId && memberId === ownerId) return; // cannot remove owner
    const next = (members || []).filter((m) => m.id !== memberId);
    persistMembers(next);
  };

  const handleSend = (e) => {
    e && e.preventDefault();

    if (!input.trim() || !activeMotion) return;
    if (meetingRecessed) return; // no discussion during recess
    if ((activeMotion.state || "discussion") === "postponed") return; // disable comments for postponed

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

  const handleOpenSubmotion = (type, targetMotion) => {
    // prefer explicit target, then currently active motion, then first active motion
    const target =
      targetMotion || activeMotion || (activeMotions && activeMotions[0]);
    if (!target) {
      alert("Select an active motion to create a submotion.");
      return;
    }
    setEditingMotionId(null);
    setSubmotionTarget(target);
    setSubmotionType(type);
    // Prefill title and description to keep context for the user.
    const baseTitle = (target.title || "").toString().trim();
    // strip only 'revision to' and 'postpone:' prefixes to avoid double-prefixing
    const stripped =
      baseTitle.replace(/^(revision to\s*|postpone:\s*)/i, "").trim() ||
      baseTitle;
    if (type === "revision") {
      setNewMotionTitle(`Revision to ${stripped}`);
    } else if (type === "postpone") {
      // keep a short Postpone prefix but strip duplicates
      // also remove a leading 'to ' to avoid titles like 'Postpone: to ...'
      const withoutTo = stripped.replace(/^to\s+/i, "");
      setNewMotionTitle(`Postpone: ${withoutTo}`);
    } else if (type === "refer") {
      setNewMotionTitle(`Refer: ${stripped}`);
    }
    // Prefill description differently for revision vs postpone.
    if (type === "revision") {
      // Keep revision description minimal per request.
      setNewMotionDesc("Proposed change: ");
    } else if (type === "postpone") {
      setNewMotionDesc(`This is a postponement of "${target.title}".`);
      // reset postpone option fields when opening a postpone submotion
      setPostponeOption("next_meeting");
      setPostponeDateTime("");
    } else if (type === "refer") {
      // Prefill a minimal refer description; detailed fields collected in modal
      setNewMotionDesc(
        `Refer "${target.title}" to a committee (simple majority).`
      );
      try {
        const list = (loadCommittees() || []).filter(
          (c) => c.id !== committee.id
        );
        setAllCommittees(list);
        setReferDestId("");
      } catch (e) {
        setAllCommittees([]);
        setReferDestId("");
      }
    }
    setShowAddModal(true);
  };

  const handleCreateMotion = (e) => {
    e && e.preventDefault();
    const title = newMotionTitle.trim();
    if (!title) return;
    const desc = newMotionDesc.trim();
    if (editingMotionId) {
      const updated = motions.map((m) => {
        if (m.id !== editingMotionId) return m;
        // preserve existing meta but allow updating postpone fields when editing a postpone submotion
        const meta = m.meta ? { ...m.meta } : undefined;
        if (meta && meta.kind === "sub" && meta.subType === "postpone") {
          meta.postponeOption = postponeOption || meta.postponeOption;
          if (postponeOption === "specific" && postponeDateTime) {
            try {
              meta.resumeAt = new Date(postponeDateTime).toISOString();
            } catch (err) {
              meta.resumeAt = postponeDateTime;
            }
          } else {
            meta.resumeAt =
              meta.postponeOption || postponeOption || meta.resumeAt;
          }
        }
        return { ...m, title, description: desc, meta };
      });
      setMotions(updated);
      saveMotionsForCommittee(committee.id, updated);
      setShowAddModal(false);
      setEditingMotionId(null);
      setNewMotionTitle("");
      setNewMotionDesc("");
      setOverturnTarget(null);
      setSubmotionTarget(null);
      setSubmotionType(null);
      setPostponeOption("next_meeting");
      setPostponeDateTime("");
    } else {
      const meta = overturnTarget
        ? { overturnOf: overturnTarget.id }
        : submotionTarget
        ? { submotionOf: submotionTarget.id, submotionType }
        : undefined;

      const newMotion = {
        id: crypto.randomUUID
          ? crypto.randomUUID()
          : Math.random().toString(36).slice(2, 10),
        title,
        description: desc,
        state: "discussion",
        messages: [],
        decisionLog: [],
        // normalize meta for submotions to a consistent internal shape
        meta: meta
          ? {
              ...(meta.submotionOf ? {} : meta),
              // if we used the older submotion shape, convert it
              ...(meta.submotionOf
                ? {
                    kind: "sub",
                    subType: meta.submotionType,
                    parentMotionId: meta.submotionOf,
                  }
                : {}),
              // allow explicit meta.kind/subType/parentMotionId
              ...(meta.kind ? meta : {}),
              // Refer submotion default attributes per RONR
              ...(submotionType === "refer"
                ? {
                    requiresSecond: true,
                    debatable: true,
                    amendable: true,
                  }
                : {}),
            }
          : undefined,
      };
      // If this is a postpone submotion, record the parent's current state
      if (
        submotionTarget &&
        submotionType === "postpone" &&
        newMotion.meta &&
        newMotion.meta.kind === "sub"
      ) {
        newMotion.meta.parentPreviousState = submotionTarget.state;
        // record the chair's chosen postpone option and optional date/time
        newMotion.meta.postponeOption = postponeOption;
        if (postponeOption === "specific" && postponeDateTime) {
          try {
            newMotion.meta.resumeAt = new Date(postponeDateTime).toISOString();
          } catch (err) {
            newMotion.meta.resumeAt = postponeDateTime;
          }
        } else if (postponeOption === "after_unfinished") {
          // explicit structured info for 'after unfinished business' position
          newMotion.meta.postponeInfo = {
            type: "agendaPosition",
            position: "afterUnfinishedBusiness",
            meetingId: currentMeetingId,
          };
          // ensure resumeAt is not set for this agenda position
          delete newMotion.meta.resumeAt;
        } else {
          newMotion.meta.resumeAt = postponeOption;
        }
      } else if (
        submotionTarget &&
        submotionType === "refer" &&
        newMotion.meta &&
        newMotion.meta.kind === "sub"
      ) {
        // capture parent state to restore if referral fails
        newMotion.meta.parentPreviousState = submotionTarget.state;
        // Destination must be an existing committee
        if (!referDestId) {
          alert("Select a destination committee to refer to.");
          return;
        }
        const dest = (allCommittees || []).find((c) => c.id === referDestId);
        newMotion.meta.referDetails = {
          destinationCommitteeId: referDestId,
          destinationCommitteeName: dest?.name || referDestId,
          // keep a simple default rule set for record-keeping
          requiresSecond: true,
          debatable: true,
          amendable: true,
        };
      }
      const updated = [newMotion, ...motions];
      setMotions(updated);
      saveMotionsForCommittee(committee.id, updated);
      setActiveMotionId(newMotion.id);
      setMotionView("discussion", newMotion.id);
      setShowAddModal(false);
      setNewMotionTitle("");
      setNewMotionDesc("");
      setOverturnTarget(null);
      setSubmotionTarget(null);
      setSubmotionType(null);
    }
  };

  const handleCancelCreateMotion = () => {
    setShowAddModal(false);
    setEditingMotionId(null);
    setNewMotionTitle("");
    setNewMotionDesc("");
    setOverturnTarget(null);
    setSubmotionTarget(null);
    setSubmotionType(null);
    setPostponeOption("next_meeting");
    setPostponeDateTime("");
  };

  const openEditMotion = (motion) => {
    if (!motion) return;
    setEditingMotionId(motion.id);
    setNewMotionTitle(motion.title || "");
    setNewMotionDesc(motion.description || "");
    // If editing a postpone submotion, prefill postpone controls
    try {
      const meta = motion.meta || {};
      if (meta.kind === "sub" && meta.subType === "postpone") {
        setSubmotionType("postpone");
        const parent =
          motions.find((mm) => mm.id === meta.parentMotionId) || null;
        setSubmotionTarget(parent);
        if (meta.postponeOption) setPostponeOption(meta.postponeOption);
        if (meta.resumeAt) {
          const parsed = Date.parse(meta.resumeAt);
          if (!isNaN(parsed)) {
            const d = new Date(parsed);
            const pad = (n) => String(n).padStart(2, "0");
            const local = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(
              d.getDate()
            )}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
            setPostponeDateTime(local);
            setPostponeOption("specific");
          } else {
            setPostponeDateTime("");
            setPostponeOption(
              meta.resumeAt || meta.postponeOption || "next_meeting"
            );
          }
        } else {
          setPostponeDateTime("");
        }
      } else {
        setSubmotionType(motion.meta?.subType || null);
      }
    } catch (err) {
      setSubmotionType(motion.meta?.subType || null);
    }
    setShowAddModal(true);
  };

  const handleDeleteMotion = (motionId) => {
    const ok = window.confirm("Delete this motion? This cannot be undone.");
    if (!ok) return false;
    const updated = motions.filter((m) => m.id !== motionId);
    setMotions(updated);
    saveMotionsForCommittee(committee.id, updated);
    if (activeMotionId === motionId) {
      const nextActive = updated[0]?.id || null;
      setActiveMotionId(nextActive);
      setMotionView("discussion", nextActive);
    }
    return true;
  };

  const changeMotionState = (next) => {
    if (!activeMotion) return;
    if (meetingRecessed) return; // cannot change motion during recess
    const updated = motions.map((m) => {
      if (m.id !== activeMotion.id) return m;
      const noteMap = {
        discussion: "Session has resumed",
        paused: "Session is paused",
        voting: "Session has moved to vote",
        closed: "Session is closed",
      };
      const nextMeta = m.meta ? { ...m.meta } : undefined;
      if (nextMeta && nextMeta.postponementLiftedAt) {
        // hide any temporary resumed indicator on next state change
        delete nextMeta.postponementLiftedAt;
      }
      return {
        ...m,
        state: next,
        votes: next === "voting" ? m.votes || [] : m.votes || [],
        decisionNote: noteMap[next] || `State changed to ${next}`,
        meta: nextMeta,
      };
    });
    setMotions(updated);
    saveMotionsForCommittee(committee.id, updated);
  };

  // Start a meeting: create a new meeting id, set today's date, mark active
  const handleStartMeeting = () => {
    if (!amIManager) return;
    const newId = String(Date.now());
    const newSeq = (currentMeetingSeq || 0) + 1;
    setPreviousMeetingId(currentMeetingId || null);
    setCurrentMeetingId(newId);
    setCurrentMeetingDate(yyyyMmDd(new Date()));
    setCurrentMeetingSeq(newSeq);
    setMeetingActive(true);

    // Normalize and lift any motions postponed to "next meeting"
    try {
      const updated = (motions || []).map((m) => {
        if ((m.state || "").toString() !== "postponed") return m;
        const meta = m.meta ? { ...m.meta } : {};
        const info = meta.postponeInfo;
        const isNextMeetingInfo =
          info &&
          ((info.type === "meeting" &&
            Number(info.targetMeetingSeq) === Number(newSeq)) ||
            (info.type === "agendaPosition" &&
              info.position === "next_meeting"));
        const isLegacyNext =
          !info &&
          (meta.resumeAt === "next_meeting" ||
            meta.postponeOption === "next_meeting");

        if (!isNextMeetingInfo && !isLegacyNext) return m;

        // If legacy shape, convert to explicit meeting target for this new meeting
        if (!info || info.type !== "meeting") {
          meta.postponeInfo = {
            type: "meeting",
            targetMeetingSeq: Number(newSeq),
          };
        }
        const prevState = meta.postponePrevState;
        const restoreState = ["discussion", "voting", "paused"].includes(
          prevState
        )
          ? prevState
          : "discussion";
        delete meta.postponeInfo;
        delete meta.postponePrevState;
        if (meta.resumeAt === "next_meeting") delete meta.resumeAt;
        if (meta.postponeOption === "next_meeting") delete meta.postponeOption;
        meta.postponementLiftedAt = new Date().toISOString();
        return { ...m, state: restoreState, decisionNote: undefined, meta };
      });
      setMotions(updated);
      saveMotionsForCommittee(committee.id, updated);
    } catch (e) {
      // ignore
    }
  };

  // End a meeting: mark ongoing motions to carry over; stop meeting
  const handleEndMeeting = () => {
    if (!amIManager) return;
    // Mark eligible motions as carry-over (unfinished business)
    const updated = (motions || []).map((m) => {
      const st = (m.state || "discussion").toString();
      const eligible = [
        "discussion",
        "paused",
        "voting",
        "in_progress",
      ].includes(st);
      const excluded = st === "postponed" || st === "closed";
      if (eligible && !excluded) {
        return { ...m, carryOver: true, meetingId: currentMeetingId };
      }
      return m;
    });
    setMotions(updated);
    saveMotionsForCommittee(committee.id, updated);

    // finalize meeting flags
    setMeetingActive(false);
    setPreviousMeetingId(currentMeetingId || null);
    // keep currentMeetingId until next start; date stays as last meeting date
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
    // Build the decision detail for the active motion
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

    // First, update the active motion with its decision details
    let updated = motions.map((m) =>
      m.id === activeMotion.id
        ? {
            ...m,
            decisionDetails: detail,
            decisionLog: Array.isArray(m.decisionLog)
              ? [...m.decisionLog, detail]
              : [detail],
          }
        : m
    );

    // If this was a submotion, apply its effect to the parent (postpone or refer)
    try {
      const am = activeMotion;
      const meta = am?.meta;
      const isSub = meta && meta.kind === "sub";
      const isPostponeSub = isSub && meta.subType === "postpone";
      const isReferSub = isSub && meta.subType === "refer";
      if ((isPostponeSub || isReferSub) && meta.parentMotionId) {
        // determine resolved outcome text
        const resolvedOutcome =
          (decisionOutcome && decisionOutcome) ||
          computeOutcome(am.votes || []);
        const passed = /pass|adopt/i.test(resolvedOutcome);
        const parentId = meta.parentMotionId;
        updated = updated.map((m) => {
          if (m.id !== parentId) return m;
          if (passed && isPostponeSub) {
            // compute structured postpone info to attach to parent if available
            const parentMeta = m.meta ? { ...m.meta } : {};
            if (meta.postponeInfo) {
              parentMeta.postponeInfo = meta.postponeInfo;
            } else if (meta.postponeOption === "specific" && meta.resumeAt) {
              parentMeta.postponeInfo = { type: "dateTime", at: meta.resumeAt };
            } else if (meta.postponeOption) {
              if (meta.postponeOption === "next_meeting") {
                parentMeta.postponeInfo = {
                  type: "meeting",
                  targetMeetingSeq: (currentMeetingSeq || 0) + 1,
                };
              } else {
                parentMeta.postponeInfo = {
                  type: "agendaPosition",
                  position: meta.postponeOption,
                  meetingId: currentMeetingId,
                };
              }
            }
            // capture previous state for later lifting
            parentMeta.postponePrevState = m.state;
            return {
              ...m,
              state: "postponed",
              decisionNote: "Postponed by submotion",
              meta: parentMeta,
            };
          } else if (passed && isReferSub) {
            // Move the parent motion to the destination committee
            const destId = meta?.referDetails?.destinationCommitteeId;
            const destName =
              meta?.referDetails?.destinationCommitteeName ||
              "destination committee";
            const originId = committee.id;
            const originName = committee.name || originId;
            const parentMeta = m.meta ? { ...m.meta } : {};
            parentMeta.referInfo = {
              toCommitteeId: destId,
              toCommitteeName: destName,
              referredAt: new Date().toISOString(),
              fromCommitteeId: originId,
              fromCommitteeName: originName,
              meetingId: currentMeetingId,
            };
            // Save referred copy into destination (inactive until taken up)
            try {
              if (destId) {
                const destMotions = loadMotionsForCommittee(destId) || [];
                const moved = {
                  ...m,
                  state: "discussion",
                  decisionNote: "Received by referral",
                  messages: [],
                  votes: [],
                  carryOver: false,
                  meetingId: undefined,
                  meta: {
                    ...(m.meta || {}),
                    referredFrom: {
                      committeeId: originId,
                      committeeName: originName,
                      referredAt: new Date().toISOString(),
                    },
                    // clear postpone flags that don't carry across
                    postponeInfo: undefined,
                    postponePrevState: undefined,
                  },
                };
                const nextList = [moved, ...destMotions];
                saveMotionsForCommittee(destId, nextList);
              }
            } catch (e) {}
            // Close in the source committee for record-keeping
            return {
              ...m,
              state: "closed",
              decisionNote: `Referred to ${destName}`,
              meta: parentMeta,
              carryOver: false,
              meetingId: undefined,
            };
          } else {
            // restore prior state if it was captured, otherwise leave as-is
            const prev = meta.parentPreviousState || m.state;
            return { ...m, state: prev };
          }
        });
      }
    } catch (err) {
      // ignore and continue
    }

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
  useEffect(() => {
    try {
      const am = activeMotion;
      if (!am) return;
      const meta = am.meta;
      const isSub = meta && meta.kind === "sub";
      const isPostponeSub = isSub && meta.subType === "postpone";
      const isReferSub = isSub && meta.subType === "refer";
      if (!isSub || !meta.parentMotionId) return;
      if (am.state !== "closed") return;
      if (meta.postponementApplied) return; // already applied

      const resolvedOutcome =
        (am.decisionDetails && am.decisionDetails.outcome) ||
        computeOutcome(am.votes || []);
      const passed = /pass|adopt/i.test(resolvedOutcome);
      const parentId = meta.parentMotionId;

      const next = motions.map((m) => {
        if (m.id === parentId) {
          if (passed && isPostponeSub) {
            const parentMeta = m.meta ? { ...m.meta } : {};
            if (meta.postponeInfo) {
              parentMeta.postponeInfo = meta.postponeInfo;
            } else if (meta.postponeOption === "specific" && meta.resumeAt) {
              parentMeta.postponeInfo = { type: "dateTime", at: meta.resumeAt };
            } else if (meta.postponeOption) {
              if (meta.postponeOption === "next_meeting") {
                parentMeta.postponeInfo = {
                  type: "meeting",
                  targetMeetingSeq: (currentMeetingSeq || 0) + 1,
                };
              } else {
                parentMeta.postponeInfo = {
                  type: "agendaPosition",
                  position: meta.postponeOption,
                  meetingId: currentMeetingId,
                };
              }
            }
            parentMeta.postponePrevState = m.state;
            return {
              ...m,
              state: "postponed",
              decisionNote: "Postponed by submotion",
              meta: parentMeta,
            };
          } else if (passed && isReferSub) {
            // Apply referral by moving the parent motion to the destination committee
            const destId = meta?.referDetails?.destinationCommitteeId;
            const destName =
              meta?.referDetails?.destinationCommitteeName ||
              "destination committee";
            const originId = committee.id;
            const originName = committee.name || originId;
            const parentMeta = m.meta ? { ...m.meta } : {};
            parentMeta.referInfo = {
              toCommitteeId: destId,
              toCommitteeName: destName,
              referredAt: new Date().toISOString(),
              fromCommitteeId: originId,
              fromCommitteeName: originName,
              meetingId: currentMeetingId,
            };
            try {
              if (destId) {
                const destMotions = loadMotionsForCommittee(destId) || [];
                const moved = {
                  ...m,
                  state: "discussion",
                  decisionNote: "Received by referral",
                  messages: [],
                  votes: [],
                  carryOver: false,
                  meetingId: undefined,
                  meta: {
                    ...(m.meta || {}),
                    referredFrom: {
                      committeeId: originId,
                      committeeName: originName,
                      referredAt: new Date().toISOString(),
                    },
                    postponeInfo: undefined,
                    postponePrevState: undefined,
                  },
                };
                const nextList = [moved, ...destMotions];
                saveMotionsForCommittee(destId, nextList);
              }
            } catch (e) {}
            return {
              ...m,
              state: "closed",
              decisionNote: `Referred to ${destName}`,
              meta: parentMeta,
              carryOver: false,
              meetingId: undefined,
            };
          } else {
            const prev = meta.parentPreviousState || m.state;
            return { ...m, state: prev };
          }
        }
        if (m.id === am.id) {
          return { ...m, meta: { ...m.meta, postponementApplied: true } };
        }
        return m;
      });

      setMotions(next);
      saveMotionsForCommittee(committee.id, next);
    } catch (err) {
      // ignore
    }
    // re-run when the active motion changes state or the motions list updates
  }, [activeMotion?.id, activeMotion?.state, motions, committee?.id]);

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

    let updated = motions.map((m) => {
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

    // If this was a postpone submotion, apply or revert its effect on the parent
    try {
      const am = activeMotion;
      const meta = am?.meta;
      const isPostponeSub =
        meta && meta.kind === "sub" && meta.subType === "postpone";
      if (isPostponeSub && meta.parentMotionId) {
        const revisedOutcome =
          (editDecisionOutcome && editDecisionOutcome) ||
          computeOutcome(am.votes || []);
        const passed = /pass|adopt/i.test(revisedOutcome);
        const parentId = meta.parentMotionId;
        updated = updated.map((m) => {
          if (m.id !== parentId && m.id !== am.id) return m;
          if (m.id === parentId) {
            if (passed) {
              return {
                ...m,
                state: "postponed",
                decisionNote: "Postponed by submotion",
                resumeAt: meta.resumeAt || meta.postponeOption,
              };
            } else {
              const prev = meta.parentPreviousState || m.state;
              return { ...m, state: prev };
            }
          }
          // mark the submotion as having applied its postponement so we don't reapply
          if (m.id === am.id) {
            return { ...m, meta: { ...m.meta, postponementApplied: true } };
          }
          return m;
        });
      }
    } catch (err) {
      // ignore
    }

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
    // Treat a tie as a rejection/failure per policy
    return "Rejected";
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
      return "failed";
    if (t.includes("refer") || t.includes("referred")) return "referred";
    return "neutral";
  };
  // Temporary "Resumed" indicator window (ms)
  const RESUMED_PILL_MS = 10 * 1000; // 10 seconds window
  const isResumedRecently = (motion) => {
    const ts = motion?.meta?.postponementLiftedAt;
    if (!ts) return false;
    const t = Date.parse(ts);
    if (Number.isNaN(t)) return false;
    return Date.now() - t < RESUMED_PILL_MS;
  };
  const stateLabel = (s) => {
    const st = s || "discussion";
    if (st === "discussion") return "In progress";
    return st;
  };
  const motionStatusLabel = (motion) => {
    if (!motion) return "";
    const st = motion.state || "discussion";
    if (st !== "closed") return stateLabel(st);
    // When closed but no final decision recorded yet, show 'closed'.
    const rawOutcome = motion.decisionDetails?.outcome || null;
    if (!rawOutcome) return "closed";
    const t = (rawOutcome || "").toString().toLowerCase();
    if (t.includes("adopt") || t.includes("pass") || t.includes("carried"))
      return "passed";
    if (
      t.includes("reject") ||
      t.includes("fail") ||
      t.includes("tie") ||
      t.includes("withdraw") ||
      t.includes("kill") ||
      t.includes("no votes")
    )
      return "failed";
    if (t.includes("refer")) return "referred";
    // If outcome text is unknown, default to 'closed' label rather than implying failure.
    return "closed";
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
    if (meetingRecessed || activeMotion.state === "referred") return;
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
  // Keep submotions grouped under their parent regardless of closed state.
  const activeMotions = (motions || []).filter(
    (m) => m.state !== "closed" || (m.meta && m.meta.kind === "sub")
  );
  const concludedMotions = (motions || []).filter(
    (m) => m.state === "closed" && !(m.meta && m.meta.kind === "sub")
  );

  // build parent -> children maps for grouped rendering (don't duplicate submotions)
  const buildChildrenMap = (list) => {
    const map = {};
    list.forEach((m) => {
      // handle traditional submotions
      if (m.meta && m.meta.kind === "sub" && m.meta.parentMotionId) {
        const pid = m.meta.parentMotionId;
        if (!map[pid]) map[pid] = [];
        // store index in the main motions array so we can sort by recency
        const idx = motions.findIndex((mm) => mm.id === m.id);
        map[pid].push({ ...m, __idx: idx, __isSubmotion: true });
      }
      // handle overturn motions which reference the parent via `meta.overturnOf`.
      // Only attach overturns as children when they are closed so they appear
      // under the parent in the concluded section.
      else if (m.meta && m.meta.overturnOf && m.state === "closed") {
        const pid = m.meta.overturnOf;
        if (!map[pid]) map[pid] = [];
        const idx = motions.findIndex((mm) => mm.id === m.id);
        map[pid].push({ ...m, __idx: idx, __isOverturn: true });
      }
    });
    return map;
  };

  // Build children map from the full motions list so submotions remain
  // attached to their parent regardless of the parent's or child's state.
  const childrenMap = buildChildrenMap(motions || []);

  // Render a text string with discretionary break opportunities so long
  // titles can wrap before overlapping the status pill. We insert <wbr/>
  // after common delimiters (hyphen, slash, dot, etc.) and as a fallback
  // split very long unbroken tokens to avoid character-by-character breaks.
  const renderBreakable = (text) => {
    if (!text && text !== 0) return text;
    const s = String(text);
    // split into tokens that are either runs of delimiters/spaces or runs of non-delimiters
    const tokens = s.split(/([\-\/_.:,()\s\u2013\u2014]+)/g);
    return tokens.map((tok, i) => {
      if (!tok) return null;
      // whitespace: return as plain string (browser can break at spaces)
      if (/^\s+$/.test(tok)) return tok;
      // delimiter runs (hyphen, slash, dot, punctuation): allow a break after them
      if (/^[\-\/_.:,()\u2013\u2014]+$/.test(tok)) {
        return (
          <span key={i}>
            {tok}
            <wbr />
          </span>
        );
      }
      // long uninterrupted token: insert <wbr/> frequently as a graceful fallback
      // (use a lower threshold and smaller chunk size so very long words break on narrow screens)
      if (tok.length > 14) {
        const parts = [];
        for (let j = 0; j < tok.length; j += 12) {
          parts.push(tok.slice(j, j + 12));
        }
        return parts.map((p, idx) => (
          <span key={i + "-" + idx}>
            {p}
            <wbr />
          </span>
        ));
      }
      // normal word token
      return <span key={i}>{tok}</span>;
    });
  };

  // Mark motion-list-item elements that have a single-line title so we
  // can vertically center the row content and align the title with the pill.
  useEffect(() => {
    function updateSingleLineFlags() {
      try {
        const items = document.querySelectorAll(".motion-list-item");
        items.forEach((item) => {
          // prefer the main title element; fall back to sub-title when present
          const titleEl =
            item.querySelector(".motion-title") ||
            item.querySelector(".sub-title");
          if (!titleEl) {
            item.classList.remove("single-line");
            return;
          }
          const cs = window.getComputedStyle(titleEl);
          const lineHeight =
            parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.2;
          const single = titleEl.clientHeight <= lineHeight * 1.05;
          if (single) item.classList.add("single-line");
          else item.classList.remove("single-line");
        });
      } catch (err) {
        // swallow
      }
    }

    updateSingleLineFlags();
    // also run after layout changes and on resize
    const id = setTimeout(updateSingleLineFlags, 0);
    window.addEventListener("resize", updateSingleLineFlags);
    return () => {
      clearTimeout(id);
      window.removeEventListener("resize", updateSingleLineFlags);
    };
  }, [motions]);

  const filterRoots = (list) =>
    list.filter(
      (m) => !(m.meta && m.meta.kind === "sub" && m.meta.parentMotionId)
    );

  // Exclude postponed motions from the main active list and show them in their
  // own section below Active Motions.
  const postponedRoots = filterRoots(
    (motions || []).filter((m) => m.state === "postponed")
  );
  const activeRoots = filterRoots(
    activeMotions.filter((m) => (m.state || "discussion") !== "postponed")
  );
  // Unfinished business: all motions explicitly marked carryOver and still ongoing.
  // Allow accumulation across multiple meetings instead of only the most recent.
  // Exclude postponed and closed states; include discussion/voting/paused.
  const unfinished = (motions || []).filter((m) => {
    const st = m.state || "discussion";
    const ongoing = ["discussion", "voting", "paused"].includes(st);
    return m.carryOver === true && ongoing;
  });
  const unfinishedRoots = filterRoots(unfinished);
  // other active roots (exclude the carried-over unfinished ones)
  const otherActiveRoots = activeRoots.filter(
    (m) => !unfinishedRoots.some((u) => u.id === m.id)
  );
  const concludedRoots = filterRoots(concludedMotions);

  // Debug: log counts to help diagnose why motions appear in the wrong section
  useEffect(() => {
    try {
      console.debug("motions-debug", {
        motions: motions.length,
        activeRoots: activeRoots.length,
        unfinishedRoots: unfinishedRoots.length,
        otherActiveRoots: otherActiveRoots.length,
        previousMeetingId,
        currentMeetingId,
      });
      // temporary diagnostic: list the unfinished motions so we can inspect why
      try {
        const list = (unfinishedRoots || []).map((m) => ({
          id: m.id,
          title: m.title,
          meetingId: m.meetingId,
          carryOver: m.carryOver,
          state: m.state,
        }));
        console.debug("motions-debug-unfinished-list", list);
      } catch (e) {}
    } catch (err) {}
  }, [motions, previousMeetingId, currentMeetingId, unfinishedRoots]);

  // Lift postponed motions that were scheduled for "After unfinished business"
  // once all unfinished items have concluded (unfinishedRoots becomes empty).
  useEffect(() => {
    if (!committee) return;
    if (unfinishedRoots.length !== 0) return; // only trigger when section is now empty
    setMotions((prev) => {
      let changed = false;
      const next = (prev || []).map((m) => {
        const info = m.meta && m.meta.postponeInfo;
        if (
          m.state === "postponed" &&
          info &&
          info.type === "agendaPosition" &&
          info.position === "afterUnfinishedBusiness"
        ) {
          changed = true;
          const prevState = m.meta && m.meta.postponePrevState;
          const restoreState = ["discussion", "voting", "paused"].includes(
            prevState
          )
            ? prevState
            : "discussion";
          const newMeta = { ...m.meta };
          delete newMeta.postponeInfo;
          delete newMeta.postponePrevState;
          newMeta.postponementLiftedAt = new Date().toISOString();
          return {
            ...m,
            state: restoreState,
            decisionNote: undefined,
            meta: newMeta,
          };
        }
        return m;
      });
      if (changed) {
        try {
          saveMotionsForCommittee(committee.id, next);
        } catch (e) {}
        return next;
      }
      return prev;
    });
  }, [unfinishedRoots.length, committee]);

  // Lift postponed motions scheduled for the next meeting when this meeting starts
  useEffect(() => {
    if (!committee) return;
    if (!meetingActive) return;
    if (!Number.isFinite(currentMeetingSeq)) return;
    setMotions((prev) => {
      let changed = false;
      const next = (prev || []).map((m) => {
        const meta = m.meta || {};
        const info = meta.postponeInfo;
        const liftByMeeting =
          m.state === "postponed" &&
          info &&
          info.type === "meeting" &&
          Number(info.targetMeetingSeq) === Number(currentMeetingSeq);
        const liftByAgendaNext =
          m.state === "postponed" &&
          info &&
          info.type === "agendaPosition" &&
          info.position === "next_meeting";
        const liftLegacy =
          m.state === "postponed" &&
          !info &&
          (meta.resumeAt === "next_meeting" ||
            meta.postponeOption === "next_meeting");
        if (liftByMeeting || liftByAgendaNext || liftLegacy) {
          changed = true;
          const prevState = meta.postponePrevState;
          const restoreState = ["discussion", "voting", "paused"].includes(
            prevState
          )
            ? prevState
            : "discussion";
          const newMeta = { ...meta };
          delete newMeta.postponeInfo;
          delete newMeta.postponePrevState;
          if (newMeta.resumeAt === "next_meeting") delete newMeta.resumeAt;
          if (newMeta.postponeOption === "next_meeting")
            delete newMeta.postponeOption;
          newMeta.postponementLiftedAt = new Date().toISOString();
          return {
            ...m,
            state: restoreState,
            decisionNote: undefined,
            meta: newMeta,
          };
        }
        return m;
      });
      if (changed) {
        try {
          saveMotionsForCommittee(committee.id, next);
        } catch (e) {}
        return next;
      }
      return prev;
    });
  }, [committee, meetingActive, currentMeetingSeq]);

  // Lift postponed motions scheduled for a specific date/time when reached
  useEffect(() => {
    if (!committee) return;
    const liftIfDue = () => {
      setMotions((prev) => {
        let changed = false;
        const now = Date.now();
        const next = (prev || []).map((m) => {
          const meta = m.meta || {};
          const info = meta.postponeInfo;
          if (m.state === "postponed" && info && info.type === "dateTime") {
            const at = Date.parse(info.at || info.resumeAt || "");
            if (!Number.isNaN(at) && now >= at) {
              changed = true;
              const prevState = meta.postponePrevState;
              const restoreState = ["discussion", "voting", "paused"].includes(
                prevState
              )
                ? prevState
                : "discussion";
              const newMeta = { ...meta };
              delete newMeta.postponeInfo;
              delete newMeta.postponePrevState;
              newMeta.postponementLiftedAt = new Date().toISOString();
              return {
                ...m,
                state: restoreState,
                decisionNote: undefined,
                meta: newMeta,
              };
            }
          }
          return m;
        });
        if (changed) {
          try {
            saveMotionsForCommittee(committee.id, next);
          } catch (e) {}
          return next;
        }
        return prev;
      });
    };
    // run once on mount
    liftIfDue();
    const timer = setInterval(liftIfDue, 30000); // check every 30s
    return () => clearInterval(timer);
  }, [committee]);

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
              {submotionType === "postpone" && (
                <div style={{ marginTop: 12 }}>
                  <label className="decision-label">Postpone until</label>
                  <div className="outcome-options" role="radiogroup">
                    <button
                      type="button"
                      className={`outcome-pill ${
                        postponeOption === "next_meeting" ? "is-active" : ""
                      }`}
                      onClick={() => setPostponeOption("next_meeting")}
                    >
                      Next meeting
                    </button>
                    <button
                      type="button"
                      className={`outcome-pill ${
                        postponeOption === "after_unfinished" ? "is-active" : ""
                      }`}
                      onClick={() => setPostponeOption("after_unfinished")}
                    >
                      After unfinished business
                    </button>
                    <button
                      type="button"
                      className={`outcome-pill ${
                        postponeOption === "later_this_meeting"
                          ? "is-active"
                          : ""
                      }`}
                      onClick={() => setPostponeOption("later_this_meeting")}
                    >
                      Later in this meeting
                    </button>
                    <button
                      type="button"
                      className={`outcome-pill ${
                        postponeOption === "specific" ? "is-active" : ""
                      }`}
                      onClick={() => setPostponeOption("specific")}
                    >
                      Specify a date/time
                    </button>
                  </div>
                  {postponeOption === "specific" && (
                    <div style={{ marginTop: 8 }}>
                      <input
                        type="datetime-local"
                        value={postponeDateTime}
                        onChange={(e) => setPostponeDateTime(e.target.value)}
                        aria-label="Specify resume date and time"
                      />
                    </div>
                  )}
                </div>
              )}
              {submotionType === "refer" && (
                <div style={{ marginTop: 12 }}>
                  <label className="decision-label">Refer to</label>
                  <div
                    style={{
                      fontSize: "0.9rem",
                      color: "#374151",
                      marginBottom: 8,
                    }}
                  >
                    You may refer this motion to any existing committee in this
                    organization.
                  </div>
                  <div
                    className="outcome-options"
                    role="radiogroup"
                    style={{ flexWrap: "wrap", gap: 8 }}
                  >
                    {(allCommittees || [])
                      .filter((c) => c && c.id && c.name)
                      .map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          className={`outcome-pill${
                            referDestId === c.id ? " is-active" : ""
                          }`}
                          onClick={() => {
                            setReferDestId(c.id);
                            setNewMotionDesc(`Refer to: ${c.name}`);
                          }}
                          aria-pressed={referDestId === c.id}
                          title={c.name}
                        >
                          {c.name}
                        </button>
                      ))}
                    {(allCommittees || []).length === 0 && (
                      <div style={{ color: "#6b7280" }}>
                        No other committees found.
                      </div>
                    )}
                  </div>
                </div>
              )}
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
                {editingMotionId && (
                  <button
                    type="button"
                    className="btn-danger"
                    onClick={() => {
                      const deleted = handleDeleteMotion(editingMotionId);
                      if (deleted) handleCancelCreateMotion();
                    }}
                  >
                    Delete
                  </button>
                )}
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
          {amIManager && (
            <button
              type="button"
              onClick={meetingActive ? handleEndMeeting : handleStartMeeting}
              className={`btn-meeting-toggle ${
                meetingActive ? "is-ending" : "is-starting"
              } ${meetingFlipAnim ? "flip-anim" : ""}`}
              title={
                meetingActive
                  ? "A meeting is open — click to end it"
                  : "Click to start a meeting"
              }
              style={{ marginRight: 8 }}
            >
              {meetingActive ? "🟥 End Meeting" : "Start Meeting"}
            </button>
          )}
          <button onClick={handleAddMotion} className="primary-icon-btn">
            +
          </button>
        </div>
        {/* Chair controls moved to composer icon — left-panel panel removed */}
        <div className="discussion-left-content">
          {/* Motions header removed per design: motion list always visible.
              Submotion toggle is kept on each parent item. */}

          <div
            id="motion-list-body"
            className="motion-list-body"
            aria-hidden={false}
          >
            <div className="motion-list">
              {motions.length === 0 && (
                <p className="empty">No motions yet. Add one.</p>
              )}

              {activeRoots.length > 0 && (
                <>
                  <div className="motions-section-header">
                    <strong>Active Motions</strong>
                  </div>
                  {unfinishedRoots.length > 0 && (
                    <div style={{ marginTop: 8, marginBottom: 6 }}>
                      <small style={{ color: "#6b7280" }}>
                        Unfinished from last meeting ({unfinishedRoots.length})
                      </small>
                    </div>
                  )}
                  {unfinishedRoots.map((m, idx) => (
                    <React.Fragment key={m.id}>
                      <div
                        className={
                          "motion-list-row " +
                          (idx > 0 ? "motion-root-divider" : "")
                        }
                      >
                        <div
                          className={
                            "motion-list-item " +
                            (m.id === activeMotionId ? "motion-active " : "") +
                            (m.state === "closed"
                              ? "motion-closed-item "
                              : "") +
                            (childrenMap[m.id] &&
                            childrenMap[m.id].some(
                              (c) => !c.__isOverturn || c.state === "closed"
                            )
                              ? "has-submotions"
                              : "")
                          }
                          onMouseLeave={(e) => {
                            try {
                              const btn = e.currentTarget.querySelector(
                                ".submotion-toggle-btn"
                              );
                              if (btn && typeof btn.blur === "function")
                                btn.blur();
                              if (document.activeElement === e.currentTarget) {
                                try {
                                  e.currentTarget.blur();
                                } catch (err) {}
                              }
                            } catch (err) {}
                          }}
                          role="button"
                          tabIndex={0}
                          onClick={() => {
                            setActiveMotionId(m.id);
                            setShowChairMenu(false);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              setActiveMotionId(m.id);
                              setShowChairMenu(false);
                            }
                          }}
                        >
                          <div className="motion-row-content">
                            {childrenMap[m.id] &&
                              childrenMap[m.id].length > 0 &&
                              (m.state || "discussion") !== "postponed" &&
                              (m.state || "discussion") !== "closed" && (
                                <button
                                  type="button"
                                  className="submotion-toggle-btn"
                                  onClick={(ev) => toggleSubmotions(m.id, ev)}
                                  aria-expanded={!submotionCollapsed[m.id]}
                                  title={
                                    submotionCollapsed[m.id]
                                      ? "Expand submotions"
                                      : "Collapse submotions"
                                  }
                                >
                                  {submotionCollapsed[m.id] ? (
                                    <svg
                                      width="12"
                                      height="12"
                                      viewBox="0 0 24 24"
                                      aria-hidden
                                    >
                                      <path
                                        d="M9 6l6 6-6 6"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                      />
                                    </svg>
                                  ) : (
                                    <svg
                                      width="12"
                                      height="12"
                                      viewBox="0 0 24 24"
                                      aria-hidden
                                    >
                                      <path
                                        d="M6 9l6 6 6-6"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                      />
                                    </svg>
                                  )}
                                </button>
                              )}

                            <span className="motion-title">
                              {renderBreakable(m.title)}
                            </span>
                            {isResumedRecently(m) ? (
                              <span
                                className="status-pill status-resumed"
                                title="Resumed from postponement"
                              >
                                Resumed
                              </span>
                            ) : (
                              <span
                                className={`status-pill status-${
                                  m.state || "discussion"
                                }`}
                              >
                                {motionStatusLabel(m)}
                              </span>
                            )}
                            <span className="badge unfinished-badge">
                              Unfinished
                            </span>
                          </div>

                          <button
                            type="button"
                            className="motion-kebab"
                            onClick={(ev) => {
                              ev.stopPropagation();
                              if (meetingRecessed) return;
                              openEditMotion(m);
                            }}
                            aria-label="Manage motion"
                            title={
                              meetingRecessed
                                ? "Disabled — meeting in recess"
                                : "Manage motion"
                            }
                            disabled={meetingRecessed}
                          >
                            <svg
                              width="14"
                              height="14"
                              viewBox="0 0 24 24"
                              aria-hidden
                            >
                              <path
                                d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25z"
                                fill="currentColor"
                              />
                              <path
                                d="M20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"
                                fill="currentColor"
                              />
                            </svg>
                          </button>

                          {/* manage buttons removed (Edit/Delete) — new system coming */}
                        </div>
                      </div>

                      {/* render submotions (children) right after the parent */}
                      {!submotionCollapsed[m.id] &&
                        childrenMap[m.id] &&
                        childrenMap[m.id]
                          .slice()
                          .sort((a, b) => (a.__idx || 0) - (b.__idx || 0))
                          .filter(
                            (c) => !c.__isOverturn || c.state === "closed"
                          )
                          .map((c) => (
                            <div key={c.id} className="motion-list-row">
                              <div
                                className={
                                  "motion-list-item " +
                                  (c.id === activeMotionId
                                    ? "motion-active"
                                    : "") +
                                  " motion-sub"
                                }
                                onMouseLeave={(e) => {
                                  try {
                                    if (
                                      document.activeElement === e.currentTarget
                                    ) {
                                      try {
                                        e.currentTarget.blur();
                                      } catch (err) {}
                                    }
                                  } catch (err) {}
                                }}
                                role="button"
                                tabIndex={0}
                                onClick={() => {
                                  setActiveMotionId(c.id);
                                  setShowChairMenu(false);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" || e.key === " ") {
                                    e.preventDefault();
                                    setActiveMotionId(c.id);
                                    setShowChairMenu(false);
                                  }
                                }}
                              >
                                <div className="motion-row-content">
                                  <div className="motion-sub-label">
                                    {(() => {
                                      const isOverturn = !!(
                                        c.__isOverturn ||
                                        (c.meta && c.meta.overturnOf)
                                      );
                                      if (isOverturn) {
                                        return (
                                          <>
                                            <span className="sub-type">
                                              Overturn:
                                            </span>
                                            <span className="sub-title">
                                              {renderBreakable(c.title)}
                                            </span>
                                          </>
                                        );
                                      }
                                      if (
                                        c.meta &&
                                        c.meta.subType === "postpone"
                                      ) {
                                        return (
                                          <>
                                            <span className="sub-type">
                                              Postpone:
                                            </span>
                                            <span className="sub-title">
                                              {renderBreakable(c.title)}
                                            </span>
                                          </>
                                        );
                                      }
                                      if (
                                        c.meta &&
                                        c.meta.subType === "revision"
                                      ) {
                                        return (
                                          <>
                                            <span className="sub-type">
                                              Revision:
                                            </span>
                                            <span className="sub-title">
                                              {renderBreakable(c.title)}
                                            </span>
                                          </>
                                        );
                                      }
                                      if (
                                        c.meta &&
                                        c.meta.subType === "refer"
                                      ) {
                                        return (
                                          <>
                                            <span className="sub-type">
                                              Refer:
                                            </span>
                                            <span className="sub-title">
                                              {renderBreakable(c.title)}
                                            </span>
                                          </>
                                        );
                                      }
                                      return (
                                        <span className="sub-title">
                                          {renderBreakable(c.title)}
                                        </span>
                                      );
                                    })()}
                                    {(() => {
                                      const parentId =
                                        (c.meta && c.meta.parentMotionId) ||
                                        (c.meta && c.meta.overturnOf);
                                      const parentTitle =
                                        (
                                          motions.find(
                                            (pm) => pm.id === parentId
                                          ) || {}
                                        ).title || "parent motion";
                                      const titleText = (
                                        c.title || ""
                                      ).toString();
                                      const isPostpone =
                                        c.meta && c.meta.subType === "postpone";
                                      const isRevision =
                                        c.meta && c.meta.subType === "revision";
                                      const isOverturn = !!(
                                        c.__isOverturn ||
                                        (c.meta && c.meta.overturnOf)
                                      );
                                      // Do not show the parent line for postpone submotions
                                      const showParent =
                                        !isPostpone &&
                                        !isRevision &&
                                        !titleText
                                          .toLowerCase()
                                          .includes(parentTitle.toLowerCase());
                                      return showParent ? (
                                        <div className="sub-parent">
                                          to <em>{parentTitle}</em>
                                        </div>
                                      ) : null;
                                    })()}
                                  </div>
                                  {isResumedRecently(c) ? (
                                    <span
                                      className="status-pill status-resumed"
                                      title="Resumed from postponement"
                                    >
                                      Resumed
                                    </span>
                                  ) : (
                                    <span
                                      className={`status-pill status-${
                                        c.state || "discussion"
                                      }`}
                                    >
                                      {motionStatusLabel(c)}
                                    </span>
                                  )}
                                </div>

                                <button
                                  type="button"
                                  className="motion-kebab"
                                  onClick={(ev) => {
                                    ev.stopPropagation();
                                    if (meetingRecessed) return;
                                    openEditMotion(c);
                                  }}
                                  aria-label="Manage motion"
                                  title={
                                    meetingRecessed
                                      ? "Disabled — meeting in recess"
                                      : "Manage motion"
                                  }
                                  disabled={meetingRecessed}
                                >
                                  <svg
                                    width="14"
                                    height="14"
                                    viewBox="0 0 24 24"
                                    aria-hidden
                                  >
                                    <path
                                      d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25z"
                                      fill="currentColor"
                                    />
                                    <path
                                      d="M20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"
                                      fill="currentColor"
                                    />
                                  </svg>
                                </button>

                                {/* manage buttons removed (Edit/Delete) — new system coming */}
                              </div>
                            </div>
                          ))}
                    </React.Fragment>
                  ))}
                </>
              )}

              {otherActiveRoots.length > 0 && (
                <>
                  {unfinishedRoots && unfinishedRoots.length > 0 && (
                    <div style={{ marginTop: 8, marginBottom: 6 }}>
                      <small style={{ color: "#6b7280" }}>
                        Other Active Motions ({otherActiveRoots.length})
                      </small>
                    </div>
                  )}
                  {otherActiveRoots.map((m, idx) => (
                    <React.Fragment key={m.id}>
                      <div
                        className={
                          "motion-list-row " +
                          (idx > 0 ? "motion-root-divider" : "")
                        }
                      >
                        <div
                          className={
                            "motion-list-item " +
                            (m.id === activeMotionId ? "motion-active " : "") +
                            (m.state === "closed"
                              ? "motion-closed-item "
                              : "") +
                            (childrenMap[m.id] && childrenMap[m.id].length > 0
                              ? "has-submotions"
                              : "")
                          }
                          onMouseLeave={(e) => {
                            try {
                              const btn = e.currentTarget.querySelector(
                                ".submotion-toggle-btn"
                              );
                              if (btn && typeof btn.blur === "function")
                                btn.blur();
                              if (document.activeElement === e.currentTarget) {
                                try {
                                  e.currentTarget.blur();
                                } catch (err) {}
                              }
                            } catch (err) {}
                          }}
                          role="button"
                          tabIndex={0}
                          onClick={() => {
                            setActiveMotionId(m.id);
                            setShowChairMenu(false);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              setActiveMotionId(m.id);
                              setShowChairMenu(false);
                            }
                          }}
                        >
                          <div className="motion-row-content">
                            {childrenMap[m.id] &&
                              childrenMap[m.id].length > 0 &&
                              (m.state || "discussion") !== "postponed" &&
                              (m.state || "discussion") !== "closed" && (
                                <button
                                  type="button"
                                  className="submotion-toggle-btn"
                                  onClick={(ev) => toggleSubmotions(m.id, ev)}
                                  aria-expanded={!submotionCollapsed[m.id]}
                                  title={
                                    submotionCollapsed[m.id]
                                      ? "Expand submotions"
                                      : "Collapse submotions"
                                  }
                                >
                                  {submotionCollapsed[m.id] ? (
                                    <svg
                                      width="12"
                                      height="12"
                                      viewBox="0 0 24 24"
                                      aria-hidden
                                    >
                                      <path
                                        d="M9 6l6 6-6 6"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                      />
                                    </svg>
                                  ) : (
                                    <svg
                                      width="12"
                                      height="12"
                                      viewBox="0 0 24 24"
                                      aria-hidden
                                    >
                                      <path
                                        d="M6 9l6 6 6-6"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                      />
                                    </svg>
                                  )}
                                </button>
                              )}

                            <span className="motion-title">
                              {renderBreakable(m.title)}
                            </span>
                            {isResumedRecently(m) ? (
                              <span
                                className="status-pill status-resumed"
                                title="Resumed from postponement"
                              >
                                Resumed
                              </span>
                            ) : (
                              <span
                                className={`status-pill status-${
                                  m.state || "discussion"
                                }`}
                              >
                                {motionStatusLabel(m)}
                              </span>
                            )}
                          </div>

                          <button
                            type="button"
                            className="motion-kebab"
                            onClick={(ev) => {
                              ev.stopPropagation();
                              if (meetingRecessed) return;
                              openEditMotion(m);
                            }}
                            aria-label="Manage motion"
                            title={
                              meetingRecessed
                                ? "Disabled — meeting in recess"
                                : "Manage motion"
                            }
                            disabled={meetingRecessed}
                          >
                            <svg
                              width="14"
                              height="14"
                              viewBox="0 0 24 24"
                              aria-hidden
                            >
                              <path
                                d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25z"
                                fill="currentColor"
                              />
                              <path
                                d="M20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"
                                fill="currentColor"
                              />
                            </svg>
                          </button>
                        </div>
                      </div>

                      {!submotionCollapsed[m.id] &&
                        childrenMap[m.id] &&
                        childrenMap[m.id]
                          .slice()
                          .sort((a, b) => (a.__idx || 0) - (b.__idx || 0))
                          .map((c) => (
                            <div key={c.id} className="motion-list-row">
                              <div
                                className={
                                  "motion-list-item " +
                                  (c.id === activeMotionId
                                    ? "motion-active"
                                    : "") +
                                  " motion-sub"
                                }
                                onMouseLeave={(e) => {
                                  try {
                                    if (
                                      document.activeElement === e.currentTarget
                                    ) {
                                      try {
                                        e.currentTarget.blur();
                                      } catch (err) {}
                                    }
                                  } catch (err) {}
                                }}
                                role="button"
                                tabIndex={0}
                                onClick={() => {
                                  setActiveMotionId(c.id);
                                  setShowChairMenu(false);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" || e.key === " ") {
                                    e.preventDefault();
                                    setActiveMotionId(c.id);
                                    setShowChairMenu(false);
                                  }
                                }}
                              >
                                <div className="motion-row-content">
                                  <div className="motion-sub-label">
                                    {(() => {
                                      const isOverturn = !!(
                                        c.__isOverturn ||
                                        (c.meta && c.meta.overturnOf)
                                      );
                                      if (isOverturn) {
                                        return (
                                          <>
                                            <span className="sub-type">
                                              Overturn:
                                            </span>
                                            <span className="sub-title">
                                              {renderBreakable(c.title)}
                                            </span>
                                          </>
                                        );
                                      }
                                      if (
                                        c.meta &&
                                        c.meta.subType === "postpone"
                                      ) {
                                        return (
                                          <>
                                            <span className="sub-type">
                                              Postpone:
                                            </span>
                                            <span className="sub-title">
                                              {renderBreakable(c.title)}
                                            </span>
                                          </>
                                        );
                                      }
                                      if (
                                        c.meta &&
                                        c.meta.subType === "revision"
                                      ) {
                                        return (
                                          <>
                                            <span className="sub-type">
                                              Revision:
                                            </span>
                                            <span className="sub-title">
                                              {renderBreakable(c.title)}
                                            </span>
                                          </>
                                        );
                                      }
                                      if (
                                        c.meta &&
                                        c.meta.subType === "refer"
                                      ) {
                                        return (
                                          <>
                                            <span className="sub-type">
                                              Refer:
                                            </span>
                                            <span className="sub-title">
                                              {renderBreakable(c.title)}
                                            </span>
                                          </>
                                        );
                                      }
                                      return (
                                        <span className="sub-title">
                                          {renderBreakable(c.title)}
                                        </span>
                                      );
                                    })()}
                                    {(() => {
                                      const parentId =
                                        (c.meta && c.meta.parentMotionId) ||
                                        (c.meta && c.meta.overturnOf);
                                      const parentTitle =
                                        (
                                          motions.find(
                                            (pm) => pm.id === parentId
                                          ) || {}
                                        ).title || "parent motion";
                                      const titleText = (
                                        c.title || ""
                                      ).toString();
                                      const isPostpone =
                                        c.meta && c.meta.subType === "postpone";
                                      const isRevision =
                                        c.meta && c.meta.subType === "revision";
                                      const isOverturn = !!(
                                        c.__isOverturn ||
                                        (c.meta && c.meta.overturnOf)
                                      );
                                      const showParent =
                                        !isPostpone &&
                                        !isRevision &&
                                        !titleText
                                          .toLowerCase()
                                          .includes(parentTitle.toLowerCase());
                                      return showParent ? (
                                        <div className="sub-parent">
                                          to <em>{parentTitle}</em>
                                        </div>
                                      ) : null;
                                    })()}
                                  </div>
                                  {isResumedRecently(c) ? (
                                    <span
                                      className="status-pill status-resumed"
                                      title="Resumed from postponement"
                                    >
                                      Resumed
                                    </span>
                                  ) : (
                                    <span
                                      className={`status-pill status-${
                                        c.state || "discussion"
                                      }`}
                                    >
                                      {motionStatusLabel(c)}
                                    </span>
                                  )}
                                </div>
                                <button
                                  type="button"
                                  className="motion-kebab"
                                  onClick={(ev) => {
                                    ev.stopPropagation();
                                    if (meetingRecessed) return;
                                    openEditMotion(c);
                                  }}
                                  aria-label="Manage motion"
                                  title={
                                    meetingRecessed
                                      ? "Disabled — meeting in recess"
                                      : "Manage motion"
                                  }
                                  disabled={meetingRecessed}
                                >
                                  <svg
                                    width="14"
                                    height="14"
                                    viewBox="0 0 24 24"
                                    aria-hidden
                                  >
                                    <path
                                      d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25z"
                                      fill="currentColor"
                                    />
                                    <path
                                      d="M20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"
                                      fill="currentColor"
                                    />
                                  </svg>
                                </button>
                              </div>
                            </div>
                          ))}
                    </React.Fragment>
                  ))}
                </>
              )}

              {postponedRoots.length > 0 && (
                <>
                  <div
                    className="motions-section-header"
                    style={{ marginTop: 8 }}
                  >
                    <strong>Postponed Motions</strong>
                  </div>
                  {postponedRoots.map((m) => (
                    <React.Fragment key={m.id}>
                      <div className="motion-list-row">
                        <div
                          className={
                            "motion-list-item " +
                            (m.id === activeMotionId ? "motion-active " : "") +
                            (m.state === "closed"
                              ? "motion-closed-item "
                              : "") +
                            (childrenMap[m.id] && childrenMap[m.id].length > 0
                              ? "has-submotions"
                              : "")
                          }
                          onMouseLeave={(e) => {
                            try {
                              const btn = e.currentTarget.querySelector(
                                ".submotion-toggle-btn"
                              );
                              if (btn && typeof btn.blur === "function")
                                btn.blur();
                              if (document.activeElement === e.currentTarget) {
                                try {
                                  e.currentTarget.blur();
                                } catch (err) {}
                              }
                            } catch (err) {}
                          }}
                          role="button"
                          tabIndex={0}
                          onClick={() => {
                            setActiveMotionId(m.id);
                            setShowChairMenu(false);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              setActiveMotionId(m.id);
                              setShowChairMenu(false);
                            }
                          }}
                        >
                          <div className="motion-row-content">
                            {childrenMap[m.id] &&
                              childrenMap[m.id].length > 0 &&
                              (m.state || "discussion") !== "postponed" &&
                              (m.state || "discussion") !== "closed" && (
                                <button
                                  type="button"
                                  className="submotion-toggle-btn"
                                  onClick={(ev) => toggleSubmotions(m.id, ev)}
                                  aria-expanded={!submotionCollapsed[m.id]}
                                  title={
                                    submotionCollapsed[m.id]
                                      ? "Expand submotions"
                                      : "Collapse submotions"
                                  }
                                >
                                  {submotionCollapsed[m.id] ? (
                                    <svg
                                      width="12"
                                      height="12"
                                      viewBox="0 0 24 24"
                                      aria-hidden
                                    >
                                      <path
                                        d="M9 6l6 6-6 6"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                      />
                                    </svg>
                                  ) : (
                                    <svg
                                      width="12"
                                      height="12"
                                      viewBox="0 0 24 24"
                                      aria-hidden
                                    >
                                      <path
                                        d="M6 9l6 6 6-6"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                      />
                                    </svg>
                                  )}
                                </button>
                              )}

                            <span className="motion-title">
                              {renderBreakable(m.title)}
                            </span>
                            {isResumedRecently(m) ? (
                              <span
                                className="status-pill status-resumed"
                                title="Resumed from postponement"
                              >
                                Resumed
                              </span>
                            ) : (
                              <span
                                className={`status-pill status-${
                                  m.state || "discussion"
                                }`}
                              >
                                {motionStatusLabel(m)}
                              </span>
                            )}
                          </div>

                          <button
                            type="button"
                            className="motion-kebab"
                            onClick={(ev) => {
                              ev.stopPropagation();
                              if (meetingRecessed) return;
                              openEditMotion(m);
                            }}
                            aria-label="Manage motion"
                            title={
                              meetingRecessed
                                ? "Disabled — meeting in recess"
                                : "Manage motion"
                            }
                            disabled={meetingRecessed}
                          >
                            <svg
                              width="14"
                              height="14"
                              viewBox="0 0 24 24"
                              aria-hidden
                            >
                              <path
                                d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25z"
                                fill="currentColor"
                              />
                              <path
                                d="M20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"
                                fill="currentColor"
                              />
                            </svg>
                          </button>
                        </div>
                      </div>

                      {!submotionCollapsed[m.id] &&
                        childrenMap[m.id] &&
                        childrenMap[m.id]
                          .slice()
                          .sort((a, b) => (a.__idx || 0) - (b.__idx || 0))
                          .map((c) => (
                            <div key={c.id} className="motion-list-row">
                              <div
                                className={
                                  "motion-list-item " +
                                  (c.id === activeMotionId
                                    ? "motion-active"
                                    : "") +
                                  " motion-sub"
                                }
                                onMouseLeave={(e) => {
                                  try {
                                    if (
                                      document.activeElement === e.currentTarget
                                    ) {
                                      try {
                                        e.currentTarget.blur();
                                      } catch (err) {}
                                    }
                                  } catch (err) {}
                                }}
                                role="button"
                                tabIndex={0}
                                onClick={() => {
                                  setActiveMotionId(c.id);
                                  setShowChairMenu(false);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" || e.key === " ") {
                                    e.preventDefault();
                                    setActiveMotionId(c.id);
                                    setShowChairMenu(false);
                                  }
                                }}
                              >
                                <div className="motion-row-content">
                                  <div className="motion-sub-label">
                                    {(() => {
                                      const isOverturn = !!(
                                        c.__isOverturn ||
                                        (c.meta && c.meta.overturnOf)
                                      );
                                      if (isOverturn) {
                                        return (
                                          <>
                                            <span className="sub-type">
                                              Overturn:
                                            </span>
                                            <span className="sub-title">
                                              {renderBreakable(c.title)}
                                            </span>
                                          </>
                                        );
                                      }
                                      if (
                                        c.meta &&
                                        c.meta.subType === "postpone"
                                      ) {
                                        return (
                                          <>
                                            <span className="sub-type">
                                              Postpone:
                                            </span>
                                            <span className="sub-title">
                                              {renderBreakable(c.title)}
                                            </span>
                                          </>
                                        );
                                      }
                                      if (
                                        c.meta &&
                                        c.meta.subType === "revision"
                                      ) {
                                        return (
                                          <>
                                            <span className="sub-type">
                                              Revision:
                                            </span>
                                            <span className="sub-title">
                                              {renderBreakable(c.title)}
                                            </span>
                                          </>
                                        );
                                      }
                                      return (
                                        <span className="sub-title">
                                          {renderBreakable(c.title)}
                                        </span>
                                      );
                                    })()}
                                    {(() => {
                                      const parentId =
                                        (c.meta && c.meta.parentMotionId) ||
                                        (c.meta && c.meta.overturnOf);
                                      const parentTitle =
                                        (
                                          motions.find(
                                            (pm) => pm.id === parentId
                                          ) || {}
                                        ).title || "parent motion";
                                      const titleText = (
                                        c.title || ""
                                      ).toString();
                                      const isPostpone =
                                        c.meta && c.meta.subType === "postpone";
                                      const isRevision =
                                        c.meta && c.meta.subType === "revision";
                                      const isOverturn = !!(
                                        c.__isOverturn ||
                                        (c.meta && c.meta.overturnOf)
                                      );
                                      const showParent =
                                        !isPostpone &&
                                        !isRevision &&
                                        !titleText
                                          .toLowerCase()
                                          .includes(parentTitle.toLowerCase());
                                      return showParent ? (
                                        <div className="sub-parent">
                                          to <em>{parentTitle}</em>
                                        </div>
                                      ) : null;
                                    })()}
                                  </div>
                                  {isResumedRecently(c) ? (
                                    <span
                                      className="status-pill status-resumed"
                                      title="Resumed from postponement"
                                    >
                                      Resumed
                                    </span>
                                  ) : (
                                    <span
                                      className={`status-pill status-${
                                        c.state || "discussion"
                                      }`}
                                    >
                                      {motionStatusLabel(c)}
                                    </span>
                                  )}
                                </div>
                                <button
                                  type="button"
                                  className="motion-kebab"
                                  onClick={(ev) => {
                                    ev.stopPropagation();
                                    openEditMotion(c);
                                  }}
                                  aria-label="Manage motion"
                                  title="Manage motion"
                                >
                                  <svg
                                    width="14"
                                    height="14"
                                    viewBox="0 0 24 24"
                                    aria-hidden
                                  >
                                    <path
                                      d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25z"
                                      fill="currentColor"
                                    />
                                    <path
                                      d="M20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"
                                      fill="currentColor"
                                    />
                                  </svg>
                                </button>
                              </div>
                            </div>
                          ))}
                    </React.Fragment>
                  ))}
                </>
              )}

              {concludedMotions.length > 0 && (
                <>
                  <div
                    className="motions-section-header"
                    style={{ marginTop: 8 }}
                  >
                    <strong>Closed Motions</strong>
                  </div>
                  {concludedRoots.map((m, idx) => (
                    <React.Fragment key={m.id}>
                      <div
                        className={
                          "motion-list-row " +
                          (idx > 0 ? "motion-root-divider" : "")
                        }
                      >
                        <div
                          className={
                            "motion-list-item " +
                            (m.id === activeMotionId ? "motion-active " : "") +
                            (m.state === "closed"
                              ? "motion-closed-item "
                              : "") +
                            (childrenMap[m.id] && childrenMap[m.id].length > 0
                              ? "has-submotions"
                              : "")
                          }
                          onMouseLeave={(e) => {
                            try {
                              const btn = e.currentTarget.querySelector(
                                ".submotion-toggle-btn"
                              );
                              if (btn && typeof btn.blur === "function")
                                btn.blur();
                              if (document.activeElement === e.currentTarget) {
                                try {
                                  e.currentTarget.blur();
                                } catch (err) {}
                              }
                            } catch (err) {}
                          }}
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
                            {childrenMap[m.id] &&
                              childrenMap[m.id].length > 0 &&
                              (m.state || "discussion") !== "postponed" &&
                              (m.state || "discussion") !== "closed" && (
                                <button
                                  type="button"
                                  className="submotion-toggle-btn"
                                  onClick={(ev) => toggleSubmotions(m.id, ev)}
                                  aria-expanded={!submotionCollapsed[m.id]}
                                  title={
                                    submotionCollapsed[m.id]
                                      ? "Expand submotions"
                                      : "Collapse submotions"
                                  }
                                >
                                  {submotionCollapsed[m.id] ? (
                                    <svg
                                      width="12"
                                      height="12"
                                      viewBox="0 0 24 24"
                                      aria-hidden
                                    >
                                      <path
                                        d="M9 6l6 6-6 6"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                      />
                                    </svg>
                                  ) : (
                                    <svg
                                      width="12"
                                      height="12"
                                      viewBox="0 0 24 24"
                                      aria-hidden
                                    >
                                      <path
                                        d="M6 9l6 6 6-6"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                      />
                                    </svg>
                                  )}
                                </button>
                              )}

                            <span className="motion-title">
                              {renderBreakable(m.title)}
                            </span>
                            <span
                              className={`status-pill status-${
                                m.state || "discussion"
                              }`}
                            >
                              {motionStatusLabel(m)}
                            </span>
                          </div>

                          <button
                            type="button"
                            className="motion-kebab"
                            onClick={(ev) => {
                              ev.stopPropagation();
                              openEditMotion(m);
                            }}
                            aria-label="Manage motion"
                            title="Manage motion"
                          >
                            <svg
                              width="14"
                              height="14"
                              viewBox="0 0 24 24"
                              aria-hidden
                            >
                              <path
                                d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25z"
                                fill="currentColor"
                              />
                              <path
                                d="M20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"
                                fill="currentColor"
                              />
                            </svg>
                          </button>

                          {/* manage buttons removed (Edit/Delete) — new system coming */}
                        </div>
                      </div>

                      {!submotionCollapsed[m.id] &&
                        childrenMap[m.id] &&
                        childrenMap[m.id]
                          .slice()
                          .sort((a, b) => (a.__idx || 0) - (b.__idx || 0))
                          .map((c) => (
                            <div key={c.id} className="motion-list-row">
                              <div
                                className={
                                  "motion-list-item " +
                                  (c.id === activeMotionId
                                    ? "motion-active"
                                    : "") +
                                  " motion-sub"
                                }
                                onMouseLeave={(e) => {
                                  try {
                                    if (
                                      document.activeElement === e.currentTarget
                                    ) {
                                      try {
                                        e.currentTarget.blur();
                                      } catch (err) {}
                                    }
                                  } catch (err) {}
                                }}
                                role="button"
                                tabIndex={0}
                                onClick={() => {
                                  setActiveMotionId(c.id);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" || e.key === " ") {
                                    e.preventDefault();
                                    setActiveMotionId(c.id);
                                  }
                                }}
                              >
                                <div className="motion-row-content">
                                  <div className="motion-sub-label">
                                    {(() => {
                                      if (
                                        c.meta &&
                                        c.meta.subType === "postpone"
                                      ) {
                                        return (
                                          <>
                                            <span className="sub-type">
                                              Postpone:
                                            </span>
                                            <span className="sub-title">
                                              {renderBreakable(c.title)}
                                            </span>
                                          </>
                                        );
                                      }
                                      if (
                                        c.meta &&
                                        c.meta.subType === "revision"
                                      ) {
                                        return (
                                          <>
                                            <span className="sub-type">
                                              Revision:
                                            </span>
                                            <span className="sub-title">
                                              {renderBreakable(c.title)}
                                            </span>
                                          </>
                                        );
                                      }
                                      return (
                                        <span className="sub-title">
                                          {renderBreakable(c.title)}
                                        </span>
                                      );
                                    })()}
                                    {(() => {
                                      const parentId =
                                        (c.meta && c.meta.parentMotionId) ||
                                        (c.meta && c.meta.overturnOf);
                                      const parentTitle =
                                        (
                                          motions.find(
                                            (pm) => pm.id === parentId
                                          ) || {}
                                        ).title || "parent motion";
                                      const titleText = (
                                        c.title || ""
                                      ).toString();
                                      const isPostpone =
                                        c.meta && c.meta.subType === "postpone";
                                      const isRevision =
                                        c.meta && c.meta.subType === "revision";
                                      const isOverturn = !!(
                                        c.__isOverturn ||
                                        (c.meta && c.meta.overturnOf)
                                      );
                                      // Do not show the parent line for postpone submotions
                                      const showParent =
                                        !isPostpone &&
                                        !isRevision &&
                                        !titleText
                                          .toLowerCase()
                                          .includes(parentTitle.toLowerCase());
                                      return showParent ? (
                                        <div className="sub-parent">
                                          to <em>{parentTitle}</em>
                                        </div>
                                      ) : null;
                                    })()}
                                  </div>
                                  <span
                                    className={`status-pill status-${
                                      c.state || "discussion"
                                    }`}
                                  >
                                    {motionStatusLabel(c)}
                                  </span>
                                </div>

                                {/* manage buttons removed (Edit/Delete) — new system coming */}
                              </div>
                            </div>
                          ))}
                    </React.Fragment>
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
                <h1 className="motion-main-title">
                  {renderBreakable(activeMotion.title)}
                </h1>
                {specialBanner && (
                  <div
                    className="special-banner"
                    role="status"
                    aria-live="polite"
                  >
                    {specialBanner}
                  </div>
                )}
                {meetingRecessed && activeMotion?.state !== "closed" && (
                  <div
                    className="special-banner"
                    role="status"
                    aria-live="polite"
                  >
                    Meeting in recess. Actions are temporarily disabled.
                  </div>
                )}
                {activeMotion?.state === "referred" && (
                  <div
                    className="special-banner"
                    role="status"
                    aria-live="polite"
                  >
                    {activeMotion?.meta?.referredFrom
                      ? `Received by referral from ${
                          activeMotion.meta.referredFrom.committeeName ||
                          activeMotion.meta.referredFrom.committeeId
                        }.`
                      : "Received by referral."}
                  </div>
                )}
                {activeMotion.description ? (
                  <p className="motion-desc">{activeMotion.description}</p>
                ) : null}

                <div className="motion-header-actions">
                  {(() => {
                    const isSub = !!(
                      activeMotion &&
                      activeMotion.meta &&
                      activeMotion.meta.kind === "sub"
                    );
                    const st = activeMotion?.state || "discussion";
                    const show = !!(
                      activeMotion &&
                      !isSub &&
                      st !== "closed" &&
                      st !== "postponed"
                    );
                    if (!show) return null;
                    return (
                      <div className="submotion-kebab-wrapper">
                        <button
                          type="button"
                          className="submotion-btn"
                          aria-haspopup="true"
                          title={
                            meetingRecessed
                              ? "Disabled — meeting in recess"
                              : "More actions"
                          }
                          disabled={meetingRecessed}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (meetingRecessed) return;
                            const menu =
                              document.getElementById("submotion-menu");
                            if (menu) {
                              menu.style.display =
                                menu.style.display === "block"
                                  ? "none"
                                  : "block";
                            }
                          }}
                        >
                          ⋮
                        </button>
                        <div
                          id="submotion-menu"
                          className="submotion-menu"
                          role="menu"
                        >
                          <button
                            type="button"
                            onClick={() =>
                              handleOpenSubmotion("revision", activeMotion)
                            }
                            title={
                              meetingRecessed
                                ? "Disabled — meeting in recess"
                                : "Propose an amendment"
                            }
                            disabled={
                              meetingRecessed ||
                              (activeMotion.state || "discussion") ===
                                "postponed"
                            }
                          >
                            Amend
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              handleOpenSubmotion("refer", activeMotion)
                            }
                            title={
                              meetingRecessed
                                ? "Disabled — meeting in recess"
                                : "Refer to committee"
                            }
                            disabled={
                              meetingRecessed ||
                              (activeMotion.state || "discussion") ===
                                "voting" ||
                              (activeMotion.state || "discussion") ===
                                "postponed"
                            }
                          >
                            Refer to Committee
                          </button>
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {activeMotion?.state === "closed" && !otcClosed && (
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
                {otcClosed && (
                  <div className="decision-current" style={{ marginTop: 8 }}>
                    <span
                      className={
                        "decision-pill is-" + (activeMotion.state || "closed")
                      }
                    >
                      {activeMotion.decisionNote ||
                        "Closed (object to consideration)"}
                    </span>
                  </div>
                )}
              </div>
              {/* (tallies are shown in a larger panel below the thread) */}
            </header>

            {/* Toast notification removed */}

            {viewTab === "discussion" && !otcClosed && (
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
              !otcClosed &&
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
              !otcClosed &&
              (activeMotion.state === "voting" ||
                activeMotion.state === "closed") && (
                <div className="vote-tally-panel">
                  {(() => {
                    const votes = activeMotion?.votes || [];
                    const tally = computeTally(votes);
                    const myVote = votes.find(
                      (v) => v.voterId === me.id
                    )?.choice;
                    const votingOpen =
                      activeMotion?.state === "voting" && !meetingRecessed;
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

            {otcClosed ? null : viewTab === "discussion" ? (
              <form className={"discussion-composer "} onSubmit={handleSend}>
                {amIManager &&
                  activeMotion &&
                  (() => {
                    const st = activeMotion.state || "discussion";
                    const isDiscussion = st === "discussion";
                    const isPaused = st === "paused";
                    const isVoting = st === "voting";
                    const isPostponed = st === "postponed";
                    const isClosed = st === "closed";
                    // Hide chair menu entirely for postponed and closed motions.
                    if (isPostponed || isClosed) return null;
                    return (
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
                              disabled={!isPaused || meetingRecessed}
                              title={
                                meetingRecessed
                                  ? "Disabled — meeting in recess"
                                  : !isPaused
                                  ? "Disabled — discussion is already active"
                                  : undefined
                              }
                            >
                              Resume Discussion
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                changeMotionState("paused");
                                setShowChairMenu(false);
                              }}
                              disabled={!isDiscussion || meetingRecessed}
                              title={
                                meetingRecessed
                                  ? "Disabled — meeting in recess"
                                  : !isDiscussion
                                  ? "Disabled — motion already paused"
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
                              disabled={isVoting || meetingRecessed}
                              title={
                                meetingRecessed
                                  ? "Disabled — meeting in recess"
                                  : isVoting
                                  ? "Disabled — already voting"
                                  : undefined
                              }
                            >
                              Move to Vote
                            </button>
                            {/* Special Motions (meeting-level, immediate, no discussion) */}
                            <div className="chair-menu-divider" />
                            <div className="chair-menu-section-title">
                              Special Motions
                            </div>
                            {meetingRecessed ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setMeetingRecessed(false);
                                  setShowChairMenu(false);
                                }}
                                title="Resume meeting from recess"
                              >
                                Resume Meeting
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  setMeetingRecessed(true);
                                  setShowChairMenu(false);
                                }}
                                title="Recess the meeting"
                              >
                                Recess
                              </button>
                            )}
                            {(() => {
                              const isSub = !!(
                                activeMotion &&
                                activeMotion.meta &&
                                activeMotion.meta.kind === "sub"
                              );
                              const noComments =
                                (activeMotion?.messages || []).length === 0;
                              const inProgress =
                                (activeMotion?.state || "discussion") ===
                                "discussion";
                              const isReferredState =
                                (activeMotion?.state || "") === "referred";
                              const isVotingOTC = !!(
                                activeMotion?.meta?.specialVote?.type ===
                                  "otc" &&
                                (activeMotion?.state || "") === "voting"
                              );
                              return (
                                <>
                                  {!isSub && inProgress && noComments && (
                                    <button
                                      type="button"
                                      onClick={startObjectionVote}
                                      disabled={meetingRecessed}
                                      title={
                                        meetingRecessed
                                          ? "Disabled — meeting in recess"
                                          : "Object to the consideration of the question"
                                      }
                                    >
                                      Object to Consideration
                                    </button>
                                  )}
                                  {isReferredState && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        changeMotionState("discussion");
                                        setShowChairMenu(false);
                                      }}
                                      disabled={meetingRecessed}
                                      title={
                                        meetingRecessed
                                          ? "Disabled — meeting in recess"
                                          : "Take up this referred motion"
                                      }
                                    >
                                      Take up referred motion
                                    </button>
                                  )}
                                  {isVotingOTC && (
                                    <button
                                      type="button"
                                      onClick={finalizeObjectionVote}
                                      disabled={meetingRecessed}
                                      title={
                                        meetingRecessed
                                          ? "Disabled — meeting in recess"
                                          : "End objection vote and apply result"
                                      }
                                    >
                                      End Objection Vote (decide by tally)
                                    </button>
                                  )}
                                </>
                              );
                            })()}
                            <button
                              type="button"
                              onClick={() => {
                                // Adjourn meeting: advance meeting ids and mark ONLY the
                                // active motion's root + its submotions as unfinished.
                                try {
                                  const prevId = currentMeetingId; // meeting we are ending
                                  const nextId = String(Date.now()); // new meeting id
                                  setPreviousMeetingId(prevId);
                                  setCurrentMeetingId(nextId);
                                  try {
                                    localStorage.setItem(
                                      "previousMeetingId",
                                      prevId
                                    );
                                    localStorage.setItem(
                                      "currentMeetingId",
                                      nextId
                                    );
                                  } catch (err) {}

                                  const targetRootId = (() => {
                                    if (
                                      activeMotion &&
                                      activeMotion.meta &&
                                      activeMotion.meta.kind === "sub" &&
                                      activeMotion.meta.parentMotionId
                                    ) {
                                      return activeMotion.meta.parentMotionId;
                                    }
                                    return activeMotion
                                      ? activeMotion.id
                                      : null;
                                  })();

                                  if (targetRootId) {
                                    setMotions((old) => {
                                      const updated = (old || []).map((m) => {
                                        const st = m.state || "discussion";
                                        const eligibleStates = [
                                          "discussion",
                                          "voting",
                                          "paused",
                                        ]; // ongoing states
                                        const isInGroup =
                                          m.id === targetRootId ||
                                          (m.meta &&
                                            m.meta.kind === "sub" &&
                                            m.meta.parentMotionId ===
                                              targetRootId);
                                        const isEligible =
                                          isInGroup &&
                                          eligibleStates.includes(st) &&
                                          st !== "postponed" &&
                                          st !== "closed";
                                        if (isEligible) {
                                          return {
                                            ...m,
                                            carryOver: true,
                                            meetingId: prevId, // associate with concluded meeting
                                          };
                                        }
                                        return m;
                                      });
                                      if (committee) {
                                        try {
                                          saveMotionsForCommittee(
                                            committee.id,
                                            updated
                                          );
                                        } catch (e) {}
                                      }
                                      return updated;
                                    });
                                  }
                                } catch (err) {
                                  // ignore errors to keep UI responsive
                                }
                                setShowChairMenu(false);
                              }}
                            >
                              Adjourn Meeting
                            </button>
                            {!(
                              activeMotion &&
                              activeMotion.meta &&
                              activeMotion.meta.kind === "sub" &&
                              activeMotion.meta.subType === "postpone"
                            ) && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => {
                                    try {
                                      setShowChairMenu(false);
                                    } catch (err) {}
                                    handleOpenSubmotion(
                                      "postpone",
                                      activeMotion
                                    );
                                  }}
                                  disabled={isVoting || meetingRecessed}
                                  title={
                                    meetingRecessed
                                      ? "Disabled — meeting in recess"
                                      : isVoting
                                      ? "Disabled — voting in progress"
                                      : "Create a postponement submotion"
                                  }
                                >
                                  Postpone Decision
                                </button>
                              </>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                if (!canChairClose) return;
                                handleCloseMotionNow(activeMotion?.id);
                                setShowChairMenu(false);
                              }}
                              disabled={
                                meetingRecessed ||
                                !(isDiscussion || isPaused || isVoting)
                              }
                              title={
                                meetingRecessed
                                  ? "Disabled — meeting in recess"
                                  : isVoting
                                  ? "Close motion (cancel vote/kill)"
                                  : isDiscussion || isPaused
                                  ? "Close motion"
                                  : "Close disabled"
                              }
                            >
                              Close Motion
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={
                    sessionClosed
                      ? "Session closed"
                      : sessionPaused
                      ? "Session paused"
                      : (activeMotion?.state || "discussion") === "postponed"
                      ? "Motion postponed"
                      : activeMotion?.state === "referred"
                      ? `Write a comment for ${activeMotion.title}…`
                      : activeMotion
                      ? `Write a comment for ${activeMotion.title}…`
                      : "Select a motion to comment"
                  }
                  disabled={
                    sessionPaused ||
                    sessionClosed ||
                    meetingRecessed ||
                    (activeMotion &&
                      (activeMotion.state || "discussion") === "postponed") ||
                    !activeMotion
                  }
                  aria-disabled={
                    sessionPaused ||
                    sessionClosed ||
                    meetingRecessed ||
                    (activeMotion &&
                      (activeMotion.state || "discussion") === "postponed") ||
                    !activeMotion
                  }
                  title={
                    sessionClosed
                      ? "Session closed"
                      : sessionPaused
                      ? "Session paused"
                      : meetingRecessed
                      ? "Meeting in recess"
                      : activeMotion &&
                        (activeMotion.state || "discussion") === "postponed"
                      ? "Motion postponed"
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
                      disabled={
                        sessionPaused ||
                        sessionClosed ||
                        meetingRecessed ||
                        (activeMotion &&
                          (activeMotion.state || "discussion") ===
                            "postponed") ||
                        !activeMotion
                      }
                      aria-disabled={
                        sessionPaused ||
                        sessionClosed ||
                        meetingRecessed ||
                        (activeMotion &&
                          (activeMotion.state || "discussion") ===
                            "postponed") ||
                        !activeMotion
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
                      disabled={
                        sessionPaused ||
                        sessionClosed ||
                        meetingRecessed ||
                        (activeMotion &&
                          (activeMotion.state || "discussion") ===
                            "postponed") ||
                        !activeMotion
                      }
                      aria-disabled={
                        sessionPaused ||
                        sessionClosed ||
                        meetingRecessed ||
                        (activeMotion &&
                          (activeMotion.state || "discussion") ===
                            "postponed") ||
                        !activeMotion
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
                      disabled={
                        sessionPaused ||
                        sessionClosed ||
                        meetingRecessed ||
                        (activeMotion &&
                          (activeMotion.state || "discussion") ===
                            "postponed") ||
                        !activeMotion
                      }
                      aria-disabled={
                        sessionPaused ||
                        sessionClosed ||
                        meetingRecessed ||
                        (activeMotion &&
                          (activeMotion.state || "discussion") ===
                            "postponed") ||
                        !activeMotion
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
                    meetingRecessed ||
                    (activeMotion &&
                      (activeMotion.state || "discussion") === "postponed") ||
                    !activeMotion ||
                    !input.trim()
                  }
                  aria-disabled={
                    sessionPaused ||
                    sessionClosed ||
                    meetingRecessed ||
                    (activeMotion &&
                      (activeMotion.state || "discussion") === "postponed") ||
                    !activeMotion ||
                    !input.trim()
                  }
                  title={
                    sessionClosed
                      ? "Session closed"
                      : sessionPaused
                      ? "Session paused"
                      : meetingRecessed
                      ? "Meeting in recess"
                      : activeMotion &&
                        (activeMotion.state || "discussion") === "postponed"
                      ? "Motion postponed"
                      : undefined
                  }
                >
                  <SendIcon />
                </button>
              </form>
            ) : !otcClosed ? (
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
                            {["Passed", "Failed", "Referred"].map((opt) => {
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
                            })}
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
                              disabled={!userVotedYes || meetingRecessed}
                              aria-disabled={!userVotedYes || meetingRecessed}
                              title={
                                meetingRecessed
                                  ? "Disabled — meeting in recess"
                                  : userVotedYes
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
                          {["Passed", "Failed", "Referred"].map((opt) => {
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
                          })}
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
            ) : null}
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
