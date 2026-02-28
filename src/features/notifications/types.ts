export interface BaseNotification {
  id: string;
  createdAt: number;
  read: boolean;
}

export interface AnnouncementNotification extends BaseNotification {
  type: 'announcement';
  title: string;
  message: string;
  sourceName: string;
  priority: 'low' | 'medium' | 'high';
}

export interface FriendRequestNotification extends BaseNotification {
  type: 'friend_request';
  fromUser: {
    id: string;
    name: string;
    avatar?: string;
    level: number;
  };
  direction?: 'sent' | 'received';
  status: 'pending' | 'accepted' | 'declined';
}

export interface ProfileViewNotification extends BaseNotification {
  type: 'profile_view';
  viewer: {
    id: string;
    name: string;
    avatar?: string;
    level: number;
  };
  viewCount: number;
  lastViewed: number;
}

export interface ActivityNotification extends BaseNotification {
  type: 'activity';
  activityType: 'mention' | 'reply' | 'event' | 'money_received' | 'live_invite' | 'other';
  fromUser?: {
    id: string;
    name: string;
    avatar?: string;
  };
  message: string;
  metadata?: Record<string, any>;
  groupCount?: number;
  groupedNames?: string[];
}

export type Notification = 
  | AnnouncementNotification
  | FriendRequestNotification
  | ProfileViewNotification
  | ActivityNotification;

export interface NotificationWidgetProps {
  data: Notification[];
  onMarkRead?: (id: string) => void;
  onAction?: (type: string, id: string, action: any) => void;
}
