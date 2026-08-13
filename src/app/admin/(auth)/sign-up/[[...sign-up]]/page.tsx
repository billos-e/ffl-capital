import { SignUp } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import { Shield } from "@/lib/icons/ssr";
import { redirect } from "next/navigation";
import { AuthLeftPanel } from "@/components/auth/auth-left-panel";
import { adminClerkAppearance } from "@/lib/auth/auth-clerk-appearance";
import { AUTH_CONTINUE_ADMIN } from "@/lib/auth/portal";
import { getAdminPostAuthRedirectPath } from "@/lib/auth/redirect";

/**
 * Admin invitation acceptance page.
 *
 * Admins are never self-serve — this page only exists so an invitation
 * link (which carries a Clerk ticket) can land somewhere that renders the
 * "create your account" form instead of a plain sign-in form. There is no
 * link to this page anywhere in the UI.
 */
export default async function AdminSignUpPage() {
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
      </AuthLeftPanel>

      <div className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 text-center lg:hidden">
            <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-brand-700">
              <Shield size={20} className="text-white" />
            </div>
            <p className="text-sm font-bold text-slate-900">Capital Lead Solutions Admin</p>
          </div>

          <h2 className="mb-2 text-2xl font-bold text-slate-900">
            Create your admin account
          </h2>
          <p className="mb-6 text-sm text-slate-500">
            You&apos;ve been invited to join as an administrator. Set a password to finish setting up your account.
          </p>

          <SignUp
            routing="path"
            path="/admin/sign-up"
            signInUrl="/admin/sign-in"
            forceRedirectUrl={AUTH_CONTINUE_ADMIN}
            appearance={adminClerkAppearance}
          />
        </div>
      </div>
    </div>
  );
}
