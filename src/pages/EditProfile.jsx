// src/pages/EditProfile.jsx
import React, { useState, useEffect } from "react";
import "../assets/styles/index.css";

const PLACEHOLDER_AVATAR = "";

export default function EditProfile() {
  const [formData, setFormData] = useState({
    name: "",
    username: "",
    email: "",
    bio: "",
  });
  const [avatar, setAvatar] = useState(null);

  // load existing profileData from localStorage
  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem("profileData") || "{}");
      setFormData({
        name: stored.name || stored.username || "",
        username: stored.username || "",
        email: stored.email || "",
        bio: stored.bio || "",
      });
      setAvatar(stored.avatarUrl || null);
    } catch {
      // ignore
    }
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  // read uploaded image as data URL so it survives refresh
  const handleImageChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setAvatar(ev.target.result); // data URL
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    // write to ls
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

          {/* 
          <div className="field">
            <label className="field-label" htmlFor="email">
              Email
            </label>
            <input
              className="field-input"
              id="email"
              name="email"
              type="email"
              placeholder="Enter your email"
              value={formData.email}
              onChange={handleChange}
            />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="bio">
              Biography
            </label>
            <textarea
              className="field-input"
              id="bio"
              name="bio"
              placeholder="Tell us a bit about yourself"
              value={formData.bio}
              onChange={handleChange}
              rows="4"
            />
          </div>
          */}

          <button type="submit" className="btn">
            Save Changes
          </button>
        </form>
      </div>
    </div>
  );
}
