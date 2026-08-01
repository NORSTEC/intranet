"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function GoogleSignInButton() {
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function signIn() {
    setIsLoading(true);
    setErrorMessage(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: new URL("/auth/callback", window.location.origin).toString(),
        queryParams: { prompt: "select_account" },
      },
    });

    if (error) {
      setErrorMessage("Google sign-in could not be started. Please try again.");
      setIsLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={signIn}
        disabled={isLoading}
        className="mt-8 flex min-h-12 w-full cursor-pointer items-center justify-center gap-3 rounded-full border-2 border-moody bg-moody px-5 font-medium text-egg transition-colors hover:bg-transparent hover:text-moody disabled:cursor-wait disabled:opacity-60 lg:border-[#0f1118] lg:bg-[#0f1118] lg:text-[#EDE8DA] lg:hover:text-[#0f1118]"
      >
        {isLoading ? "Redirecting…" : "Continue with Google"}
        <span className="material-symbols-outlined">arrow_right_alt</span>
      </button>
      {errorMessage && (
        <p className="mt-3 text-sm text-[#a33b2b]" role="alert">
          {errorMessage}
        </p>
      )}
    </>
  );
}
