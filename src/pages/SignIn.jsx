import { useEffect } from "react";
import { Navigate } from "react-router-dom";
import { useAuth0 } from "@auth0/auth0-react";

export default function SignIn() {
  const { isAuthenticated, isLoading, loginWithRedirect } = useAuth0();

  useEffect(() => {
    // If the user is not authenticated, trigger the Auth0 redirect to sign in.
    if (!isLoading && !isAuthenticated) {
      loginWithRedirect();
    }
  }, [isLoading, isAuthenticated, loginWithRedirect]);

  // If already authenticated and not loading, go to the create-committee page.
  if (!isLoading && isAuthenticated) {
    return <Navigate to="/create-committee" replace />;
  }

  // While loading or when redirecting, render nothing.
  return null;
}
