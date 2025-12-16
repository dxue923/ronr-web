const AVATAR_SIZE = 40;
function Avatar({ src, alt }) {
  const hasImage = src && src.trim().length > 0;
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
          border: "1px solid #d1d5db",
          background: "#e5e7eb",
          flexShrink: 0,
        }}
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
        border: "1px solid #d1d5db",
        flexShrink: 0,
      }}
    />
  );
}
// Helper to render a message row in the discussion panel
function MessageRow({ authorName, avatarUrl, text, time, stance }) {
  return (
    <div className="chat-message-row">
      <span className="chat-discussion-avatar">
        <Avatar src={avatarUrl} alt={authorName} />
      </span>
      <div className="chat-message-content">
        <div className="chat-message-meta">
          <span className="chat-message-author">{authorName}</span>
          <span className="chat-message-time">
            {new Date(time).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        </div>
        <div className="chat-message-bubble">{text}</div>
      </div>
    </div>
  );
}

function LiveProfileMemberCard({
  username,
  fallbackName,
  role,
  avatarUrl,
  canRemove,
  onRemove,
}) {
  const displayName = fallbackName || username;
  return (
    <div className="member-row">
      <Avatar src={avatarUrl} alt={displayName} />
      <div>
        <div className="member-name">{displayName}</div>
        <RoleBadge role={role} />
      </div>
      {canRemove && (
        <button
          type="button"
          className="remove-member-btn"
          title="Remove participant"
          onClick={onRemove}
        >
          ×
        </button>
      )}
    </div>
  );
}
// src/pages/Chat.jsx
import React, { useState, useRef, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { useAuth0 } from "@auth0/auth0-react";
import { ROLE } from "../utils/permissions";
import { getCommentsForMotion, createComment } from "../api/discussion";
import {
  getCommittee as apiGetCommittee,
  updateCommittee as apiUpdateCommittee,
  getCommittees as apiGetCommittees,
} from "../api/committee";
import {
  fetchMotions,
  createMotion as apiCreateMotion,
  updateMotionStatus,
  castMotionVote,
  updateMotion,
} from "../api/motions";
import "../assets/styles/index.css";
import { getMeeting } from "../api/meetings";
import logo from "../assets/logo.png";
import {
  fetchProfile as apiFetchProfile,
  lookupProfile as apiLookupProfile,
} from "../api/profile";
import { getApiToken } from "../api/auth";
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
function getFallbackUser() {
  return { id: "guest", username: "guest", name: "Guest", avatarUrl: "" };
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
  const {
    isAuthenticated,
    getIdTokenClaims,
    getAccessTokenSilently,
    user,
    isLoading: authLoading,
  } = useAuth0();
  // Show a temporary 'Referred' pill for 10 seconds after motion arrives
  const isRecentlyReferred = (m) => {
    const rf = m?.meta?.referredFrom;
    if (!rf) return false;
    const ts = rf.receivedAt || rf.timestamp || rf.time || rf.createdAt;
    const t = typeof ts === "string" ? Date.parse(ts) : Number(ts);
    if (!t || Number.isNaN(t)) return false;
    return Date.now() - t < 10000;
  };
  const [submotionCollapsed, setSubmotionCollapsed] = React.useState({});
  const [submotionMenuOpen, setSubmotionMenuOpen] = useState(false);

  const toggleSubmotions = (parentId, ev) => {
    if (ev && ev.stopPropagation) ev.stopPropagation();
    setSubmotionCollapsed((s) => ({ ...s, [parentId]: !s[parentId] }));
  };
  const { id } = useParams(); // committee id
  const [committee, setCommittee] = useState(() => findCommitteeById(id));
  const [committeeError, setCommitteeError] = useState("");
  const [committeeLoading, setCommitteeLoading] = useState(false);

  // If committee isn't found locally, fetch from backend
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!id) return;
      setCommitteeLoading(true);
      setCommitteeError("");
      try {
        const remote = await apiGetCommittee(id);
        if (cancelled) return;
        if (remote && remote.id) {
          setCommittee(remote);
          // Also persist into localStorage for legacy helpers
          try {
            const list = loadCommittees();
            const exists = list.some((c) => c.id === remote.id);
            const next = exists
              ? list.map((c) => (c.id === remote.id ? remote : c))
              : [remote, ...list];
            saveCommittees(next);
          } catch (e) {}
        } else {
          setCommitteeError("Committee not found");
        }
      } catch (err) {
        if (!cancelled)
          setCommitteeError(err.message || "Failed to load committee");
      } finally {
        if (!cancelled) setCommitteeLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  // Close submotion menu on outside click or Escape
  useEffect(() => {
    if (!submotionMenuOpen) return;
    const handleDocClick = (e) => {
      const wrapper = document.querySelector(".submotion-kebab-wrapper");
      if (!wrapper) return;
      if (!wrapper.contains(e.target)) {
        setSubmotionMenuOpen(false);
      }
    };
    const handleKey = (e) => {
      if (e.key === "Escape") setSubmotionMenuOpen(false);
    };
    document.addEventListener("click", handleDocClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("click", handleDocClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [submotionMenuOpen]);

  const [motions, setMotions] = useState([]);
  const [activeMotionId, setActiveMotionId] = useState(
    () => motions[0]?.id || null
  );
  const [loadingComments, setLoadingComments] = useState(false);
  const [commentsError, setCommentsError] = useState("");
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
    try {
      if (committee?.id)
        localStorage.setItem(
          `committee:${committee.id}:motions:updateAt`,
          String(Date.now())
        );
    } catch (e) {}
  };
  const scrollRef = useRef(null);
  const recessRestoredRef = useRef(false);
  // Whether auto-scrolling to bottom is allowed. If the user scrolls up,
  // we set this to false so periodic updates won't yank the view to bottom.
  const allowAutoScroll = useRef(true);
  // Robust scroll-to-bottom helper: uses two RAF ticks and computes the
  // precise target as scrollHeight - clientHeight to reach the true bottom.
  const scrollToBottom = (force = false) => {
    const el = scrollRef.current;
    if (!el) return;
    if (!force && !allowAutoScroll.current) return;
    try {
      requestAnimationFrame(() => {
        try {
          const target = Math.max(0, el.scrollHeight - el.clientHeight);
          el.scrollTop = target;
        } catch (e) {}
        requestAnimationFrame(() => {
          try {
            const target2 = Math.max(0, el.scrollHeight - el.clientHeight);
            el.scrollTop = target2;
          } catch (e) {}
        });
      });
    } catch (e) {}
  };
  const composerInputRef = useRef(null);
  // ...existing code...
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
  const [chatForceLoading, setChatForceLoading] = useState(true);
  const [motionsLoadedOnce, setMotionsLoadedOnce] = useState(false);
  const [me, setMe] = useState(getFallbackUser());
  // whether we're still fetching member profiles (names/avatars)
  const [profilesLoading, setProfilesLoading] = useState(false);
  // timeout (ms) to force-clear `profilesLoading` if lookups hang
  const PROFILE_LOOKUP_TIMEOUT_MS = 5000;
  // Load current user from Profile API when authenticated and refresh on profile updates
  useEffect(() => {
    let cancelled = false;

    async function loadMe() {
      // Quick-path: if Auth0 provided a `user` object synchronously, use it
      // immediately so message ownership can be established on first render.
      try {
        if (user && !cancelled) {
          const emailLocal = (user.email || "").split("@")[0] || "";
          const username = (
            user.nickname ||
            user.preferred_username ||
            emailLocal ||
            user.sub ||
            ""
          )
            .toString()
            .trim();
          const stableId = username || "guest";
          const name = (user.name || username || "Guest").toString().trim();
          const preview = {
            id: stableId,
            username: stableId,
            name,
            avatarUrl: user.picture || "",
          };
          setMe(preview);
        }
      } catch (e) {}
      try {
        if (!isAuthenticated) {
          setMe(getFallbackUser());
          return;
        }
        // Prefer access token (for correct audience) and fall back to ID token.
        const { token } = await getApiToken({
          getAccessTokenSilently,
          getIdTokenClaims,
        });
        const profile = token ? await apiFetchProfile(token) : null;
        if (!profile || cancelled) return;
        const emailLocal = (profile.email || "").split("@")[0] || "";
        const username = (profile.username || emailLocal || "")
          .toString()
          .trim();
        const stableId = username || "guest";
        const name = (profile.name || "").toString().trim() || stableId;
        const next = {
          id: stableId,
          username: stableId,
          name,
          avatarUrl: profile.avatarUrl || "",
        };
        setMe(next);
      } catch (e) {
        setMe(getFallbackUser());
      }
    }

    loadMe();

    const onProfileUpdated = () => {
      loadMe();
    };
    window.addEventListener("profile-updated", onProfileUpdated);
    const onStorage = (e) => {
      if (e.key === "profileUpdatedAt") loadMe();
    };
    window.addEventListener("storage", onStorage);

    return () => {
      cancelled = true;
      window.removeEventListener("profile-updated", onProfileUpdated);
      window.removeEventListener("storage", onStorage);
    };
  }, [isAuthenticated, getIdTokenClaims]);

  const authToken = (() => {
    try {
      return localStorage.getItem("authToken") || null;
    } catch {
      return null;
    }
  })();
  // stance selection for composer (submission stance)
  const [composerStance, setComposerStance] = useState("neutral");
  // visual highlight stance (neutral highlighted by default)
  const [composerStanceVisual, setComposerStanceVisual] = useState("neutral");
  // view tab for middle column: 'discussion' | 'final'
  const [viewTab, setViewTab] = useState("discussion");
  // per-motion remembered tabs (remember last-opened tab per motion)
  const [motionTabs, setMotionTabs] = useState({});

  useEffect(() => {
    const t = setTimeout(() => setChatForceLoading(false), 200);
    return () => clearTimeout(t);
  }, []);

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
  // postpone submotion choice simplified to specific date/time only
  const [postponeOption, setPostponeOption] = useState("specific");
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
  // meeting toggle UI removed
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
  // Close chair controls on outside click or Escape
  useEffect(() => {
    if (!showChairMenu) return;
    const onClickOutside = (e) => {
      try {
        const panel = document.querySelector(".chair-menu");
        const trigger = document.querySelector(".chair-icon-btn");
        const target = e.target;
        const inPanel = panel && panel.contains(target);
        const onTrigger = trigger && trigger.contains(target);
        if (!inPanel && !onTrigger) setShowChairMenu(false);
      } catch {}
    };
    const onKey = (e) => {
      if (e.key === "Escape") setShowChairMenu(false);
    };
    document.addEventListener("click", onClickOutside);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onClickOutside);
      document.removeEventListener("keydown", onKey);
    };
  }, [showChairMenu]);
  // removed: transient blink indicator for Final Decision tab
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

  const showInitialOverlay =
    ((committeeLoading && !committee) ||
      (!motionsLoadedOnce && !motions.length) ||
      (loadingComments && !motionsLoadedOnce) ||
      chatForceLoading ||
      (profilesLoading &&
        committee &&
        ((committee.members && committee.members.length > 0) ||
          (committee.memberships && committee.memberships.length > 0)))) &&
    !commentsError;

  // find active motion object
  const activeMotion = motions.find((m) => m.id === activeMotionId) || null;
  // normalize votes into an array of { voterId, choice } for UI usage
  const voteEntries = (motion) => {
    if (!motion) return [];
    // preferred: motion.votes is already an array of vote entries
    if (Array.isArray(motion.votes)) return motion.votes;
    // fallback: per-voter choices stored in meta.voterChoices (object mapping voterId -> choice)
    const choices =
      motion.meta && typeof motion.meta.voterChoices === "object"
        ? motion.meta.voterChoices
        : null;
    if (choices) {
      return Object.keys(choices).map((voterId) => ({
        voterId,
        choice: choices[voterId],
      }));
    }
    return [];
  };
  const otcClosed = isOtcClosed(activeMotion);
  // whether the current session for the active motion is paused
  const sessionPaused = activeMotion?.state === "paused";
  // whether the current session for the active motion is closed
  const sessionClosed = activeMotion?.state === "closed";
  // whether the current user voted 'yes' on the active motion
  const userVotedYes = voteEntries(activeMotion).some(
    (v) =>
      (v.voterId || "") === (me.id || "") &&
      (v.choice || "").toString().toLowerCase() === "yes"
  );
  // track vote submission in-flight to avoid duplicate casts
  const [voteSubmittingFor, setVoteSubmittingFor] = useState(null);
  // synchronous ref used as immediate guard against duplicate rapid clicks
  const voteSubmittingRef = useRef(null);
  const [showFinalOverlay, setShowFinalOverlay] = useState(false);

  // auto-show final decision overlay when a motion with decisionDetails becomes active
  useEffect(() => {
    if (activeMotion && activeMotion.decisionDetails) {
      setShowFinalOverlay(true);
    } else {
      setShowFinalOverlay(false);
    }
  }, [activeMotion?.id, activeMotion?.decisionDetails]);

  // Load motions from backend for this committee
  useEffect(() => {
    if (!committee) return;
    (async () => {
      try {
        const remote = await fetchMotions(committee.id);
        const mapped = (remote || []).map((m) => {
          // reconstruct local state & meta so submotions remain attached after reload
          const state =
            m.status === "paused"
              ? "paused"
              : m.status === "postponed"
              ? "postponed"
              : m.status === "referred"
              ? "referred"
              : m.status === "voting"
              ? "voting"
              : m.status === "closed" ||
                m.status === "passed" ||
                m.status === "failed"
              ? "closed"
              : "discussion";
          const meta = { ...(m.meta || {}) };
          // Support both new canonical fields (type/parentMotionId) and legacy meta.submotionOf
          const isSub =
            (m.type === "submotion" && m.parentMotionId) ||
            !!meta.submotionOf ||
            !!meta.parentMotionId;
          if (isSub) {
            meta.kind = "sub";
            meta.parentMotionId =
              m.parentMotionId || meta.submotionOf || meta.parentMotionId;
            // if a submotionType was provided in meta, normalize to subType for UI code
            if (meta.submotionType && !meta.subType)
              meta.subType = meta.submotionType;
          }
          // Overturn motions: ensure grouping works after reload
          // (stored as meta.overturnOf when proposed locally)
          return {
            id: m.id,
            title: m.title,
            description: m.description,
            state,
            messages: [],
            decisionLog: [],
            votes: [],
            meta,
            decisionDetails: m.decisionDetails || undefined,
          };
        });
        setMotions(mapped);
        setMotionsLoadedOnce(true);
        // Default: collapse all submotions on initial load
        try {
          const parents = new Set();
          (mapped || []).forEach((m) => {
            const meta = m.meta || {};
            if (meta && meta.kind === "sub" && meta.parentMotionId) {
              parents.add(meta.parentMotionId);
            }
          });
          setSubmotionCollapsed((prev) => {
            const next = { ...prev };
            parents.forEach((pid) => {
              if (typeof next[pid] === "undefined") next[pid] = true;
            });
            return next;
          });
        } catch {}
        // set initial active motion
        setActiveMotionId(mapped[0]?.id || null);
      } catch (err) {
        console.error("Failed to load motions", err);
        try {
          const local = loadMotionsForCommittee(committee.id);
          setMotions(local);
          // Collapse submotions by default for local fallback as well
          try {
            const parents = new Set();
            (local || []).forEach((m) => {
              const meta = m.meta || {};
              if (meta && meta.kind === "sub" && meta.parentMotionId) {
                parents.add(meta.parentMotionId);
              }
            });
            setSubmotionCollapsed((prev) => {
              const next = { ...prev };
              parents.forEach((pid) => {
                if (typeof next[pid] === "undefined") next[pid] = true;
              });
              return next;
            });
          } catch {}
          setActiveMotionId(local[0]?.id || null);
        } catch {}
      }
    })();
  }, [committee?.id]);

  // Ensure submotions remain collapsed by default when motions change
  useEffect(() => {
    try {
      const parents = new Set();
      (motions || []).forEach((m) => {
        const meta = m.meta || {};
        if (meta && meta.kind === "sub" && meta.parentMotionId) {
          parents.add(meta.parentMotionId);
        }
      });
      setSubmotionCollapsed((prev) => {
        const next = { ...prev };
        parents.forEach((pid) => {
          if (typeof next[pid] === "undefined") next[pid] = true;
        });
        return next;
      });
    } catch {}
  }, [motions]);

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

  // meeting toggle animation removed

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
      // persist recess state per-committee (skip if we haven't restored yet)
      try {
        if (recessRestoredRef.current) {
          localStorage.setItem(
            `committee:${committee.id}:meetingRecessed`,
            meetingRecessed ? "true" : "false"
          );
        }
      } catch (e) {}
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
    meetingRecessed,
    currentMeetingDate,
  ]);

  // Restore persisted recess state when committee changes
  useEffect(() => {
    if (!committee?.id) return;
    try {
      const raw = localStorage.getItem(
        `committee:${committee.id}:meetingRecessed`
      );
      if (raw !== null) {
        setMeetingRecessed(raw === "true");
        // mark that we've restored from storage so initial persist won't overwrite
        recessRestoredRef.current = true;
      }
    } catch (e) {}
  }, [committee?.id]);

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
    // Only auto-scroll if the user hasn't scrolled up.
    scrollToBottom();
  }, [activeMotion?.messages]);

  // ensure we scroll to the most recent messages when returning to Discussion view
  useEffect(() => {
    if (viewTab !== "discussion") return;
    if (!scrollRef.current) return;
    const t = setTimeout(() => {
      scrollToBottom();
    }, 0);
    return () => clearTimeout(t);
  }, [viewTab, activeMotion?.id, activeMotion?.messages]);

  // Track whether the user has scrolled away from the bottom. When the
  // user scrolls up we disable auto-scroll so polling/new-data won't force
  // the viewport back to the bottom. Re-enable when user scrolls back near
  // the bottom (threshold in px).
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let raf = null;
    const THRESHOLD = 80; // px from bottom considered "at bottom"
    const onScroll = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        try {
          const scrollTop = el.scrollTop;
          const clientH = el.clientHeight;
          const scrollH = el.scrollHeight;
          const dist = scrollH - (scrollTop + clientH);
          allowAutoScroll.current = dist <= THRESHOLD;
        } catch (err) {}
      });
    };
    // initialize
    onScroll();
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      try {
        el.removeEventListener("scroll", onScroll);
      } catch {}
      if (raf) cancelAnimationFrame(raf);
    };
  }, [scrollRef.current]);

  // fetch remote comments when active motion changes or on interval (polling)
  useEffect(() => {
    if (!activeMotionId) return;
    let cancelled = false;
    let pollTimer = null;
    async function loadComments() {
      try {
        const remote = await getCommentsForMotion(activeMotionId);
        if (cancelled) return;
        // Always fetch the latest profile for each author and use their profile.name when present.
        // If no profile name is available, fall back to the raw authorId.
        const mapped = await Promise.all(
          (remote || []).map(async (c) => {
            let displayName = "";
            try {
              let profile = null;
              if (typeof findProfileByUsername === "function") {
                const lookupKey =
                  c.authorId && c.authorId.includes("@")
                    ? c.authorId
                    : c.authorId;
                const lookupResult = findProfileByUsername(lookupKey);
                profile =
                  typeof lookupResult === "function"
                    ? await lookupResult()
                    : lookupResult;
              } else if (typeof getProfileByUsername === "function") {
                const lookupKey =
                  c.authorId && c.authorId.includes("@")
                    ? c.authorId
                    : c.authorId;
                profile = await getProfileByUsername(lookupKey);
              }
              if (profile && profile.name && profile.name.trim()) {
                displayName = profile.name.trim();
              }
            } catch {}
            // Fallback: always use authorId if no name found
            if (!displayName) {
              displayName = (c.authorId || "").toString().trim();
            }
            return {
              id: c.id,
              authorId: c.authorId,
              authorName: displayName,
              text: c.text,
              time: c.createdAt || new Date().toISOString(),
              stance: c.position || "neutral",
            };
          })
        );
        setMotions((prev) =>
          prev.map((m) =>
            m.id === activeMotionId ? { ...m, messages: mapped } : m
          )
        );
      } catch (err) {
        if (!cancelled)
          setCommentsError(err.message || "Failed to load comments");
      }
    }
    // Initial load
    setLoadingComments(true);
    loadComments().finally(() => setLoadingComments(false));
    // Poll every 3 seconds
    pollTimer = setInterval(loadComments, 3000);
    // Listen for profile-updated events to reload comments
    const onProfileUpdated = () => {
      setLoadingComments(true);
      loadComments().finally(() => setLoadingComments(false));
    };
    window.addEventListener("profile-updated", onProfileUpdated);
    return () => {
      cancelled = true;
      if (pollTimer) clearInterval(pollTimer);
      window.removeEventListener("profile-updated", onProfileUpdated);
    };
  }, [activeMotionId]);

  // Avoid early return before hooks complete to maintain consistent hook order.
  const committeeUnavailable = !committee;
  // If we do have a committee, prefer to align "me" with its member list
  // so that authorId used in comments matches the committee member IDs.
  useEffect(() => {
    if (!committee) return;
    try {
      const list = committee.members || committee.memberships || [];
      if (!Array.isArray(list) || list.length === 0) return;
      const cid = (me.id || "").toString();
      const cuser = (me.username || "").toString();
      const match = list.find((m) => {
        const mid = (m.id || "").toString();
        const muser = (m.username || "").toString();
        return (
          (cid && (mid === cid || muser === cid)) ||
          (cuser && (mid === cuser || muser === cuser))
        );
      });
      // If we find a matching committee member, use that as the source of truth.
      if (match) {
        const username = (match.username || match.id || "").toString();
        const name = (match.name || "").toString().trim() || username;
        setMe({
          id: username,
          username,
          name,
          avatarUrl: match.avatarUrl || "",
        });
        return;
      }
      // If no match, keep existing `me` as-is
    } catch {
      // best-effort alignment only
    }
  }, [committee]);

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
  // Normalize members to a unified client shape from server data
  // Filter out anonymous/placeholder entries like "guest"/"anon" or blank usernames
  const normalizeMembers = (c) => {
    if (!c) return [];
    const list = c.members || c.memberships || [];

    const used = new Set();
    const out = [];

    (list || []).forEach((m) => {
      // attempt to derive a sensible username
      let uname = "";
      try {
        uname = (m.username || "").toString().trim();
      } catch (e) {
        uname = "";
      }
      // ignore obvious placeholders
      if (!uname || ["guest", "anon", "test2"].includes(uname.toLowerCase())) {
        uname = "";
      }

      // derive from email local-part if available
      if (!uname) {
        const email = (m.email || m.userEmail || m.mail || "")
          .toString()
          .trim();
        if (email && email.includes("@")) uname = email.split("@")[0];
      }

      // if still missing, try id local-part
      if (!uname) {
        const mid = (m.id || "").toString().trim();
        if (mid && mid.includes("@")) uname = mid.split("@")[0];
      }

      // fallback to name or id
      if (!uname) uname = (m.name || m.id || "").toString().trim();
      if (!uname) return; // skip empty

      // ensure uniqueness (case-insensitive)
      let candidate = uname;
      let suffix = 1;
      while (used.has(candidate.toLowerCase())) {
        candidate = `${uname}-${suffix}`;
        suffix += 1;
      }
      used.add(candidate.toLowerCase());

      out.push({
        id: candidate,
        username: candidate,
        name: (m.name || candidate).toString().trim(),
        role: (m.role || "member").toLowerCase(),
        avatarUrl: m.avatarUrl || "",
      });
    });

    return out;

    // // Member profile card for chat participants
    // function MemberProfileCard({ username, role }) {
    //   const [profile, setProfile] = useState(null);
    //   useEffect(() => {
    //     let mounted = true;
    //     async function fetchProfile() {
    //       // Use backend lookup for latest info
    //       let fn = findProfileByUsername;
    //       let p = null;
    //       if (typeof fn === "function") {
    //         const lookup = await fn(username);
    //         if (typeof lookup === "function") {
    //           p = await lookup();
    //         } else {
    //           p = lookup;
    //         }
    //       }
    //       if (mounted) setProfile(p);
    //     }
    //     fetchProfile();
    //     window.addEventListener("profile-updated", fetchProfile);
    //     return () => {
    //       mounted = false;
    //       window.removeEventListener("profile-updated", fetchProfile);
    //     };
    //   }, [username]);
    //   if (!profile) return null;
    //   const displayName =
    //     profile.name && profile.name.trim().length > 0
    //       ? profile.name
    //       : profile.username;
    //   const avatarSrc =
    //     profile.avatarUrl && profile.avatarUrl.trim().length > 0
    //       ? profile.avatarUrl
    //       : "https://ui-avatars.com/api/?name=" +
    //         encodeURIComponent(displayName || username) +
    //         "&background=e5e7eb&color=374151&size=40";
    //   return (
    //     <div className="member-item" id={`member-${username}`}>
    //       <div className="member-left">
    //         <img
    //           src={avatarSrc}
    //           alt={displayName || username || "avatar"}
    //           className="member-avatar"
    //           style={{
    //             width: 40,
    //             height: 40,
    //             borderRadius: "9999px",
    //             objectFit: "cover",
    //             border: "1px solid #d1d5db",
    //             background: "#e5e7eb",
    //             flexShrink: 0,
    //           }}
    //         />
    //         <div className="member-meta">
    //           <p className="member-name">{displayName}</p>
    //           <p className="member-username">{profile.username}</p>
    //           <RoleBadge role={role} />
    //         </div>
    //       </div>
    //     </div>
    //   );
    // }
    // // Render participants with live profile info
    // function ParticipantsList() {
    //   return (
    //     <div className="participants-list">
    //       {members.map((m) => (
    //         <MemberProfileCard
    //           key={m.username}
    //           username={m.username}
    //           role={m.role}
    //         />
    //       ))}
    //     </div>
    //   );
    // }
  };
  const members = committeeUnavailable ? [] : normalizeMembers(committee);

  const [profileCache, setProfileCache] = useState({}); // keyed by username

  // Prefetch member profiles (avatars/names) for display in messages
  useEffect(() => {
    let cancelled = false;
    let remaining = 0;

    async function ensureProfile(username) {
      if (!username) return;
      // If we've already attempted this username (success or failure), don't retry.
      if (Object.prototype.hasOwnProperty.call(profileCache, username)) return;
      try {
        const { token } = await getApiToken({
          getAccessTokenSilently,
          getIdTokenClaims,
        });
        const prof = await apiLookupProfile(token, username).catch(() => null);
        if (cancelled) return;
        if (prof) {
          setProfileCache((p) => ({ ...p, [username]: prof }));
        } else {
          // mark as attempted (null) so we don't endlessly retry failing usernames
          setProfileCache((p) => ({ ...p, [username]: null }));
        }
      } catch (e) {
        // mark as attempted on unexpected errors as well
        try {
          setProfileCache((p) => ({ ...p, [username]: null }));
        } catch {}
      }
    }

    const names = new Set();
    (members || []).forEach((m) => {
      if (m && m.username) names.add(m.username);
    });
    (activeMotion?.messages || []).forEach((msg) => {
      const aid = (msg.authorId || "").toString().trim();
      if (aid) names.add(aid);
    });

    // If there are no names to fetch, ensure loading flag is cleared.
    if (names.size === 0) {
      setProfilesLoading(false);
      return () => {
        cancelled = true;
      };
    }

    // mark as loading while lookups are in-flight
    setProfilesLoading(true);
    remaining = names.size;

    // start a timeout fallback so we don't wait forever
    let timeoutId = null;
    try {
      timeoutId = setTimeout(() => {
        if (!cancelled) setProfilesLoading(false);
      }, PROFILE_LOOKUP_TIMEOUT_MS);
    } catch {}

    names.forEach((u) => {
      (async () => {
        try {
          await ensureProfile(u);
        } finally {
          remaining -= 1;
          if (!cancelled && remaining <= 0) {
            try {
              if (timeoutId) clearTimeout(timeoutId);
            } catch {}
            setProfilesLoading(false);
          }
        }
      })();
    });

    return () => {
      cancelled = true;
      try {
        if (timeoutId) clearTimeout(timeoutId);
      } catch {}
    };
  }, [
    members,
    activeMotion?.messages,
    getAccessTokenSilently,
    getIdTokenClaims,
    profileCache,
  ]);

  const persistMembers = async (nextMembers) => {
    try {
      if (!committee?.id) return;
      const payloadMembers = nextMembers
        .map((m) => {
          const username = (m.username || m.id || m.name || "")
            .toString()
            .trim();
          const name = (m.name || "").toString().trim() || username;
          if (!username) return null;
          if (["guest", "anon"].includes(username.toLowerCase())) return null;
          return {
            username,
            name,
            role: (m.role || "member").toLowerCase(),
            avatarUrl: m.avatarUrl || "",
          };
        })
        .filter(Boolean);

      // Acquire API token (prefer access token) for update request
      let apiToken = null;
      try {
        const { token, isAccessToken } = await getApiToken({
          getAccessTokenSilently,
          getIdTokenClaims,
        });
        if (token) {
          if (isAccessToken) apiToken = token;
          else {
            const idClaims = await getIdTokenClaims().catch(() => null);
            apiToken = idClaims?.__raw || token;
          }
        }
      } catch {}

      const updated = await apiUpdateCommittee(
        committee.id,
        {
          name: committee.name,
          ownerId: committee.ownerId || committee.owner,
          members: payloadMembers,
          settings: committee.settings || {},
        },
        apiToken
      );
      // ...keep the rest of persistMembers the same

      if (updated && updated.id) {
        setCommittee(updated);
        // also sync localStorage cache for legacy helpers
        try {
          const list = loadCommittees();
          const exists = list.some((c) => c.id === updated.id);
          const next = exists
            ? list.map((c) => (c.id === updated.id ? updated : c))
            : [updated, ...list];
          saveCommittees(next);
        } catch {}
      } else {
        setMembersRev((r) => r + 1);
      }
    } catch (e) {
      console.warn("Persist members failed; keeping local", e);
      setMembersRev((r) => r + 1);
    }
  };

  // derive current user's role and manager permissions
  const myMembership = (members || []).find(
    (m) =>
      (m.id || m.name || "").toString() ===
      (me.id || me.username || "").toString()
  );
  const myRole =
    myMembership?.role ||
    (committee?.ownerId === me.id || committee?.owner === me.id
      ? ROLE.OWNER
      : ROLE.MEMBER);
  const amIManager = myRole === ROLE.CHAIR || myRole === ROLE.OWNER;

  // Meeting status is managed locally; avoid remote GET to reduce server calls

  // When profile changes, refresh committee to reflect updated names/usernames in participants
  useEffect(() => {
    async function refreshCommitteeFromServer() {
      try {
        if (!committee?.id) return;
        const remote = await apiGetCommittee(committee.id);
        if (remote && remote.id) {
          setCommittee(remote);
          try {
            const list = loadCommittees();
            const exists = list.some((c) => c.id === remote.id);
            const next = exists
              ? list.map((c) => (c.id === remote.id ? remote : c))
              : [remote, ...list];
            saveCommittees(next);
          } catch {}
        }
      } catch {}
    }
    const onUpdated = () => refreshCommitteeFromServer();
    const onStorage = (e) => {
      if (e.key === "profileUpdatedAt") refreshCommitteeFromServer();
    };
    window.addEventListener("profile-updated", onUpdated);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("profile-updated", onUpdated);
      window.removeEventListener("storage", onStorage);
    };
  }, [committee?.id]);

  // ...existing code...

  // Hide chair menu when switching active motion (e.g., user clicks another motion)
  useEffect(() => {
    if (showChairMenu && amIManager) setShowChairMenu(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMotionId]);

  // ...existing code...

  const handleSend = async (e) => {
    return handleSendWithStance(e);
  };

  const handleSendWithStance = async (e, selectedStance) => {
    e && e.preventDefault();
    if (!input.trim() || !activeMotion) return;
    if (meetingRecessed) return;
    if ((activeMotion.state || "discussion") === "postponed") return;
    const text = input.trim();
    const stanceToUse = (
      selectedStance ||
      composerStance ||
      "neutral"
    ).toLowerCase();
    setInput("");
    try {
      // Always use the current user's own identity for authorId.
      // Never borrow another member's username.
      const cid = (me.id || "").toString();
      const cuser = (me.username || "").toString();
      const authorId = cuser || cid || "guest";
      const payload = {
        motionId: activeMotion.id,
        authorId,
        text,
        position: stanceToUse,
      };
      try {
        console.debug("[Chat] send", {
          me,
          committeeMembers: committee?.members || committee?.memberships || [],
          chosenAuthorId: authorId,
          payload,
        });
      } catch {}
      try {
        console.debug("createComment payload", payload);
      } catch {}
      const created = await createComment(payload);
      const newMsg = {
        id: created.id || Date.now().toString(),
        authorId: created.authorId || authorId,
        authorName: me.name,
        text: created.text || text,
        time: created.createdAt || new Date().toISOString(),
        stance: created.position || stanceToUse || "neutral",
      };
      setMotions((prev) =>
        prev.map((m) =>
          m.id === activeMotion.id
            ? { ...m, messages: [...(m.messages || []), newMsg] }
            : m
        )
      );
      // Ensure we jump to the newest message the user just sent.
      try {
        allowAutoScroll.current = true;
        scrollToBottom(true);
      } catch (e) {}
      // keep visual highlight as current selection; default remains neutral
      // restore focus to composer for rapid entry
      try {
        if (composerInputRef.current) composerInputRef.current.focus();
      } catch {}
    } catch (err) {
      try {
        console.error("createComment error", err);
      } catch {}
      console.warn("Remote comment create failed; falling back to local", err);
      const fallbackMsg = {
        id: Date.now().toString(),
        authorId,
        authorName: me.name,
        text,
        time: new Date().toISOString(),
        stance: stanceToUse,
      };
      setMotions((prev) =>
        prev.map((m) =>
          m.id === activeMotion.id
            ? { ...m, messages: [...(m.messages || []), fallbackMsg] }
            : m
        )
      );
      // Ensure we jump to the newest message on fallback too.
      try {
        allowAutoScroll.current = true;
        scrollToBottom(true);
      } catch (e) {}
      setCommentsError(err.message || "Failed to send remotely; saved locally");
      // keep visual highlight as current selection; default remains neutral
      // restore focus to composer on failure too
      try {
        if (composerInputRef.current) composerInputRef.current.focus();
      } catch {}
    }
  };

  // Allow Enter to send when focus is on stance pills toggled via Tab
  useEffect(() => {
    function onKeyDown(e) {
      if (e.key !== "Enter") return;
      const el = document.activeElement;
      if (!el) return;
      try {
        const hasClass = el.classList && el.classList.contains("stance-pill");
        const isStance = hasClass || el.getAttribute("data-role") === "stance";
        if (isStance) {
          e.preventDefault();
          // trigger send without requiring focus on textarea
          handleSend();
        }
      } catch {}
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleSend]);

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
    // Restrict postpone submotions to main/root motions only
    if (type === "postpone" && target.meta && target.meta.kind === "sub") {
      alert("Postponement submotions are only allowed for main motions.");
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
      // reset postpone option to specific date/time
      setPostponeOption("specific");
      setPostponeDateTime("");
    } else if (type === "refer") {
      // Do not prefill description for refer; keep blank
      setNewMotionDesc("");
      // Fetch committees from backend filtered by current user membership.
      (async () => {
        try {
          const member = (me && me.username) || undefined;
          const list = await apiGetCommittees(member);
          const filtered = (list || []).filter((c) => c.id !== committee.id);
          setAllCommittees(filtered);
          setReferDestId("");
        } catch (err) {
          // fallback to legacy localStorage list if backend call fails
          try {
            const list = (loadCommittees() || []).filter(
              (c) => c.id !== committee.id
            );
            setAllCommittees(list);
          } catch (e) {
            setAllCommittees([]);
          }
          setReferDestId("");
        }
      })();
    }
    setShowAddModal(true);
  };

  const handleCreateMotion = async (e) => {
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
      let created;
      try {
        // Prepare payload for API: include submotion or overturn metadata so backend can persist hierarchy
        let apiType;
        let apiParentId;
        const apiMeta = {};
        if (submotionTarget && submotionType) {
          apiType = "submotion";
          apiParentId = submotionTarget.id;
          apiMeta.submotionType = submotionType;
        }
        if (overturnTarget) {
          apiMeta.overturnOf = overturnTarget.id;
        }
        if (submotionType === "postpone") {
          // only support specific date/time for postpone
          if (postponeDateTime) {
            try {
              apiMeta.resumeAt = new Date(postponeDateTime).toISOString();
            } catch {
              apiMeta.resumeAt = postponeDateTime;
            }
          }
        } else if (submotionType === "refer" && referDestId) {
          const dest = (allCommittees || []).find((c) => c.id === referDestId);
          apiMeta.referDetails = {
            destinationCommitteeId: referDestId,
            destinationCommitteeName: dest?.name || referDestId,
            requiresSecond: true,
            debatable: true,
            amendable: true,
          };
        }
        created = await apiCreateMotion({
          title,
          description: desc,
          committeeId: committee.id,
          type: apiType,
          parentMotionId: apiParentId,
          meta: Object.keys(apiMeta).length > 0 ? apiMeta : undefined,
          createdBy: {
            id: me.id,
            name: me.name,
            username: me.username,
            avatarUrl: me.avatarUrl,
          },
        });
      } catch (err) {
        console.error("Failed to create motion remotely", err);
        // fallback local
        const nowIso = new Date().toISOString();
        created = {
          id: crypto.randomUUID
            ? crypto.randomUUID()
            : Math.random().toString(36).slice(2, 10),
          title,
          description: desc,
          status: "in-progress",
          createdAt: nowIso,
          createdById: me?.id || "",
          createdByName: me?.name || "",
          createdByUsername: me?.username || "",
          createdByAvatarUrl: me?.avatarUrl || "",
        };
      }
      const newMotion = {
        id: created.id,
        title: created.title || title,
        description: created.description || desc,
        state:
          created.status === "paused"
            ? "paused"
            : created.status === "postponed"
            ? "postponed"
            : created.status === "referred"
            ? "referred"
            : created.status === "closed" ||
              created.status === "passed" ||
              created.status === "failed"
            ? "closed"
            : "discussion",
        messages: [],
        decisionLog: [],
        meta: (() => {
          if (overturnTarget) {
            return { overturnOf: overturnTarget.id };
          }
          if (submotionTarget && submotionType) {
            const m = {
              kind: "sub",
              subType: submotionType,
              parentMotionId: submotionTarget.id,
            };
            if (submotionType === "postpone") {
              if (postponeDateTime) {
                try {
                  m.resumeAt = new Date(postponeDateTime).toISOString();
                } catch {
                  m.resumeAt = postponeDateTime;
                }
              }
            } else if (submotionType === "refer" && referDestId) {
              const dest = (allCommittees || []).find(
                (c) => c.id === referDestId
              );
              m.referDetails = {
                destinationCommitteeId: referDestId,
                destinationCommitteeName: dest?.name || referDestId,
                requiresSecond: true,
                debatable: true,
                amendable: true,
              };
            }
            return m;
          }
          return undefined;
        })(),
      };
      // If this is a postpone submotion, record the parent's current state
      if (
        submotionTarget &&
        submotionType === "postpone" &&
        newMotion.meta &&
        newMotion.meta.kind === "sub"
      ) {
        newMotion.meta.parentPreviousState = submotionTarget.state;
        // record the chosen resume date/time only
        if (postponeDateTime) {
          try {
            newMotion.meta.resumeAt = new Date(postponeDateTime).toISOString();
          } catch (err) {
            newMotion.meta.resumeAt = postponeDateTime;
          }
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
      // Auto-expand the parent submotion toggle to reveal the new card
      try {
        const parentId =
          (newMotion.meta && newMotion.meta.parentMotionId) || null;
        if (parentId) {
          setSubmotionCollapsed((prev) => ({ ...prev, [parentId]: false }));
        }
      } catch {}
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
    setPostponeOption("specific");
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
      if (meta && meta.kind === "sub" && meta.subType === "postpone") {
        setSubmotionType("postpone");
        const parent =
          motions.find((mm) => mm.id === meta.parentMotionId) || null;
        setSubmotionTarget(parent);
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
            setPostponeOption("specific");
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
    try {
      const url = new URL(
        "/.netlify/functions/motions",
        window.location.origin
      );
      url.searchParams.set("id", motionId);
      fetch(url.toString(), { method: "DELETE" }).catch(() => {});
    } catch (e) {}
    const updated = motions.filter((m) => m.id !== motionId);
    setMotions(updated);
    if (activeMotionId === motionId) {
      const nextActive = updated[0]?.id || null;
      setActiveMotionId(nextActive);
      setMotionView("discussion", nextActive);
    }
    return true;
  };

  const changeMotionState = async (next) => {
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
    // sync to backend status
    try {
      const status =
        next === "paused"
          ? "paused"
          : next === "postponed"
          ? "postponed"
          : next === "referred"
          ? "referred"
          : next === "closed"
          ? "closed"
          : next === "voting"
          ? "voting"
          : "in-progress";
      if (next === "closed") {
        // If we're closing a motion that was received by referral and the
        // chair is rejecting it (i.e., previous state was 'referred'),
        // do NOT persist decisionDetails — there was no discussion or vote.
        if (activeMotion && activeMotion.state === "referred") {
          // Persist only the closed status so it moves to closed list without Final Decision
          await updateMotion(activeMotion.id, { status });
          try {
            if (committee?.id) {
              saveMotionsForCommittee(committee.id, updated);
              localStorage.setItem(
                `committee:${committee.id}:motions:updateAt`,
                String(Date.now())
              );
            }
          } catch (e) {}
        } else {
          // Persist a decision outcome so reload shows Passed/Failed instead of generic Closed
          const votes = voteEntries(activeMotion);
          const outcome = computeOutcome(votes); // "Adopted" or "Rejected" or "No Votes"
          const detail = {
            outcome,
            summary: "",
            pros: [],
            cons: [],
            recordedAt: new Date().toISOString(),
            recordedBy: me.id,
          };
          await updateMotion(activeMotion.id, { decisionDetails: detail });
          try {
            if (committee?.id) {
              saveMotionsForCommittee(committee.id, updated);
              localStorage.setItem(
                `committee:${committee.id}:motions:updateAt`,
                String(Date.now())
              );
            }
          } catch (e) {}
        }
        // After closing, if the current user is a chair/manager, show the
        // Final Decision tab and the final-decision panel so they can fill it.
        try {
          // Force the UI into the Final Decision view for the closed motion.
          // Ensure activeMotionId and per-motion tab are set so restore logic
          // doesn't immediately revert us back to Discussion.
          const aid = activeMotion?.id;
          if (aid) {
            setActiveMotionId(aid);
            setMotionTabs((prev) => ({ ...(prev || {}), [aid]: "final" }));
            setViewTab("final");
            // Re-apply shortly after to guard against other effects resetting view
            setTimeout(() => {
              try {
                setMotionTabs((prev) => ({ ...(prev || {}), [aid]: "final" }));
                setViewTab("final");
              } catch (e) {}
            }, 120);
          }
        } catch (e) {}
      } else {
        // If we're taking up a referred motion, persist the taken-up event into meta
        try {
          if (activeMotion.state === "referred" && next === "discussion") {
            const newMeta = { ...(activeMotion.meta || {}) };
            try {
              newMeta.referredFrom = {
                ...(newMeta.referredFrom || {}),
                takenUpAt: new Date().toISOString(),
                takenUpBy: me?.id || null,
              };
            } catch (e) {}
            await updateMotion(activeMotion.id, { meta: newMeta, status });
            // After taking up, refetch motions so UI shows authoritative state
            if (committee?.id) {
              try {
                const remote = await fetchMotions(committee.id);
                const mapped = (remote || []).map((m) => {
                  const state =
                    m.status === "paused"
                      ? "paused"
                      : m.status === "postponed"
                      ? "postponed"
                      : m.status === "referred"
                      ? "referred"
                      : m.status === "voting"
                      ? "voting"
                      : m.status === "closed" ||
                        m.status === "passed" ||
                        m.status === "failed"
                      ? "closed"
                      : "discussion";
                  const meta = { ...(m.meta || {}) };
                  const isSub =
                    (m.type === "submotion" && m.parentMotionId) ||
                    !!meta.submotionOf ||
                    !!meta.parentMotionId;
                  if (isSub) {
                    meta.kind = "sub";
                    meta.parentMotionId =
                      m.parentMotionId ||
                      meta.submotionOf ||
                      meta.parentMotionId;
                    if (meta.submotionType && !meta.subType)
                      meta.subType = meta.submotionType;
                  }
                  return {
                    id: m.id,
                    title: m.title,
                    description: m.description,
                    state,
                    messages: [],
                    decisionLog: [],
                    votes: m.votes || [],
                    meta,
                    decisionDetails: m.decisionDetails || undefined,
                  };
                });
                setMotions(mapped);
              } catch (err) {
                console.error(
                  "Failed to refetch motions after taking up referral",
                  err
                );
              }
            }
            // done
            return;
          }
        } catch (e) {
          console.warn("Failed to persist take-up metadata", e);
        }
        await updateMotionStatus(activeMotion.id, status);
        // After moving to vote, refetch motions from backend so all members see the change
        if (next === "voting" && committee?.id) {
          try {
            const remote = await fetchMotions(committee.id);
            const mapped = (remote || []).map((m) => {
              const state =
                m.status === "paused"
                  ? "paused"
                  : m.status === "postponed"
                  ? "postponed"
                  : m.status === "referred"
                  ? "referred"
                  : m.status === "voting"
                  ? "voting"
                  : m.status === "closed" ||
                    m.status === "passed" ||
                    m.status === "failed"
                  ? "closed"
                  : "discussion";
              const meta = { ...(m.meta || {}) };
              const isSub =
                (m.type === "submotion" && m.parentMotionId) ||
                !!meta.submotionOf ||
                !!meta.parentMotionId;
              if (isSub) {
                meta.kind = "sub";
                meta.parentMotionId =
                  m.parentMotionId || meta.submotionOf || meta.parentMotionId;
                if (meta.submotionType && !meta.subType)
                  meta.subType = meta.submotionType;
              }
              return {
                id: m.id,
                title: m.title,
                description: m.description,
                state,
                messages: [],
                decisionLog: [],
                votes: m.votes || [],
                meta,
                decisionDetails: m.decisionDetails || undefined,
              };
            });
            setMotions(mapped);
          } catch (err) {
            console.error(
              "Failed to refetch motions after moving to vote",
              err
            );
          }
        }
      }
    } catch (err) {
      console.warn("Failed to update motion status", err);
    }
    // ...existing code...
    // Poll motions from backend every 3 seconds while any motion is in voting state
    useEffect(() => {
      if (!committee?.id) return;
      const anyVoting =
        Array.isArray(motions) && motions.some((m) => m.state === "voting");
      if (!anyVoting) return;
      let cancelled = false;
      const poll = async () => {
        try {
          const remote = await fetchMotions(committee.id);
          if (cancelled) return;
          const mapped = (remote || []).map((m) => {
            const state =
              m.status === "paused"
                ? "paused"
                : m.status === "postponed"
                ? "postponed"
                : m.status === "referred"
                ? "referred"
                : m.status === "voting"
                ? "voting"
                : m.status === "closed" ||
                  m.status === "passed" ||
                  m.status === "failed"
                ? "closed"
                : "discussion";
            const meta = { ...(m.meta || {}) };
            const isSub =
              (m.type === "submotion" && m.parentMotionId) ||
              !!meta.submotionOf ||
              !!meta.parentMotionId;
            if (isSub) {
              meta.kind = "sub";
              meta.parentMotionId =
                m.parentMotionId || meta.submotionOf || meta.parentMotionId;
              if (meta.submotionType && !meta.subType)
                meta.subType = meta.submotionType;
            }
            return {
              id: m.id,
              title: m.title,
              description: m.description,
              state,
              messages: [],
              decisionLog: [],
              votes: m.votes || [],
              meta,
              decisionDetails: m.decisionDetails || undefined,
            };
          });
          setMotions(mapped);
        } catch (err) {
          console.error("Failed to poll motions during voting", err);
        }
      };
      const interval = setInterval(poll, 3000);
      return () => {
        cancelled = true;
        clearInterval(interval);
      };
    }, [committee?.id, motions]);
  };

  // start/end meeting handlers removed with the toggle UI

  const handleSaveDecisionSummary = async (e) => {
    e && e.preventDefault();
    if (!activeMotion || activeMotion.state !== "closed") return;
    if (!amIManager) return;
    const summary = decisionSummary.trim();
    const pros = decisionPros.trim();
    const cons = decisionCons.trim();
    if (!summary && !pros && !cons && !decisionOutcome) return; // require at least one field
    setSavingDecision(true);
    // Build the decision detail for the active motion
    const computedOutcome =
      (decisionOutcome && decisionOutcome) ||
      computeOutcome(voteEntries(activeMotion));
    const detail = {
      outcome: computedOutcome || undefined,
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

    // Persist decision details to backend
    try {
      await updateMotion(activeMotion.id, {
        decisionDetails: detail,
      });
    } catch (err) {
      console.warn("Failed to persist decision details", err);
    }

    // If this was a submotion, apply its effect to the parent (postpone or refer)
    const pendingCreates = [];
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
            // compute structured postpone info for specific date/time only
            const parentMeta = m.meta ? { ...m.meta } : {};
            if (meta.postponeInfo && meta.postponeInfo.type === "dateTime") {
              parentMeta.postponeInfo = meta.postponeInfo;
            } else if (meta.resumeAt) {
              parentMeta.postponeInfo = { type: "dateTime", at: meta.resumeAt };
            }
            // capture previous state for later lifting
            parentMeta.postponePrevState = m.state;
            // Persist postpone effect to backend (fire-and-forget)
            (async () => {
              try {
                await updateMotion(parentId, {
                  meta: parentMeta,
                  status: "postponed",
                });
              } catch (err) {
                console.warn("Failed to persist postpone effect", err);
              }
            })();
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
            const originName = (committee && committee.name) || originId;
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
            if (destId) {
              try {
                const destMotions = loadMotionsForCommittee(destId) || [];
                // Build a sanitized copy of the parent motion for the destination:
                // strip any submotion-related metadata so only the main motion is sent.
                const rawMeta = m.meta || {};
                const sanitizedMeta = { ...(rawMeta || {}) };
                // Remove submotion / parent linkage and transient flags
                delete sanitizedMeta.kind;
                delete sanitizedMeta.subType;
                delete sanitizedMeta.submotionType;
                delete sanitizedMeta.submotionOf;
                delete sanitizedMeta.parentMotionId;
                delete sanitizedMeta.parentPreviousState;
                delete sanitizedMeta.postponePrevState;
                delete sanitizedMeta.postponeInfo;
                delete sanitizedMeta.overturnOf;
                delete sanitizedMeta.referDetails;
                delete sanitizedMeta.referredFrom;
                // Attach referredFrom metadata for traceability
                sanitizedMeta.referredFrom = {
                  committeeId: originId,
                  committeeName: originName,
                  originalMotionId: m.id,
                  referredAt: new Date().toISOString(),
                };

                const moved = {
                  id: m.id,
                  title: m.title,
                  description: m.description,
                  state: "referred",
                  messages: [],
                  votes: [],
                  carryOver: false,
                  meetingId: undefined,
                  meta: sanitizedMeta,
                };

                // Create on backend asynchronously and update local storage when done
                const p = apiCreateMotion({
                  title: moved.title,
                  description: moved.description,
                  committeeId: destId,
                  type: "main",
                  meta: moved.meta,
                  createdBy: {
                    id: me.id,
                    name: me.name,
                    username: me.username,
                    avatarUrl: me.avatarUrl,
                  },
                })
                  .then((created) => {
                    const serverId =
                      created?.id || created?._id || Date.now().toString();
                    const finalMoved = {
                      ...moved,
                      id: serverId,
                      meta: {
                        ...(moved.meta || {}),
                        referredFrom: {
                          ...(moved.meta?.referredFrom || {}),
                          receivedAt:
                            created?.meta?.referredFrom?.receivedAt ||
                            new Date().toISOString(),
                        },
                      },
                    };
                    const destList = loadMotionsForCommittee(destId) || [];
                    const nextList = [finalMoved, ...destList];
                    saveMotionsForCommittee(destId, nextList);
                  })
                  .catch((err) => {
                    console.warn(
                      "Failed to create referred motion in destination",
                      err
                    );
                    const destList = loadMotionsForCommittee(destId) || [];
                    const nextList = [moved, ...destList];
                    saveMotionsForCommittee(destId, nextList);
                  });
                pendingCreates.push(p);
              } catch (e) {
                // ignore
              }
            }
            // Persist refer effect to backend (fire-and-forget)
            (async () => {
              try {
                await updateMotion(parentId, {
                  meta: parentMeta,
                  status: "referred",
                });
              } catch (err) {
                console.warn("Failed to persist refer effect", err);
              }
            })();
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
    try {
      if (committee?.id) {
        saveMotionsForCommittee(committee.id, updated);
        localStorage.setItem(
          `committee:${committee.id}:motions:updateAt`,
          String(Date.now())
        );
      }
    } catch (e) {}
    setSavingDecision(false);
    try {
      if (pendingCreates && pendingCreates.length)
        await Promise.all(pendingCreates);
    } catch (e) {
      console.warn(
        "Failed to complete referred motion creates:",
        e?.message || e
      );
    }
    // removed: cross-window final decision blink notification
  };
  // unchanged: submotion effect application handled elsewhere; removed blink listeners

  // start editing an existing decision summary
  const handleStartEditDecision = () => {
    if (!activeMotion || !activeMotion.decisionDetails) return;
    setEditDecisionSummary(activeMotion.decisionDetails.summary || "");
    setEditDecisionPros((activeMotion.decisionDetails.pros || []).join("\n"));
    setEditDecisionCons((activeMotion.decisionDetails.cons || []).join("\n"));
    setEditDecisionOutcome(
      activeMotion.decisionDetails?.outcome ||
        computeOutcome(voteEntries(activeMotion)) ||
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

  const handleSaveEditedDecision = async (e) => {
    e && e.preventDefault();
    if (!activeMotion || !activeMotion.decisionDetails) return;
    const summary = editDecisionSummary.trim();
    const prosRaw = editDecisionPros.trim();
    const consRaw = editDecisionCons.trim();
    if (!summary && !prosRaw && !consRaw) return; // require at least one field
    setSavingEditDecision(true);

    let updated = motions.map((m) => {
      if (m.id !== activeMotion.id) return m;
      const computedOutcome =
        (editDecisionOutcome && editDecisionOutcome) ||
        computeOutcome(voteEntries(activeMotion));
      const revision = {
        outcome: computedOutcome || undefined,
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
          computeOutcome(voteEntries(am));
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
                resumeAt: meta.resumeAt,
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

    // Persist edited decision details and, if a postpone submotion passed,
    // also persist the submotion as passed and move parent + its submotions to postponed.
    try {
      const decisionPayload = updated.find(
        (m) => m.id === activeMotion.id
      )?.decisionDetails;
      await updateMotion(activeMotion.id, { decisionDetails: decisionPayload });

      // Handle postpone submotion persistence
      try {
        const am = activeMotion;
        const meta = am?.meta;
        const isPostponeSub =
          meta && meta.kind === "sub" && meta.subType === "postpone";
        if (isPostponeSub && meta.parentMotionId) {
          const revisedOutcome =
            (editDecisionOutcome && editDecisionOutcome) ||
            computeOutcome(voteEntries(am));
          const passed = /pass|adopt/i.test(revisedOutcome);
          if (passed) {
            const parentId = meta.parentMotionId;
            // mark submotion locally as closed/passed and parent+siblings as postponed
            const nextLocal = (updated || []).map((m) => {
              if (m.id === activeMotion.id) {
                return {
                  ...m,
                  state: "closed",
                  decisionDetails: decisionPayload,
                };
              }
              const isChildOfParent =
                (m.meta && m.meta.parentMotionId === parentId) ||
                m.parentMotionId === parentId;
              if (m.id === parentId || isChildOfParent) {
                return {
                  ...m,
                  state: "postponed",
                  decisionNote:
                    m.id === parentId
                      ? "Postponed by submotion"
                      : m.decisionNote,
                  resumeAt: meta.resumeAt || m.resumeAt,
                };
              }
              return m;
            });
            setMotions(nextLocal);

            // Persist changes for submotion, parent and its submotions
            const tasks = [];
            tasks.push(
              updateMotion(activeMotion.id, {
                status: "passed",
                decisionDetails: decisionPayload,
              }).catch(() => {})
            );

            (updated || [])
              .filter(
                (m) =>
                  m.id === parentId ||
                  (m.meta && m.meta.parentMotionId === parentId) ||
                  m.parentMotionId === parentId
              )
              .forEach((m) => {
                if (m.id === activeMotion.id) return;
                const payload = { status: "postponed" };
                if (m.id === parentId && meta && meta.resumeAt) {
                  payload.meta = { ...(m.meta || {}), resumeAt: meta.resumeAt };
                } else {
                  payload.meta = {
                    ...(m.meta || {}),
                    postponedBy: activeMotion.id,
                  };
                }
                tasks.push(updateMotion(m.id, payload).catch(() => {}));
              });

            await Promise.all(tasks);
          }
        }
      } catch (e) {
        console.warn("Failed to apply postpone submotion effects", e);
      }
    } catch (err) {
      console.warn("Failed to persist edited decision details", err);
    }
    setMotions(updated);
    try {
      if (committee?.id) {
        saveMotionsForCommittee(committee.id, updated);
        localStorage.setItem(
          `committee:${committee.id}:motions:updateAt`,
          String(Date.now())
        );
      }
    } catch (e) {}
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
    // Persist closed status to backend so it remains on refresh
    (async () => {
      try {
        // Compute and persist outcome so Final Decision tab shows Passed/Failed
        const target = (updated || []).find((mm) => mm.id === motionId) || {};
        const votes = voteEntries(target);
        const outcome = computeOutcome(votes);
        const detail = {
          outcome,
          summary: "",
          pros: [],
          cons: [],
          recordedAt: new Date().toISOString(),
          recordedBy: me.id,
        };
        await updateMotion(motionId, { decisionDetails: detail });
      } catch (err) {
        console.warn("Failed to persist closed status", err);
      }
    })();
    // ensure the closed motion is active and switch to Final view
    setActiveMotionId(motionId);
    setMotionView("final", motionId);
    // trigger a brief blink on the Final Decision tab when we close
    const before = motions.find((m) => m.id === motionId);
    if (before && !before.decisionDetails) {
      setFinalBlink(true);
      setTimeout(() => setFinalBlink(false), 1400);
    }
    // Re-apply final view shortly after to override other tab-restoring effects
    setTimeout(() => {
      try {
        setMotionView("final", motionId);
      } catch (e) {}
    }, 120);
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
    const votesCast = tally.yes + tally.no; // abstentions excluded for supermajority calc
    // Only Adopted or Rejected outcomes
    // Tie handling rules: yes==abstain => Adopt; no==abstain => Reject
    if (tally.yes === tally.abstain && tally.yes > tally.no) return "Adopted";
    if (tally.no === tally.abstain && tally.no > tally.yes) return "Rejected";
    // If abstain is the largest group, treat as rejection
    const abstainIsMajority =
      tally.abstain > tally.yes && tally.abstain > tally.no;
    if (abstainIsMajority) return "Rejected";
    const passThreshold = (2 / 3) * votesCast;
    if (tally.yes >= Math.ceil(passThreshold)) return "Adopted";
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
    if (t.includes("tie") || t.includes("tied")) return "failed";
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
    // removed: 'referred' outcome option; default to 'closed'
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
  // removed: cross-window storage listener for final decision blink

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
    const stored = motionTabs ? motionTabs[activeMotionId] : undefined;
    try {
      console.debug("restoreMotionTab", { activeMotionId, stored, motionTabs });
    } catch (e) {}
    // Only restore a saved per-motion tab if one exists. If no saved tab
    // is present, avoid overriding the current view (prevents races when
    // the code programmatically sets the view to 'final' right after closing).
    if (typeof stored !== "undefined") {
      setViewTab(stored);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMotionId, motionTabs]);

  // whether chair may close the current motion (disabled when already closed)
  const canChairClose = activeMotion && activeMotion.state !== "closed";

  // handle user voting (everyone can vote while motion is in 'voting')
  const handleVote = async (choice) => {
    if (!activeMotion || activeMotion.state !== "voting") return;
    if (meetingRecessed || activeMotion.state === "referred") return;
    const motionId = activeMotion?.id;
    if (!motionId) return;
    if (voteSubmittingRef.current === motionId) return; // already submitting (sync guard)
    try {
      // mark synchronously to prevent concurrent invocations
      voteSubmittingRef.current = motionId;
      setVoteSubmittingFor(motionId);
      const updatedDoc = await castMotionVote(motionId, choice, me.id);
      // reflect aggregate counts in UI while keeping local per-user record for isMine checks
      setMotions((prev) =>
        prev.map((m) => {
          if (m.id !== motionId) return m;
          // Prefer authoritative per-voter choices returned by backend
          const metaChoices =
            updatedDoc?.meta && typeof updatedDoc.meta.voterChoices === "object"
              ? { ...updatedDoc.meta.voterChoices }
              : null;
          const votesArray = metaChoices
            ? Object.keys(metaChoices).map((voterId) => ({
                voterId,
                choice: metaChoices[voterId],
              }))
            : // fallback to existing array-shaped votes in-memory, updating current user
              (() => {
                const votes = Array.isArray(m.votes) ? [...m.votes] : [];
                const filtered = votes.filter((v) => v.voterId !== me.id);
                filtered.push({
                  voterId: me.id,
                  choice: String(choice).toLowerCase(),
                });
                return filtered;
              })();
          return {
            ...m,
            votes: votesArray,
            tally: updatedDoc.votes || { yes: 0, no: 0, abstain: 0 },
          };
        })
      );
      // persist local cache and broadcast update so other tabs refresh
      try {
        if (committee?.id) {
          const next = (motions || []).map((m) =>
            m.id === motionId
              ? {
                  ...m,
                  votes:
                    updatedDoc?.meta && updatedDoc.meta.voterChoices
                      ? Object.keys(updatedDoc.meta.voterChoices).map((v) => ({
                          voterId: v,
                          choice: updatedDoc.meta.voterChoices[v],
                        }))
                      : m.votes,
                  tally: updatedDoc.votes ||
                    m.tally || { yes: 0, no: 0, abstain: 0 },
                }
              : m
          );
          saveMotionsForCommittee(committee.id, next);
          localStorage.setItem(
            `committee:${committee.id}:motions:updateAt`,
            String(Date.now())
          );
        }
      } catch (e) {}
      voteSubmittingRef.current = null;
      setVoteSubmittingFor(null);
    } catch (err) {
      voteSubmittingRef.current = null;
      setVoteSubmittingFor(null);
      console.warn("Failed to cast vote", err);
    }
  };

  // group motions for UI sections: active (not concluded) and concluded
  // Keep submotions grouped under their parent regardless of concluded state.
  // A motion is considered "concluded" when it reached a terminal state
  // such as `closed`, `passed`, or `failed`. Treat terminal statuses as
  // concluded so closed motions move immediately to the Closed section
  // for all members (decisionDetails may still be edited by the chair).
  const isConcluded = (m) => {
    const st = (m.state || "discussion").toString();
    return ["closed", "passed", "failed"].includes(st);
  };

  const activeMotions = (motions || []).filter((m) => {
    const concluded = isConcluded(m);
    const isSub = !!(m.meta && m.meta.kind === "sub");
    if (!isSub) return !concluded;
    const parentId = m.meta && m.meta.parentMotionId;
    if (!parentId) return !concluded;
    const parent = (motions || []).find((mm) => mm.id === parentId);
    const parentConcluded = parent ? isConcluded(parent) : false;
    return !concluded && !parentConcluded;
  });

  const concludedMotions = (motions || []).filter(
    (m) => isConcluded(m) && !(m.meta && m.meta.kind === "sub")
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
      // Overturn motions are independent and should not be attached as children.
    });
    return map;
  };

  // Build children map from the full motions list so submotions remain
  // attached to their parent regardless of the parent's or child's state.
  const childrenMap = buildChildrenMap(motions || []);

  // Listen for motion updates broadcast by other tabs/clients via
  // `committee:{id}:motions:updateAt` and refetch authoritative motions
  // for this committee so decisionDetails and vote tallies appear for all.
  useEffect(() => {
    if (!committee || !committee.id) return;
    let mounted = true;
    const key = `committee:${committee.id}:motions:updateAt`;

    const refetch = async () => {
      try {
        const remote = await fetchMotions(committee.id);
        if (!mounted) return;
        const mapped = (remote || []).map((m) => {
          const state =
            m.status === "paused"
              ? "paused"
              : m.status === "postponed"
              ? "postponed"
              : m.status === "referred"
              ? "referred"
              : m.status === "voting"
              ? "voting"
              : m.status === "closed" ||
                m.status === "passed" ||
                m.status === "failed"
              ? "closed"
              : "discussion";
          const meta = { ...(m.meta || {}) };
          const isSub =
            (m.type === "submotion" && m.parentMotionId) ||
            !!meta.submotionOf ||
            !!meta.parentMotionId;
          if (isSub) {
            meta.kind = "sub";
            meta.parentMotionId =
              m.parentMotionId || meta.submotionOf || meta.parentMotionId;
            if (meta.submotionType && !meta.subType)
              meta.subType = meta.submotionType;
          }
          return {
            id: m.id,
            title: m.title,
            description: m.description,
            state,
            messages: [],
            decisionLog: [],
            votes: m.votes || [],
            meta,
            decisionDetails: m.decisionDetails || undefined,
          };
        });
        setMotions(mapped);
        try {
          saveMotionsForCommittee(committee.id, mapped);
        } catch (e) {}
        setMotionsLoadedOnce(true);
      } catch (e) {
        // ignore fetch errors
      }
    };

    const onStorage = (e) => {
      try {
        if (!e || !e.key) return;
        if (e.key === key) refetch();
      } catch (err) {}
    };

    window.addEventListener("storage", onStorage);
    try {
      if (localStorage.getItem(key)) refetch();
    } catch (e) {}

    return () => {
      mounted = false;
      window.removeEventListener("storage", onStorage);
    };
  }, [committee && committee.id]);

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

  // Removed lifting for the next meeting; only date/time-based lifting remains

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
  if (showInitialOverlay) {
    return (
      <div className="chat-page two-pane">
        <div className="ronr-loading-screen">
          <div className="ronr-loading-card">
            <div className="ronr-loading-icon">
              <div className="ronr-loading-pulse" />
              <img
                src={logo}
                alt="Rules of Order logo"
                className="ronr-loading-logo"
              />
            </div>
            <h1 className="ronr-loading-title">Rules of Order</h1>
            <p className="ronr-loading-subtitle">
              Loading motions, members, and discussion…
            </p>
          </div>
        </div>
      </div>
    );
  }

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
                  <label className="decision-label">
                    Specify resume date/time
                  </label>
                  <div style={{ marginTop: 8 }}>
                    <input
                      type="datetime-local"
                      value={postponeDateTime}
                      onChange={(e) => setPostponeDateTime(e.target.value)}
                      aria-label="Specify resume date and time"
                    />
                  </div>
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
          <h2>{(committee && committee.name) || "Committee"}</h2>
          {/* chair start/end meeting toggle removed */}
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
              <div className="motions-section-header">
                <strong>Active Motions</strong>
                <button
                  onClick={handleAddMotion}
                  className="primary-icon-btn small"
                  title="Add Motion"
                  aria-label="Add Motion"
                  style={{ marginLeft: 8 }}
                >
                  +
                </button>
              </div>

              {activeRoots.length > 0 ? (
                <>
                  {unfinishedRoots.length > 0 && (
                    <div style={{ marginTop: 8, marginBottom: 6 }}>
                      <small style={{ color: "#6b7280" }}>
                        Unfinished from last meeting ({unfinishedRoots.length})
                      </small>
                    </div>
                  )}
                  {[...unfinishedRoots]
                    .sort(
                      (a, b) =>
                        (isRecentlyReferred(b) ? 1 : 0) -
                        (isRecentlyReferred(a) ? 1 : 0)
                    )
                    .map((m, idx) => (
                      <React.Fragment key={m.id}>
                        <div className={"motion-list-row"}>
                          <div
                            className={
                              "motion-list-item " +
                              (m.id === activeMotionId
                                ? "motion-active "
                                : "") +
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
                                childrenMap[m.id].length > 0 && (
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
                              {!isSplit &&
                                (isResumedRecently(m) ? (
                                  <span
                                    className="status-pill status-resumed"
                                    title="Resumed from postponement"
                                  >
                                    Resumed
                                  </span>
                                ) : isRecentlyReferred(m) ? (
                                  <span
                                    className="status-pill status-referred"
                                    title="Recently referred"
                                  >
                                    Referred
                                  </span>
                                ) : (
                                  <span
                                    className={`status-pill status-${m.state}`}
                                  >
                                    {motionStatusLabel(m)}
                                  </span>
                                ))}
                              {isSplit && (
                                <span className="badge unfinished-badge">
                                  Unfinished
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
                                        document.activeElement ===
                                        e.currentTarget
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
                                          c.meta &&
                                          c.meta.subType === "postpone";
                                        const isRevision =
                                          c.meta &&
                                          c.meta.subType === "revision";
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
                                            .includes(
                                              parentTitle.toLowerCase()
                                            );
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
                                    ) : isRecentlyReferred(c) ? (
                                      <span
                                        className="status-pill status-referred"
                                        title="Recently referred"
                                      >
                                        Referred
                                      </span>
                                    ) : (
                                      <span
                                        className={`status-pill status-${c.state}`}
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
              ) : (
                <p className="empty">No motions yet. Add one.</p>
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
                  {[...otherActiveRoots]
                    .sort(
                      (a, b) =>
                        (isRecentlyReferred(b) ? 1 : 0) -
                        (isRecentlyReferred(a) ? 1 : 0)
                    )
                    .map((m, idx) => (
                      <React.Fragment key={m.id}>
                        <div className={"motion-list-row"}>
                          <div
                            className={
                              "motion-list-item " +
                              (m.id === activeMotionId
                                ? "motion-active "
                                : "") +
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
                                childrenMap[m.id].length > 0 && (
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
                                  className={`status-pill status-${m.state}`}
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
                                        document.activeElement ===
                                        e.currentTarget
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
                                          c.meta &&
                                          c.meta.subType === "postpone";
                                        const isRevision =
                                          c.meta &&
                                          c.meta.subType === "revision";
                                        const isOverturn = !!(
                                          c.__isOverturn ||
                                          (c.meta && c.meta.overturnOf)
                                        );
                                        const showParent =
                                          !isPostpone &&
                                          !isRevision &&
                                          !titleText
                                            .toLowerCase()
                                            .includes(
                                              parentTitle.toLowerCase()
                                            );
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
                                    ) : isRecentlyReferred(c) ? (
                                      <span
                                        className="status-pill status-referred"
                                        title="Recently referred"
                                      >
                                        Referred
                                      </span>
                                    ) : (
                                      <span
                                        className={`status-pill status-${c.state}`}
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
                              childrenMap[m.id].length > 0 && (
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
                              <span className={`status-pill status-${m.state}`}>
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
                              childrenMap[m.id].length > 0 && (
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
                            <span className={`status-pill status-${m.state}`}>
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
                                    className={`status-pill status-${c.state}`}
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

          {isSplit ? (
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
                  aria-label={
                    membersCollapsed
                      ? "Expand participants"
                      : "Collapse participants"
                  }
                  style={{ float: "right" }}
                >
                  {membersCollapsed ? (
                    <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden>
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
                    <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden>
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
              </div>
              <div
                className={`member-list-body ${
                  membersCollapsed ? "collapsed" : ""
                }`}
              >
                {members.map((p) => {
                  const prof = profileCache[p.username] || {};
                  const displayName =
                    prof.name && prof.name.trim().length > 0
                      ? prof.name
                      : p.name || p.id || p.username;
                  const avatarSrc =
                    prof.avatarUrl && prof.avatarUrl.trim().length > 0
                      ? prof.avatarUrl
                      : p.avatarUrl && p.avatarUrl.trim().length > 0
                      ? p.avatarUrl
                      : "https://ui-avatars.com/api/?name=" +
                        encodeURIComponent(displayName) +
                        "&background=e5e7eb&color=374151&size=40";
                  return (
                    <LiveProfileMemberCard
                      key={p.id || p.name || p.username}
                      username={p.username}
                      fallbackName={displayName}
                      role={p.role}
                      avatarUrl={avatarSrc}
                    />
                  );
                })}
              </div>
            </div>
          ) : null}
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
                          aria-expanded={submotionMenuOpen ? "true" : "false"}
                          title={
                            meetingRecessed
                              ? "Disabled — meeting in recess"
                              : submotionMenuOpen
                              ? "Close submotion menu"
                              : "Open submotion menu"
                          }
                          disabled={meetingRecessed}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (meetingRecessed) return;
                            setSubmotionMenuOpen((o) => !o);
                          }}
                        >
                          ⋮
                        </button>
                        {submotionMenuOpen && (
                          <div
                            className="submotion-menu"
                            role="menu"
                            aria-label="Submotion actions"
                          >
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => {
                                handleOpenSubmotion("revision", activeMotion);
                                setSubmotionMenuOpen(false);
                              }}
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
                              role="menuitem"
                              onClick={() => {
                                handleOpenSubmotion("refer", activeMotion);
                                setSubmotionMenuOpen(false);
                              }}
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
                        )}
                      </div>
                    );
                  })()}
                </div>

                {activeMotion?.state === "referred" && (
                  <div className="referred-note" style={{ marginTop: 8 }}>
                    {amIManager ? (
                      <div
                        style={{
                          display: "flex",
                          gap: 8,
                          alignItems: "center",
                        }}
                      >
                        <div style={{ color: "#374151" }}>
                          This motion was referred to the committee.
                        </div>
                        <div>
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
                                : "Accept referral and start discussion"
                            }
                          >
                            Accept
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              if (!canChairClose) return;
                              changeMotionState("closed");
                              setShowChairMenu(false);
                            }}
                            disabled={meetingRecessed || !canChairClose}
                            title={
                              meetingRecessed
                                ? "Disabled — meeting in recess"
                                : !canChairClose
                                ? "You don't have permission to close this motion"
                                : "Reject referral and close motion"
                            }
                            style={{ marginLeft: 8 }}
                          >
                            Reject
                          </button>
                        </div>
                      </div>
                    ) : (
                      "This motion has been referred to the committee. The chair must take up the motion before discussion is enabled."
                    )}
                  </div>
                )}

                {/* Persisted referral message after chair accepts: show without highlight */}
                {activeMotion?.meta?.referredFrom &&
                  activeMotion?.state !== "referred" && (
                    <div
                      className="referred-note persisted"
                      style={{ marginTop: 8 }}
                    >
                      {(() => {
                        const rf = activeMotion.meta.referredFrom || {};
                        const fromName =
                          rf.committeeName ||
                          rf.committeeId ||
                          "another committee";
                        return `Referred from ${fromName}`;
                      })()}
                    </div>
                  )}

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
                    {activeMotion?.state === "closed" &&
                      (!activeMotion?.meta?.referredFrom ||
                        activeMotion?.decisionDetails ||
                        activeMotion?.meta?.referredFrom?.takenUpAt) && (
                        <button
                          type="button"
                          className={
                            "segment-btn " +
                            (viewTab === "final" ? "is-active" : "")
                          }
                          onClick={() => {
                            setMotionView("final");
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
                {/* removed: loading placeholder to avoid flashes */}
                {commentsError && !loadingComments && (
                  <p className="empty-thread">{commentsError}</p>
                )}
                {!loadingComments &&
                  !commentsError &&
                  (activeMotion.messages || []).map((msg) => {
                    const isMine = (() => {
                      const aid = (msg.authorId || "")
                        .toString()
                        .trim()
                        .toLowerCase();
                      const myId = (me.id || "")
                        .toString()
                        .trim()
                        .toLowerCase();
                      const myUser = (me.username || "")
                        .toString()
                        .trim()
                        .toLowerCase();
                      return aid && (aid === myId || aid === myUser);
                    })();
                    const memberForMessage = (members || []).find((m) => {
                      const mid = (m.id || "").toString();
                      const muser = (m.username || "").toString();
                      const aid = (msg.authorId || "").toString();
                      return mid === aid || muser === aid;
                    });
                    const authorLookup = (
                      (memberForMessage &&
                        (memberForMessage.username || memberForMessage.id)) ||
                      msg.authorId ||
                      ""
                    )
                      .toString()
                      .trim();
                    const cachedProfile = profileCache[authorLookup] || null;
                    const displayNameFromMembers =
                      (cachedProfile &&
                        (cachedProfile.name || cachedProfile.username)) ||
                      (memberForMessage &&
                        (memberForMessage.name || memberForMessage.username)) ||
                      authorLookup ||
                      "";
                    try {
                      console.debug("[Chat] render", {
                        msg,
                        me,
                        members,
                        memberForMessage,
                        displayNameFromMembers,
                      });
                    } catch {}
                    return (
                      <div
                        key={msg.id}
                        className={
                          "message-row " + (isMine ? "mine" : "theirs")
                        }
                      >
                        {/* Mirror layout: theirs avatar-left, mine avatar-right */}
                        <div className="message-row-inner">
                          {!isMine && (
                            <Avatar
                              src={
                                (cachedProfile && cachedProfile.avatarUrl) ||
                                (memberForMessage &&
                                  memberForMessage.avatarUrl) ||
                                ""
                              }
                              alt={displayNameFromMembers}
                            />
                          )}

                          <div className="message-left-stack">
                            {/* AUTHOR + STANCE above bubble */}
                            <div className="message-header">
                              <span className="message-author">
                                {displayNameFromMembers}
                              </span>
                              {msg.stance && (
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
                              )}
                            </div>
                            <div className="message-bubble">{msg.text}</div>
                            <div className="message-time">
                              {new Date(msg.time).toLocaleTimeString([], {
                                hour: "numeric",
                                minute: "2-digit",
                              })}
                            </div>
                          </div>

                          {isMine && (
                            <Avatar
                              src={
                                (cachedProfile && cachedProfile.avatarUrl) ||
                                (memberForMessage &&
                                  memberForMessage.avatarUrl) ||
                                ""
                              }
                              alt={displayNameFromMembers}
                            />
                          )}
                        </div>
                      </div>
                    );
                  })}

                {/* removed: 'No discussion yet' message on empty threads */}
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
                      activeMotion.state +
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
                    const votes = voteEntries(activeMotion);
                    const tally = activeMotion?.tally || computeTally(votes);
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
                            disabled={
                              !votingOpen ||
                              voteSubmittingFor === activeMotion.id
                            }
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
                            disabled={
                              !votingOpen ||
                              voteSubmittingFor === activeMotion.id
                            }
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
                            disabled={
                              !votingOpen ||
                              voteSubmittingFor === activeMotion.id
                            }
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
                    const st = activeMotion?.state || "discussion";
                    const isDiscussion = st === "discussion";
                    const isPaused = st === "paused";
                    const isVoting = st === "voting";
                    const isPostponed = st === "postponed";
                    const isClosed = st === "closed";
                    const isReferred = st === "referred";
                    // Hide chair menu entirely for postponed and closed motions.
                    if (isPostponed || isClosed) return null;
                    const controlsDisabled = meetingRecessed || isReferred;
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
                            <>
                              {isPaused ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    changeMotionState("discussion");
                                    setShowChairMenu(false);
                                  }}
                                  disabled={controlsDisabled}
                                  title={
                                    meetingRecessed
                                      ? "Disabled — meeting in recess"
                                      : isReferred
                                      ? "Disabled until chair accepts referred motion"
                                      : "Resume discussion"
                                  }
                                >
                                  Resume Discussion
                                </button>
                              ) : isDiscussion ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    changeMotionState("paused");
                                    setShowChairMenu(false);
                                  }}
                                  disabled={controlsDisabled}
                                  title={
                                    meetingRecessed
                                      ? "Disabled — meeting in recess"
                                      : isReferred
                                      ? "Disabled until chair accepts referred motion"
                                      : "Pause discussion"
                                  }
                                >
                                  Pause Discussion
                                </button>
                              ) : null}

                              {isVoting ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (!canChairClose) return;
                                    handleCloseMotionNow(activeMotion?.id);
                                    setShowChairMenu(false);
                                  }}
                                  disabled={controlsDisabled || !canChairClose}
                                  title={
                                    meetingRecessed
                                      ? "Disabled — meeting in recess"
                                      : isReferred
                                      ? "Disabled until chair accepts referred motion"
                                      : !canChairClose
                                      ? "You don't have permission to close this motion"
                                      : "Close motion"
                                  }
                                >
                                  Close Motion
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => {
                                    changeMotionState("voting");
                                    setShowChairMenu(false);
                                  }}
                                  disabled={controlsDisabled}
                                  title={
                                    meetingRecessed
                                      ? "Disabled — meeting in recess"
                                      : isReferred
                                      ? "Disabled until chair accepts referred motion"
                                      : "Move to vote"
                                  }
                                >
                                  Move to Vote
                                </button>
                              )}
                            </>
                            {/* inline helper removed: show message only via hover title */}
                            {/* Special motions title will be shown below Postpone */}
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
                                  {!(
                                    activeMotion &&
                                    activeMotion.meta &&
                                    activeMotion.meta.kind === "sub"
                                  ) && (
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
                                      disabled={isVoting || controlsDisabled}
                                      title={
                                        meetingRecessed
                                          ? "Disabled — meeting in recess"
                                          : isVoting || isReferred
                                          ? "Disabled — voting in progress or awaiting chair acceptance"
                                          : "Create a postponement submotion"
                                      }
                                    >
                                      Postpone Decision
                                    </button>
                                  )}
                                </>
                              );
                            })()}
                            {/* Special Motions */}
                            <div className="chair-menu-divider" />
                            <div className="chair-menu-section-title">
                              Special Motions
                            </div>
                            {/* Recess / Resume */}
                            {/* Object to Consideration (moved here under Special Motions) */}
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
                                      disabled={
                                        meetingRecessed || isReferredState
                                      }
                                      title={
                                        meetingRecessed
                                          ? "Disabled — meeting in recess"
                                          : isReferredState
                                          ? "Disabled until chair accepts referred motion"
                                          : "Object to the consideration of the question"
                                      }
                                    >
                                      Object to Consideration
                                    </button>
                                  )}

                                  {isVotingOTC && (
                                    <button
                                      type="button"
                                      onClick={finalizeObjectionVote}
                                      disabled={
                                        meetingRecessed || isReferredState
                                      }
                                      title={
                                        meetingRecessed
                                          ? "Disabled — meeting in recess"
                                          : isReferredState
                                          ? "Disabled until chair accepts referred motion"
                                          : "End objection vote and apply result"
                                      }
                                    >
                                      End Objection Vote (decide by tally)
                                    </button>
                                  )}
                                </>
                              );
                            })()}
                            {meetingRecessed ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setMeetingRecessed(false);
                                  try {
                                    if (committee?.id)
                                      localStorage.setItem(
                                        `committee:${committee.id}:meetingRecessed`,
                                        "false"
                                      );
                                  } catch (e) {}
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
                                  try {
                                    if (committee?.id)
                                      localStorage.setItem(
                                        `committee:${committee.id}:meetingRecessed`,
                                        "true"
                                      );
                                  } catch (e) {}
                                  setShowChairMenu(false);
                                }}
                                title="Recess the meeting"
                              >
                                Recess
                              </button>
                            )}
                            {/* Adjourn Meeting last */}
                            <button
                              type="button"
                              onClick={() => {
                                try {
                                  const prevId = currentMeetingId;
                                  const nextId = String(Date.now());
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
                                        ];
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
                                            meetingId: prevId,
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
                                } catch (err) {}
                                setShowChairMenu(false);
                              }}
                            >
                              Adjourn Meeting
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                {/* referred-note moved to header above */}
                <input
                  ref={composerInputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={
                    sessionClosed
                      ? "Session closed"
                      : sessionPaused
                      ? "Session paused"
                      : activeMotion?.state === "postponed"
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
                      (activeMotion.state === "postponed" ||
                        activeMotion.state === "referred")) ||
                    !activeMotion
                  }
                  aria-disabled={
                    sessionPaused ||
                    sessionClosed ||
                    meetingRecessed ||
                    (activeMotion &&
                      (activeMotion.state === "postponed" ||
                        activeMotion.state === "referred")) ||
                    !activeMotion
                  }
                  title={
                    sessionClosed
                      ? "Session closed"
                      : sessionPaused
                      ? "Session paused"
                      : meetingRecessed
                      ? "Meeting in recess"
                      : activeMotion && activeMotion.state === "postponed"
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
                        (composerStanceVisual === "pro" ? "is-active" : "")
                      }
                      onClick={() => {
                        setComposerStanceVisual("pro");
                        setComposerStance("pro");
                      }}
                      onFocus={() => {
                        setComposerStanceVisual("pro");
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleSendWithStance(e, "pro");
                        }
                      }}
                      aria-pressed={composerStance === "pro"}
                      disabled={
                        sessionPaused ||
                        sessionClosed ||
                        meetingRecessed ||
                        (activeMotion && activeMotion.state === "postponed") ||
                        !activeMotion
                      }
                      aria-disabled={
                        sessionPaused ||
                        sessionClosed ||
                        meetingRecessed ||
                        (activeMotion &&
                          (activeMotion.state === "postponed" ||
                            activeMotion.state === "referred")) ||
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
                        (composerStanceVisual === "con" ? "is-active" : "")
                      }
                      onClick={() => {
                        setComposerStanceVisual("con");
                        setComposerStance("con");
                      }}
                      onFocus={() => {
                        setComposerStanceVisual("con");
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleSendWithStance(e, "con");
                        }
                      }}
                      aria-pressed={composerStance === "con"}
                      disabled={
                        sessionPaused ||
                        sessionClosed ||
                        meetingRecessed ||
                        (activeMotion &&
                          (activeMotion.state === "postponed" ||
                            activeMotion.state === "referred")) ||
                        !activeMotion
                      }
                      aria-disabled={
                        sessionPaused ||
                        sessionClosed ||
                        meetingRecessed ||
                        (activeMotion && activeMotion.state === "postponed") ||
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
                        (composerStanceVisual === "neutral" ? "is-active" : "")
                      }
                      onClick={() => {
                        setComposerStanceVisual("neutral");
                        setComposerStance("neutral");
                      }}
                      onFocus={() => {
                        setComposerStanceVisual("neutral");
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleSendWithStance(e, "neutral");
                        }
                      }}
                      aria-pressed={composerStance === "neutral"}
                      disabled={
                        sessionPaused ||
                        sessionClosed ||
                        meetingRecessed ||
                        (activeMotion && activeMotion.state === "postponed") ||
                        !activeMotion
                      }
                      aria-disabled={
                        sessionPaused ||
                        sessionClosed ||
                        meetingRecessed ||
                        (activeMotion && activeMotion.state === "postponed") ||
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
                      (activeMotion.state === "postponed" ||
                        activeMotion.state === "referred")) ||
                    !activeMotion ||
                    !input.trim()
                  }
                  aria-disabled={
                    sessionPaused ||
                    sessionClosed ||
                    meetingRecessed ||
                    (activeMotion &&
                      (activeMotion.state === "postponed" ||
                        activeMotion.state === "referred")) ||
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
                      : activeMotion && activeMotion.state === "postponed"
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
                          <div className="final-outcome" aria-live="polite">
                            {(() => {
                              const votes = voteEntries(activeMotion);
                              const tally =
                                activeMotion?.tally || computeTally(votes);
                              const outcomeText =
                                activeMotion.decisionDetails?.outcome ||
                                (votes.length > 0 ? computeOutcome(votes) : "");
                              if (!outcomeText) return null;
                              const cls = outcomeClassFromText(outcomeText);
                              return (
                                <span className={`outcome-pill ${cls}`}>
                                  {outcomeText}
                                </span>
                              );
                            })()}
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
                                const votes = voteEntries(activeMotion);
                                const tally =
                                  activeMotion?.tally || computeTally(votes);
                                const outcomeText =
                                  activeMotion.decisionDetails?.outcome ||
                                  (votes.length > 0
                                    ? computeOutcome(votes)
                                    : "");
                                if (!outcomeText) return null;
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
                          const votes = voteEntries(activeMotion);
                          const tally =
                            activeMotion?.tally || computeTally(votes);
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
                          <div>
                            <button
                              type="button"
                              className="decision-edit-btn"
                              onClick={handleStartEditDecision}
                            >
                              Edit
                            </button>
                          </div>
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
                        <div className="final-outcome" aria-live="polite">
                          {(() => {
                            const votes = voteEntries(activeMotion);
                            const tally =
                              activeMotion?.tally || computeTally(votes);
                            const outcomeText =
                              activeMotion.decisionDetails?.outcome ||
                              (votes.length > 0 ? computeOutcome(votes) : "");
                            if (!outcomeText) return null;
                            const cls = outcomeClassFromText(outcomeText);
                            return (
                              <span className={`outcome-pill ${cls}`}>
                                {outcomeText}
                              </span>
                            );
                          })()}
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

      {/* RIGHT: participants (only on wide screens) - render the same member list
          as the left panel on wide screens to avoid duplication. */}
      <aside className="discussion-right">
        {!isSplit && (
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
                aria-label={
                  membersCollapsed
                    ? "Expand participants"
                    : "Collapse participants"
                }
                style={{ float: "right" }}
              >
                {membersCollapsed ? (
                  <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden>
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
                  <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden>
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
            </div>
            <div
              className={`member-list-body ${
                membersCollapsed ? "collapsed" : ""
              }`}
            >
              {members.map((p) => {
                const prof = profileCache[p.username] || {};
                const displayName =
                  prof.name && prof.name.trim().length > 0
                    ? prof.name
                    : p.name || p.id || p.username;
                const avatarSrc =
                  prof.avatarUrl && prof.avatarUrl.trim().length > 0
                    ? prof.avatarUrl
                    : p.avatarUrl && p.avatarUrl.trim().length > 0
                    ? p.avatarUrl
                    : "https://ui-avatars.com/api/?name=" +
                      encodeURIComponent(displayName) +
                      "&background=e5e7eb&color=374151&size=40";
                return (
                  <LiveProfileMemberCard
                    key={p.id || p.name || p.username}
                    username={p.username}
                    fallbackName={displayName}
                    role={p.role}
                    avatarUrl={avatarSrc}
                  />
                );
              })}
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
