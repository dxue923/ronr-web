import React, { useState, useEffect } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import "../assets/styles/index.css";

const PLACEHOLDER_AVATAR = "";

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

  if (!isAuthenticated) {
    return <div>Please log in to edit your profile.</div>;
  }

  return (
    <div className="create-account-page">
      <div className="account-card">
        <h2 style={{ textAlign: "center", marginBottom: "12px" }}>
          Edit Profile
        </h2>

        <div className="avatar">
          <img src={avatar || PLACEHOLDER_AVATAR} alt="Profile" />
          <label htmlFor="avatar-upload" className="avatar-label">
            Edit
          </label>
          <input
            id="avatar-upload"
            type="file"
            accept="image/*"
            onChange={handleImageChange}
            style={{ display: "none" }}
          />
        </div>

        <form className="form" onSubmit={handleSubmit}>
          <div className="field">
            <label className="field-label" htmlFor="name">
              Name <span className="req">*</span>
            </label>
            <input
              className="field-input"
              id="name"
              name="name"
              type="text"
              placeholder="Enter your name"
              value={formData.name}
              onChange={handleChange}
              required
            />
          </div>

          <div className="field">
            <label className="field-label" htmlFor="username">
              Username <span className="req">*</span>
            </label>
            <input
              className="field-input"
              id="username"
              name="username"
              type="text"
              placeholder="Enter your username"
              value={formData.username}
              onChange={handleChange}
              required
            />
          </div>

          <div className="field">
            <label className="field-label" htmlFor="email">
              Email
            </label>
            <input
              className="field-input"
              id="email"
              name="email"
              type="email"
              value={formData.email}
              disabled // lock email, uneditable
            />
          </div>

          <button type="submit" className="btn">
            Save Changes
          </button>
        </form>
      </div>
    </div>
  );
}
