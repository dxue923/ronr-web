import { useEffect } from "react";
import { Navigate } from "react-router-dom";
import { useAuth0 } from "@auth0/auth0-react";

export default function SignUp() {
  const { isAuthenticated, isLoading, loginWithRedirect } = useAuth0();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      loginWithRedirect({
        authorizationParams: {
          screen_hint: "signup",
        },
      });
    }
  }, [isLoading, isAuthenticated, loginWithRedirect]);

  // If already authenticated, go to create-committee
  if (!isLoading && isAuthenticated) {
    return <Navigate to="/create-committee" replace />;
  }

  return null;
}
