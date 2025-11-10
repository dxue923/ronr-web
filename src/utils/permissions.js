export const ROLE = {
  OWNER: "owner",
  CHAIR: "chair",
  MEMBER: "member",
  OBSERVER: "observer",
};

export const Can = {
  assignRoles(myRole, targetRole) {
    if (myRole === ROLE.OWNER) return true;
    if (myRole === ROLE.CHAIR) return targetRole !== ROLE.OWNER;
    return false;
  },

  // for now owner has chair perms too
  createMotion(r) {
    return r === ROLE.CHAIR || r === ROLE.OWNER;
  },
  startDiscussion(r) {
    return r === ROLE.CHAIR || r === ROLE.OWNER;
  },
  moveToVote(r) {
    return r === ROLE.CHAIR || r === ROLE.OWNER;
  },

  comment(r) {
    return r === ROLE.MEMBER || r === ROLE.CHAIR || r === ROLE.OWNER;
  },
};
