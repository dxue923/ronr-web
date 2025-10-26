import { useAuth0 } from "@auth0/auth0-react";

export default function SignOutButton() {
  const { logout } = useAuth0();

  return (
    <button
      className="btn"
      onClick={() =>
        logout({
          logoutParams: { returnTo: window.location.origin },
        })
      }
    >
      Sign out
    </button>
  );
}