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
  // Search data
  dashboard: {
    committees: [],
    search: "",
    loading: false,
  },

  // Creation data
  createCommittee: {
    name: "",
    members: [],
    submitting: false,
    error: null,
  },
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
