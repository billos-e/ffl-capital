import { UserButton } from "@clerk/nextjs";
import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { getCurrentPartner } from "@/lib/auth/session";
import { getRoleFromMetadata } from "@/lib/auth/roles";
import { Lightning } from "@/lib/icons/ssr";
import { AuthContinueRedirect } from "@/app/auth/continue/redirect";
import { getLeadFilterCriteriaOptions } from "@/lib/filter-sets/criteria-options";
import { loadEnabledCategoryLabels } from "@/lib/lead-categories/category-labels";
import { OnboardingWizardLoader } from "./onboarding-wizard-loader";

export default async function OnboardingPage() {
  const user = await currentUser();
  const role = getRoleFromMetadata(user?.publicMetadata as Record<string, unknown>);
  if (role === "admin") redirect("/admin");

  const [partner, criteriaOptions, categories] = await Promise.all([
    getCurrentPartner(),
    getLeadFilterCriteriaOptions(),
    loadEnabledCategoryLabels(),
  ]);
  // Use client-side redirect to avoid throwing NEXT_REDIRECT in the RSC layer,
  // which triggers the dev-mode error overlay (non-issue in production but
  // confusing during development).
  if (partner) return <AuthContinueRedirect to="/partner" />;
  const fullName = user?.fullName?.trim() ?? "";
  const [fallbackFirst = "", ...fallbackRest] = fullName ? fullName.split(/\s+/) : [];
  const initialProfile = {
    firstName: user?.firstName ?? fallbackFirst,
    lastName: user?.lastName ?? fallbackRest.join(" "),
    email: user?.emailAddresses[0]?.emailAddress ?? "",
  };

  return (
    <div className="min-h-screen">
      {/* Top bar */}
      <header className="flex h-14 items-center justify-between border-b border-slate-200 bg-white px-8">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-700">
            <Lightning size={14} className="text-white" />
          </div>
          <span className="text-sm font-bold text-brand-800">Capital Lead Solutions</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-500">Signed in</span>
          <UserButton />
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10">
        <OnboardingWizardLoader
          initialProfile={initialProfile}
          criteriaOptions={criteriaOptions}
          categories={categories}
        />
      </div>
    </div>
  );
}
