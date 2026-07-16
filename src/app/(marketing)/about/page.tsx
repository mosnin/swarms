import { redirect } from "next/navigation";

/** The about page grew into /company; keep the old URL working forever. */
export default function AboutPage() {
  redirect("/company");
}
