import { redirect } from "next/navigation";

// Force dynamic rendering to avoid build-time database access
export const dynamic = 'force-dynamic';

export default async function Home() {
  redirect('/sitecore-xmc');
}
