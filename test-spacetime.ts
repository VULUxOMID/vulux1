import { DbConnection } from './src/lib/spacetimedb';

const connection = DbConnection.builder()
  .withUri('ws://localhost:3000')
  .withDatabaseName('vulu-spacetime')
  .onConnect((conn) => {
    console.log('connected');
    const id = `cli-${Date.now()}`;
    conn.reducers
      .sendGlobalMessage({
        id,
        roomId: '',
        item: JSON.stringify({
          id,
          user: 'CLI',
          text: 'test from CLI',
          type: 'user',
          createdAt: Date.now(),
        }),
      })
      .then(() => {
        console.log('sent');
        setTimeout(() => process.exit(0), 1000);
      })
      .catch((e) => {
        console.error('error', e);
        process.exit(1);
      });
  })
  .onConnectError((_ctx, err) => { console.error('error', err); process.exit(1); })
  .build();
