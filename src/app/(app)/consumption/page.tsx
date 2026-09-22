import { redirect } from "next/navigation";

/** The section opens on the shelf that fills first. */
export default function ConsumptionPage() {
  redirect("/consumption/books");
}
