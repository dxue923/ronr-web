import React from "react";
import { useLocation, Navigate } from "react-router-dom";
import { useAuth0 } from "@auth0/auth0-react";

// Small wrapper to protect routes that require authentication.
// If the Auth0 SDK is still loading, render nothing (could show a spinner).
// If the user is not authenticated, navigate to /signin which starts
// the Auth0 login flow (SignIn page triggers loginWithRedirect).
export default function RequireAuth({ children }) {
  const { isAuthenticated, isLoading } = useAuth0();
  const location = useLocation();

  if (isLoading) return null;

  if (isAuthenticated) return children;

  return <Navigate to="/signin" state={{ from: location }} replace />;
}
