import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

import { App } from '@/app/App';
import { backgroundImageUrl } from '@/app/background';
import { applyTemplate, readTemplateHint } from '@/app/templates';
import { useSettingsStore } from '@/stores/settings';

// Sem o runtime do Tauri (jsdom), o app usa os padrões e salva só em memória.

afterEach(() => {
  useSettingsStore.setState(useSettingsStore.getInitialState(), true);
});

describe('App', () => {
  it('abre no dashboard com a navegação principal', () => {
    render(<App />);

    expect(screen.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument();

    const nav = screen.getByRole('navigation', { name: 'Navegação principal' });
    const labels = within(nav)
      .getAllByRole('button')
      .map((button) => button.getAttribute('aria-label'));
    expect(labels).toEqual(['Dashboard', 'Pomodoro', 'Kanban', 'Configurações']);
    expect(within(nav).getByRole('button', { name: 'Dashboard' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('troca de tela ao usar a navegação', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'Kanban' }));

    expect(screen.getByRole('heading', { level: 1, name: 'Kanban' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Kanban' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: 'Dashboard' })).not.toHaveAttribute('aria-current');
  });

  it('não exibe números fictícios no dashboard', () => {
    render(<App />);

    for (const label of ['Pomodoros concluídos', 'Tempo de foco', 'Tarefas concluídas']) {
      expect(within(screen.getByRole('region', { name: label })).getByText('—')).toBeVisible();
    }
  });

  // Depende de existir ou não um arquivo src/assets/background.*, que é do usuário.
  it('usa a imagem de fundo fornecida ou, sem ela, o gradiente de fallback', () => {
    render(<App />);

    const background = screen.getByTestId('app-background');
    if (backgroundImageUrl === undefined) {
      expect(background).toHaveClass('app-background-fallback');
    } else {
      expect(background).not.toHaveClass('app-background-fallback');
      expect(background.style.backgroundImage).toContain(backgroundImageUrl);
    }
  });

  it('informa que a versão só existe dentro do app desktop', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'Configurações' }));

    expect(screen.getByText('Disponível apenas dentro do aplicativo desktop.')).toBeVisible();
  });
});

describe('templates de estilização', () => {
  it('começa no template Vidro', () => {
    render(<App />);

    expect(document.documentElement.dataset.template).toBe('glass');
  });

  it('aplica o template Matriz escolhido nas configurações', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'Configurações' }));
    await user.click(screen.getByRole('radio', { name: /Matriz/ }));

    expect(screen.getByRole('radio', { name: /Matriz/ })).toBeChecked();
    expect(document.documentElement.dataset.template).toBe('matrix');
    expect(useSettingsStore.getState().settings.appearance.template).toBe('matrix');
  });

  it('desenha os indicadores em matriz de pontos, ainda sem números', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Configurações' }));
    await user.click(screen.getByRole('radio', { name: /Matriz/ }));

    await user.click(screen.getByRole('button', { name: 'Dashboard' }));

    const indicator = screen.getByRole('region', { name: 'Tempo de foco' });
    expect(within(indicator).getByRole('img', { name: 'Sem dados' })).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: 'Nenhum pomodoro concluído nesta semana' }),
    ).toBeInTheDocument();
  });

  it('guarda o template aplicado como dica para a próxima abertura', () => {
    expect(readTemplateHint()).toBe('glass');

    applyTemplate('matrix');

    expect(readTemplateHint()).toBe('matrix');
  });

  it('ignora uma dica com valor desconhecido', () => {
    localStorage.setItem('compasso.template', 'neon');

    expect(readTemplateHint()).toBe('glass');
  });
});

describe('configurações do timer', () => {
  async function openSettings() {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Configurações' }));
    return user;
  }

  it('mostra os padrões do Pomodoro', async () => {
    await openSettings();

    expect(screen.getByRole('spinbutton', { name: 'Foco' })).toHaveValue(25);
    expect(screen.getByRole('spinbutton', { name: 'Pausa curta' })).toHaveValue(5);
    expect(screen.getByRole('spinbutton', { name: 'Pausa longa' })).toHaveValue(15);
    expect(screen.getByRole('spinbutton', { name: 'Ciclos até a pausa longa' })).toHaveValue(4);
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeDisabled();
  });

  it('salva valores válidos', async () => {
    const user = await openSettings();

    const focus = screen.getByRole('spinbutton', { name: 'Foco' });
    await user.clear(focus);
    await user.type(focus, '50');
    await user.click(screen.getByRole('checkbox', { name: 'Iniciar as pausas automaticamente' }));
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Configurações salvas.');
    expect(useSettingsStore.getState().settings.timer).toMatchObject({
      focusMinutes: 50,
      autoStartBreaks: true,
    });
    expect(screen.getByRole('spinbutton', { name: 'Foco' })).toHaveValue(50);
  });

  it('recusa valores fora dos limites sem salvar', async () => {
    const user = await openSettings();

    const focus = screen.getByRole('spinbutton', { name: 'Foco' });
    await user.clear(focus);
    await user.type(focus, '0');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(screen.getByText('Use um valor entre 1 e 180.')).toBeVisible();
    expect(screen.getByRole('spinbutton', { name: 'Foco' })).toBeInvalid();
    expect(useSettingsStore.getState().settings.timer.focusMinutes).toBe(25);
  });

  it('recusa campo vazio', async () => {
    const user = await openSettings();

    await user.clear(screen.getByRole('spinbutton', { name: 'Pausa curta' }));
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(screen.getByText('Informe um número inteiro.')).toBeVisible();
    expect(useSettingsStore.getState().settings.timer.shortBreakMinutes).toBe(5);
  });
});

describe('configurações do notch e dos avisos', () => {
  async function openSettings() {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Configurações' }));
    return user;
  }

  it('escolhe a posição do notch', async () => {
    const user = await openSettings();
    const position = screen.getByRole('combobox', { name: 'Posição' });
    expect(position).toHaveTextContent('Topo');

    await user.click(position);
    await user.click(await screen.findByRole('option', { name: 'Lateral direita' }));

    expect(useSettingsStore.getState().settings.notch.position).toBe('right');
    expect(screen.getByRole('combobox', { name: 'Posição' })).toHaveTextContent('Lateral direita');
  });

  it('desativa o notch e, com ele, a escolha da posição', async () => {
    const user = await openSettings();

    await user.click(
      screen.getByRole('checkbox', { name: 'Mostrar o notch no monitor principal' }),
    );

    expect(useSettingsStore.getState().settings.notch.enabled).toBe(false);
    expect(screen.getByRole('combobox', { name: 'Posição' })).toBeDisabled();
  });

  it('liga e desliga som e notificação separadamente', async () => {
    const user = await openSettings();
    const sound = screen.getByRole('checkbox', { name: 'Tocar um som' });
    const notification = screen.getByRole('checkbox', {
      name: 'Mostrar uma notificação do Windows',
    });
    expect(sound).toBeChecked();
    expect(notification).toBeChecked();

    await user.click(sound);

    expect(useSettingsStore.getState().settings.alerts).toEqual({
      soundEnabled: false,
      notificationsEnabled: true,
    });
    expect(screen.getByRole('checkbox', { name: 'Tocar um som' })).not.toBeChecked();
  });
});
