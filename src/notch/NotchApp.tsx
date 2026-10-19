import { isTauri } from '@tauri-apps/api/core';
import {
  BellRing,
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
  type NotchBorder,
  type NotchLayout,
  type NotchNotice,
  type NotchPosition,
  type NotchTheme,
  type Settings,
} from '@/lib/commands';
import { MediaTab } from '@/notch/MediaTab';
import { MiniPlayer } from '@/notch/MiniPlayer';
import {
  borderFillPath,
  borderGlowPath,
  EDGE_LAYOUT,
  flareTrim,
  LAYOUT_RANK,
  MINI_PLAYER_HEIGHT,
  MINI_PLAYER_WIDTH,
  notchShape,
} from '@/notch/shape';
import { subscribeNotchNotice } from '@/lib/events';
import { reportNotchFailure } from '@/notch/shared';
import { TasksTab } from '@/notch/TasksTab';
import { TimerTab } from '@/notch/TimerTab';
import { WeatherTab } from '@/notch/WeatherTab';
import { useMediaStore } from '@/stores/media';
import { useRoutinesStore } from '@/stores/routines';
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
/** Quanto tempo o aviso de fim de sessão (`notch:notice`) fica na tela. */
export const NOTICE_MS = 3_000;

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

const TIMER_TAB = 'timer';
const MEDIA_TAB = 'media';

