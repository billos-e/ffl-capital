import { SignIn } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import { Lightning } from "@/lib/icons/ssr";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthLeftPanel } from "@/components/auth/auth-left-panel";
import { authClerkAppearance } from "@/lib/auth/auth-clerk-appearance";
import { getPartnerPostAuthRedirectPath } from "@/lib/auth/redirect";
import { AUTH_CONTINUE_PARTNER } from "@/lib/auth/portal";

export default async function SignInPage() {
  const { userId } = await auth();
  if (userId) redirect(await getPartnerPostAuthRedirectPath());
  return (
    <div className="flex min-h-screen">
      <AuthLeftPanel subtitle="Lead Distribution Platform">
        <h1 className="text-4xl font-bold leading-tight">
          Distribute leads
          <br />
          <span className="text-brand-400">faster and smarter.</span>
        </h1>
        <p className="mt-4 max-w-sm text-brand-200 leading-relaxed">
          Real-time matching, aged lead marketplace, and a modern portal for every partner — all in one platform.
        </p>

        <div className="mt-10 space-y-4">
          {[
            "~500 IUL leads distributed daily",
            "Automatic state + priority matching",
            "Self-service aged leads from $5",
            "TrustedForm compliance on every lead",
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
            <Link href="/" className="inline-block transition-opacity hover:opacity-80">
              <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-brand-700">
                <Lightning size={20} className="text-white" />
              </div>
              <p className="text-sm font-bold text-slate-900">Capital Lead Solutions</p>
            </Link>
          </div>

          <h2 className="mb-2 text-2xl font-bold text-slate-900">Partner sign in</h2>
          <div className="mb-6 space-y-1 text-sm text-slate-500">
            <p>Sign in to access your partner portal.</p>
            <p>
              <Link href="/admin/sign-in" className="font-medium text-brand-600 hover:underline">
                Admin? Sign in here
              </Link>
            </p>
          </div>

          <SignIn forceRedirectUrl={AUTH_CONTINUE_PARTNER} appearance={authClerkAppearance} />
        </div>
      </div>
    </div>
  );
}
