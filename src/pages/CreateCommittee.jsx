import { useState } from 'react';
import "../assets/styles/index.css";
// import { CreateCommitteePageData } from "../data/pageData";

export default function CreateCommittee() {
  const [committeeName, setCommitteeName] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [committeeMembers, setCommitteeMembers] = useState([
    { name: 'John Doe', username: 'johndoe' },
    { name: 'Jane Smith', username: 'janesmith' },
    { name: 'Bob Johnson', username: 'bobjohnson' }
  ]);

  const handleSaveName = () => {
    if (committeeName.trim()) {
      alert(`Committee name saved: ${committeeName}`);
    }
  };

  const handleAddMember = () => {
    if (searchTerm.trim()) {
      // This is where you'd implement actual member search/add logic
      alert(`Searching for: ${searchTerm}`);
      setSearchTerm('');
    }
  };

  const handleCreateCommittee = () => {
    // This would navigate to the discussion page
    alert('Committee created!');
  };

  return (
    <div>
      {/* Main content */}
      <div className="main-content">
        <h1>Create a Committee</h1>
        <div className="committee-details">
          {/* Committee Name Section */}
          <div className="name-committee">
            <h2>Committee Name</h2>
            <input
              className="committee-name-input"
              type="text"
              value={committeeName}
              onChange={(e) => setCommitteeName(e.target.value)}
              placeholder="Name your committee"
            />
            <button 
              className="submit-button"
              onClick={handleSaveName}>
                Save Name
            </button>
          </div>

          {/* Committee Members Section */}
          <div className="committee-members">
            <h2>Committee Members</h2>
            <input
              className="member-search-input"
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by username or email"
            />
            <button 
              className="submit-button"
              onClick={handleAddMember}>
                Add Member
            </button>
            
            {/* Members List */}
            <ul className="member-list">
              {committeeMembers.map((member, index) => (
                <li
                  className="member-item"
                  key={index}>
                  <p>
                    {member.name} ({member.username})
                  </p>
                </li>
              ))}
            </ul>
          </div>

          {/* Create Committee Button */}
          <button
            className="submit-button"
            onClick={handleCreateCommittee}>
              Create Committee
          </button>
        </div>
      </div>
    </div>
  );
}