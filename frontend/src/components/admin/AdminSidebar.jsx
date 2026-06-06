import {
  Activity,
  BarChart3,
  BellRing,
  Bot,
  ClipboardList,
  MapPinned,
  LayoutDashboard,
  LogOut,
  Map,
  PanelLeftClose,
  PanelLeftOpen,
  RadioTower,
  Shield,
  ShieldCheck,
  UserCircle2,
  UserRoundCheck,
  Users,
} from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import BrandMark from '../BrandMark'

const STORAGE_KEY = 'rescuelink.admin.sidebar.collapsed'

const NAV_GROUPS = [
  {
    label: 'Operations',
    items: [
      { label: 'Dashboard', to: '/admin/dashboard', ability: 'view-dashboard', icon: LayoutDashboard },
      { label: 'Triage', to: '/admin/triage', ability: 'manage-incidents', icon: ClipboardList },
      { label: 'AI Risk', to: '/admin/ai-risk', ability: 'manage-incidents', icon: Bot },
      { label: 'Hazard Zones', to: '/admin/hazard-zones', ability: 'manage-incidents', icon: MapPinned },
      { label: 'Responders', to: '/admin/responders', icon: UserRoundCheck },
      { label: 'Incidents', to: '/admin/incidents', ability: 'manage-incidents', icon: Activity },
      { label: 'Map View', to: '/admin/map', ability: 'manage-incidents', icon: Map },
      { label: 'Registrations', to: '/admin/registrations', ability: 'manage-users', icon: Users },
      { label: 'Roles', to: '/admin/roles', ability: 'manage-roles', icon: ShieldCheck },
      { label: 'IoT Devices', to: '/admin/iot-devices', ability: 'manage-iot', icon: RadioTower },
      { label: 'Notifications', to: '/admin/notifications', ability: 'broadcast-messages', icon: BellRing },
    ],
  },
  {
    label: 'Analytics',
    items: [
      { label: 'Analytics', to: '/admin/analytics', ability: 'view-analytics', icon: BarChart3 },
    ],
  },
  {
    label: 'System',
    items: [
      { label: 'Audit Logs', to: '/admin/audit', ability: 'view-reports', icon: Shield },
      { label: 'System', to: '/admin/system', ability: 'edit-system-settings', icon: Activity },
    ],
  },
]

function readStoredCollapseState() {
  if (typeof window === 'undefined') {
    return false
  }

  return window.localStorage.getItem(STORAGE_KEY) === '1'
}

function AdminSidebar({ user, onLogout }) {
  const { pathname } = useLocation()
  const { can } = useAuth()
  const [collapsed, setCollapsed] = useState(readStoredCollapseState)

  useEffect(() => {
    document.documentElement.style.setProperty('--admin-sidebar-width', collapsed ? '5.5rem' : '15rem')
    window.localStorage.setItem(STORAGE_KEY, collapsed ? '1' : '0')
  }, [collapsed])

  const visibleGroups = useMemo(
    () => NAV_GROUPS
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => !item.ability || can(item.ability)),
      }))
      .filter((group) => group.items.length > 0),
    [can],
  )

  return (
    <aside className={`fixed left-0 top-0 z-40 hidden h-screen border-r border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.95),rgba(241,245,249,0.98))] shadow-[14px_0_44px_rgba(11,17,32,0.08)] backdrop-blur lg:flex lg:flex-col ${collapsed ? 'w-[5.5rem]' : 'w-60'}`}>
      <div className={`border-b border-slate-200/80 ${collapsed ? 'px-3 py-4' : 'px-5 py-5'}`}>
        <div className={`flex items-center ${collapsed ? 'justify-center' : 'justify-between'} gap-3`}>
          <BrandMark compact={collapsed} />
          {!collapsed ? (
            <button
              type="button"
              onClick={() => setCollapsed(true)}
              className="rounded-2xl border border-slate-200 bg-white p-2 text-slate-500 transition hover:border-info hover:text-info"
              aria-label="Collapse sidebar"
            >
              <PanelLeftClose className="h-4 w-4" />
            </button>
          ) : null}
        </div>
        {collapsed ? (
          <button
            type="button"
            onClick={() => setCollapsed(false)}
            className="mx-auto mt-3 flex rounded-2xl border border-slate-200 bg-white p-2 text-slate-500 transition hover:border-info hover:text-info"
            aria-label="Expand sidebar"
          >
            <PanelLeftOpen className="h-4 w-4" />
          </button>
        ) : (
          <p className="">
          </p>
        )}
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
        {visibleGroups.map((group) => (
          <section key={group.label} className="space-y-2">
            {collapsed ? (
              <div className="mx-auto h-px w-8 bg-slate-200" />
            ) : (
              <p className="px-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">{group.label}</p>
            )}

            <div className="space-y-1.5">
              {group.items.map((item) => {
                const active = pathname.startsWith(item.to)
                const Icon = item.icon

                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    title={collapsed ? item.label : undefined}
                    className={`group flex items-center rounded-2xl border px-3 py-2.5 text-sm font-semibold transition ${
                      collapsed ? 'justify-center px-0' : 'gap-3'
                    } ${
                      active
                        ? 'border-info/20 bg-info/10 text-info shadow-[0_12px_30px_rgba(37,99,235,0.15)]'
                        : 'border-transparent text-slate-600 hover:border-slate-200 hover:bg-white hover:text-navy'
                    }`}
                  >
                    <Icon className={`h-[18px] w-[18px] shrink-0 ${active ? 'text-info' : 'text-slate-400 transition group-hover:text-navy'}`} />
                    {!collapsed ? <span>{item.label}</span> : null}
                  </Link>
                )
              })}
            </div>
          </section>
        ))}
      </nav>

      <div className={`border-t border-slate-200/80 ${collapsed ? 'px-3 py-4' : 'p-4'}`}>
        <div className={`rounded-3xl border border-white/80 bg-white/90 shadow-sm ${collapsed ? 'px-2 py-3' : 'px-3 py-3'}`}>
          <div className={`flex items-center ${collapsed ? 'justify-center' : 'gap-3'}`}>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-panel text-navy">
              <UserCircle2 className="h-5 w-5" />
            </div>
            {!collapsed ? (
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-navy">{user?.full_name}</p>
                <p className="text-xs uppercase tracking-[0.16em] text-slate-400">{user?.role}</p>
              </div>
            ) : null}
          </div>
        </div>
        <button
          type="button"
          onClick={onLogout}
          title={collapsed ? 'Logout' : undefined}
          className={`mt-3 inline-flex w-full items-center rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-navy transition hover:border-danger hover:text-danger ${collapsed ? 'justify-center px-0' : 'gap-2'}`}
        >
          <LogOut className="h-4 w-4" />
          {!collapsed ? <span>Logout</span> : null}
        </button>
      </div>
    </aside>
  )
}

export default AdminSidebar
