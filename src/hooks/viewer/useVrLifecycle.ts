import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type VrSessionHandlers = {
  requestSession: () => Promise<XRSession | null>;
  endSession: () => Promise<void> | void;
};

interface UseVrLifecycleOptions {
  onBeforeEnter?: () => void;
}

export interface UseVrLifecycleResult {
  isVrSupportChecked: boolean;
  isVrSupported: boolean;
  isVrPassthroughSupported: boolean;
  isVrActive: boolean;
  isVrRequesting: boolean;
  hasVrSessionHandlers: boolean;
  isVrAvailable: boolean;
  vrButtonLabel: string;
  enterVr: () => Promise<void>;
  exitVr: () => Promise<void>;
  registerSessionHandlers: (handlers: VrSessionHandlers | null) => void;
  handleSessionStarted: () => void;
  handleSessionEnded: () => void;
}

const DEFAULT_VR_LABEL = 'Enter VR';

const WEBXR_MODE_IMMERSIVE_VR = 'immersive-vr';
const WEBXR_MODE_IMMERSIVE_AR = 'immersive-ar';

const consoleWarn = console.warn.bind(console);
const consoleError = console.error.bind(console);

const isFunction = (value: unknown): value is (...args: unknown[]) => unknown => {
  return typeof value === 'function';
};

const toPromise = (maybePromise: Promise<void> | void) => {
  return maybePromise instanceof Promise ? maybePromise : Promise.resolve(maybePromise);
};

export const useVrLifecycle = ({
  onBeforeEnter
}: UseVrLifecycleOptions): UseVrLifecycleResult => {
  const [isVrSupported, setIsVrSupported] = useState(false);
  const [isVrPassthroughSupported, setIsVrPassthroughSupported] = useState(false);
  const [isVrSupportChecked, setIsVrSupportChecked] = useState(false);
  const [isVrActive, setIsVrActive] = useState(false);
  const [isVrRequesting, setIsVrRequesting] = useState(false);
  const [hasVrSessionHandlers, setHasVrSessionHandlers] = useState(false);

  const vrSessionControlsRef = useRef<VrSessionHandlers | null>(null);

  const registerSessionHandlers = useCallback((handlers: VrSessionHandlers | null) => {
    vrSessionControlsRef.current = handlers;
    setHasVrSessionHandlers(Boolean(handlers));
  }, []);

  const handleSessionStarted = useCallback(() => {
    setIsVrActive(true);
  }, []);

  const handleSessionEnded = useCallback(() => {
    setIsVrActive(false);
  }, []);

  const enterVr = useCallback(async () => {
    if (!isVrSupportChecked || !isVrSupported) {
      return;
    }
    const controls = vrSessionControlsRef.current;
    if (!controls) {
      return;
    }
    setIsVrRequesting(true);
    onBeforeEnter?.();
    try {
      await controls.requestSession();
    } catch (error) {
      consoleError('Failed to start VR session', error);
    } finally {
      setIsVrRequesting(false);
    }
  }, [isVrSupportChecked, isVrSupported, onBeforeEnter]);

  const exitVr = useCallback(async () => {
    const controls = vrSessionControlsRef.current;
    if (!controls) {
      return;
    }
    try {
      await toPromise(controls.endSession());
    } catch (error) {
      consoleError('Failed to end VR session', error);
    }
  }, []);

  useEffect(() => {
    let isCancelled = false;

    const markSupport = (supported: boolean, passthroughSupported: boolean) => {
      if (!isCancelled) {
        setIsVrSupported(supported);
        setIsVrPassthroughSupported(passthroughSupported);
        setIsVrSupportChecked(true);
      }
    };

    const detectVrSupport = async () => {
      if (typeof navigator === 'undefined' || !navigator.xr) {
        markSupport(false, false);
        return;
      }

      const xr = navigator.xr as {
        requestSession?: unknown;
        isSessionSupported?: unknown;
      };

      const requestSession = isFunction(xr.requestSession)
        ? (xr.requestSession as (mode: string, options?: unknown) => Promise<XRSession>)
        : null;
      const isSessionSupportedFn = isFunction(xr.isSessionSupported)
        ? (xr.isSessionSupported as (mode: string) => Promise<boolean>)
        : null;

      const hasRequestSession = Boolean(requestSession);

      if (!xr || !isSessionSupportedFn) {
        if (hasRequestSession) {
          consoleWarn('WebXR isSessionSupported unavailable; falling back to optimistic VR enablement.');
          markSupport(true, false);
        } else {
          markSupport(false, false);
        }
        return;
      }

      try {
        let immersiveVrSupported = false;
        let immersiveArSupported = false;

        try {
          immersiveVrSupported = await isSessionSupportedFn.call(navigator.xr!, WEBXR_MODE_IMMERSIVE_VR);
        } catch (error) {
          consoleWarn('Failed to detect immersive-vr support', error);
        }

        try {
          immersiveArSupported = await isSessionSupportedFn.call(navigator.xr!, WEBXR_MODE_IMMERSIVE_AR);
        } catch (error) {
          consoleWarn('Failed to detect immersive-ar support', error);
        }

        if (immersiveVrSupported || immersiveArSupported) {
          markSupport(true, immersiveArSupported);
          return;
        }

        if (hasRequestSession) {
          consoleWarn(
            'WebXR immersive session probe reported unsupported; falling back to optimistic VR enablement.'
          );
          markSupport(true, immersiveArSupported);
        } else {
          markSupport(false, immersiveArSupported);
        }
      } catch (error) {
        consoleWarn('Failed to detect WebXR support', error);
        if (hasRequestSession) {
          markSupport(true, false);
        } else {
          markSupport(false, false);
        }
      }
    };

    void detectVrSupport();

    return () => {
      isCancelled = true;
    };
  }, []);

  const vrButtonLabel = useMemo(() => {
    if (isVrActive) {
      return 'Exit VR';
    }
    if (isVrRequesting) {
      return 'Entering VR…';
    }
    return DEFAULT_VR_LABEL;
  }, [isVrActive, isVrRequesting]);

  const isVrAvailable = useMemo(() => {
    return isVrSupportChecked && isVrSupported;
  }, [isVrSupportChecked, isVrSupported]);

  return {
    isVrSupportChecked,
    isVrSupported,
    isVrPassthroughSupported,
    isVrActive,
    isVrRequesting,
    hasVrSessionHandlers,
    isVrAvailable,
    vrButtonLabel,
    enterVr,
    exitVr,
    registerSessionHandlers,
    handleSessionStarted,
    handleSessionEnded
  };
};

export default useVrLifecycle;
