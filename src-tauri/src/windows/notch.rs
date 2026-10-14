//! Notch: janela pequena, sem moldura e sempre no topo, colada ao centro de
//! uma borda do monitor principal (superior, esquerda ou direita).
//!
//! A janela tem sempre o tamanho exato do que está visível — recolhida,
//! expandida ou compacta —, de modo que não captura cliques fora da sua área.

use std::sync::{Mutex, PoisonError};

use serde::Deserialize;
use tauri::{AppHandle, Manager, PhysicalPosition, PhysicalSize};

use super::NOTCH;
use crate::settings::{NotchPosition, NotchSettings};

/// O que o notch está mostrando; determina o tamanho da janela.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Layout {
    /// Só o puxador.
    #[default]
    Collapsed,
    /// Uma aba de conteúdo com o player compacto ao lado.
    Expanded,
    /// Só o player de música (aba Música), menor.
    Compact,
}

/// Tamanho da janela, em pixels lógicos, medido em relação à borda:
/// `along` acompanha a borda e `depth` avança para dentro da tela. Inclui as
/// abas curvas que ligam o notch à borda. Os valores são espelhados em
/// `src/notch/shape.ts`, que desenha a forma.
#[derive(Debug, Clone, Copy, PartialEq)]
struct EdgeSize {
    along: f64,
    depth: f64,
}

fn edge_size(position: NotchPosition, layout: Layout) -> EdgeSize {
    let side = position != NotchPosition::Top;
    let (along, depth) = match (layout, side) {
        (Layout::Collapsed, _) => (148.0, 12.0),
        (Layout::Expanded, false) => (628.0, 216.0),
        (Layout::Compact, false) => (428.0, 216.0),
        (Layout::Expanded, true) => (428.0, 260.0),
        (Layout::Compact, true) => (388.0, 260.0),
    };
    EdgeSize { along, depth }
}

/// Área do monitor principal, em pixels físicos.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct MonitorArea {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub scale_factor: f64,
}

/// Retângulo da janela do notch, em pixels físicos.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Geometry {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

/// Onde o notch deve ficar: colado à borda escolhida e centralizado nela.
pub fn geometry(monitor: MonitorArea, position: NotchPosition, layout: Layout) -> Geometry {
    let size = edge_size(position, layout);
    let to_physical = |logical: f64| (logical * monitor.scale_factor).round().max(1.0) as u32;
    let centered =
        |origin: i32, available: u32, used: u32| origin + ((available - used) / 2) as i32;

    match position {
        NotchPosition::Top => {
            let width = to_physical(size.along).min(monitor.width);
            let height = to_physical(size.depth).min(monitor.height);
            Geometry {
                x: centered(monitor.x, monitor.width, width),
                y: monitor.y,
                width,
                height,
            }
        }
        NotchPosition::Left | NotchPosition::Right => {
            let width = to_physical(size.depth).min(monitor.width);
            let height = to_physical(size.along).min(monitor.height);
            let x = if position == NotchPosition::Left {
                monitor.x
            } else {
                monitor.x + (monitor.width - width) as i32
            };
            Geometry {
                x,
                y: centered(monitor.y, monitor.height, height),
                width,
                height,
            }
        }
    }
}

/// Estado do notch, registrado como estado do Tauri.
#[derive(Default)]
pub struct NotchState {
    layout: Mutex<Layout>,
    position: Mutex<NotchPosition>,
}

fn read<T: Copy>(value: &Mutex<T>) -> T {
    *value.lock().unwrap_or_else(PoisonError::into_inner)
}

fn write<T>(value: &Mutex<T>, new: T) {
    *value.lock().unwrap_or_else(PoisonError::into_inner) = new;
}

/// Reposiciona e redimensiona a janela conforme o monitor principal atual.
/// Não faz nada se ela já estiver no lugar — é seguro chamar a cada evento
/// de movimento sem entrar em laço.
pub fn apply(app: &AppHandle) -> tauri::Result<()> {
    let Some(window) = app.get_webview_window(NOTCH) else {
        return Ok(());
    };
    let Some(monitor) = app.primary_monitor()? else {
        return Ok(());
    };
    let state = app.state::<NotchState>();
    let target = geometry(
        MonitorArea {
            x: monitor.position().x,
            y: monitor.position().y,
            width: monitor.size().width,
            height: monitor.size().height,
            scale_factor: monitor.scale_factor(),
        },
        read(&state.position),
        read(&state.layout),
    );

    let size = PhysicalSize::new(target.width, target.height);
    let position = PhysicalPosition::new(target.x, target.y);
    if window.outer_size()? != size {
        window.set_size(size)?;
    }
    if window.outer_position()? != position {
        window.set_position(position)?;
    }
    Ok(())
}

pub fn set_layout(app: &AppHandle, layout: Layout) -> tauri::Result<()> {
    write(&app.state::<NotchState>().layout, layout);
    apply(app)
}

