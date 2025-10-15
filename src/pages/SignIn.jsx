import { useState } from "react";
import { SignInPageData } from "../data/pageData";

export default function SignIn() {
  const [data, setData] = useState(SignInPageData);

  return (
    <div>
      <h1>Sign In Page</h1>
    </div>
  );
}
