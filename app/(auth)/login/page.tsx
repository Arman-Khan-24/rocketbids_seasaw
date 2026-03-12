"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { Rocket, LogIn } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import type { User } from "@supabase/supabase-js";

type UserRole = "admin" | "bidder";

function resolveRole(value: unknown): UserRole {
  return value === "admin" ? "admin" : "bidder";
}

function resolveErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof (error as { message: unknown }).message === "string"
  ) {
    return (error as { message: string }).message;
  }

  return "Unable to sign in.";
}

export default function LoginPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const applyDailyLoginBonus = useCallback(async () => {
    try {
      await fetch("/api/mining/daily-login", { method: "POST" });
    } catch (bonusError) {
      // Non-critical: login should still proceed even if bonus call fails.
      console.warn("Daily login bonus call failed", bonusError);
    }
  }, []);

  const getOrCreateProfileRole = useCallback(
    async (user: User) => {
      const fallbackRole = resolveRole(user.user_metadata?.role);
      const fallbackName =
        user.user_metadata?.full_name || user.email?.split("@")[0] || "User";

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();

      if (profileError) {
        console.warn(
          "Unable to read profile role. Falling back to auth metadata.",
          profileError,
        );
        return fallbackRole;
      }

      if (profile?.role === "admin" || profile?.role === "bidder") {
        return profile.role;
      }

      const { error: insertError } = await supabase.from("profiles").upsert(
        {
          id: user.id,
          full_name: fallbackName,
          role: fallbackRole,
        },
        { onConflict: "id" },
      );

      if (insertError) {
        console.warn(
          "Unable to create profile row. Continuing with metadata role.",
          insertError,
        );
      }

      return fallbackRole;
    },
    [supabase],
  );

  useEffect(() => {
    let active = true;

    async function redirectIfAlreadySignedIn() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!active || !user) {
        return;
      }

      try {
        const role = await getOrCreateProfileRole(user);
        router.replace(
          role === "admin" ? "/admin/dashboard" : "/bidder/browse",
        );
        router.refresh();
      } catch (e) {
        console.error(e);
      }
    }

    void redirectIfAlreadySignedIn();

    return () => {
      active = false;
    };
  }, [getOrCreateProfileRole, router, supabase]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const { error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        throw authError;
      }

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) {
        throw userError;
      }

      if (!user) {
        throw new Error("Unable to resolve signed-in user.");
      }

      const role = await getOrCreateProfileRole(user);

      if (role === "bidder") {
        await applyDailyLoginBonus();
      }

      router.replace(role === "admin" ? "/admin/dashboard" : "/bidder/browse");
      router.refresh();
    } catch (e) {
      setError(resolveErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm space-y-6"
      >
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-2">
            <Rocket className="h-8 w-8 text-rocket-gold" />
            <h1 className="font-display text-3xl font-bold text-rocket-text">
              RocketBids
            </h1>
          </div>
          <p className="text-sm text-rocket-muted">Sign in to your account</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <Input
            label="Email"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <Input
            label="Password"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          {error && <p className="text-sm text-rocket-danger">{error}</p>}

          <Button type="submit" disabled={loading} className="w-full" size="lg">
            <LogIn size={16} className="mr-2" />
            {loading ? "Signing in..." : "Sign In"}
          </Button>
        </form>

        <p className="text-center text-sm text-rocket-muted">
          Don&apos;t have an account?{" "}
          <Link
            href="/register"
            className="text-rocket-gold hover:underline font-medium"
          >
            Register
          </Link>
        </p>
      </motion.div>
    </div>
  );
}
