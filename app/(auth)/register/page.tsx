"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { Rocket, UserPlus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

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

  return "Unable to register right now.";
}

export default function RegisterPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"bidder" | "admin">("bidder");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);

    try {
      const { data: signUpData, error: authError } = await supabase.auth.signUp(
        {
          email,
          password,
          options: {
            data: {
              full_name: fullName,
              role,
            },
          },
        },
      );

      if (authError) {
        throw authError;
      }

      if (signUpData.user) {
        const { error: profileError } = await supabase.from("profiles").upsert(
          {
            id: signUpData.user.id,
            full_name: fullName,
            role,
          },
          { onConflict: "id" },
        );

        if (profileError) {
          console.warn(
            "Unable to create profile during registration. Continuing.",
            profileError,
          );
        }
      }

      if (!signUpData.session) {
        setSuccess(
          "Registration successful. Please verify your email, then sign in.",
        );
        return;
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
          <p className="text-sm text-rocket-muted">Create your account</p>
        </div>

        <form onSubmit={handleRegister} className="space-y-4">
          <Input
            label="Full Name"
            type="text"
            placeholder="Jane Doe"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
          />
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
            minLength={6}
          />

          <div className="space-y-1.5">
            <label className="block text-sm text-rocket-muted">Role</label>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setRole("bidder")}
                className={`flex-1 rounded-lg border px-4 py-2.5 text-sm transition-colors ${
                  role === "bidder"
                    ? "border-rocket-gold bg-rocket-gold/10 text-rocket-gold font-medium"
                    : "border-rocket-border bg-rocket-card text-rocket-muted hover:text-rocket-text"
                }`}
              >
                Bidder
              </button>
              <button
                type="button"
                onClick={() => setRole("admin")}
                className={`flex-1 rounded-lg border px-4 py-2.5 text-sm transition-colors ${
                  role === "admin"
                    ? "border-rocket-gold bg-rocket-gold/10 text-rocket-gold font-medium"
                    : "border-rocket-border bg-rocket-card text-rocket-muted hover:text-rocket-text"
                }`}
              >
                Admin
              </button>
            </div>
          </div>

          {error && <p className="text-sm text-rocket-danger">{error}</p>}
          {success && <p className="text-sm text-rocket-teal">{success}</p>}

          <Button type="submit" disabled={loading} className="w-full" size="lg">
            <UserPlus size={16} className="mr-2" />
            {loading ? "Creating account..." : "Create Account"}
          </Button>
        </form>

        <p className="text-center text-sm text-rocket-muted">
          Already have an account?{" "}
          <Link
            href="/login"
            className="text-rocket-gold hover:underline font-medium"
          >
            Sign in
          </Link>
        </p>
      </motion.div>
    </div>
  );
}
