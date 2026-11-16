import {
  BarChart3,
  Brain,
  CalendarDays,
  Images,
  LayoutDashboard,
  ListChecks,
  Mail,
  PenSquare,
  Settings,
  Share2,
  Sparkles,
  Users,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  title: string;
  href: string;
  icon: LucideIcon;
}

export const NAV: { label: string; items: NavItem[] }[] = [
  { label: 'Overview', items: [{ title: 'Dashboard', href: '/dashboard', icon: LayoutDashboard }] },
  {
    label: 'Publish',
    items: [
      { title: 'Create post', href: '/compose', icon: PenSquare },
      { title: 'Calendar', href: '/calendar', icon: CalendarDays },
      { title: 'Content queue', href: '/content', icon: ListChecks },
      { title: 'Media library', href: '/media', icon: Images },
    ],
  },
  {
    label: 'AI',
    items: [
      { title: 'AI Studio', href: '/studio', icon: Sparkles },
      { title: 'AI Analyst', href: '/analyst', icon: Brain },
    ],
  },
  {
    label: 'Grow',
    items: [
      { title: 'Analytics', href: '/analytics', icon: BarChart3 },
      { title: 'Email campaigns', href: '/email', icon: Mail },
      { title: 'Contacts', href: '/email/contacts', icon: Users },
    ],
  },
  {
    label: 'Setup',
    items: [
      { title: 'Channels', href: '/channels', icon: Share2 },
      { title: 'Settings', href: '/settings', icon: Settings },
    ],
  },
];
