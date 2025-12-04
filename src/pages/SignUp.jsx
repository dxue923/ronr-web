import { useEffect } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth0 } from "@auth0/auth0-react";

export default function SignUp() {
  const { isAuthenticated, isLoading, loginWithRedirect } = useAuth0();
  const location = useLocation();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      const returnTo = location.state?.from?.pathname || "/create-committee";
      loginWithRedirect({
        authorizationParams: {
          screen_hint: "signup",
        },
        appState: { returnTo },
      });
    }
  }, [isLoading, isAuthenticated, loginWithRedirect, location.state]);

  // If already authenticated, go to create-committee
  if (!isLoading && isAuthenticated) {
    const target = location.state?.from?.pathname || "/create-committee";
    return <Navigate to={target} replace />;
  }

  return null;
}
