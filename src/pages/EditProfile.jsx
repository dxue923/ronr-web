import React, { useState, useEffect } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import { fetchProfile, updateProfile } from "../api/profile";
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

      setLoading(true);
      try {
        // Get ID token (JWT with sub/email/etc.)
        const claims = await getIdTokenClaims().catch(() => null);
        const token = claims?.__raw;

        if (!token) {
          throw new Error("Unable to get auth token");
        }

        const profile = await fetchProfile(token);
        if (!profile) return;

        setFormData({
          name: profile.name || "",
          username: profile.username || "",
          email: profile.email || user?.email || "",
          bio: "", // or profile.bio if you later add it
        });
        setAvatar(profile.avatarUrl || null);
      } catch (err) {
        console.error("[EditProfile] load error", err);
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
      username: formData.username?.trim() || formData.name?.trim() || "You",
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
      const claims = await getIdTokenClaims().catch(() => null);
      const token = claims?.__raw;
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
      // No localStorage: all changes are saved to backend only
      alert("Profile synced!");
    } catch (err) {
      console.error("[EditProfile] update error", err);
      setError(err.message || "Update failed");
      // No misleading alert about local save
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
