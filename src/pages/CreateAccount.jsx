import { useState } from "react";
import { CreateCommitteePageData } from "../data/pageData";

export default function CreateCommittee() {
  const [data, setData] = useState(CreateCommitteePageData);

  return (
    <div>
      <h1>Create Account Page</h1>
    </div>
  );
}
