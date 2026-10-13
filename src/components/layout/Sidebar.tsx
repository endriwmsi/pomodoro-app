import { NAV_ITEMS, type NavItem, type ViewId } from '@/app/navigation';

interface SidebarProps {
  activeView: ViewId;
  onNavigate: (view: ViewId) => void;
}

export function Sidebar({ activeView, onNavigate }: SidebarProps) {
  const renderItem = (item: NavItem) => {
    const active = item.id === activeView;
    const Icon = item.icon;
    return (
      <li key={item.id}>
        <button
          type="button"
          title={item.label}
          aria-label={item.label}
          aria-current={active ? 'page' : undefined}
          onClick={() => {
            onNavigate(item.id);
          }}
          className={`flex size-8 items-center justify-center rounded-lg transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-white/70 ${
            active ? 'bg-white/15 text-white' : 'text-white/60 hover:bg-white/10 hover:text-white'
          }`}
        >
          <Icon size={17} strokeWidth={1.75} aria-hidden="true" />
        </button>
      </li>
    );
  };

  return (
    <nav
      aria-label="Navegação principal"
      data-tauri-drag-region
      className="flex w-12 shrink-0 flex-col items-center pt-3 pb-2"
    >
      <div
        aria-hidden="true"
        data-tauri-drag-region
        className="mb-4 size-5 rounded-full border-[3px] border-white border-r-transparent"
      />
      <ul className="flex flex-col gap-1.5">
        {NAV_ITEMS.filter((item) => item.placement === 'primary').map(renderItem)}
      </ul>
      <div data-tauri-drag-region className="min-h-4 flex-1 self-stretch" />
      <ul className="flex flex-col gap-1.5">
        {NAV_ITEMS.filter((item) => item.placement === 'secondary').map(renderItem)}
      </ul>
    </nav>
  );
}
