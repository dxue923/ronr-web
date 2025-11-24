import React, { useState, useEffect } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import "../assets/styles/index.css";

const PLACEHOLDER_AVATAR = null;

export default function EditProfile() {
  const { user, isAuthenticated } = useAuth0();
  const [formData, setFormData] = useState({
    name: "",
    username: "",
    email: "",
    bio: "",
  });
  const [avatar, setAvatar] = useState(null);

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem("profileData") || "{}");
      setFormData({
        name: stored.name || stored.username || "",
        username: stored.username || "",
        email: user?.email || stored.email || "",
        bio: stored.bio || "",
      });
      setAvatar(stored.avatarUrl || null);
    } catch {}
  }, [user]);

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

  const handleSubmit = (e) => {
    e.preventDefault();
    const payload = {
      name: formData.name?.trim(),
      username: formData.username?.trim() || formData.name?.trim() || "You",
      email: formData.email?.trim() || "",
      bio: formData.bio || "",
      avatarUrl: avatar || "",
    };
    localStorage.setItem("profileData", JSON.stringify(payload));
    alert("Profile updated!");
  };

  const notAuthed = !isAuthenticated;

  return (
    <div className="edit-profile-page">
      <div className="profile-card">
        {notAuthed && (
          <div className="auth-warning">
            Please sign in to sync your profile with your account. You can still
            edit and save profile data locally.
          </div>
        )}
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

          {/* Bio */}
          {/* <div className="form-field">
            <label className="form-label" htmlFor="bio">
              Bio
            </label>
            <textarea
              className="form-input"
              id="bio"
              name="bio"
              placeholder="Tell us about yourself"
              value={formData.bio}
              onChange={handleChange}
              rows="4"
            />
          </div> */}

          {/* Submit Button */}
          <button type="submit" className="submit-btn">
            Save Changes
          </button>
        </form>
      </div>
    </div>
  );
}
