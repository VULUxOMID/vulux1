import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors } from '../../theme';
import { toast } from '../../components/Toast';
import { ReportComposerModal } from '../reports/ReportComposerModal';
import { CURRENT_POST_USER } from './mockData';
import { sharePostLink } from './postShare';
import { usePosts } from './PostsContext';
import { usePostImageUpload } from './usePostImageUpload';
import {
  ActionSheet,
  ComposerEntry,
  EditComposerModal,
  ErrorState,
  LoadingState,
  PostCard,
  ScreenHeader,
  postsUiStyles,
} from './PostsUi';
import type { PostItem } from './types';

type FeedMode = 'hot' | 'new' | 'top' | 'saved';

function getPostCommentCount(post: PostItem) {
  return post.commentCount ?? post.comments.length;
}

function sortPosts(posts: PostItem[], mode: FeedMode) {
  const copy = [...posts];
  if (mode === 'saved') {
    return copy
      .filter((post) => post.viewerSaved)
      .sort((a, b) => b.updatedAt - a.updatedAt || b.createdAt - a.createdAt);
  }
  if (mode === 'new') {
    return copy.sort((a, b) => b.createdAt - a.createdAt || b.score - a.score);
  }
  if (mode === 'top') {
    return copy.sort(
      (a, b) => b.score - a.score || getPostCommentCount(b) - getPostCommentCount(a) || b.createdAt - a.createdAt,
    );
  }
  return copy.sort((a, b) => {
    const ageA = Math.max(1, (Date.now() - a.createdAt) / 3600000);
    const ageB = Math.max(1, (Date.now() - b.createdAt) / 3600000);
    const hotA = (a.score + getPostCommentCount(a) * 3) / ageA;
    const hotB = (b.score + getPostCommentCount(b) * 3) / ageB;
    return hotB - hotA || b.createdAt - a.createdAt;
  });
}

