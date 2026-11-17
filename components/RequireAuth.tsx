"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";

export function RequireAuth({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login/");
    }
  }, [loading, user, router]);

  if (loading || !user) {
    return (
      <main className="page">
        <div className="container">Carregando...</div>
      </main>
    );
  }

  return children;
}
