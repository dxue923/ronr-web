import React, { useState } from "react";
import "../assets/styles/index.css";
import { CreateCommitteePageData } from "../data/pageData";

export default function CreateCommittee() {
  const [committeeName, setCommitteeName] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  // Placeholder committee members
  const [committeeMembers, setCommitteeMembers] = useState([
    { name: 'Member One', username: 'member1' },
    { name: 'Member Two', username: 'member_2' },
    { name: 'Member Three', username: 'member.3' }
  ]);

  const handleAddMember = () => {
    /*
      Needs some form of search functionality to find users by username/email
      Members are added to the list by pressing enter or clicking their name when it pops up
      No need for special "add-member" button
    */
  };

  const handleCreateCommittee = () => {
    /* 
      Handle case where committeeName is empty
      Handle case where no members are added
      Navigate to discussion page upon successful creation
      Create empty discussion board for new committee
    */
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
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by username or email"
            />
            
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
