export type LeaderboardItem = {
  id: string;
  rank: number;
  displayName: string;
  username: string;
  avatarUrl: string;
  cashAmount: number;
  isCurrentUser?: boolean;
  isFriend?: boolean;
};
