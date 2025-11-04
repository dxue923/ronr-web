// Sign in page
export const SignInPageData = {
  email: "",
  password: "",
  loading: false,
  error: null,
};

// Create account page
export const CreateAccountPageData = {
  name: "",
  email: "",
  password: "",
  avatarUrl: "",
  submitting: false,
  error: null,
};

// Edit profile page
export const EditProfilePageData = {
  name: "",
  avatarUrl: "",
  saving: false,
  message: "",
};

// Create committee page
export const CreateCommitteePageData = {
  committees: [
    {
      id: "committee-1",
      name: "General Committee",
      description: "Handles administrative motions and budget approvals.",
      members: [
        { id: "u1", name: "Chairman 1", role: "chair" },
        { id: "u2", name: "Member 1", role: "member" },
        { id: "u3", name: "Member 2", role: "member" },
      ],
      motions: [
        {
          id: "motion-1",
          title: "Motion 1: Budget Approval",
          description: "Approve the new annual budget.",
          discussion: [
            {
              id: "msg-1",
              author: "Member 1",
              text: "I support this motion.",
              createdAt: "2025-11-02T18:00:00Z",
            },
            {
              id: "msg-2",
              author: "Member 2",
              text: "I think we need more discussion.",
              createdAt: "2025-11-02T18:01:00Z",
            },
          ],
          createdAt: "2025-11-02T17:59:00Z",
        },
        {
          id: "motion-2",
          title: "Motion 2: New Policy Proposal",
          description: "Introduce attendance tracking.",
          discussion: [],
          createdAt: "2025-11-02T18:05:00Z",
        },
      ],
      createdAt: "2025-11-02T17:55:00Z",
    },
  ],
  activeCommitteeId: "committee-1",
};

// Chat page
export const ChatPageData = {
  // Committee data
  committeePage: {
    committee: null,
    motions: [
      { name: "Motion 1: Budget Approval", discussion: [], active: true },
      { name: "Motion 2: New Policy Proposal", discussion: [], active: false },
      { name: "Motion 3: Event Planning", discussion: [], active: false },
    ],
    discussion: [],
    votes: [],
    activeTab: "motions",
    loading: false,
  },

  // Meeting data
  chairPanel: {
    committee: null,
    settings: {
      mode: "offline",
      minSpeakersBeforeVote: 0,
    },
    queue: [],
    controllingMotionId: null,
    loading: false,
  },

  // Messages data
  chatPage: {
    messages: [],
    input: "",
    sending: false,
  },
};