/** Abas do notch, na ordem do seletor. Novas abas entram aqui. */
const TABS: readonly NotchTab[] = [
  {
    id: TIMER_TAB,
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
function Flare({
  size,
  center,
  trim,
}: {
  size: number;
  center: string;
  trim?: string | undefined;
}) {
  return (
    <span
      aria-hidden="true"
      className="notch-flare"
      style={
        { width: size, height: size, '--flare-center': center, clipPath: trim } as CSSProperties
      }
    />
  );
}

/**
 * Borda animada do notch recolhido (`notch.border`): cobre abas e corpo; uma
 * camada fecha a lasca entre aba e canto (`borderFillPath`) e a outra é a
 * faixa (`borderGlowPath`). Some ao abrir, e a animação fica parada enquanto
 * não aparece. As cores e o movimento estão em `globals.css`.
 */
function NotchBorderGlow({
  border,
  position,
  open,
}: {
  border: NotchBorder;
  position: NotchPosition;
  open: boolean;
}) {
  return (
    <span
      aria-hidden="true"
      data-notch-border={border.style}
      data-edge={position}
      data-paused={open || undefined}
      style={{ '--notch-border-color': border.color } as CSSProperties}
      className={`notch-border ${open ? 'opacity-0' : 'opacity-100'}`}
    >
      <span
        className="notch-border-fill"
        style={{ clipPath: `path('${borderFillPath(position)}')` }}
      />
      <span
        className="notch-border-glow"
        style={{ clipPath: `path('${borderGlowPath(position)}')` }}
      >
        <span className="notch-border-flow" />
      </span>
    </span>
  );
}

/**
 * Aviso de fim de sessão, por cima da aba Timer. Continua montado ao sumir,
 * para o texto não desaparecer antes do esmaecimento.
 */
function NoticeBanner({ notice, visible }: { notice: NotchNotice | null; visible: boolean }) {
  return (
    <div
      role="status"
      aria-hidden={!visible}
      style={{ backgroundColor: 'var(--notch-surface)' }}
      className={`absolute inset-0 z-10 flex flex-col items-center justify-center gap-1.5 px-3 text-center transition-opacity duration-200 ${
        visible ? 'opacity-100' : 'pointer-events-none opacity-0'
      }`}
    >
      {notice ? (
        <>
          <BellRing size={18} aria-hidden="true" className="text-accent" />
          <p className="font-display text-xl leading-tight font-semibold">{notice.title}</p>
          <p className="text-xs text-white/70">{notice.body}</p>
        </>
      ) : null}
    </div>
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
  /** O mouse está sobre o notch. */
  const hovered = useRef(false);

  /** Último aviso de fim de sessão; `noticeVisible` diz se ainda está na tela. */
  const [notice, setNotice] = useState<NotchNotice | null>(null);
  const [noticeVisible, setNoticeVisible] = useState(false);
  const noticeTimer = useRef<number | undefined>(undefined);
  const restoreTimer = useRef<number | undefined>(undefined);
  /**
   * A aba em que o notch estava quando um aviso o abriu sozinho; ao recolher,
   * ela volta. `null` quando o painel não foi aberto por um aviso — ou quando
   * o mouse entrou e o painel passou a ser do usuário.
   */
  const tabBeforeNotice = useRef<string | null>(null);

  const open = layout !== 'collapsed';
  const tab = Math.max(
    tabs.findIndex((item) => item.id === tabId),
    0,
  );

  useEffect(
    () => () => {
      window.clearTimeout(pending.current);
      window.clearTimeout(noticeTimer.current);
      window.clearTimeout(restoreTimer.current);
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

  // Fim de um foco ou de uma pausa: recolhido, o notch abre na aba Timer com
  // o aviso e, passado `NOTICE_MS`, recolhe e volta à aba em que estava. Já
  // aberto (mouse em cima ou fixado), mostra o aviso sem trocar de aba nem
  // recolher.
  const showNotice = useCallback(
    (next: NotchNotice) => {
      const { notch } = useSettingsStore.getState().settings;
      if (!notch.enabled || !notch.notices) return;

      window.clearTimeout(noticeTimer.current);
      window.clearTimeout(restoreTimer.current);
      setNotice(next);
      setNoticeVisible(true);
      if (wanted.current === 'collapsed') {
        tabBeforeNotice.current ??= tabIdRef.current;
        selectTab(TIMER_TAB);
        expand();
      }

      noticeTimer.current = window.setTimeout(() => {
        setNoticeVisible(false);
        const previous = tabBeforeNotice.current;
        if (previous === null) return;
        if (hovered.current || pinnedRef.current) {
          tabBeforeNotice.current = null;
          return;
        }
        transitionTo('collapsed');
        // Só depois de recolher, para a troca de aba não aparecer. Um aviso
        // que chegue antes disso cancela a volta e mantém `previous`.
        restoreTimer.current = window.setTimeout(() => {
          tabBeforeNotice.current = null;
          selectTab(previous);
        }, ANIMATION_MS);
      }, NOTICE_MS);
    },
    [expand, selectTab, transitionTo],
  );

  useEffect(() => {
    if (!isTauri()) return;
    let disposed = false;
    let unsubscribe: (() => void) | undefined;
    subscribeNotchNotice(showNotice)
      .then((stop) => {
        if (disposed) stop();
        else unsubscribe = stop;
      })
      .catch(reportNotchFailure);
    return () => {
      disposed = true;
      unsubscribe?.();
    };
  }, [showNotice]);

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
  // Com a borda, o notch recolhido segue o contorno suave dela (ver flareTrim).
  const trimFlares = settings.notch.border.enabled && layout === 'collapsed';
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
      onMouseEnter={() => {
        hovered.current = true;
        // O usuário assumiu o painel: o aviso não o recolhe mais.
        tabBeforeNotice.current = null;
        window.clearTimeout(restoreTimer.current);
        expand();
      }}
      onMouseLeave={() => {
        hovered.current = false;
        if (!pinnedRef.current) collapse(COLLAPSE_DELAY_MS);
      }}
      onWheel={onWheel}
    >
      <div className={`relative flex ${edge.stack}`}>
        <Flare
          size={shape.flare}
          center={edge.flareCenters[0]}
          trim={trimFlares ? flareTrim(position, 0) : undefined}
        />

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
              <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
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
                <NoticeBanner
                  notice={notice}
                  visible={noticeVisible && tabs[tab]?.id === TIMER_TAB}
                />
              </div>

              {showMiniPlayer ? (
                <div
                  style={
                    side ? { height: MINI_PLAYER_HEIGHT - 12 } : { width: MINI_PLAYER_WIDTH - 12 }
                  }
                  className={`shrink-0 border-white/10 ${side ? 'border-t pt-3' : 'border-l pl-3'}`}
                >
                  <MiniPlayer horizontal={side} />
                </div>
              ) : null}
            </div>
          </div>
        </section>

        <Flare
          size={shape.flare}
          center={edge.flareCenters[1]}
          trim={trimFlares ? flareTrim(position, 1) : undefined}
        />

        {settings.notch.border.enabled ? (
          <NotchBorderGlow border={settings.notch.border} position={position} open={open} />
        ) : null}
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
  const connectRoutines = useRoutinesStore((state) => state.connect);

  useEffect(() => connectSettings(), [connectSettings]);
  useEffect(() => connectTimer(), [connectTimer]);
  useEffect(() => connectTasks(), [connectTasks]);
  useEffect(() => connectRoutines(), [connectRoutines]);
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
