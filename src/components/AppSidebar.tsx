import { useEffect, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  Home,
  Building2,
  Stethoscope,
  CalendarDays,
  CalendarRange,
  Users,
  Headphones,
  LayoutDashboard,
  BookOpen,
  UserCircle2,
  Settings,
  LogOut,
  ChevronRight,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar";
import { useApp } from "@/lib/i18n";
import logoLight from "@/assets/primewave-light.png";
import logoDark from "@/assets/primewave-dark.png";

export function AppSidebar() {
  const { t, theme, logout, lang } = useApp();
  const path = useRouterState({ select: (s) => s.location.pathname });

  type LeafItem = {
    kind: "leaf";
    key: string;
    title: string;
    url: string;
    icon: typeof Home;
  };
  type GroupItem = {
    kind: "group";
    key: string;
    title: string;
    icon: typeof Home;
    /** Sub-item paths share the same parent so we auto-open the group when
     * the current pathname starts with this. */
    matchPrefix: string;
    children: LeafItem[];
  };
  type Item = LeafItem | GroupItem;

  const items: Item[] = [
    { kind: "leaf", key: "home",         title: t("home"),         url: "/dashboard",    icon: Home },
    { kind: "leaf", key: "clinics",      title: t("clinics"),      url: "/clinics",      icon: Building2 },
    { kind: "leaf", key: "providers",    title: t("providers"),    url: "/providers",    icon: Stethoscope },
    { kind: "leaf", key: "appointments", title: t("appointments"), url: "/appointments", icon: CalendarDays },
    { kind: "leaf", key: "calendar",     title: t("calendar"),     url: "/calendar",     icon: CalendarRange },
    { kind: "leaf", key: "patients",     title: t("patients"),     url: "/patients",     icon: Users },
    {
      kind: "group",
      key: "callCenter",
      title: t("callCenter"),
      icon: Headphones,
      matchPrefix: "/call-center",
      children: [
        { kind: "leaf", key: "ccDashboard",   title: t("dashboard"),     url: "/call-center/dashboard",      icon: LayoutDashboard },
        { kind: "leaf", key: "knowledgeBase", title: t("knowledgeBase"), url: "/call-center/knowledge-base", icon: BookOpen },
        { kind: "leaf", key: "persona",       title: t("persona"),       url: "/call-center/persona",        icon: UserCircle2 },
      ],
    },
    { kind: "leaf", key: "settings", title: t("settings"), url: "/settings", icon: Settings },
  ];

  return (
    <Sidebar collapsible="icon" side={lang === "ar" ? "right" : "left"}>
      <SidebarHeader className="border-b border-sidebar-border px-3 py-4">
        <Link to="/dashboard" className="flex items-center gap-2">
          <img
            src={theme === "dark" ? logoLight : logoDark}
            alt="Primewave"
            className="h-8 w-auto"
          />
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          {/* (No SidebarGroupLabel — the bare "Menu" header was removed.) */}
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => {
                if (item.kind === "leaf") {
                  const active = path === item.url;
                  return (
                    <SidebarMenuItem key={item.key}>
                      <SidebarMenuButton asChild isActive={active}>
                        <Link to={item.url} className="flex items-center gap-2">
                          <item.icon className="h-4 w-4" />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                }
                return <CollapsibleGroup key={item.key} item={item} currentPath={path} />;
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={logout}>
              <LogOut className="h-4 w-4" />
              <span>{t("signOut")}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}

interface CollapsibleGroupProps {
  item: {
    key: string;
    title: string;
    icon: typeof Home;
    matchPrefix: string;
    children: Array<{ key: string; title: string; url: string; icon: typeof Home }>;
  };
  currentPath: string;
}

function CollapsibleGroup({ item, currentPath }: CollapsibleGroupProps) {
  // Auto-open whenever a child is the active route; lets the user toggle.
  const childActive = currentPath.startsWith(item.matchPrefix);
  const [open, setOpen] = useState<boolean>(childActive);
  // If the route changes to a child after mount (e.g. nav-back) make sure
  // the group expands again. Effect dependencies on childActive only — we
  // don't auto-close when navigating *away* so the user's manual toggle
  // sticks.
  useEffect(() => {
    if (childActive) setOpen(true);
  }, [childActive]);

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        type="button"
        onClick={() => setOpen((v) => !v)}
        isActive={childActive}
        aria-expanded={open}
      >
        <item.icon className="h-4 w-4" />
        <span className="flex-1 text-start">{item.title}</span>
        <ChevronRight
          className={`h-4 w-4 transition-transform ${open ? "rotate-90" : ""}`}
          aria-hidden="true"
        />
      </SidebarMenuButton>
      {open && (
        <SidebarMenuSub>
          {item.children.map((child) => {
            const active = currentPath === child.url;
            return (
              <SidebarMenuSubItem key={child.key}>
                <SidebarMenuSubButton asChild isActive={active}>
                  <Link to={child.url} className="flex items-center gap-2">
                    <child.icon className="h-3.5 w-3.5" />
                    <span>{child.title}</span>
                  </Link>
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
            );
          })}
        </SidebarMenuSub>
      )}
    </SidebarMenuItem>
  );
}
