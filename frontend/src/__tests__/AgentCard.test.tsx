/**
 * AgentCard component tests — React Testing Library
 * UX Spec §6.2, §6.3
 * AC-FLOOR-01, AC-FLOOR-04, AC-A11Y-02, AC-A11Y-05
 *
 * Test strategy:
 * - User-centric queries: getByRole, getByText
 * - No internal state or implementation detail testing
 * - Keyboard activation tests cover AC-A11Y-05
 * - Status badge variant tests cover AC-A11Y-02 (text + colour, not colour alone)
 */

import { describe, test, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AgentCard } from '../components/AgentCard';
import type { AgentStatus } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// FIXTURES
// ─────────────────────────────────────────────────────────────────────────────

function buildAgent(overrides: Partial<AgentStatus> = {}): AgentStatus {
  return {
    id: 'clawdia',
    name: 'Clawdia',
    emoji: '🦞',
    state: 'active',
    currentTask: 'Reviewing the performance brief',
    summary: null,
    lastSeenAt: new Date(Date.now() - 90 * 1000).toISOString(), // 90 seconds ago
    snapshotAt: new Date().toISOString(),
    isProcessing: true,
    sessionId: 'session_test_123',
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// RENDER HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function renderCard(agent: AgentStatus, onClick = vi.fn()) {
  const user = userEvent.setup();
  const { container } = render(
    <AgentCard agent={agent} onClick={onClick} />
  );
  return { user, container, onClick };
}

// ─────────────────────────────────────────────────────────────────────────────
// TESTS
// ─────────────────────────────────────────────────────────────────────────────

describe('AgentCard', () => {
  // ── Renders agent name, emoji, status badge ──────────────────────────────────
  describe('renders agent information correctly', () => {
    test('renders the agent name', () => {
      // Arrange
      const agent = buildAgent({ name: 'Clawdia' });

      // Act
      renderCard(agent);

      // Assert
      expect(screen.getByText('Clawdia')).toBeInTheDocument();
    });

    test('renders the agent emoji', () => {
      // Arrange
      const agent = buildAgent({ emoji: '🦞', name: 'Clawdia' });

      // Act
      renderCard(agent);

      // Assert — emoji should be present in the document
      expect(screen.getByText('🦞')).toBeInTheDocument();
    });

    test('renders the current task text', () => {
      // Arrange
      const agent = buildAgent({ currentTask: 'Reviewing the performance brief' });

      // Act
      renderCard(agent);

      // Assert
      expect(screen.getByText('Reviewing the performance brief')).toBeInTheDocument();
    });

    test('renders "No active task" when currentTask is null', () => {
      // Arrange
      const agent = buildAgent({ currentTask: null });

      // Act
      renderCard(agent);

      // Assert
      expect(screen.getByText('No active task')).toBeInTheDocument();
    });

    test('renders the "Last seen" timestamp', () => {
      // Arrange
      const agent = buildAgent();

      // Act
      renderCard(agent);

      // Assert — "Last seen" prefix should be present
      expect(screen.getByText(/last seen/i)).toBeInTheDocument();
    });

    test('card has role="button" for keyboard and screen reader access', () => {
      // Arrange
      const agent = buildAgent();

      // Act
      renderCard(agent);

      // Assert
      expect(screen.getByRole('button')).toBeInTheDocument();
    });

    test('card has a descriptive aria-label including name, status, and task', () => {
      // Arrange
      const agent = buildAgent({
        name: 'Clawdia',
        state: 'active',
        currentTask: 'Reviewing the performance brief',
      });

      // Act
      renderCard(agent);

      // Assert
      const card = screen.getByRole('button');
      const ariaLabel = card.getAttribute('aria-label') ?? '';
      expect(ariaLabel).toMatch(/Clawdia/);
      expect(ariaLabel).toMatch(/Working/i); // STATUS_LABELS['active'] = 'Working'
      expect(ariaLabel).toMatch(/Reviewing the performance brief/);
    });

    test('card has tabIndex=0 for keyboard navigation', () => {
      // Arrange
      const agent = buildAgent();

      // Act
      renderCard(agent);

      // Assert
      expect(screen.getByRole('button')).toHaveAttribute('tabindex', '0');
    });
  });

  // ── Status badge renders correctly ────────────────────────────────────────────
  describe('status badge rendering', () => {
    // Testing that text AND colour convey status (AC-A11Y-02)

    test('shows "Working" text badge for active status', () => {
      // Arrange
      const agent = buildAgent({ state: 'active' });

      // Act
      renderCard(agent);

      // Assert — StatusBadge renders the label text
      expect(screen.getByText('Working')).toBeInTheDocument();
    });

    test('shows "Running" text badge for running status', () => {
      // Arrange
      const agent = buildAgent({ state: 'running' });

      // Act
      renderCard(agent);

      // Assert
      expect(screen.getByText('Running')).toBeInTheDocument();
    });

    test('shows "Idle" text badge for idle status', () => {
      // Arrange
      const agent = buildAgent({ state: 'idle' });

      // Act
      renderCard(agent);

      // Assert
      expect(screen.getByText('Idle')).toBeInTheDocument();
    });

    test('shows "Error" text badge for error status', () => {
      // Arrange
      const agent = buildAgent({ state: 'error' });

      // Act
      renderCard(agent);

      // Assert
      expect(screen.getByText('Error')).toBeInTheDocument();
    });

    test('shows "Offline" text badge for offline status', () => {
      // Arrange
      const agent = buildAgent({ state: 'offline' });

      // Act
      renderCard(agent);

      // Assert
      expect(screen.getByText('Offline')).toBeInTheDocument();
    });

    test('status badge has aria-label that includes "Status:"', () => {
      // Arrange — checking ARIA is correctly set (colour alone check)
      const agent = buildAgent({ state: 'active' });

      // Act
      renderCard(agent);

      // Assert — StatusBadge renders with aria-label="Status: Working"
      const badge = screen.getByLabelText(/status: working/i);
      expect(badge).toBeInTheDocument();
    });

    test('status badge for error state has aria-label "Status: Error"', () => {
      // Arrange
      const agent = buildAgent({ state: 'error' });

      // Act
      renderCard(agent);

      // Assert
      const badge = screen.getByLabelText(/status: error/i);
      expect(badge).toBeInTheDocument();
    });

    test('all five status states render correctly without throwing', () => {
      // Arrange
      const states: AgentStatus['state'][] = ['active', 'running', 'idle', 'error', 'offline'];

      // Act & Assert — no error thrown for any state
      for (const state of states) {
        expect(() => {
          const { unmount } = render(
            <AgentCard agent={buildAgent({ state })} onClick={vi.fn()} />
          );
          unmount();
        }).not.toThrow();
      }
    });
  });

  // ── Opens detail panel on click ───────────────────────────────────────────────
  describe('opens detail panel on click', () => {
    test('calls onClick when the card is clicked', async () => {
      // Arrange
      const agent = buildAgent();
      const { user, onClick } = renderCard(agent);

      // Act
      await user.click(screen.getByRole('button'));

      // Assert
      expect(onClick).toHaveBeenCalledOnce();
      expect(onClick).toHaveBeenCalledWith(agent, expect.any(Object));
    });

    test('passes the agent data to the onClick handler', async () => {
      // Arrange
      const agent = buildAgent({ name: 'Marcus', id: 'marcus' });
      const { user, onClick } = renderCard(agent);

      // Act
      await user.click(screen.getByRole('button'));

      // Assert — first argument is the agent
      const [calledAgent] = onClick.mock.calls[0];
      expect(calledAgent.id).toBe('marcus');
      expect(calledAgent.name).toBe('Marcus');
    });

    test('passes a ref object as the second argument to onClick', async () => {
      // Arrange
      const agent = buildAgent();
      const { user, onClick } = renderCard(agent);

      // Act
      await user.click(screen.getByRole('button'));

      // Assert — second argument is a React ref with a .current property
      const [, cardRef] = onClick.mock.calls[0];
      expect(cardRef).toHaveProperty('current');
    });
  });

  // ── Opens detail panel on Enter/Space key ────────────────────────────────────
  describe('keyboard activation (AC-A11Y-05)', () => {
    test('calls onClick when Enter key is pressed on the card', async () => {
      // Arrange
      const agent = buildAgent();
      const { user, onClick } = renderCard(agent);

      // Act — focus the card and press Enter
      const card = screen.getByRole('button');
      await user.click(card); // click to focus first

      // Reset so we can test Enter independently
      onClick.mockReset();
      card.focus();
      await user.keyboard('{Enter}');

      // Assert
      expect(onClick).toHaveBeenCalledOnce();
    });

    test('calls onClick when Space key is pressed on the card', async () => {
      // Arrange
      const agent = buildAgent();
      const { user, onClick } = renderCard(agent);

      // Act — focus the card and press Space
      const card = screen.getByRole('button');
      card.focus();
      await user.keyboard(' ');

      // Assert
      expect(onClick).toHaveBeenCalledOnce();
    });

    test('does NOT call onClick when other keys are pressed (e.g. Escape)', async () => {
      // Arrange
      const agent = buildAgent();
      const { user, onClick } = renderCard(agent);

      // Act
      const card = screen.getByRole('button');
      card.focus();
      await user.keyboard('{Escape}');

      // Assert
      expect(onClick).not.toHaveBeenCalled();
    });

    test('card is reachable via Tab key', async () => {
      // Arrange
      const agent = buildAgent();
      const { user } = renderCard(agent);

      // Act — Tab to the card from document body
      await user.tab();

      // Assert
      expect(screen.getByRole('button')).toHaveFocus();
    });
  });

  // ── Multiple agents in the same render ───────────────────────────────────────
  describe('renders correctly when multiple cards are present', () => {
    test('each card shows its own name when multiple cards are rendered', () => {
      // Arrange
      const agents = [
        buildAgent({ id: 'clawdia', name: 'Clawdia', emoji: '🦞' }),
        buildAgent({ id: 'marcus', name: 'Marcus', emoji: '⚙️' }),
        buildAgent({ id: 'sienna', name: 'Sienna', emoji: '🎨' }),
      ];

      // Act
      render(
        <div>
          {agents.map((a) => (
            <AgentCard key={a.id} agent={a} onClick={vi.fn()} />
          ))}
        </div>
      );

      // Assert
      expect(screen.getByText('Clawdia')).toBeInTheDocument();
      expect(screen.getByText('Marcus')).toBeInTheDocument();
      expect(screen.getByText('Sienna')).toBeInTheDocument();
    });

    test('each card shows its own emoji', () => {
      // Arrange
      const agents = [
        buildAgent({ id: 'clawdia', name: 'Clawdia', emoji: '🦞' }),
        buildAgent({ id: 'marcus', name: 'Marcus', emoji: '⚙️' }),
      ];

      // Act
      render(
        <div>
          {agents.map((a) => (
            <AgentCard key={a.id} agent={a} onClick={vi.fn()} />
          ))}
        </div>
      );

      // Assert
      expect(screen.getByText('🦞')).toBeInTheDocument();
      expect(screen.getByText('⚙️')).toBeInTheDocument();
    });

    test('clicking one card calls its own onClick, not the other', async () => {
      // Arrange
      const user = userEvent.setup();
      const onClick1 = vi.fn();
      const onClick2 = vi.fn();
      const agents = [
        buildAgent({ id: 'clawdia', name: 'Clawdia' }),
        buildAgent({ id: 'marcus', name: 'Marcus' }),
      ];

      render(
        <div>
          <AgentCard agent={agents[0]} onClick={onClick1} />
          <AgentCard agent={agents[1]} onClick={onClick2} />
        </div>
      );

      // Act — click the second card
      const [, secondCard] = screen.getAllByRole('button');
      await user.click(secondCard);

      // Assert
      expect(onClick1).not.toHaveBeenCalled();
      expect(onClick2).toHaveBeenCalledOnce();
    });
  });
});
