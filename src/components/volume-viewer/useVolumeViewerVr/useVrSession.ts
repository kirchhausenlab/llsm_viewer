import { useEffect, useMemo } from 'react';

import { createSessionHelpers } from './helpers/session';
import type { CreateSessionHelpersParams, CreateSessionHelpersResult } from './helpers/session';

export type UseVrSessionParams = CreateSessionHelpersParams;

export function useVrSession(params: UseVrSessionParams): CreateSessionHelpersResult {
  const sessionHelpers = useMemo(() => createSessionHelpers(params), [params]);

  useEffect(() => sessionHelpers.attachSessionManager(), [
    sessionHelpers.attachSessionManager,
    sessionHelpers.sessionManager,
  ]);

  useEffect(() => sessionHelpers.attachRequestRef(), [sessionHelpers.attachRequestRef]);
  useEffect(() => sessionHelpers.attachEndRef(), [sessionHelpers.attachEndRef]);

  return sessionHelpers;
}
