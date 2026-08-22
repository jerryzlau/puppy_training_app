import { redirect } from "next/navigation";

/** The report card now lives inside School — keep old links working. */
export default function ProgressRedirect() {
  redirect("/school");
}
