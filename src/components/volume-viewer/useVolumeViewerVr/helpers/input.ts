import type { MutableRefObject } from 'react';

import {
  createControllerEntryConfigurator,
  createControllerRayUpdater,
  type ControllerInputDependencies,
  type ControllerRayDependencies,
} from '../../vr/input';

export type CreateInputHelpersParams = {
  controllerDeps: ControllerInputDependencies;
  rayDeps: ControllerRayDependencies;
  updateControllerRaysRef: MutableRefObject<() => void>;
};

export type CreateInputHelpersResult = {
  configureControllerEntry: ReturnType<typeof createControllerEntryConfigurator>;
  updateControllerRays: ReturnType<typeof createControllerRayUpdater>;
};

export function createInputHelpers({
  controllerDeps,
  rayDeps,
  updateControllerRaysRef,
}: CreateInputHelpersParams): CreateInputHelpersResult {
  const configureControllerEntry = createControllerEntryConfigurator(controllerDeps);
  const updateControllerRays = createControllerRayUpdater(rayDeps);
  updateControllerRaysRef.current = updateControllerRays;
  return {
    configureControllerEntry,
    updateControllerRays,
  };
}
