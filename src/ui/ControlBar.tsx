import { useEngineStore } from '../state/engine';
import { useLayout, useUiStore } from '../state/ui';
import { BrakeButton, EngineButton, GateDiagram, MoreButton, MorePanel, Readout, ShiftButton, ThrottleButton } from './EngineControls';
import { ExplodeButton } from './ExplodeButton';
import { FlowToggle, XrayToggle } from './XrayToggle';

/**
 * The controls, laid out per screen (phone-first):
 * - desktop: one slim bar along the bottom: Explode, X-ray, and while the engine runs Stop,
 *   tach / boost / gear / km/h, − gate +, brake, throttle and "more" (display speed, cylinder,
 *   volume) in a card above;
 * - portrait phone: one compact bottom bar; while driving it holds Stop, brake, − / + and the
 *   throttle (Explode, X-ray and the gate move into the bottom sheet), gauges at the top centre;
 * - landscape phone (driving layout): a small row at the bottom centre, the throttle under
 *   the right thumb with + above it, the brake under the left with − above it, gauges small at
 *   the top centre; the 3D view gets everything else.
 * "Driving controls" (in "more") folds it all back to Start / Stop.
 */
export function ControlBar() {
  const layout = useLayout();
  const running = useEngineStore((s) => s.engineRunning);
  const compact = useUiStore((s) => s.compact);
  const driving = running && !compact;
  const phone = layout !== 'desktop';

  const viewing = (
    <>
      <MoreButton />
      <ExplodeButton />
      <XrayToggle />
      <FlowToggle />
      <EngineButton />
    </>
  );

  return (
    <>
      {layout === 'desktop' ? (
        <div className="bar" data-occludes="">
          <ExplodeButton />
          <XrayToggle />
          <FlowToggle />
          <div className="bar__engine" data-running={running || undefined}>
            <EngineButton />
            {driving && (
              <>
                <Readout variant="bar" />
                <ShiftButton dir={-1} />
                <GateDiagram compact />
                <ShiftButton dir={1} />
                <BrakeButton variant="pill" />
                <ThrottleButton variant="pill" />
              </>
            )}
            <MoreButton />
          </div>
        </div>
      ) : layout === 'portrait' && driving ? (
        <div className="bar bar--drive" data-occludes="">
          <MoreButton />
          <EngineButton iconOnly />
          <BrakeButton variant="pill" />
          <ShiftButton dir={-1} />
          <ShiftButton dir={1} />
          <ThrottleButton variant="pill" />
        </div>
      ) : (
        <div className="bar" data-occludes="">
          {viewing}
        </div>
      )}
      {phone && driving && <Readout variant="hud" />}
      {layout === 'landscape' && driving && (
        <>
          <div className="thumbs thumbs--left">
            <ShiftButton dir={-1} />
            <BrakeButton variant="thumb" />
          </div>
          <div className="thumbs thumbs--right">
            <ShiftButton dir={1} />
            <ThrottleButton variant="thumb" />
          </div>
        </>
      )}
      <MorePanel
        sheet={phone}
        extra={
          layout === 'portrait' && driving ? (
            <>
              <ExplodeButton />
              <XrayToggle />
              <FlowToggle />
            </>
          ) : undefined
        }
      />
    </>
  );
}
