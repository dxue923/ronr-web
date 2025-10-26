import { useEffect } from "react";
import { useAuth0 } from "@auth0/auth0-react";
// import "../assets/styles/index.css";

export default function SignIn() {
  const { isAuthenticated, isLoading, loginWithRedirect } = useAuth0();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      loginWithRedirect();
    }
  }, [isLoading, isAuthenticated, loginWithRedirect]);

  return null;
}