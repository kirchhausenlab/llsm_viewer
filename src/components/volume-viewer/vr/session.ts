export interface RefLike<T> {
  current: T;
}

export interface SessionRegistrationHandlers {
  requestSession: () => Promise<XRSession | null>;
  endSession: () => Promise<void> | void;
}

export interface SessionManagerLike {
  requestSession: () => Promise<XRSession>;
  endSession: () => Promise<void>;
  dispose: () => void;
  installSessionEventListeners: (handlers: {
    onSessionStart: () => void;
    onSessionEnd: () => void;
  }) => () => void;
  setupControllers: (configureEntry: (...args: any[]) => void) => () => void;
}

export interface SessionLifecycleHandlers {
  onSessionStarted: () => void;
  onSessionEnded: () => void;
}

export interface SessionLifecycleParams {
  createManager: (handlers: SessionLifecycleHandlers) => SessionManagerLike;
  sessionManagerRef: RefLike<SessionManagerLike | null>;
  applySessionStartState: () => void;
  applySessionEndState: () => void;
  disposedRef: RefLike<boolean>;
  vrPropsRef: RefLike<
    | {
        onVrSessionStarted?: () => void;
        onVrSessionEnded?: () => void;
      }
    | null
  >;
}

export interface SessionLifecycleResult {
  sessionManager: SessionManagerLike;
  callOnVrSessionStarted: () => void;
  callOnVrSessionEnded: () => void;
  attachSessionManager: () => () => void;
}

export interface BindSessionRequestsParams {
  sessionManagerRef: RefLike<SessionManagerLike | null>;
  requestSessionRef: RefLike<(() => Promise<XRSession>) | null>;
  endSessionRequestRef: RefLike<(() => Promise<void> | void) | null>;
  vrPropsRef: RefLike<
    | {
        onRegisterVrSession?: (
          handlers: SessionRegistrationHandlers | null,
        ) => void;
      }
    | null
  >;
}

export interface BindSessionRequestsResult {
  requestVrSession: () => Promise<XRSession>;
  endVrSession: () => Promise<void>;
  callOnRegisterVrSession: (
    handlers: SessionRegistrationHandlers | null,
  ) => void;
  attachRequestRef: () => () => void;
  attachEndRef: () => () => void;
}

export function createSessionLifecycle({
  createManager,
  sessionManagerRef,
  applySessionStartState,
  applySessionEndState,
  disposedRef,
  vrPropsRef,
}: SessionLifecycleParams): SessionLifecycleResult {
  const callOnVrSessionStarted = () => {
    applySessionStartState();
    if (!disposedRef.current) {
      vrPropsRef.current?.onVrSessionStarted?.();
    }
  };

  const callOnVrSessionEnded = () => {
    applySessionEndState();
    if (!disposedRef.current) {
      vrPropsRef.current?.onVrSessionEnded?.();
    }
  };

  const sessionManager = createManager({
    onSessionStarted: callOnVrSessionStarted,
    onSessionEnded: callOnVrSessionEnded,
  });

  const attachSessionManager = () => {
    sessionManagerRef.current = sessionManager;
    return () => {
      if (sessionManagerRef.current === sessionManager) {
        sessionManagerRef.current = null;
      }
      sessionManager.dispose();
    };
  };

  return {
    sessionManager,
    callOnVrSessionStarted,
    callOnVrSessionEnded,
    attachSessionManager,
  };
}

export function bindSessionRequests({
  sessionManagerRef,
  requestSessionRef,
  endSessionRequestRef,
  vrPropsRef,
}: BindSessionRequestsParams): BindSessionRequestsResult {
  const requestVrSession = () => {
    const manager = sessionManagerRef.current;
    if (!manager) {
      return Promise.reject(
        new Error('VR session manager not initialized'),
      );
    }
    return manager.requestSession();
  };

  const endVrSession = () => {
    const manager = sessionManagerRef.current;
    if (!manager) {
      return Promise.resolve();
    }
    return manager.endSession();
  };

  const callOnRegisterVrSession = (
    handlers: SessionRegistrationHandlers | null,
  ) => {
    endSessionRequestRef.current = handlers?.endSession ?? null;
    vrPropsRef.current?.onRegisterVrSession?.(handlers);
  };

  const attachRequestRef = () => bindRef(requestSessionRef, requestVrSession);
  const attachEndRef = () => bindRef(endSessionRequestRef, endVrSession);

  return {
    requestVrSession,
    endVrSession,
    callOnRegisterVrSession,
    attachRequestRef,
    attachEndRef,
  };
}

function bindRef<T>(ref: RefLike<T | null>, value: T): () => void {
  ref.current = value;
  return () => {
    if (ref.current === value) {
      ref.current = null;
    }
  };
}
