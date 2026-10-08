import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { HideableClass } from '@/hooks/useSocialGraph/useSocialGraph.types';
import { trackPulseEvent } from '@/libs/observability/pulse';
import { SocialGraphLegend } from './SocialGraphLegend';

vi.mock('@/libs/observability/pulse', () => ({ trackPulseEvent: vi.fn() }));

const props = {
  classCounts: new Map<HideableClass, number>([
    ['self', 1],
    ['friend', 8],
    ['post', 10],
  ]),
  hiddenClasses: new Set<HideableClass>(['post']),
  onHoverClass: vi.fn(),
  onToggleClass: vi.fn(),
};

describe('SocialGraphLegend', () => {
  it('shows live counts, spotlights on hover, and toggles on click', () => {
    render(<SocialGraphLegend {...props} />);

    // Counts render next to their rows
    expect(screen.getByText('8')).toBeInTheDocument();

    fireEvent.mouseEnter(document.querySelector('[data-cy="graph-legend-friend"]')!);
    expect(props.onHoverClass).toHaveBeenCalledWith('friend');

    fireEvent.click(document.querySelector('[data-cy="graph-legend-friend"]')!);
    expect(props.onToggleClass).toHaveBeenCalledWith('friend');

    // Hidden classes read as off
    expect(document.querySelector('[data-cy="graph-legend-post"]')).toHaveAttribute('aria-pressed', 'false');
  });

  it('hides edge rows by default', () => {
    render(<SocialGraphLegend {...props} />);
    expect(document.querySelector('[data-cy="graph-legend-edge-fresh"]')).toBeNull();
    expect(document.querySelector('[data-cy="graph-legend-edge-intra"]')).toBeNull();
  });

  it('shows edge rows per mode and spotlights matching edges on hover', () => {
    const onHoverEdges = vi.fn();
    render(<SocialGraphLegend {...props} showRecency communitiesOn onHoverEdges={onHoverEdges} />);

    fireEvent.mouseEnter(document.querySelector('[data-cy="graph-legend-edge-fresh"]')!);
    expect(onHoverEdges).toHaveBeenCalledWith('fresh');
    fireEvent.mouseEnter(document.querySelector('[data-cy="graph-legend-edge-intra"]')!);
    expect(onHoverEdges).toHaveBeenCalledWith('intra');
    fireEvent.mouseEnter(document.querySelector('[data-cy="graph-legend-edge-bridge"]')!);
    expect(onHoverEdges).toHaveBeenCalledWith('bridge');

    // Leaving the legend clears the edge spotlight too
    fireEvent.mouseLeave(document.querySelector('[data-cy="graph-legend"]')!);
    expect(onHoverEdges).toHaveBeenLastCalledWith(null);
  });

  it('reports each class toggle with the visibility it leads to', () => {
    vi.mocked(trackPulseEvent).mockClear();
    render(<SocialGraphLegend {...props} />);

    fireEvent.click(document.querySelector('[data-cy="graph-legend-friend"]')!);
    fireEvent.click(document.querySelector('[data-cy="graph-legend-post"]')!);

    expect(vi.mocked(trackPulseEvent).mock.calls).toEqual([
      ['graph_control_used', { control: 'legend', legend_class: 'friend', enabled: false }],
      ['graph_control_used', { control: 'legend', legend_class: 'post', enabled: true }],
    ]);
  });
});
