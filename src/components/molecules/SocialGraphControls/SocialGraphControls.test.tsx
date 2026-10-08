import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { trackPulseEvent } from '@/libs/observability/pulse';
import { SocialGraphControls } from './SocialGraphControls';

vi.mock('@/libs/observability/pulse', () => ({ trackPulseEvent: vi.fn() }));

const props = {
  onZoomIn: vi.fn(),
  onZoomOut: vi.fn(),
  timeMachineOn: false,
  timeMachineAvailable: true,
  onToggleTimeMachine: vi.fn(),
  onRecenterSelf: vi.fn(),
  isFullscreen: false,
  onToggleFullscreen: vi.fn(),
};

describe('SocialGraphControls', () => {
  it('wires the design pill row: zoom, time machine, recenter', () => {
    render(<SocialGraphControls {...props} advancedContent={<div data-testid="advanced-body" />} />);

    fireEvent.click(document.querySelector('[data-cy="graph-zoom-in"]')!);
    expect(props.onZoomIn).toHaveBeenCalled();
    fireEvent.click(document.querySelector('[data-cy="graph-zoom-out"]')!);
    expect(props.onZoomOut).toHaveBeenCalled();
    fireEvent.click(document.querySelector('[data-cy="graph-time-toggle"]')!);
    expect(props.onToggleTimeMachine).toHaveBeenCalled();
    fireEvent.click(document.querySelector('[data-cy="graph-recenter"]')!);
    expect(props.onRecenterSelf).toHaveBeenCalled();
    // Advanced pill exists when content is provided
    expect(document.querySelector('[data-cy="graph-advanced"]')).toBeInTheDocument();
  });

  it('hides recenter when signed out and disables the time machine without timestamps', () => {
    const { rerender } = render(<SocialGraphControls {...props} onRecenterSelf={undefined} />);
    expect(document.querySelector('[data-cy="graph-recenter"]')).toBeNull();
    expect(document.querySelector('[data-cy="graph-advanced"]')).toBeNull();

    rerender(<SocialGraphControls {...props} onRecenterSelf={undefined} timeMachineAvailable={false} />);
    expect(document.querySelector('[data-cy="graph-time-toggle"]')).toBeDisabled();
  });

  it('marks the time machine pill active', () => {
    render(<SocialGraphControls {...props} timeMachineOn />);
    expect(document.querySelector('[data-cy="graph-time-toggle"]')).toHaveAttribute('aria-pressed', 'true');
  });

  it('toggles fullscreen from the right-most pill', () => {
    const onToggleFullscreen = vi.fn();
    const { rerender } = render(
      <SocialGraphControls {...props} advancedContent={<div />} onToggleFullscreen={onToggleFullscreen} />,
    );
    const pill = document.querySelector('[data-cy="graph-fullscreen"]')!;
    // Last in the row, after the advanced popover trigger
    expect(document.querySelector('[data-cy="graph-controls"]')!.lastElementChild).toBe(pill);
    expect(pill).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(pill);
    expect(onToggleFullscreen).toHaveBeenCalled();

    rerender(
      <SocialGraphControls {...props} advancedContent={<div />} onToggleFullscreen={onToggleFullscreen} isFullscreen />,
    );
    expect(document.querySelector('[data-cy="graph-fullscreen"]')).toHaveAttribute('aria-pressed', 'true');
  });

  it('reports pill usage to Pulse, but not zoom clicks', () => {
    vi.mocked(trackPulseEvent).mockClear();
    render(<SocialGraphControls {...props} timeMachineOn isFullscreen={false} />);

    fireEvent.click(document.querySelector('[data-cy="graph-zoom-in"]')!);
    fireEvent.click(document.querySelector('[data-cy="graph-time-toggle"]')!);
    fireEvent.click(document.querySelector('[data-cy="graph-recenter"]')!);
    fireEvent.click(document.querySelector('[data-cy="graph-fullscreen"]')!);

    expect(vi.mocked(trackPulseEvent).mock.calls).toEqual([
      ['graph_control_used', { control: 'time_machine', enabled: false }],
      ['graph_control_used', { control: 'recenter' }],
      ['graph_control_used', { control: 'fullscreen', enabled: true }],
    ]);
  });
});
