import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { toast } from '../../components/Toast';
import { ReportComposerModal } from '../reports/ReportComposerModal';
import { CURRENT_POST_USER } from './mockData';
import { sharePostLink } from './postShare';
import { usePosts } from './PostsContext';
import { usePostImageUpload } from './usePostImageUpload';
import {
  ActionSheet,
  CommentCard,
  EditComposerModal,
  ErrorState,
  LoadingState,
  PostCard,
  ReplyInput,
  ScreenHeader,
  postsUiStyles,
} from './PostsUi';

export default function PostDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ postId?: string | string[] }>();
  const { isUploadingImage, pickAndUploadImage } = usePostImageUpload();
  const {
    isHydrating,
    hydrateError,
    reloadPosts,
    getPost,
    addComment,
    deleteComment,
    deletePost,
    toggleSavePost,
    recordPostShare,
    reportPost,
    updateComment,
    updatePost,
    voteComment,
    votePost,
  } = usePosts();
  const [replyText, setReplyText] = useState('');
  const [reportingPostId, setReportingPostId] = useState<string | null>(null);
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);
  const [selectedTarget, setSelectedTarget] = useState<
    | { kind: 'post'; id: string }
    | { kind: 'comment'; id: string }
    | null
  >(null);
  const [editTarget, setEditTarget] = useState<
    | { kind: 'post'; id: string }
    | { kind: 'comment'; id: string }
    | null
  >(null);
  const [editDraft, setEditDraft] = useState('');
  const [editImageUrl, setEditImageUrl] = useState('');

  const postId = Array.isArray(params.postId) ? params.postId[0] : params.postId;
  const post = useMemo(() => (postId ? getPost(postId) : null), [getPost, postId]);
  const selectedComment = useMemo(
    () =>
      selectedTarget?.kind === 'comment'
        ? post?.comments.find((comment) => comment.id === selectedTarget.id) ?? null
        : null,
    [post, selectedTarget],
  );
  const editComment = useMemo(
    () =>
      editTarget?.kind === 'comment'
        ? post?.comments.find((comment) => comment.id === editTarget.id) ?? null
        : null,
    [editTarget, post],
  );
  const reportingPost = reportingPostId && post?.id === reportingPostId ? post : null;

  if (!post && isHydrating) {
    return (
      <SafeAreaView edges={['top']} style={postsUiStyles.page}>
        <ScreenHeader leftIcon="arrow-back" onLeftPress={() => router.back()} title="Posts" />
        <View style={postsUiStyles.pageContent}>
          <LoadingState body="Loading the post and its replies from the backend." title="Loading post" />
        </View>
      </SafeAreaView>
    );
  }

  if (!post && hydrateError) {
    return (
      <SafeAreaView edges={['top']} style={postsUiStyles.page}>
        <ScreenHeader leftIcon="arrow-back" onLeftPress={() => router.back()} title="Posts" />
        <View style={postsUiStyles.pageContent}>
          <ErrorState body={hydrateError} onAction={() => void reloadPosts()} actionLabel="Retry" title="Could not load post" />
        </View>
      </SafeAreaView>
    );
  }

  if (!post) {
    return (
      <SafeAreaView edges={['top']} style={postsUiStyles.page}>
        <ScreenHeader leftIcon="arrow-back" onLeftPress={() => router.back()} title="Posts" />
        <View style={postsUiStyles.emptyState}>
          <Text style={postsUiStyles.emptyTitle}>Post not found</Text>
          <Text style={postsUiStyles.emptyBody}>This mock post may have been removed from local state.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const selectedPost =
    selectedTarget?.kind === 'post' && selectedTarget.id === post.id ? post : null;
  const editingPost = editTarget?.kind === 'post' && editTarget.id === post.id ? post : null;

  const confirmDelete = () => {
    const commitDelete = () => {
      if (selectedPost) {
        void (async () => {
          try {
            await deletePost(selectedPost.id);
            setSelectedTarget(null);
            toast.success('Post deleted');
            router.replace('/posts');
          } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Could not delete this post.');
          }
        })();
        return;
      }

      if (selectedComment) {
        void (async () => {
          try {
            await deleteComment(post.id, selectedComment.id);
            setSelectedTarget(null);
            toast.success('Reply deleted');
          } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Could not delete this reply.');
          }
        })();
      }
    };

    const label = selectedPost ? 'Delete this post?' : 'Delete this reply?';

    if (Platform.OS === 'web') {
      const confirmed = typeof window !== 'undefined' ? window.confirm(label) : false;
      if (confirmed) commitDelete();
      return;
    }

    Alert.alert('Delete', label, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: commitDelete },
    ]);
  };

  const handleSharePost = async (nextPostId: string) => {
    try {
      const result = await sharePostLink(nextPostId);
      await recordPostShare(nextPostId);
      toast.success(result.mode === 'copied' ? 'Post link copied' : 'Post shared');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not share this post right now.');
    }
  };

  return (
    <SafeAreaView edges={['top']} style={postsUiStyles.page}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={postsUiStyles.page}
      >
        <ScreenHeader leftIcon="arrow-back" onLeftPress={() => router.back()} title="Post" />
        <ScrollView contentContainerStyle={postsUiStyles.pageContent} showsVerticalScrollIndicator={false}>
          <PostCard
            onActionsPress={() => {
              if (post.author.id === CURRENT_POST_USER.id) {
                setSelectedTarget({ kind: 'post', id: post.id });
                return;
              }
              setReportingPostId(post.id);
            }}
            onDownvote={() => {
              void votePost(post.id, -1).catch((error) => {
                toast.error(error instanceof Error ? error.message : 'Could not update this vote.');
              });
            }}
            onPress={undefined}
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

          {post.comments.length === 0 ? (
            <View style={postsUiStyles.emptyState}>
              <Text style={postsUiStyles.emptyTitle}>No replies yet</Text>
              <Text style={postsUiStyles.emptyBody}>Be the first one to answer and shape the thread.</Text>
            </View>
          ) : null}

          {post.comments.map((comment) => (
            <CommentCard
              key={comment.id}
              comment={comment}
              isOwned={comment.author.id === CURRENT_POST_USER.id}
              onActionsPress={() => setSelectedTarget({ kind: 'comment', id: comment.id })}
              onDownvote={() => {
                void voteComment(post.id, comment.id, -1).catch((error) => {
                  toast.error(error instanceof Error ? error.message : 'Could not update this vote.');
                });
              }}
              onUpvote={() => {
                void voteComment(post.id, comment.id, 1).catch((error) => {
                  toast.error(error instanceof Error ? error.message : 'Could not update this vote.');
                });
              }}
            />
          ))}
        </ScrollView>

        <ReplyInput
          actionLabel="Reply"
          onChangeText={setReplyText}
          onSubmit={async () => {
            try {
              await addComment(post.id, replyText);
              setReplyText('');
              toast.success('Reply posted');
            } catch (error) {
              toast.error(error instanceof Error ? error.message : 'Could not post this reply.');
            }
          }}
          placeholder="Write a reply"
          value={replyText}
        />
      </KeyboardAvoidingView>

      <ActionSheet
        onClose={() => setSelectedTarget(null)}
        onDelete={confirmDelete}
        onEdit={() => {
          if (selectedPost) {
            setEditDraft(selectedPost.text);
            setEditImageUrl(selectedPost.imageUrl ?? '');
            setEditTarget({ kind: 'post', id: selectedPost.id });
            setSelectedTarget(null);
            return;
          }
          if (selectedComment) {
            setEditDraft(selectedComment.text);
            setEditTarget({ kind: 'comment', id: selectedComment.id });
            setSelectedTarget(null);
          }
        }}
        title={selectedPost ? 'Post actions' : 'Reply actions'}
        visible={!!selectedTarget}
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
          setEditTarget(null);
          setEditDraft('');
          setEditImageUrl('');
        }}
        onChangeText={setEditDraft}
        onPickImage={
          editingPost
            ? async () => {
                try {
                  const uploadedUrl = await pickAndUploadImage();
                  if (!uploadedUrl) {
                    return;
                  }
                  setEditImageUrl(uploadedUrl);
                  toast.success('Image attached');
                } catch (error) {
                  toast.error(
                    error instanceof Error ? error.message : 'Could not upload that image right now.',
                  );
                }
              }
            : undefined
        }
        onRemoveImage={editingPost ? () => setEditImageUrl('') : undefined}
        isImageUploading={editingPost ? isUploadingImage : false}
        imageUrl={editingPost ? editImageUrl : undefined}
        onSubmit={async () => {
          if (editingPost) {
            try {
              await updatePost(editingPost.id, {
                text: editDraft,
                imageUrl: editImageUrl.trim() || undefined,
              });
              setEditTarget(null);
              setEditDraft('');
              setEditImageUrl('');
              toast.success('Post updated');
            } catch (error) {
              toast.error(error instanceof Error ? error.message : 'Could not update this post.');
            }
            return;
          }
          if (editComment) {
            try {
              await updateComment(post.id, editComment.id, editDraft);
              setEditTarget(null);
              setEditDraft('');
              toast.success('Reply updated');
            } catch (error) {
              toast.error(error instanceof Error ? error.message : 'Could not update this reply.');
            }
          }
        }}
        title={editingPost ? 'Edit post' : 'Edit reply'}
        value={editDraft}
        visible={!!editTarget}
      />
    </SafeAreaView>
  );
}
