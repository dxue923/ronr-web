import React, { useState } from "react";
import "../assets/styles/index.css";

export default function EditProfile() {
  const [formData, setFormData] = useState({
    name: "",
    username: "",
    email: "",
    bio: "",
  });
  const [preview, setPreview] = useState(null);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setPreview(URL.createObjectURL(file));
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    console.log("Updated profile:", formData);
    alert("Profile updated!");
  };

  return (
    <div className="create-account-page">
      <div className="account-card">
        <a href="/" className="back-link">
          ← Back
        </a>
        <h2 style={{ textAlign: "center", marginBottom: "12px" }}>
          Edit Profile
        </h2>

        <div className="avatar">
          <img
            src={preview || "https://via.placeholder.com/160"}
          />
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
              Email <span className="req">*</span>
            </label>
            <input
              className="field-input"
              id="email"
              name="email"
              type="email"
              placeholder="Enter your email"
              value={formData.email}
              onChange={handleChange}
              required
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

          <button type="submit" className="btn">
            Save Changes
          </button>
        </form>
      </div>
    </div>
  );
}
