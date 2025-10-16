import { useState } from "react";
import { EditProfilePageData } from "../data/pageData";

export default function EditProfile() {
  const [data, setData] = useState(EditProfilePageData);

  return <h1>Edit Profile</h1>;
}
