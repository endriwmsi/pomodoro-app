import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CloudSun,
  ListTodo,
  Music,
  Pin,
  Timer,
  type LucideIcon,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type WheelEvent,
} from 'react';

import { applyTemplate } from '@/app/templates';
import {
  notchSetLayout,
  type NotchLayout,
  type NotchPosition,
  type NotchTheme,
  type Settings,
} from '@/lib/commands';
import { MediaTab } from '@/notch/MediaTab';
import { MiniPlayer } from '@/notch/MiniPlayer';
import { EDGE_LAYOUT, LAYOUT_RANK, MINI_PLAYER_SIZE, notchShape } from '@/notch/shape';
import { reportNotchFailure } from '@/notch/shared';
import { TasksTab } from '@/notch/TasksTab';
import { TimerTab } from '@/notch/TimerTab';
import { WeatherTab } from '@/notch/WeatherTab';
import { useMediaStore } from '@/stores/media';
import { useSettingsStore, useTemplate } from '@/stores/settings';
import { useTasksStore } from '@/stores/tasks';
import { useTimerStore } from '@/stores/timer';

/**
 * Interface da janela do notch. A janela tem sempre o tamanho exato do que
 * está visível: para crescer, primeiro a janela aumenta (backend) e depois a
 * forma é animada; para diminuir, o inverso.
 */

const ANIMATION_MS = 180;
/** Tolerância antes de recolher, para a saída acidental do mouse não fechar o painel. */
const COLLAPSE_DELAY_MS = 350;
/** Intervalo mínimo entre trocas de aba pela roda do mouse. */
const WHEEL_COOLDOWN_MS = 320;
/** Com o painel aberto, a mídia em reprodução é relida neste intervalo. */
const MEDIA_POLL_MS = 2_000;
/** Distância, em px, entre os ícones do seletor de abas. */
const RAIL_STEP = 34;

const HANDLE_ICON = { top: ChevronDown, left: ChevronRight, right: ChevronLeft } as const;

interface NotchTab {
  id: string;
  label: string;
  icon: LucideIcon;
  /** Cor do ícone quando a aba está selecionada. */
  color: string;
  /** Se ausente, a aba existe sempre. */
  enabled?: (settings: Settings) => boolean;
  /** `stacked`: conteúdo empilhado (notch nas laterais). */
  render: (stacked: boolean) => React.JSX.Element;
}

const MEDIA_TAB = 'media';

/** Abas do notch, na ordem do seletor. Novas abas entram aqui. */
const TABS: readonly NotchTab[] = [
  {
    id: 'timer',
    label: 'Timer',
    icon: Timer,
    color: 'text-accent',
    render: (stacked) => <TimerTab stacked={stacked} />,
  },
  {
    id: 'tasks',
    label: 'Tarefas',
    icon: ListTodo,
    color: 'text-violet-400',
    render: (stacked) => <TasksTab stacked={stacked} />,
  },
  {
    id: MEDIA_TAB,
    label: 'Música',
    icon: Music,
    color: 'text-emerald-400',
    render: (stacked) => <MediaTab stacked={stacked} />,
  },
  {
    id: 'weather',
    label: 'Clima',
    icon: CloudSun,
    color: 'text-sky-400',
    // Só existe com a previsão ligada: sem ela, nada usa a internet.
    enabled: (settings) => settings.weather.enabled,
    render: (stacked) => <WeatherTab stacked={stacked} />,
  },
];

/** Tamanho do painel aberto: a aba Música mostra só o player e é menor. */
function openLayout(tabId: string): NotchLayout {
  return tabId === MEDIA_TAB ? 'compact' : 'expanded';
}

/** Aba côncava que liga o corpo do notch à borda da tela. */
function Flare({ size, center }: { size: number; center: string }) {
  return (
    <span
      aria-hidden="true"
      className="notch-flare"
      style={{ width: size, height: size, '--flare-center': center } as CSSProperties}
    />
  );
}

/** A roda do mouse deve rolar esta lista em vez de trocar de aba? */
function scrollsList(event: WheelEvent): boolean {
  const list = (event.target as Element).closest<HTMLElement>('[data-notch-scroll]');
  if (!list || list.scrollHeight <= list.clientHeight) return false;
  return event.deltaY > 0
    ? list.scrollTop + list.clientHeight < list.scrollHeight
    : list.scrollTop > 0;
}

