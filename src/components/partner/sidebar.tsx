"use client";

import { useState } from "react";
import { clsx } from "clsx";
import { usePortal } from "@/components/layout/portal-provider";
import { usePartner } from "@/components/partner/partner-provider";
import { isPartnerActive } from "@/lib/partner/active";
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
  FileText,
  Wallet,
  ShoppingBag,
  Gear,
  Phone,
  ChartBar,
} from "@/lib/icons/client";
import type { Icon } from "@/lib/icons/client";
import type { SidebarNavAccent } from "@/components/ui/sidebar-nav-accent";

const navItems: {
  href: string;
  label: string;
  icon: Icon;
  exact?: boolean;
  accent: SidebarNavAccent;
}[] = [
  { href: "/partner", label: "Dashboard", icon: SquaresFour, exact: true, accent: "brand" },
  { href: "/partner/leads", label: "My Leads", icon: FileText, accent: "orange" },
  { href: "/partner/aged", label: "Aged Marketplace", icon: ShoppingBag, accent: "mint" },
  { href: "/partner/wallet", label: "Wallet", icon: Wallet, accent: "red" },
  { href: "/partner/reports", label: "Reports", icon: ChartBar, accent: "violet" },
  { href: "/partner/settings", label: "Settings", icon: Gear, accent: "amber" },
  { href: "/partner/contact", label: "Contact Us", icon: Phone, accent: "cyan" },
];

export function PartnerSidebar() {
  const { partner, patchPartner } = usePartner();
  const { sidebarCollapsed } = usePortal();
  const handleEmptyAreaClick = useSidebarEmptyAreaClick();
  const partnerName = `${partner.firstName} ${partner.lastName}`;
  const isActiveBuyer = isPartnerActive(partner);
  const [manageAccountOpen, setManageAccountOpen] = useState(false);

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
        <div className="flex flex-shrink-0 items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-full bg-brand-700" />
          <span className="h-2.5 w-2.5 rounded-full bg-brand-100" />
        </div>

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
              Partner Portal
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
          displayName={partnerName}
          avatarUrl={partner.avatarUrl}
          isActive={isActiveBuyer}
          onManageAccount={() => setManageAccountOpen(true)}
        />
      </div>

      <ManageAccountModal
        open={manageAccountOpen}
        onOpenChange={setManageAccountOpen}
        initialFirstName={partner.firstName}
        initialLastName={partner.lastName}
        initialAvatarUrl={partner.avatarUrl}
        initialAffiliation={partner.affiliation ?? ""}
        onSaved={({ firstName, lastName, avatarUrl, affiliation }) =>
          patchPartner({
            firstName,
            lastName,
            avatarUrl: avatarUrl ?? null,
            ...(affiliation !== undefined && { affiliation }),
          })
        }
      />
    </aside>
  );
}
