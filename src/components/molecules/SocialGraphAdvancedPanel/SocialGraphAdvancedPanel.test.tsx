import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { trackPulseEvent } from '@/libs/observability/pulse';
import { SocialGraphAdvancedPanel } from './SocialGraphAdvancedPanel';

vi.mock('@/libs/observability/pulse', () => ({ trackPulseEvent: vi.fn() }));

const props = {
  declutter: false,
  onToggleDeclutter: vi.fn(),
  communitiesOn: true,
  onToggleCommunities: vi.fn(),
  edgeChipsOn: false,
  onToggleEdgeChips: vi.fn(),
  tagHubsOn: false,
  onToggleTagHubs: vi.fn(),
  physicsPaused: false,
  onTogglePhysics: vi.fn(),
  onReleasePins: vi.fn(),
  onFit: vi.fn(),
};

describe('SocialGraphAdvancedPanel', () => {
  it('toggles each lens and reports the state it switches to', () => {
    render(<SocialGraphAdvancedPanel {...props} />);

    fireEvent.click(document.querySelector('[data-cy="graph-declutter"]')!);
    fireEvent.click(document.querySelector('[data-cy="graph-communities"]')!);
    fireEvent.click(document.querySelector('[data-cy="graph-tag-hubs"]')!);

    expect(props.onToggleDeclutter).toHaveBeenCalledOnce();
    expect(props.onToggleCommunities).toHaveBeenCalledOnce();
    expect(props.onToggleTagHubs).toHaveBeenCalledOnce();
    expect(vi.mocked(trackPulseEvent).mock.calls).toEqual([
      ['graph_control_used', { control: 'declutter', enabled: true }],
      ['graph_control_used', { control: 'communities', enabled: false }],
      ['graph_control_used', { control: 'tag_hubs', enabled: true }],
    ]);
  });

  it('runs and reports the camera conveniences', () => {
    vi.mocked(trackPulseEvent).mockClear();
    render(<SocialGraphAdvancedPanel {...props} />);

    fireEvent.click(document.querySelector('[data-cy="graph-fit"]')!);
    fireEvent.click(document.querySelector('[data-cy="graph-release-pins"]')!);

    expect(props.onFit).toHaveBeenCalledOnce();
    expect(props.onReleasePins).toHaveBeenCalledOnce();
    expect(vi.mocked(trackPulseEvent).mock.calls).toEqual([
      ['graph_control_used', { control: 'fit' }],
      ['graph_control_used', { control: 'release_pins' }],
    ]);
  });
});
