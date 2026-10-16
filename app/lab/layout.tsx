import { notFound } from "next/navigation";

/** Design sandboxes: dev only. 404 in production. */
export default function LabLayout({ children }: { children: React.ReactNode }) {
  if (process.env.NODE_ENV === "production") notFound();
  return <>{children}</>;
}