/// Aplica as configurações do notch: borda, e se ele aparece ou não. Trocar
/// de borda o recolhe, pois o tamanho expandido depende da borda.
pub fn configure(app: &AppHandle, settings: NotchSettings) -> tauri::Result<()> {
    let Some(window) = app.get_webview_window(NOTCH) else {
        return Ok(());
    };
    let state = app.state::<NotchState>();
    let moved = read(&state.position) != settings.position;
    write(&state.position, settings.position);

    if !settings.enabled {
        return window.hide();
    }
    if moved || !window.is_visible()? {
        write(&state.layout, Layout::Collapsed);
    }
    apply(app)?;
    window.show()
}

#[cfg(test)]
mod tests {
    use super::*;
    use Layout::{Collapsed, Compact, Expanded};
    use NotchPosition::{Left, Right, Top};

    fn monitor(x: i32, y: i32, width: u32, height: u32, scale_factor: f64) -> MonitorArea {
        MonitorArea {
            x,
            y,
            width,
            height,
            scale_factor,
        }
    }

    const FULL_HD: MonitorArea = MonitorArea {
        x: 0,
        y: 0,
        width: 1920,
        height: 1080,
        scale_factor: 1.0,
    };

    fn center_x(g: Geometry) -> i32 {
        g.x + g.width as i32 / 2
    }

    fn center_y(g: Geometry) -> i32 {
        g.y + g.height as i32 / 2
    }

    #[test]
    fn at_the_top_it_is_centered_and_touches_the_top_edge() {
        let g = geometry(FULL_HD, Top, Collapsed);

        assert_eq!(
            g,
            Geometry {
                x: 886,
                y: 0,
                width: 148,
                height: 12
            }
        );
        assert_eq!(center_x(g), 960);
    }

    #[test]
    fn on_the_left_it_is_vertically_centered_and_touches_the_left_edge() {
        let g = geometry(FULL_HD, Left, Collapsed);

        assert_eq!(
            g,
            Geometry {
                x: 0,
                y: 466,
                width: 12,
                height: 148
            }
        );
        assert_eq!(center_y(g), 540);
    }

    #[test]
    fn on_the_right_it_touches_the_right_edge() {
        for layout in [Collapsed, Compact, Expanded] {
            let g = geometry(FULL_HD, Right, layout);

            assert_eq!(g.x + g.width as i32, 1920);
            assert_eq!(center_y(g), 540);
        }
    }

    #[test]
    fn every_layout_keeps_the_same_center_on_every_edge() {
        for position in [Top, Left, Right] {
            let collapsed = geometry(FULL_HD, position, Collapsed);
            for layout in [Compact, Expanded] {
                let open = geometry(FULL_HD, position, layout);

                if position == Top {
                    assert_eq!(center_x(collapsed), center_x(open));
                    assert_eq!(open.y, 0);
                } else {
                    assert_eq!(center_y(collapsed), center_y(open));
                }
            }
        }
    }

    #[test]
    fn sizes_depend_on_the_edge_and_on_what_is_shown() {
        let size = |position, layout| {
            let g = geometry(FULL_HD, position, layout);
            (g.width, g.height)
        };

        assert_eq!(size(Top, Expanded), (628, 216));
        assert_eq!(size(Top, Compact), (428, 216));
        assert_eq!(size(Left, Expanded), (260, 428));
        assert_eq!(size(Left, Compact), (260, 388));
    }

    #[test]
    fn the_music_only_layout_is_smaller_than_the_full_one() {
        for position in [Top, Left, Right] {
            let compact = geometry(FULL_HD, position, Compact);
            let expanded = geometry(FULL_HD, position, Expanded);

            assert!(compact.width * compact.height < expanded.width * expanded.height);
        }
    }

    #[test]
    fn sizes_follow_the_dpi_scale() {
        let g = geometry(monitor(0, 0, 2880, 1620, 1.5), Top, Expanded);

        assert_eq!((g.width, g.height), (942, 324));
        assert_eq!(center_x(g), 1440);
    }

    #[test]
    fn fractional_scales_round_to_whole_pixels() {
        let g = geometry(monitor(0, 0, 2400, 1350, 1.25), Top, Collapsed);

        assert_eq!((g.width, g.height), (185, 15));
    }

    #[test]
    fn the_primary_monitor_may_not_start_at_the_origin() {
        // Monitor principal à esquerda de outro, e mais abaixo.
        let area = monitor(-2560, 120, 2560, 1440, 1.0);

        let top = geometry(area, Top, Collapsed);
        let right = geometry(area, Right, Collapsed);

        assert_eq!((top.x, top.y), (-2560 + 1206, 120));
        assert_eq!(right.x + right.width as i32, 0);
        assert_eq!(center_y(right), 120 + 720);
    }

    #[test]
    fn the_notch_never_exceeds_a_very_small_monitor() {
        let tiny = monitor(0, 0, 200, 150, 1.0);

        let top = geometry(tiny, Top, Expanded);
        let side = geometry(tiny, Left, Expanded);

        assert_eq!((top.x, top.width, top.height), (0, 200, 150));
        assert_eq!((side.y, side.width, side.height), (0, 200, 150));
    }

    #[test]
    fn layouts_deserialize_from_the_frontend_names() {
        let parse = |text: &str| serde_json::from_str::<Layout>(text).unwrap();

        assert_eq!(parse(r#""collapsed""#), Collapsed);
        assert_eq!(parse(r#""expanded""#), Expanded);
        assert_eq!(parse(r#""compact""#), Compact);
    }
}