interface TabRailProps {
  tabs: readonly NotchTab[];
  selected: number;
  onSelect: (index: number) => void;
  /** Ícones empilhados (notch nas laterais) em vez de lado a lado. */
  vertical: boolean;
}

/**
 * Seletor de abas em forma de carrossel: o ícone selecionado fica no centro,
 * maior e colorido, e os vizinhos encolhem. Ao trocar, a fileira inteira
 * desliza com um leve ricochete, como se fosse arrastada com o dedo.
 */
function TabRail({ tabs, selected, onSelect, vertical }: TabRailProps) {
  // Uma "janela" de três posições; a fileira é deslocada para pôr a aba
  // selecionada na do meio.
  const offset = (1 - selected) * RAIL_STEP;

  return (
    <div
      role="tablist"
      aria-label="Seções do notch"
      aria-orientation={vertical ? 'vertical' : 'horizontal'}
      style={
        vertical
          ? { height: RAIL_STEP * 3, width: RAIL_STEP }
          : { width: RAIL_STEP * 3, height: RAIL_STEP }
      }
      className="notch-rail-window relative shrink-0 overflow-hidden"
    >
      <div
        style={{
          transform: vertical ? `translateY(${offset}px)` : `translateX(${offset}px)`,
        }}
        className={`notch-spring absolute top-0 left-0 flex ${vertical ? 'flex-col' : ''}`}
      >
        {tabs.map(({ id, label, icon: Icon, color }, index) => {
          const active = index === selected;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={active}
              aria-label={label}
              title={label}
              onClick={() => {
                onSelect(index);
              }}
              style={{ width: RAIL_STEP, height: RAIL_STEP }}
              className="relative flex shrink-0 items-center justify-center outline-none"
            >
              {/* Bolha colorida atrás do ícone selecionado. */}
              <span
                aria-hidden="true"
                className={`notch-spring absolute size-7 rounded-full bg-current ${color} ${
                  active ? 'scale-100 opacity-20' : 'scale-0 opacity-0'
                }`}
              />
              <span
                className={`notch-spring relative flex ${
                  active ? `scale-110 ${color}` : 'scale-75 text-white/40 hover:text-white/70'
                }`}
              >
                <Icon size={17} strokeWidth={2.4} aria-hidden="true" />
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function NotchPanel({ position }: { position: NotchPosition }) {
  const settings = useSettingsStore((state) => state.settings);
  const refreshMedia = useMediaStore((state) => state.refresh);
  const tabs = TABS.filter((item) => item.enabled?.(settings) ?? true);

  /** O que está desenhado agora (a janela nunca é menor que isto). */
  const [layout, setLayout] = useState<NotchLayout>('collapsed');
  /** Mantido aberto por clique, independentemente do mouse. */
  const [pinned, setPinned] = useState(false);
  /** Guardado por ID: a lista de abas pode mudar (clima ligado/desligado). */
  const [tabId, setTabId] = useState(TABS[0]?.id ?? '');

  const layoutRef = useRef<NotchLayout>('collapsed');
  /** O layout pedido por último; respostas atrasadas de pedidos antigos são ignoradas. */
  const wanted = useRef<NotchLayout>('collapsed');
  const tabIdRef = useRef(tabId);
  const pinnedRef = useRef(false);
  const pending = useRef<number | undefined>(undefined);
  const lastWheel = useRef(0);

  const open = layout !== 'collapsed';
  const tab = Math.max(
    tabs.findIndex((item) => item.id === tabId),
    0,
  );

  useEffect(
    () => () => {
      window.clearTimeout(pending.current);
    },
    [],
  );

  /** Leva a janela e o desenho ao layout `next`, na ordem que evita cortes. */
  const transitionTo = useCallback((next: NotchLayout) => {
    window.clearTimeout(pending.current);
    wanted.current = next;
    const draw = () => {
      layoutRef.current = next;
      setLayout(next);
    };
    if (LAYOUT_RANK[next] >= LAYOUT_RANK[layoutRef.current]) {
      // Cresce: a janela primeiro; o desenho, um quadro depois.
      notchSetLayout(next)
        .then(() => {
          requestAnimationFrame(() => {
            if (wanted.current === next) draw();
          });
        })
        .catch(reportNotchFailure);
    } else {
      // Diminui: o desenho primeiro; a janela, ao fim da animação.
      draw();
      pending.current = window.setTimeout(() => {
        notchSetLayout(next).catch(reportNotchFailure);
      }, ANIMATION_MS);
    }
  }, []);

  const selectTab = useCallback(
    (id: string) => {
      tabIdRef.current = id;
      setTabId(id);
      if (wanted.current !== 'collapsed') transitionTo(openLayout(id));
    },
    [transitionTo],
  );

  // Abre na aba em que estava: o player aparece em todas, então a música
  // tocando não muda a aba.
  const expand = useCallback(() => {
    transitionTo(openLayout(tabIdRef.current));
    void refreshMedia();
  }, [refreshMedia, transitionTo]);

  const collapse = useCallback(
    (delay: number) => {
      window.clearTimeout(pending.current);
      pending.current = window.setTimeout(() => {
        transitionTo('collapsed');
      }, delay);
    },
    [transitionTo],
  );

  // Enquanto o painel está aberto, o player (completo ou compacto) acompanha a mídia.
  useEffect(() => {
    if (!open) return;
    const timer = window.setInterval(() => void refreshMedia(), MEDIA_POLL_MS);
    return () => {
      window.clearInterval(timer);
    };
  }, [open, refreshMedia]);

  const togglePinned = () => {
    pinnedRef.current = !pinnedRef.current;
    setPinned(pinnedRef.current);
  };

  const select = (index: number) => {
    const next = tabs[Math.min(Math.max(index, 0), tabs.length - 1)];
    if (next) selectTab(next.id);
  };

  const onWheel = (event: WheelEvent) => {
    if (!open || event.deltaY === 0 || scrollsList(event)) return;
    const now = Date.now();
    if (now - lastWheel.current < WHEEL_COOLDOWN_MS) return;
    lastWheel.current = now;
    select(tab + (event.deltaY > 0 ? 1 : -1));
  };

  const side = position !== 'top';
  const edge = EDGE_LAYOUT[position];
  const shape = notchShape(position, layout);
  // Recolhido, o conteúdo (invisível) já fica do tamanho com que vai abrir.
  const contentLayout = open ? layout : openLayout(tabId);
  const content = notchShape(position, contentLayout);
  const HandleIcon = HANDLE_ICON[position];
  const showMiniPlayer = contentLayout === 'expanded';

  // Nas laterais o seletor fica em pé, junto à borda da tela, e as abas
  // deslizam na vertical; no topo, tudo corre na horizontal.
  const share = 100 / tabs.length;
  const trackStyle: CSSProperties = side
    ? { height: `${tabs.length * 100}%`, transform: `translateY(-${tab * share}%)` }
    : { width: `${tabs.length * 100}%`, transform: `translateX(-${tab * share}%)` };

  return (
    <div
      className={`flex h-screen w-screen overflow-hidden ${edge.window}`}
      onMouseEnter={expand}
      onMouseLeave={() => {
        if (!pinnedRef.current) collapse(COLLAPSE_DELAY_MS);
      }}
      onWheel={onWheel}
    >
      <div className={`flex ${edge.stack}`}>
        <Flare size={shape.flare} center={edge.flareCenters[0]} />

        <section
          aria-label="Compasso"
          style={{
            width: side ? shape.depth : shape.along,
            height: side ? shape.along : shape.depth,
            borderRadius: edge.bodyRadius(shape.radius),
          }}
          className="notch-body relative shrink-0 overflow-hidden text-white"
        >
          {/* Puxador: visível apenas recolhido. */}
          <div
            aria-hidden="true"
            className={`absolute inset-0 flex items-center justify-center transition-opacity duration-100 ${
              open ? 'opacity-0' : 'opacity-100'
            }`}
          >
            <HandleIcon size={11} strokeWidth={2.5} className="text-white/55" />
          </div>

          <div
            inert={!open}
            style={{
              width: side ? content.depth : content.along,
              height: side ? content.along : content.depth,
            }}
            className={`absolute flex gap-2 transition-opacity duration-150 ${
              side
                ? `top-1/2 -translate-y-1/2 px-2.5 py-5 ${position === 'right' ? 'right-0 flex-row-reverse' : 'left-0 flex-row'}`
                : 'top-0 left-1/2 -translate-x-1/2 flex-col px-5 pt-1.5 pb-6'
            } ${open ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
          >
            <div
              className={`relative flex shrink-0 items-center justify-center ${side ? 'flex-col' : ''}`}
            >
              <TabRail tabs={tabs} selected={tab} onSelect={select} vertical={side} />
              <button
                type="button"
                aria-pressed={pinned}
                aria-label={pinned ? 'Soltar o painel' : 'Manter o painel aberto'}
                title={pinned ? 'Soltar o painel' : 'Manter o painel aberto'}
                onClick={togglePinned}
                className={`absolute flex size-6 items-center justify-center rounded-full transition-colors duration-150 outline-none hover:bg-white/15 ${
                  side ? 'bottom-0' : 'right-0'
                } ${pinned ? 'text-accent' : 'text-white/45'}`}
              >
                <Pin size={12} aria-hidden="true" />
              </button>
            </div>

            {/* A aba e, ao lado (topo) ou abaixo (laterais), o player compacto. */}
            <div className={`flex min-h-0 min-w-0 flex-1 gap-3 ${side ? 'flex-col' : ''}`}>
              <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
                {/* Trilho com as abas em fila; desliza até a ativa. */}
                <div
                  style={trackStyle}
                  className={`notch-spring flex h-full ${side ? 'flex-col' : ''}`}
                >
                  {tabs.map(({ id, label, render }, index) => (
                    <div
                      key={id}
                      role="tabpanel"
                      aria-label={label}
                      inert={index !== tab}
                      style={side ? { height: `${share}%` } : { width: `${share}%` }}
                      className={`notch-spring min-h-0 min-w-0 shrink-0 ${side ? 'w-full' : 'h-full'} ${
                        index === tab ? 'scale-100 opacity-100' : 'scale-90 opacity-0'
                      }`}
                    >
                      {render(side)}
                    </div>
                  ))}
                </div>
              </div>

              {showMiniPlayer ? (
                <div
                  style={
                    side ? { height: MINI_PLAYER_SIZE - 12 } : { width: MINI_PLAYER_SIZE - 12 }
                  }
                  className={`shrink-0 border-white/10 ${side ? 'border-t pt-3' : 'border-l pl-3'}`}
                >
                  <MiniPlayer horizontal={side} />
                </div>
              ) : null}
            </div>
          </div>
        </section>

        <Flare size={shape.flare} center={edge.flareCenters[1]} />
      </div>
    </div>
  );
}

const DARK_SCHEME = '(prefers-color-scheme: dark)';

function subscribeToScheme(onChange: () => void) {
  const query = window.matchMedia(DARK_SCHEME);
  query.addEventListener('change', onChange);
  return () => {
    query.removeEventListener('change', onChange);
  };
}

/** A cor em vigor: `system` acompanha o modo claro ou escuro do Windows. */
function useResolvedTheme(theme: NotchTheme): 'dark' | 'light' {
  const systemIsDark = useSyncExternalStore(
    subscribeToScheme,
    () => window.matchMedia(DARK_SCHEME).matches,
  );
  if (theme === 'system') return systemIsDark ? 'dark' : 'light';
  return theme;
}

export function NotchApp() {
  const template = useTemplate();
  const theme = useResolvedTheme(useSettingsStore((state) => state.settings.notch.theme));
  const position = useSettingsStore((state) => state.settings.notch.position);
  const connectSettings = useSettingsStore((state) => state.connect);
  const connectTimer = useTimerStore((state) => state.connect);
  const connectTasks = useTasksStore((state) => state.connect);

  useEffect(() => connectSettings(), [connectSettings]);
  useEffect(() => connectTimer(), [connectTimer]);
  useEffect(() => connectTasks(), [connectTasks]);
  useEffect(() => {
    applyTemplate(template);
  }, [template]);
  // As cores do notch são trocadas pelo CSS a partir deste atributo.
  useEffect(() => {
    document.documentElement.dataset.notchTheme = theme;
  }, [theme]);

  // A chave recria o painel recolhido quando a borda muda: o backend também
  // recolhe a janela nesse momento.
  return <NotchPanel key={position} position={position} />;
}
