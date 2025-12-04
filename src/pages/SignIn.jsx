import { useEffect } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth0 } from "@auth0/auth0-react";

export default function SignIn() {
  const { isAuthenticated, isLoading, loginWithRedirect } = useAuth0();
  const location = useLocation();

  useEffect(() => {
    // If the user is not authenticated, trigger the Auth0 redirect to sign in.
    if (!isLoading && !isAuthenticated) {
      const returnTo = location.state?.from?.pathname || "/create-committee";
      loginWithRedirect({
        appState: { returnTo },
        authorizationParams: {
          prompt: "login",
        },
      });
    }
  }, [isLoading, isAuthenticated, loginWithRedirect, location.state]);

  // If already authenticated and not loading, go to the create-committee page.
  if (!isLoading && isAuthenticated) {
    const target = location.state?.from?.pathname || "/create-committee";
    return <Navigate to={target} replace />;
  }

  // While loading or when redirecting, render nothing.
  return null;
}
