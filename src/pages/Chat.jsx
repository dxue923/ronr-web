// src/pages/Discussion.jsx
import React, { useState, useRef, useEffect } from "react";
import "../assets/styles/index.css";
import { CreateCommitteePageData } from "../data/pageData";
import { Chatbox } from "../components/Chatbox";

// ——— helpers: cache IO + active committee
const loadCache = (key, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(key) || "null") ?? fallback;
  } catch {
    return fallback;
  }
};
const saveCache = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
};
const getActiveCommittee = (data) =>
  data?.committees?.find((c) => c.id === data?.activeCommitteeId) ??
  data?.committees?.[0];

export default function Discussion() {
  // state: root data cache
  const [data, setData] = useState(() =>
    loadCache("discussionData", CreateCommitteePageData)
  );

  // state: input for composer
  const [input, setInput] = useState("");

  // state: motions list (placeholder until API loads)
  const [motions, setMotions] = useState(() => {
    const active = getActiveCommittee(data);
    return active?.motions?.length
      ? active.motions
      : [
          { id: "tmp-1", title: "Motion A", discussion: [] },
          { id: "tmp-2", title: "Motion B", discussion: [] },
        ];
  });

  // state: currently selected motion index
  const [activeMotionIndex, setActiveMotionIndex] = useState(0);

  // state: add-motion inline control
  const [addingMotion, setAddingMotion] = useState(false);
  const [newMotion, setNewMotion] = useState("");

  // effect: fetch motions from Netlify function once
  useEffect(() => {
    let cancelled = false;
    fetch("/.netlify/functions/motions")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((list) => {
        if (!cancelled && Array.isArray(list) && list.length) {
          setMotions(list);
          setData((prev) => {
            const activeId =
              prev?.activeCommitteeId ?? getActiveCommittee(prev)?.id;
            const committees = (prev?.committees ?? []).map((c) =>
              c.id === activeId ? { ...c, motions: list } : c
            );
            const next = { ...prev, committees };
            saveCache("discussionData", next);
            return next;
          });
        }
      })
      .catch(() => {}); // silent fallback to placeholders
    return () => {
      cancelled = true;
    };
  }, []);

  // effect: fetch comments for current motion from Netlify function
  useEffect(() => {
    if (!motions?.length) return; // wait until motions are loaded
    const current = motions[activeMotionIndex];
    if (!current?.id) return;

    // 🔒 if we already fetched comments for this motion, don't fetch again
    if (current._discussionLoaded) return;

    let cancelled = false;
    fetch(`/.netlify/functions/discussion?motionId=${current.id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((list) => {
        if (cancelled || !Array.isArray(list)) return;
        setMotions((prev) =>
          prev.map((m) =>
            m.id === current.id
              ? {
                  ...m,
                  discussion: list,
                  _discussionLoaded: true, // ✅ mark as loaded
                }
              : m
          )
        );
      })
      .catch(() => {
        // silent fallback — keep existing discussion if API fails
        setMotions((prev) =>
          prev.map((m) =>
            m.id === current.id ? { ...m, _discussionLoaded: true } : m
          )
        );
      });

    return () => {
      cancelled = true;
    };
  }, [motions, activeMotionIndex]);

  // effect: persist motions into cached data on change
  useEffect(() => {
    setData((prev) => {
      const activeId = prev?.activeCommitteeId ?? getActiveCommittee(prev)?.id;
      const committees = (prev?.committees ?? []).map((c) =>
        c.id === activeId ? { ...c, motions } : c
      );
      const next = { ...prev, committees };
      saveCache("discussionData", next);
      return next;
    });
  }, [motions]);

  // refs: autoscroll to latest message in current thread
  const threadEndRef = useRef(null);
  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [motions, activeMotionIndex]);

  // derived: committee and people
  const activeCommittee = getActiveCommittee(data);
  const chair = activeCommittee?.members?.find((m) => m.role === "chair");
  const members = (activeCommittee?.members ?? []).filter(
    (m) => m.role === "member"
  );
  const currentMotion = motions?.[activeMotionIndex];

  // handlers: add a new motion (now calls POST)
  const handleAddMotion = async () => {
    const title = newMotion.trim();
    if (!title) return;

    try {
      const res = await fetch("/.netlify/functions/motions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description: "" }),
      });
      if (!res.ok) throw new Error("Failed to create motion");
      const created = payload.motion ?? payload; // <- handle both shapes

      setMotions((prev) => {
        const next = [...prev, created];
        // focus the newly created motion
        setActiveMotionIndex(next.length - 1);
        return next;
      });

      setNewMotion("");
      setAddingMotion(false);
    } catch (e) {
      // (optional) fallback to local add if the API fails
      const created = {
        id: String(Date.now()),
        title,
        description: "",
        discussion: [],
        createdAt: new Date().toISOString(),
      };
      setMotions((prev) => {
        const next = [...prev, created];
        setActiveMotionIndex(next.length - 1);
        return next;
      });
      setNewMotion("");
      setAddingMotion(false);
    }
  };

  // NEW — local update + POST API call
  const handleSubmit = async (e) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || !currentMotion?.id) return;

    // local optimistic update
    const newComment = {
      id: Date.now(),
      author: "You",
      text,
      createdAt: new Date().toISOString(),
    };
    setMotions((prev) =>
      prev.map((m, i) =>
        i === activeMotionIndex
          ? { ...m, discussion: [...(m.discussion ?? []), newComment] }
          : m
      )
    );
    setInput("");

    try {
      await fetch("/.netlify/functions/discussion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          motionId: currentMotion.id,
          author: "You",
          text,
        }),
      });
    } catch {
      // optional: handle network error silently
    }
  };

  return (
    <div className="app-layout">
      {/* left: motions list + people */}
      <aside className="left-main">
        <div className="motions-header">
          <h3 className="motions">Motions</h3>
          <button
            className="add-motion-btn"
            aria-label="Add motion"
            onClick={() => setAddingMotion(true)}
          >
            +
          </button>
        </div>

        <nav className="motion-list">
          <ul>
            {motions?.map((m, idx) => (
              <li key={m.id ?? idx}>
                <button
                  type="button"
                  className={idx === activeMotionIndex ? "active" : ""}
                  onClick={() => setActiveMotionIndex(idx)}
                >
                  {m.title}
                </button>
              </li>
            ))}
            {addingMotion && (
              <li>
                <input
                  type="text"
                  className="new-motion-input"
                  placeholder="Enter motion title..."
                  value={newMotion}
                  onChange={(e) => setNewMotion(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAddMotion()}
                  autoFocus
                />
              </li>
            )}
          </ul>
        </nav>

        <div className="sidebar-divider" role="separator" aria-hidden="true" />

        <div className="sidebar-people">
          <h4>Chair</h4>
          <div className="chair">
            <img src="#" alt="" className="avatar" />
            <span>{chair?.name ?? "—"}</span>
          </div>

          <h4>Members</h4>
          {members.length ? (
            members.map((m) => (
              <div key={m.id} className="member">
                <img src="#" alt="" className="avatar" />
                <span>{m.name}</span>
              </div>
            ))
          ) : (
            <div className="member">
              <span>—</span>
            </div>
          )}

          <h4>Observers</h4>
          <div className="observer">
            <img src="#" alt="" className="avatar" />
            <span>Observer 1</span>
          </div>
        </div>
      </aside>

      {/* center: discussion thread + composer */}
      <main className="center-main">
        <div className="discussion-thread">
          {currentMotion?.discussion?.map((c) => (
            <Chatbox
              key={c.id}
              message={c.text}
              author={c.author}
              timestamp={c.createdAt}
              isOwn={c.author === "You"}
            />
          ))}
          <div ref={threadEndRef} />
        </div>

        <section className="composer">
          <button className="plus-btn" aria-label="More options">
            +
          </button>
          <form className="comment-form" onSubmit={handleSubmit}>
            <input
              className="input"
              placeholder={`Write a comment for ${
                currentMotion?.title ?? "this motion"
              }...`}
              value={input}
              onChange={(e) => setInput(e.target.value)}
            />
            <button
              className="submit"
              type="submit"
              aria-label="Submit comment"
            >
              <i className="fa fa-arrow-up" aria-hidden="true"></i>
            </button>
          </form>
        </section>
      </main>
    </div>
  );
}
