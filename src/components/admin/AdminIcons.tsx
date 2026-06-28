import {
  BarChart3,
  BadgeDollarSign,
  Bell,
  Bot,
  BriefcaseBusiness,
  Brain,
  Building2,
  Calculator,
  ClipboardCheck,
  Database,
  FileSearch,
  Files,
  Gavel,
  GitCompareArrows,
  Kanban,
  KeyRound,
  LayoutDashboard,
  LucideIcon,
  MapPinned,
  MessageSquare,
  MonitorDot,
  Puzzle,
  RadioTower,
  ScrollText,
  Settings,
  ShieldCheck,
  Users,
} from "lucide-react";

const iconMap: Record<string, LucideIcon> = {
  BarChart3,
  BadgeDollarSign,
  Bell,
  Bot,
  BriefcaseBusiness,
  Brain,
  Building2,
  Calculator,
  ClipboardCheck,
  Database,
  FileSearch,
  Files,
  Gavel,
  GitCompareArrows,
  Kanban,
  KeyRound,
  LayoutDashboard,
  MapPinned,
  MessageSquare,
  MonitorDot,
  Puzzle,
  RadioTower,
  ScrollText,
  Settings,
  ShieldCheck,
  Users,
};

type AdminIconProps = {
  icon: string;
  size?: number;
  className?: string;
};

export function AdminIcon({ icon, size = 18, className }: AdminIconProps) {
  const Icon = iconMap[icon] || LayoutDashboard;
  return <Icon size={size} className={className} />;
}
