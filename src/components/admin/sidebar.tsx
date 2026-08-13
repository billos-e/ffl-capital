"use client";

import { useState } from "react";
import { clsx } from "clsx";
import { usePortal } from "@/components/layout/portal-provider";
import { useAdminProfile } from "@/hooks/use-admin-profile";
import { SidebarNavLink } from "@/components/ui/sidebar-nav-link";
import {
  SidebarCollapseButton,
  useSidebarEmptyAreaClick,
} from "@/components/ui/sidebar-toggle";
import dynamic from "next/dynamic";
const SidebarUserButton = dynamic(
  () => import("@/components/ui/sidebar-user-button").then((m) => m.SidebarUserButton),
  { ssr: false }
);
const ManageAccountModal = dynamic(
  () => import("@/components/partner/manage-account-modal").then((m) => m.ManageAccountModal),
  { ssr: false }
);
import {
  SquaresFour,
  Users,
  FileText,
  ArrowCounterClockwise,
  Archive,
  Gear,
  Wallet,
} from "@/lib/icons/client";
import type { Icon } from "@/lib/icons/client";
import type { SidebarNavAccent } from "@/components/ui/sidebar-nav-accent";

/** Flat nav aligned to Pencil mockup. */
const navItems: {
  href: string;
  label: string;
  icon: Icon;
  exact?: boolean;
  accent: SidebarNavAccent;
}[] = [
  { href: "/admin", label: "Dashboard", icon: SquaresFour, exact: true, accent: "brand" },
  { href: "/admin/partners", label: "Partners", icon: Users, accent: "rose" },
  { href: "/admin/leads", label: "Leads", icon: FileText, accent: "orange" },
  { href: "/admin/refunds", label: "Refunds", icon: ArrowCounterClockwise, accent: "orange" },
  { href: "/admin/transactions", label: "Transactions", icon: Wallet, accent: "mint" },
  { href: "/admin/aged", label: "Aged Leads", icon: Archive, accent: "mint" },
  { href: "/admin/settings", label: "Settings", icon: Gear, accent: "slate" },
];

export function AdminSidebar() {
  const { sidebarCollapsed } = usePortal();
  const handleEmptyAreaClick = useSidebarEmptyAreaClick();
  const [manageAccountOpen, setManageAccountOpen] = useState(false);

  // Profile from DB (admin_profiles table). Falls back to Clerk on first load.
  const { profile, patchProfile } = useAdminProfile();

  const displayName =
    profile
      ? `${profile.firstName} ${profile.lastName}`.trim()
      : undefined; // undefined → SidebarUserButton falls back to Clerk

  return (
    <aside
      onClick={handleEmptyAreaClick}
      aria-label="Click empty area to toggle sidebar"
      className={clsx(
        "flex h-screen flex-shrink-0 flex-col border-r border-sidebar-border bg-sidebar-bg transition-[width] duration-300 ease-out motion-reduce:transition-none",
        sidebarCollapsed ? "w-[72px]" : "w-60",
      )}
    >
      <div
        className={clsx(
          "flex h-16 items-center border-b border-sidebar-border",
          sidebarCollapsed ? "justify-center px-2" : "gap-2.5 px-4",
        )}
      >
        {/* Logo */}
        <div className="flex flex-shrink-0 items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-full bg-brand-700" />
          <span className="h-2.5 w-2.5 rounded-full bg-brand-100" />
        </div>

        {/* Title + collapse button */}
        <div
          className={clsx(
            "flex min-w-0 items-center overflow-hidden transition-all duration-300",
            sidebarCollapsed ? "w-0 opacity-0" : "w-auto flex-1 opacity-100",
          )}
        >
          <div className="min-w-0 flex-1 flex-col">
            <span className="truncate text-sm font-semibold leading-tight text-slate-800">
              Capital Lead Solutions
            </span>
            <span className="block text-[11px] font-medium leading-tight text-sidebar-heading">
              Admin Portal
            </span>
          </div>
          <SidebarCollapseButton />
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-4">
        <div className="space-y-0.5">
          {navItems.map((item) => (
            <SidebarNavLink
              key={item.href}
              href={item.href}
              label={item.label}
              icon={item.icon}
              exact={item.exact}
              accent={item.accent}
            />
          ))}
        </div>
      </nav>

      <div
        className={clsx(
          "border-t border-sidebar-border py-4",
          sidebarCollapsed ? "px-2" : "px-4",
        )}
      >
        <SidebarUserButton
          afterSignOutUrl="/admin/sign-in"
          displayName={displayName}
          avatarUrl={profile?.avatarUrl}
          onManageAccount={() => setManageAccountOpen(true)}
        />
      </div>

      <ManageAccountModal
        open={manageAccountOpen}
        onOpenChange={setManageAccountOpen}
        initialFirstName={profile?.firstName ?? ""}
        initialLastName={profile?.lastName ?? ""}
        initialAvatarUrl={profile?.avatarUrl ?? null}
        syncToDb={false}
        showAffiliation={false}
        onSaved={({ firstName, lastName, avatarUrl }) =>
          patchProfile({ firstName, lastName, avatarUrl: avatarUrl ?? null })
        }
      />
    </aside>
  );
}
