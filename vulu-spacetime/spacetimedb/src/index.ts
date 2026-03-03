import { spacetimedb } from './schema';
export * from './reducers'; // auto-register and expose reducers
export {
  publicProfileSummary,
  publicLeaderboard,
  publicLiveDiscovery,
  myAccountState,
  myWalletBalance,
  myWalletTransactions,
  myProfile,
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
