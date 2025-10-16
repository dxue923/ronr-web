import { useState, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import "../assets/styles/index.css";

// <link rel="preconnect" href="https://fonts.googleapis.com">
// <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous">
// <link href="https://fonts.googleapis.com/css2?family=STIX+Two+Text:ital,wght@0,400..700;1,400..700&display=swap" rel="stylesheet">

export default function CreateAccount() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: "",
    username: "",
    email: "",
    password: "",
    passwordConfirm: "",
    bio: "",
  });

  const [showPwd, setShowPwd] = useState(false);
  const [showPwdConfirm, setShowPwdConfirm] = useState(false);

  const [avatarPreview, setAvatarPreview] = useState("");
  const fileInputRef = useRef(null);

  function handleChange(e) {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
  }

  function handleAvatarChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setAvatarPreview(String(reader.result));
    reader.readAsDataURL(file);
  }

  function handleSubmit(e) {
    e.preventDefault();

    if (form.password !== form.passwordConfirm) {
      alert("Passwords do not match.");
      return;
    }

    navigate("/signin");
  }

  return (
    <div className="create-account-page">
      <section className="account-card" aria-labelledby="formTitle">
        <Link to="/signin" className="back-link">
          Back to Sign In
        </Link>

        <div className="avatar">
          <img id="avatarPreview" src={avatarPreview || undefined} />
          <label htmlFor="avatarInput" className="avatar-label">
            Add Picture
          </label>
          <input
            id="avatarInput"
            ref={fileInputRef}
            type="file"
            accept="image/*"
            hidden
            onChange={handleAvatarChange}
          />
        </div>

        <form id="createForm" className="form" onSubmit={handleSubmit}>
          <label className="field">
            <span className="field-label">
              Name <span className="req">*</span>
            </span>
            <input
              className="field-input"
              name="name"
              placeholder="Name"
              value={form.name}
              onChange={handleChange}
              required
            />
          </label>

          <label className="field">
            <span className="field-label">
              Username <span className="req">*</span>
            </span>
            <input
              className="field-input"
              name="username"
              placeholder="Username"
              value={form.username}
              onChange={handleChange}
              required
            />
          </label>

          <label className="field">
            <span className="field-label">
              Email <span className="req">*</span>
            </span>
            <input
              className="field-input"
              name="email"
              type="email"
              placeholder="Email"
              value={form.email}
              onChange={handleChange}
              required
            />
          </label>

          <label className="field">
            <span className="field-label">
              Password <span className="req">*</span>
            </span>
            <div className="password-wrapper">
              <input
                className="field-input"
                id="password"
                name="password"
                type={showPwd ? "text" : "password"}
                placeholder="Password"
                value={form.password}
                onChange={handleChange}
                required
              />
            </div>
          </label>

          <label className="field">
            <span className="field-label">
              Password (confirm) <span className="req">*</span>
            </span>
            <div className="password-wrapper">
              <input
                className="field-input"
                id="password_confirm"
                name="passwordConfirm"
                type={showPwdConfirm ? "text" : "password"}
                placeholder="Password"
                value={form.passwordConfirm}
                onChange={handleChange}
                required
              />
            </div>
          </label>

          <label className="field">
            <span className="field-label">Bio</span>
            <textarea
              className="field-input field-textarea"
              id="bio"
              name="bio"
              placeholder=""
              rows={4}
              value={form.bio}
              onChange={handleChange}
            />
          </label>
          <button className="create-account-btn" type="submit">
            Create Account
          </button>
        </form>
      </section>
    </div>
  );
}
