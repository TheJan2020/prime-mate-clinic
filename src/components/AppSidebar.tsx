import { Link, useRouterState } from "@tanstack/react-router";
import {
  Home,
  Building2,
  Stethoscope,
  CalendarDays,
  CalendarRange,
  Users,
  Headphones,
  Settings,
  LogOut,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { useApp } from "@/lib/i18n";
import logoLight from "@/assets/primewave-light.png";
import logoDark from "@/assets/primewave-dark.png";

export function AppSidebar() {
  const { t, theme, logout, lang } = useApp();
  const path = useRouterState({ select: (s) => s.location.pathname });

  const items = [
    { key: "home", title: t("home"), url: "/dashboard", icon: Home },
    { key: "clinics", title: t("clinics"), url: "/clinics", icon: Building2 },
    { key: "providers", title: t("providers"), url: "/providers", icon: Stethoscope },
    { key: "appointments", title: t("appointments"), url: "/appointments", icon: CalendarDays },
    { key: "calendar", title: t("calendar"), url: "/calendar", icon: CalendarRange },
    { key: "patients", title: t("patients"), url: "/patients", icon: Users },
    { key: "callCenter", title: t("callCenter"), url: "/call-center", icon: Headphones },
    { key: "settings", title: t("settings"), url: "/settings", icon: Settings },
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
          <SidebarGroupLabel>Menu</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => {
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