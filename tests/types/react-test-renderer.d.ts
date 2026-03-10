declare module 'react-test-renderer' {
  import type { ReactElement } from 'react';

  export type ReactTestInstance = any;
  export type ReactTestRenderer = any;

  export function create(element: ReactElement): ReactTestRenderer;
  export function act(callback: () => void): void;
  export function act(callback: () => Promise<void>): Promise<void>;

  const TestRenderer: {
    create: typeof create;
  };

  export default TestRenderer;
}
