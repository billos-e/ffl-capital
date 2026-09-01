import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { Lightning, Shield, TrendUp, Users, ArrowRight, CheckCircle } from "@/lib/icons/ssr";
import { getPostAuthRedirectPath } from "@/lib/auth/redirect";

export default async function HomePage() {
  const { userId } = await auth();
  if (userId) redirect(await getPostAuthRedirectPath());
  return (
    <div className="min-h-screen bg-white">
      {/* Nav */}
      <nav className="flex h-16 items-center justify-between border-b border-slate-100 px-8">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-700">
            <Lightning size={16} className="text-white" />
          </div>
          <span className="text-sm font-bold text-slate-900">Capital Lead Solutions</span>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/sign-in"
            className="text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
          >
            Sign In
          </Link>
          <Link href="/sign-up" className="btn-primary btn-sm">
            Get Started
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="mx-auto max-w-5xl px-8 py-20 text-center">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-brand-50 px-4 py-1.5 text-xs font-semibold text-brand-700">
          <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
          Internal Lead Distribution Platform
        </div>
        <h1 className="text-5xl font-extrabold tracking-tight text-slate-900 leading-tight">
          IUL Lead Distribution,
          <br />
          <span className="text-brand-700">Built to Scale</span>
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-lg text-slate-500">
          Automatically route ~500 daily Meta leads to your agents based on state, priority, and wallet balance. Plus a self-service aged leads marketplace.
        </p>
        <div className="mt-8 flex items-center justify-center gap-4">
          <Link href="/sign-up" className="btn-primary">
            Partner Sign-Up
            <ArrowRight size={16} />
          </Link>
          <Link href="/sign-in" className="btn-secondary">
            Partner Sign In
          </Link>
          <Link href="/admin/sign-in" className="btn-ghost text-sm font-medium text-slate-600">
            Admin Login
          </Link>
        </div>
      </section>

      {/* Features */}
      <section className="border-t border-slate-100 bg-slate-50 py-16">
        <div className="mx-auto max-w-5xl px-8">
          <h2 className="mb-10 text-center text-2xl font-bold text-slate-900">
            Everything you need to distribute leads efficiently
          </h2>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                icon: Lightning,
                color: "bg-brand-50 text-brand-600",
                title: "Real-Time Matching",
                desc: "Leads matched instantly to the highest-priority eligible agent — state, wallet, priority all considered.",
              },
              {
                icon: TrendUp,
                color: "bg-emerald-50 text-emerald-600",
                title: "Aged Lead Marketplace",
                desc: "Self-service marketplace for leads 30+ days old at just $5 each. No admin required.",
              },
              {
                icon: Shield,
                color: "bg-violet-50 text-violet-600",
                title: "TrustedForm Compliance",
                desc: "Every lead carries a TrustedForm certificate for legal proof of consent.",
              },
              {
                icon: Users,
                color: "bg-sky-50 text-sky-600",
                title: "Partner Self-Service",
                desc: "Partners manage their own target states, wallet, and CRM webhook — no admin overhead.",
              },
              {
                icon: CheckCircle,
                color: "bg-amber-50 text-amber-600",
                title: "Refund Workflow",
                desc: "In-app refund requests for out of service phone numbers only. Partners are given a 15% refund rate each Realtime order for out of service numbers. ",
              },
            ].map((f) => (
              <div key={f.title} className="card p-5">
                <div className={`mb-3 inline-flex rounded-xl p-2.5 ${f.color}`}>
                  <f.icon size={20} />
                </div>
                <h3 className="font-semibold text-slate-900">{f.title}</h3>
                <p className="mt-1 text-sm text-slate-500 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 text-center">
        <div className="mx-auto max-w-xl px-8">
          <h2 className="text-2xl font-bold text-slate-900">Ready to start buying leads?</h2>
          <p className="mt-3 text-slate-500">
            Create a partner account, complete onboarding, and fund your wallet to receive IUL leads automatically.
          </p>
          <Link href="/sign-up" className="btn-primary mt-6 inline-flex">
            Create Partner Account
            <ArrowRight size={16} />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-100 py-6 text-center text-xs text-slate-400">
        © 2026 Capital Lead Solutions · Internal Platform · Powered by TECHMA
      </footer>
    </div>
  );
}
