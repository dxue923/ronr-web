import React, { useState } from "react";
import "../assets/styles/index.css";
import { CreateCommitteePageData } from "../data/pageData";
import { useNavigate } from 'react-router-dom';

export default function CreateCommittee() {
  const [committeeName, setCommitteeName] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [committeeMembers, setCommitteeMembers] = useState([]);
  const [searchResults, setSearchResults] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const navigate = useNavigate ? useNavigate() : null;

  // Mock committee members to simulate search functionality
  const mockUsers = [
    { name: 'Nathalie', username: 'nathalie_123' },
    { name: 'Dave', username: 'dave' },
    { name: 'Maddy', username: 'maddy15' },
    { name: 'Lilly', username: 'li.lly' },
  ];

  const handleAddMember = () => {
    // Fake search/add behavior:
    // - searchTerm matches a mock user (by username or name substring): add user
    // - No match: create new member object using searchTerm as name/username
    // - Prevent adding duplicates by username
    const term = (searchTerm || '').trim();
    if (!term) return;

    // Find first matching mock user by username or name
    const match = mockUsers.find(u =>
      u.username.toLowerCase() === term.toLowerCase() ||
      u.name.toLowerCase().includes(term.toLowerCase())
    );

    const newMember = match ? { ...match } : { name: term, username: term.replace(/\s+/g, '').toLowerCase() };

    // Avoid duplicates
    const exists = committeeMembers.some(m => m.username.toLowerCase() === newMember.username.toLowerCase());
    if (exists) {
      setError('Member already added');
      return;
    }

    setCommitteeMembers(prev => [...prev, newMember]);
    setSearchTerm('');
    setSearchResults([]);
    setError(null);
  };

  const handleCreateCommittee = () => {
    // Basic validation
    setError(null);
    if (!committeeName || committeeName.trim() === '') {
      setError('Please provide a committee name.');
      return;
    }

    if (!committeeMembers || committeeMembers.length === 0) {
      setError('Please add at least one committee member.');
      return;
    }

    // Prepare committee
    const committee = {
      name: committeeName.trim(),
      members: committeeMembers.map(m => ({ name: m.name, username: m.username })),
      createdAt: new Date().toISOString(),
    };

    setSubmitting(true);

    // Attempt to create committee via serverless function or API endpoint.
    // If no backend exists, fall back to a simulated delay and navigate.
    const endpoint = '/.netlify/functions/createCommittee';

    fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(committee),
    })
      .then(async (res) => {
        if (!res.ok) {
          const text = await res.text();
          throw new Error(text || `Server returned ${res.status}`);
        }
        return res.json();
      })
      .then((data) => {
        // Expect data to contain an id or route for the new committee discussion
        const committeeId = data && data.id ? data.id : null;
        // navigate to discussion page if possible, otherwise redirect to home
        if (navigate) {
          if (committeeId) navigate(`/committee/${committeeId}`);
          else navigate('/');
        } else {
          if (committeeId) window.location.href = `/committee/${committeeId}`;
          else window.location.href = '/';
        }
      })
      .catch((err) => {
        setError(err.message || 'Failed to create committee');
      })
      .finally(() => setSubmitting(false));
  };

  return (
    <div className="create-committee-page">
      {/* Main content */}
      <div className="account-card">
        <h1 className="page-title">Create a Committee</h1>
        <div className="committee-details">
          {/* Committee Name Section */}
          <div className="name-committee">
            <span className="committee-name-label">Committee Name </span>
            <span className="req">*</span>
            <input
              className="committee-name-input"
              type="text"
              value={committeeName}
              onChange={(e) => setCommitteeName(e.target.value)}
              placeholder="Name your committee"
            />
          </div>

          {/* Committee Members Section */}
          {/* Should this be mandatory? 
                Committee creator should be added by default
                Add functionality to add new members later - probably not done here
          */}

          <div className="committee-members">
            <span className="committee-members-label">Committee Members</span>
            {/* <span className="req">*</span> */}
            <input
              className="member-search-input"
              type="text"
              value={searchTerm}
              onChange={(e) => {
                const v = e.target.value;
                setSearchTerm(v);
                if (!v || v.trim() === '') {
                  setSearchResults([]);
                } else {
                  const q = v.toLowerCase();
                  const results = mockUsers.filter(u =>
                    u.username.toLowerCase().includes(q) || u.name.toLowerCase().includes(q)
                  );
                  setSearchResults(results);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddMember();
                }
              }}
              placeholder="Search by username or email"
            />
            {/* Suggestions */}
            {searchResults && searchResults.length > 0 && (
              <ul className="search-suggestions">
                {searchResults.map((r, i) => (
                  <li
                    key={i}
                    className="suggestion-item"
                    onClick={() => {
                      setSearchTerm(r.username);
                      // add directly
                      const exists = committeeMembers.some(m => m.username.toLowerCase() === r.username.toLowerCase());
                      if (!exists) setCommitteeMembers(prev => [...prev, r]);
                      setSearchResults([]);
                    }}
                  >
                    <strong>{r.username}</strong> — <span>{r.name}</span>
                  </li>
                ))}
              </ul>
            )}
            
            {/* Members List */}
            <ul className="member-list">
              {committeeMembers.map((member, index) => (
                <li
                  className="member-item"
                  key={index}>
                  <p className="member-name"> {member.name} </p>
                  <p className="member-username"> {member.username} </p>
                </li>
              ))}
            </ul>
          </div>
        </div>
        
        {/* Create Committee Button */}
        <button
          className="submit-button"
          onClick={handleCreateCommittee}>
            Create Committee
        </button>
      </div>
    </div>
  );
}
