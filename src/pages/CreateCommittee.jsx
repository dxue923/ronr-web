import React, { useState } from "react";
import "../assets/styles/index.css";

function committeeNameForm() {
  const [nameInputValue, setNameInputValue] = useState("");
  const [nameSubmittedValue, setNameSubmittedValue] = useState("");

  // Event handler for input changes
  const handleChange = (event) => {
    setNameInputValue(event.target.value);
  };

  // Event handler for form submission
  const handleSubmit = (event) => {
    event.preventDefault();
    setNameSubmittedValue(inputValue); // Save the current input value to submittedValue
  };

  return (
    <form onSubmit={handleSubmit}>
      <label>
        Name your committee:
        <input type="text" value={nameInputValue} onChange={handleChange} />
      </label>
      <button type="submit">Submit</button>
    </form>
  );
}

export default function CreateCommittee() {
  return (
    <>
      <div id="committee-page">
        <h1 class="page-title">Create a Committee</h1>
        <div id="create-committees">
          <div id="committee-name">
            <h2>Committee Name</h2>
            committeeNameForm();{" "}
            {/* This is supposed to be the submission form */}
          </div>
          <div id="add-members">
            <h2>Committee Members</h2>
            {/* <input class="searchbar" type="text" name="committeemembers" placeholder="Search by username or email"> */}
            <button class="button" id="add-member">
              Add Member
            </button>
            <ul>
              {/* list of current members - dummy text, will be added as members are added to committee */}
              {/* <li id="member-1"></li>
                            <li id="member-2"></li>
                            <li id="member-3"></li>
                            <script src="committee.js"></script>
                            <script>
                                const memberLi1 = document.getElementById('member1');
                                memberLi1.innerHTML = `<p>${committeeMembers[0].name} (${committeeMembers[0].username})</p>`;   
                                
                                const memberLi2 = document.getElementById('member2');
                                memberLi2.innerHTML = `<p>${committeeMembers[1].name} (${committeeMembers[1].username})</p>`;  

                                const memberLi3 = document.getElementById('member3');
                                memberLi3.innerHTML = `<p>${committeeMembers[2].name} (${committeeMembers[2].username})</p>`;  
                            </script>  */}
            </ul>
          </div>
          {/* <button class="button" id="addmember">Create Committee</button> */}
          {/* <a href="chat.jsx" class="button">Create Committee</a> */}
        </div>
      </div>
    </>
  );
}
