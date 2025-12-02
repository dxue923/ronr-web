import React, { useState, useEffect } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import { fetchProfile, updateProfile } from "../api/profile";
import "../assets/styles/index.css";

const PLACEHOLDER_AVATAR = null;

export default function EditProfile() {
  const { user, isAuthenticated, getAccessTokenSilently } = useAuth0();
  const [formData, setFormData] = useState({
    name: "",
    username: "",
    email: "",
    bio: "",
  });
  const [avatar, setAvatar] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  // remoteLoaded state removed (no longer showing load status UI)

  // Load profile: remote if authenticated, else local storage fallback (scoped by email)
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setError("");
      if (!isAuthenticated) {
        // Local fallback only, use activeProfileEmail if available
        try {
          const activeEmail = localStorage.getItem("activeProfileEmail") || "";
          const key = activeEmail
            ? `profileData:${activeEmail}`
            : "profileData";
          const stored = JSON.parse(localStorage.getItem(key) || "{}");
          if (cancelled) return;
          setFormData({
            name: stored.name || stored.username || "",
            username: stored.username || "",
            email: user?.email || stored.email || "",
            bio: stored.bio || "",
          });
          setAvatar(stored.avatarUrl || null);
        } catch {}
        return;
      }

      setLoading(true);
      try {
        const token = await getAccessTokenSilently().catch(() => null);
        if (!token) throw new Error("Unable to get auth token");
        const profile = await fetchProfile(token);
        if (cancelled) return;
        setFormData({
          name: profile.name || profile.username || "",
          username: profile.username || "",
          email: profile.email || user?.email || "",
          bio: "", // bio not stored server-side yet
        });
        setAvatar(profile.avatarUrl || null);
        // Persist namespaced local cache and active email
        try {
          if (profile.email) {
            localStorage.setItem("activeProfileEmail", profile.email);
            localStorage.setItem(
              `profileData:${profile.email}`,
              JSON.stringify({
                name: profile.name || "",
                username: profile.username || "",
                email: profile.email || "",
                bio: "",
                avatarUrl: profile.avatarUrl || "",
              })
            );
          }
        } catch {}
      } catch (err) {
        console.error("[EditProfile] load error", err);
        if (!cancelled) setError(err.message || "Failed to load profile");
        // Fallback to local storage if available
        try {
          const activeEmail = localStorage.getItem("activeProfileEmail") || "";
          const key = activeEmail
            ? `profileData:${activeEmail}`
            : "profileData";
          const stored = JSON.parse(localStorage.getItem(key) || "{}");
          if (!cancelled) {
            setFormData({
              name: stored.name || stored.username || "",
              username: stored.username || "",
              email: user?.email || stored.email || "",
              bio: stored.bio || "",
            });
            setAvatar(stored.avatarUrl || null);
          }
        } catch {}
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, getAccessTokenSilently, user]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleImageChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setAvatar(ev.target.result);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    const payload = {
      name: formData.name?.trim(),
      username: formData.username?.trim() || formData.name?.trim() || "You",
      email: formData.email?.trim() || "",
      bio: formData.bio || "",
      avatarUrl: avatar || "",
    };

    // Always persist locally for fallback (namespaced by email)
    try {
      if (payload.email) {
        localStorage.setItem("activeProfileEmail", payload.email);
        localStorage.setItem(
          `profileData:${payload.email}`,
          JSON.stringify(payload)
        );
      } else {
        // legacy fallback
        localStorage.setItem("profileData", JSON.stringify(payload));
      }
    } catch {}

    if (!isAuthenticated) {
      alert("Profile saved locally (not signed in).");
      return;
    }

    setSaving(true);
    try {
      const token = await getAccessTokenSilently().catch(() => null);
      if (!token) throw new Error("Missing auth token");
      const updated = await updateProfile(token, {
        name: payload.name,
        username: payload.username,
        avatarUrl: payload.avatarUrl,
      });
      setFormData((prev) => ({
        ...prev,
        name: updated.name || prev.name,
        username: updated.username || prev.username,
        email: updated.email || prev.email,
      }));
      setAvatar(updated.avatarUrl || avatar);
      // Update namespaced local cache and active email after successful sync
      try {
        const email = updated.email || payload.email || "";
        if (email) {
          localStorage.setItem("activeProfileEmail", email);
          localStorage.setItem(
            `profileData:${email}`,
            JSON.stringify({
              name: updated.name || payload.name,
              username: updated.username || payload.username,
              email,
              bio: payload.bio || "",
              avatarUrl: updated.avatarUrl || payload.avatarUrl || "",
            })
          );
        }
      } catch {}
      alert("Profile synced!");
    } catch (err) {
      console.error("[EditProfile] update error", err);
      setError(err.message || "Update failed");
      alert("Remote update failed; saved locally only.");
    } finally {
      setSaving(false);
    }
  };

  const notAuthed = !isAuthenticated;

  return (
    <div className="edit-profile-page">
      <div className="profile-card">
        {notAuthed && (
          <div className="auth-warning">
            You are not signed in. Changes are stored locally only.
          </div>
        )}
        {!!error && <div className="error-msg">{error}</div>}
        <h2 className="profile-title">Edit Profile</h2>

        <div className="avatar-section">
          <img src={avatar || undefined} alt="" className="profile-image" />
          <label htmlFor="avatar-upload" className="avatar-edit-label">
            Edit Avatar
          </label>
          <input
            id="avatar-upload"
            type="file"
            accept="image/*"
            onChange={handleImageChange}
            style={{ display: "none" }}
          />
        </div>

        <form className="profile-edit-form" onSubmit={handleSubmit}>
          {/* Name */}
          <div className="form-field">
            <label className="form-label" htmlFor="name">
              Name <span className="required">*</span>
            </label>
            <input
              className="form-input"
              id="name"
              name="name"
              type="text"
              placeholder="Enter your name"
              value={formData.name}
              onChange={handleChange}
              required
            />
          </div>

          {/* Username */}
          <div className="form-field">
            <label className="form-label" htmlFor="username">
              Username <span className="required">*</span>
            </label>
            <input
              className="form-input"
              id="username"
              name="username"
              type="text"
              placeholder="Enter your username"
              value={formData.username}
              onChange={handleChange}
              required
            />
          </div>

          {/* Email */}
          <div className="form-field">
            <label className="form-label" htmlFor="email">
              Email
            </label>
            <input
              className="form-input"
              id="email"
              name="email"
              type="email"
              value={formData.email}
              disabled
              placeholder="Email"
            />
          </div>

          {/* Submit Button */}
          <button type="submit" className="submit-btn" disabled={saving}>
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </form>
      </div>
    </div>
  );
}
