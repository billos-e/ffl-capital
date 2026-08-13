import { SignIn } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import { Shield } from "@/lib/icons/ssr";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthLeftPanel } from "@/components/auth/auth-left-panel";
import { adminClerkAppearance } from "@/lib/auth/auth-clerk-appearance";
import { AUTH_CONTINUE_ADMIN } from "@/lib/auth/portal";
import { getAdminPostAuthRedirectPath } from "@/lib/auth/redirect";

export default async function AdminSignInPage() {
  const { userId } = await auth();
  if (userId) {
    const path = await getAdminPostAuthRedirectPath();
    redirect(path ?? "/admin/access-denied");
  }

  return (
    <div className="flex min-h-screen">
      <AuthLeftPanel subtitle="Admin Portal">
        <h1 className="text-4xl font-bold leading-tight">
          Platform
          <br />
          <span className="text-brand-400">operations center.</span>
        </h1>
        <p className="mt-4 max-w-sm text-brand-200 leading-relaxed">
          Manage partners, leads, refunds, and platform settings. Staff access only — not for partner agents.
        </p>

        <div className="mt-10 space-y-4">
          {[
            "Partner approval and configuration",
            "Lead matching and reprocessing",
            "Refund review and wallet oversight",
            "Integrity and migration tools",
          ].map((item) => (
            <div key={item} className="flex items-center gap-3 text-sm">
              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-700 text-[10px] font-bold">
                ✓
              </div>
              <span className="text-slate-300">{item}</span>
            </div>
          ))}
        </div>
      </AuthLeftPanel>

      <div className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 text-center lg:hidden">
            <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-brand-700">
              <Shield size={20} className="text-white" />
            </div>
            <p className="text-sm font-bold text-slate-900">Capital Lead Solutions Admin</p>
          </div>

          <h2 className="mb-2 text-2xl font-bold text-slate-900">Admin sign in</h2>
          <p className="mb-6 text-sm text-slate-500">
            Partner agent?{" "}
            <Link href="/sign-in" className="font-medium text-brand-600 hover:underline">
              Use the partner portal
            </Link>
          </p>

          <SignIn
            forceRedirectUrl={AUTH_CONTINUE_ADMIN}
            appearance={adminClerkAppearance}
          />
        </div>
      </div>
    </div>
  );
}
