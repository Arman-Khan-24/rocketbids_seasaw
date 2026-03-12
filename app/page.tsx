import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  const role =
    profile?.role === "admin" || profile?.role === "bidder"
      ? profile.role
      : user.user_metadata?.role === "admin"
        ? "admin"
        : "bidder";

  if (role === "admin") {
    redirect("/admin/dashboard");
  }

  redirect("/bidder/browse");
}
