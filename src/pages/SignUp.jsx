import { useEffect } from "react";
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

  return null;
}
