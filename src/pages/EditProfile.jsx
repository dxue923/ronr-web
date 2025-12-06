import React, { useState, useEffect } from "react";
import { useAuth0 } from "@auth0/auth0-react";
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
  const deriveUsername = (email) => (email ? String(email).split("@")[0] : "");
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
      // Preload email/username from Auth0 user so fields show immediately
      if (email && !cancelled) {
        setFormData((prev) => ({
          ...prev,
          email,
          username: prev.username || deriveUsername(email),
        }));
      }
      const cached = loadProfileFromStorage(email);
      if (cached && !cancelled) {
        setFormData({
          name: cached.name || "",
          username: cached.username || deriveUsername(email),
          email: cached.email || email,
          bio: "",
        });
        setAvatar(cached.avatarUrl || null);
      }

      setLoading(true);
      try {
        // Request an access token for the API (preferred). If that fails,
        // fall back to the ID token so the UI can still load in edge cases.
        let token = await getAccessTokenSilently({
          authorizationParams: {
            audience: import.meta.env.VITE_AUTH0_AUDIENCE,
            scope: "openid profile email",
          },
        }).catch(() => null);

        if (!token) {
          const claims = await getIdTokenClaims().catch(() => null);
          token = claims?.__raw;
        }

        if (!token) {
          throw new Error("Unable to get auth token");
        }

        const profile = await fetchProfile(token);
        if (profile && !cancelled) {
          const emailForCache = profile.email || user?.email || "";
          setFormData({
            name: profile.name || "",
            username:
              profile.username ||
              deriveUsername(emailForCache) ||
              profile.username ||
              "",
            email: emailForCache,
            bio: "", // or profile.bio if you later add it
          });
          setAvatar(profile.avatarUrl || null);
          // Persist a lightweight snapshot to localStorage for next load
          saveProfileToStorage(emailForCache, {
            name: profile.name || "",
            username: profile.username || deriveUsername(emailForCache),
            email: emailForCache,
            avatarUrl: profile.avatarUrl || null,
          });
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
      username:
        formData.username?.trim() ||
        deriveUsername(formData.email) ||
        formData.name?.trim() ||
        "You",
      email: formData.email?.trim() || "",
      bio: formData.bio || "",
      avatarUrl: avatar || "",
    };

    if (!isAuthenticated) {
      // Save locally when not authenticated so the page still reflects changes.
      const emailForCache = payload.email || user?.email || "";
      try {
        saveProfileToStorage(emailForCache, {
          name: payload.name,
          username: payload.username,
          email: emailForCache,
          avatarUrl: payload.avatarUrl,
        });
        // Notify other pages to refresh their cached view
        window.dispatchEvent(new Event("profile-updated"));
        alert("Changes saved locally. Sign in to sync with the server.");
      } catch (err) {
        setError("Failed to save locally");
      }
      return;
    }

    setSaving(true);
    try {
      let token = await getAccessTokenSilently({
        authorizationParams: {
          audience: import.meta.env.VITE_AUTH0_AUDIENCE,
          scope: "openid profile email",
        },
      }).catch(() => null);

      if (!token) {
        const claims = await getIdTokenClaims().catch(() => null);
        token = claims?.__raw;
      }
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

      // Persist updated profile to localStorage so other pages can read it
      try {
        const emailForCache =
          updated.email || formData.email || user?.email || "";
        saveProfileToStorage(emailForCache, {
          name: updated.name || payload.name,
          username: updated.username || payload.username,
          email: emailForCache,
          avatarUrl: updated.avatarUrl || payload.avatarUrl,
        });
      } catch (e) {
        console.warn("Failed to save updated profile to localStorage", e);
      }

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
