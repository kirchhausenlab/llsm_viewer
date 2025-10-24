console.log('Running all tests...');

await import('./volumeProcessing.test.ts');
await import('./serialization.test.ts');
await import('./collaborationServer.test.ts');
await import('./volumeViewerCollaboration.test.ts');

