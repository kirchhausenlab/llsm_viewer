import { useCallback, useEffect, useMemo } from 'react';

import type { Dispatch, SetStateAction } from 'react';

import { createInputHelpers } from './helpers/input';
import type { CreateInputHelpersParams } from './helpers/input';
import type { CreateSessionHelpersResult } from './helpers/session';

type UseVrControllersParams = CreateInputHelpersParams & {
  sessionHelpers: Pick<
    CreateSessionHelpersResult,
    'applySessionStartState' | 'applySessionEndState' | 'sessionManager'
  >;
  controllerSetupRevision: number;
  setControllerSetupRevision: Dispatch<SetStateAction<number>>;
};

export function useVrControllers({
  controllerDeps,
  rayDeps,
  updateControllerRaysRef,
  sessionHelpers,
  controllerSetupRevision,
  setControllerSetupRevision,
}: UseVrControllersParams) {
  const inputHelpers = useMemo(
    () => createInputHelpers({ controllerDeps, rayDeps, updateControllerRaysRef }),
    [controllerDeps, rayDeps, updateControllerRaysRef],
  );

  const onRendererInitialized = useCallback(() => {
    setControllerSetupRevision((revision) => revision + 1);
  }, [setControllerSetupRevision]);

  useEffect(() => {
    if (controllerSetupRevision === 0) {
      return;
    }
    return sessionHelpers.sessionManager.installSessionEventListeners({
      onSessionStart: sessionHelpers.applySessionStartState,
      onSessionEnd: sessionHelpers.applySessionEndState,
    });
  }, [
    controllerSetupRevision,
    sessionHelpers.applySessionEndState,
    sessionHelpers.applySessionStartState,
    sessionHelpers.sessionManager,
  ]);

  useEffect(() => {
    if (controllerSetupRevision === 0) {
      return;
    }
    return sessionHelpers.sessionManager.setupControllers(inputHelpers.configureControllerEntry);
  }, [controllerSetupRevision, inputHelpers.configureControllerEntry, sessionHelpers.sessionManager]);

  return {
    ...inputHelpers,
    onRendererInitialized,
  };
}