export default function PostsFeedScreen() {
  const router = useRouter();
  const {
    posts,
    isHydrating,
    hydrateError,
    reloadPosts,
    deletePost,
    updatePost,
    toggleSavePost,
    recordPostShare,
    reportPost,
    votePost,
  } = usePosts();
  const { isUploadingImage, pickAndUploadImage } = usePostImageUpload();
  const [feedMode, setFeedMode] = useState<FeedMode>('hot');
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [reportingPostId, setReportingPostId] = useState<string | null>(null);
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);
  const [editDraft, setEditDraft] = useState('');
  const [editImageUrl, setEditImageUrl] = useState('');

  const orderedPosts = useMemo(() => sortPosts(posts, feedMode), [feedMode, posts]);
  const selectedPost = useMemo(
    () => orderedPosts.find((post) => post.id === selectedPostId) ?? null,
    [orderedPosts, selectedPostId],
  );
  const editingPost = useMemo(
    () => orderedPosts.find((post) => post.id === editingPostId) ?? null,
    [editingPostId, orderedPosts],
  );
  const reportingPost = useMemo(
    () => orderedPosts.find((post) => post.id === reportingPostId) ?? null,
    [orderedPosts, reportingPostId],
  );

  const confirmDelete = (postId: string) => {
    const commitDelete = () => {
      void (async () => {
        try {
          await deletePost(postId);
          setSelectedPostId(null);
          toast.success('Post deleted');
        } catch (error) {
          toast.error(error instanceof Error ? error.message : 'Could not delete this post.');
        }
      })();
    };

    if (Platform.OS === 'web') {
      const confirmed = typeof window !== 'undefined' ? window.confirm('Delete this post?') : false;
      if (confirmed) commitDelete();
      return;
    }

    Alert.alert('Delete post', 'Delete this post?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: commitDelete },
    ]);
  };

  const handleSharePost = async (postId: string) => {
    try {
      const result = await sharePostLink(postId);
      await recordPostShare(postId);
      toast.success(result.mode === 'copied' ? 'Post link copied' : 'Post shared');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not share this post right now.');
    }
  };

  return (
    <SafeAreaView edges={['top']} style={postsUiStyles.page}>
      <ScreenHeader
        title="Posts"
        rightIcon="add"
        onRightPress={() => router.push('/posts/create')}
      />

      <ScrollView contentContainerStyle={postsUiStyles.pageContent} showsVerticalScrollIndicator={false}>
        <View style={postsUiStyles.tabRow}>
          {(['hot', 'new', 'top', 'saved'] as FeedMode[]).map((mode) => {
            const active = mode === feedMode;
            return (
              <Pressable
                key={mode}
                onPress={() => setFeedMode(mode)}
                style={[postsUiStyles.tabChip, active && postsUiStyles.tabChipActive]}
              >
                <Text style={[postsUiStyles.tabChipLabel, active && postsUiStyles.tabChipLabelActive]}>
                  {mode.toUpperCase()}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <ComposerEntry onPress={() => router.push('/posts/create')} />

        {isHydrating ? (
          <LoadingState body="Loading the latest posts and votes from the backend." title="Loading posts" />
        ) : null}

        {!isHydrating && hydrateError ? (
          <ErrorState body={hydrateError} onAction={() => void reloadPosts()} actionLabel="Retry" title="Could not load posts" />
        ) : null}

        {!isHydrating && !hydrateError && orderedPosts.length === 0 ? (
          <View style={postsUiStyles.emptyState}>
            <Ionicons color={colors.textSecondary} name="document-text-outline" size={28} />
            <Text style={postsUiStyles.emptyTitle}>
              {feedMode === 'saved' ? 'No saved posts yet' : 'No posts yet'}
            </Text>
            <Text style={postsUiStyles.emptyBody}>
              {feedMode === 'saved'
                ? 'Save posts from the feed or detail view and they will show up here.'
                : 'Start the feed with a first post. V1 keeps the flow simple: text, one image, replies, and votes.'}
            </Text>
          </View>
        ) : null}

        {!isHydrating && !hydrateError ? orderedPosts.map((post) => (
          <PostCard
            key={post.id}
            onActionsPress={() => {
              if (post.author.id === CURRENT_POST_USER.id) {
                setSelectedPostId(post.id);
                return;
              }
              setReportingPostId(post.id);
            }}
            onCommentPress={() => router.push(`/posts/${post.id}`)}
            onDownvote={() => {
              void votePost(post.id, -1).catch((error) => {
                toast.error(error instanceof Error ? error.message : 'Could not update this vote.');
              });
            }}
            onPress={() => router.push(`/posts/${post.id}`)}
            onSavePress={() => {
              toggleSavePost(post.id);
              toast.success(post.viewerSaved ? 'Removed from saved posts' : 'Saved post');
            }}
            onSharePress={() => {
              void handleSharePost(post.id);
            }}
            onUpvote={() => {
              void votePost(post.id, 1).catch((error) => {
                toast.error(error instanceof Error ? error.message : 'Could not update this vote.');
              });
            }}
            post={post}
          />
        )) : null}
      </ScrollView>

      <ActionSheet
        onClose={() => setSelectedPostId(null)}
        onDelete={() => {
          if (selectedPost) confirmDelete(selectedPost.id);
        }}
        onEdit={() => {
          if (!selectedPost) return;
          setEditDraft(selectedPost.text);
          setEditImageUrl(selectedPost.imageUrl ?? '');
          setEditingPostId(selectedPost.id);
          setSelectedPostId(null);
        }}
        title="Post actions"
        visible={!!selectedPost}
      />

      <ReportComposerModal
        initialDetails=""
        initialReason={null}
        loading={isSubmittingReport}
        onClose={() => {
          if (!isSubmittingReport) {
            setReportingPostId(null);
          }
        }}
        onSubmit={async ({ details, reason }) => {
          if (!reportingPost) {
            return;
          }
          setIsSubmittingReport(true);
          try {
            await reportPost(reportingPost.id, { reason, details });
            setReportingPostId(null);
            toast.success('Report submitted');
          } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Could not submit this report.');
          } finally {
            setIsSubmittingReport(false);
          }
        }}
        subtitle={
          reportingPost
            ? `Let Team Vulu know what is wrong with ${reportingPost.author.username}'s post.`
            : 'Choose a reason so moderation can review this post quickly.'
        }
        title="Report post"
        visible={!!reportingPost}
      />

      <EditComposerModal
        actionLabel="Save"
        onCancel={() => {
          setEditingPostId(null);
          setEditDraft('');
          setEditImageUrl('');
        }}
        onChangeText={setEditDraft}
        onPickImage={async () => {
          try {
            const uploadedUrl = await pickAndUploadImage();
            if (!uploadedUrl) {
              return;
            }
            setEditImageUrl(uploadedUrl);
            toast.success('Image attached');
          } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Could not upload that image right now.');
          }
        }}
        onRemoveImage={() => setEditImageUrl('')}
        isImageUploading={isUploadingImage}
        imageUrl={editImageUrl}
        onSubmit={async () => {
          if (!editingPost) return;
          try {
            await updatePost(editingPost.id, {
              text: editDraft,
              imageUrl: editImageUrl.trim() || undefined,
            });
            setEditingPostId(null);
            setEditDraft('');
            setEditImageUrl('');
            toast.success('Post updated');
          } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Could not update this post.');
          }
        }}
        title="Edit post"
        value={editDraft}
        visible={!!editingPost}
      />
    </SafeAreaView>
  );
}
