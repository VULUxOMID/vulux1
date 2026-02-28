export interface Track {
  id: string;
  title: string;
  artist: string;
  artwork: string;
  duration: number;
  url: string;
  lyrics?: string;
}

export interface Playlist {
  id: string;
  title: string;
  description: string;
  cover: string;
  tracks: string[];
}

export interface Artist {
  id: string;
  name: string;
  bio: string;
  image: string;
}

export interface MusicGenre {
  id: string;
  title: string;
  subtitle: string;
  image: string;
  gradient: [string, string];
}
