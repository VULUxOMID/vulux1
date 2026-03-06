import { spacetimedb } from './schema';
export * from './reducers'; // auto-register and expose reducers
export {
  publicProfileSummary,
  publicLeaderboard,
  publicLiveDiscovery,
  eventMetricsOverview,
  myAccountState,
  myWalletBalance,
  myWalletTransactions,
  myProfile,
  mySubmittedReports,
  myNotifications,
  myFriendships,
  myConversations,
  myConversationMessages,
  myIdentity,
  myRoles,
} from './schema';

// Export the initialized schema
export default spacetimedb;

export const init = spacetimedb.init((_ctx) => {
  console.info('Vulu SpacetimeDB Module Initialized');
});

export const onConnect = spacetimedb.clientConnected((_ctx) => {
  console.info('Client Connected to Vulu SpacetimeDB Module');
});

export const onDisconnect = spacetimedb.clientDisconnected((_ctx) => {
  console.info('Client Disconnected from Vulu SpacetimeDB Module');
});
