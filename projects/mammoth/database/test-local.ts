import { createUser } from "./index.ts";

if (import.meta.main) {
  const user = await createUser("John Doe", "john.doe@example.com");
  console.log(user);
}