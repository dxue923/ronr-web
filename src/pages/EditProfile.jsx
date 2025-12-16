import React, { useState, useEffect } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import { getApiToken } from "../api/auth";
import {
  fetchProfile,
  updateProfile,
  loadProfileFromStorage,
  saveProfileToStorage,
} from "../api/profile";
import "../assets/styles/index.css";

const PLACEHOLDER_AVATAR = null;

export default function EditProfile() {
  const { user, isAuthenticated, getAccessTokenSilently, getIdTokenClaims } =
    useAuth0();
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
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setError("");
      if (!isAuthenticated) {
        setError("Please sign in to load your profile.");
        return;
      }
      // Try to seed from local cache first so the UI appears instantly
      const email = user?.email || "";
      const localPart = email ? String(email).split("@")[0] : "";
      const cached = loadProfileFromStorage(email);
      if (cached && !cancelled) {
        setFormData({
          name: cached.name || "",
          username: cached.username || "",
          email: cached.email || email,
          bio: "",
        });
        setAvatar(cached.avatarUrl || null);
      } else if (!cached && !cancelled) {
        // Seed from Auth0 user claims immediately so email/username show up
        setFormData({
          name: user?.name || "",
          username: localPart || "",
          email: email || "",
          bio: "",
        });
        setAvatar(user?.picture || null);
      }

      setLoading(true);
      try {
        // Prefer an API access token for the profile endpoint (audience must match),
        // fall back to the ID token if an access token is not available.
        const { token } = await getApiToken({
          getAccessTokenSilently,
          getIdTokenClaims,
        });
        if (!token) throw new Error("Unable to get auth token");
        const profile = await fetchProfile(token);
        if (!cancelled) {
          const emailForCache = profile?.email || user?.email || "";
          const localFromEmail = emailForCache
            ? String(emailForCache).split("@")[0]
            : "";
          setFormData({
            name: profile?.name || user?.name || "",
            // Prefer saved username, otherwise derive from email local-part
            username:
              profile?.username ||
              localFromEmail ||
              (user?.email ? String(user.email).split("@")[0] : ""),
            email: emailForCache,
            bio: "",
          });
          setAvatar(profile?.avatarUrl || user?.picture || null);
          // Persist a lightweight snapshot to localStorage for next load
          saveProfileToStorage(emailForCache, profile || {});
        }
      } catch (err) {
        setError(err.message || "Failed to load profile");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, getIdTokenClaims, user]);

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
      // Ensure username exists: prefer explicit, otherwise derive from email local-part
      username:
        formData.username?.trim() ||
        (formData.email ? String(formData.email).split("@")[0] : "") ||
        formData.name?.trim() ||
        "user",
      email: formData.email?.trim() || "",
      bio: formData.bio || "",
      avatarUrl: avatar || "",
    };

    if (!isAuthenticated) {
      setError("You must be signed in to update your profile.");
      alert("You must be signed in to update your profile.");
      return;
    }

    setSaving(true);
    try {
      const { token } = await getApiToken({
        getAccessTokenSilently,
        getIdTokenClaims,
      });
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

      // Ask backend to refresh this user's entry in all committees
      try {
        await fetch("/.netlify/functions/committee?syncProfile=1", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            username: updated.username || payload.username,
          }),
        });
      } catch (e) {
        // Non-fatal: committee member display names may lag until next fetch
        console.warn("[EditProfile] committee sync failed", e);
      }

      // Dispatch profile-updated event so other pages refresh user info
      window.dispatchEvent(new Event("profile-updated"));

      alert("Profile synced!");
    } catch (err) {
      setError(err.message || "Update failed");
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
        {/* Title removed per request */}

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
              Name
            </label>
            <input
              className="form-input"
              id="name"
              name="name"
              type="text"
              placeholder="Enter your name (optional)"
              value={formData.name}
              onChange={handleChange}
            />
          </div>

          {/* Username */}
          <div className="form-field">
            <label className="form-label" htmlFor="username">
              Username
            </label>
            <input
              className="form-input form-input--disabled"
              id="username"
              name="username"
              type="text"
              placeholder="Enter your username"
              value={formData.username}
              readOnly
              disabled
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
