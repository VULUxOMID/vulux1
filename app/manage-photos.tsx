import * as Haptics from 'expo-haptics';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import Slider from '@react-native-community/slider';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useIsFocused } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Alert,
  Animated,
  Dimensions,
  Image,
  Linking,
  Modal,
  PanResponder,
  type PanResponderGestureState,
  Pressable,
  ScrollView,
  StyleSheet,
  LayoutAnimation,
  Platform,
  UIManager,
  useWindowDimensions,
  View,
} from 'react-native';

import { AppScreen, AppText } from '../src/components';
import { useAuth as useSessionAuth } from '../src/auth/spacetimeSession';
import { toast } from '../src/components/Toast';
import { useUserProfile, UserProfilePhoto } from '../src/context/UserProfileContext';
import { useAppIsActive } from '../src/hooks/useAppIsActive';
import { subscribeBootstrap } from '../src/lib/spacetime';
import { colors, radius, spacing } from '../src/theme';
import { uploadMediaAsset } from '../src/utils/mediaUpload';

if (Platform.OS === 'android') {
  if (UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
  }
}

type Photo = UserProfilePhoto;

const { width, height: WINDOW_HEIGHT } = Dimensions.get('window');
const GRID_COLUMNS = 3;
const GRID_PADDING = spacing.lg; // AppScreen already adds this on each side
const PHOTO_SIZE = Math.floor((width - GRID_PADDING * 2 - spacing.sm * (GRID_COLUMNS - 1)) / GRID_COLUMNS);
const PHOTO_HEIGHT = PHOTO_SIZE * 1.4;
const DELETE_CORNER_SIZE = 44;
const LONG_PRESS_MS = 120;
const SCROLL_CANCEL_DIST = 10;
const SCROLL_ZONE_HEIGHT = 120;
const SCROLL_SPEED = 15;
const MAX_PHOTOS = 12;
const CROP_MAX_SCALE = 3;
const CROP_FRAME_RATIO = PHOTO_HEIGHT / PHOTO_SIZE;

const REORDER_LAYOUT_ANIM = {
  duration: 300,
  update: {
    type: LayoutAnimation.Types.spring,
    springDamping: 0.85,
  },
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function computeCropMetrics(
  asset: Pick<ImagePicker.ImagePickerAsset, 'width' | 'height'>,
  cropWidth: number,
  cropHeight: number,
  scale: number,
) {
  const sourceWidth = asset.width || cropWidth;
  const sourceHeight = asset.height || cropHeight;
  const sourceRatio = sourceWidth / Math.max(1, sourceHeight);
  const frameRatio = cropWidth / Math.max(1, cropHeight);

  let baseWidth = cropWidth;
  let baseHeight = cropHeight;

  if (sourceRatio >= frameRatio) {
    baseHeight = cropHeight;
    baseWidth = cropHeight * sourceRatio;
  } else {
    baseWidth = cropWidth;
    baseHeight = cropWidth / Math.max(0.0001, sourceRatio);
  }

  return {
    sourceWidth,
    sourceHeight,
    baseWidth,
    baseHeight,
    displayWidth: baseWidth * scale,
    displayHeight: baseHeight * scale,
  };
}

function clampCropOffset(
  offset: { x: number; y: number },
  displayWidth: number,
  displayHeight: number,
  cropWidth: number,
  cropHeight: number,
) {
  const maxX = Math.max(0, (displayWidth - cropWidth) / 2);
  const maxY = Math.max(0, (displayHeight - cropHeight) / 2);

  return {
    x: clamp(offset.x, -maxX, maxX),
    y: clamp(offset.y, -maxY, maxY),
  };
}

export default function ManagePhotosScreen() {
  const router = useRouter();
  const isFocused = useIsFocused();
  const insets = useSafeAreaInsets();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const isAppActive = useAppIsActive();
  const { isLoaded: isAuthLoaded, isSignedIn, userId, getToken } = useSessionAuth();
  const { userProfile, updateUserProfile, updateAvatar } = useUserProfile();
  const gridRef = useRef<React.ElementRef<typeof View>>(null);
  const scrollViewRef = useRef<ScrollView>(null);
  const gridWindowRef = useRef({ x: 0, y: 0, width: 0, height: 0 });

  const dragStartIndexRef = useRef<number>(-1);
  const draggingIdRef = useRef<string | null>(null);
  const dragStartSlotRef = useRef({ x: 0, y: 0 });
  const pan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const photosRef = useRef<Photo[]>([]);
  const tileRespondersRef = useRef<Record<string, ReturnType<typeof PanResponder.create>>>({});
  const tileLayoutsRef = useRef<Record<string, { x: number; y: number }>>({});
  const gridGeoRef = useRef<{ cols: number; cellW: number; cellH: number; startX: number; startY: number } | null>(null);

  const longPressTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDraggingRef = useRef(false);
  const dragScale = useRef(new Animated.Value(1)).current;
  const cropDragStartRef = useRef({ x: 0, y: 0 });
  const cropScaleRef = useRef(1);
  const cropOffsetRef = useRef({ x: 0, y: 0 });

  // Scroll tracking
  const scrollOffsetRef = useRef(0);
  const autoScrollFrameRef = useRef<number | null>(null);
  const pendingAddSourceRef = useRef<'library' | 'camera' | null>(null);

  // Anchor: finger screen position + scroll at PanResponder grant
  const dragAnchorRef = useRef({ x: 0, y: 0 });
  const dragAnchorScrollRef = useRef(0);

  const lastGestureRef = useRef<Pick<PanResponderGestureState, 'dx' | 'dy' | 'moveX' | 'moveY'>>({
    dx: 0,
    dy: 0,
    moveX: 0,
    moveY: 0,
  });

  const photos = userProfile.photos;
  const canAddMorePhotos = photos.length < MAX_PHOTOS;
  const shouldSubscribe = isAppActive && isFocused && isAuthLoaded && isSignedIn && !!userId;

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [isSourceSheetVisible, setIsSourceSheetVisible] = useState(false);
  const [cropAsset, setCropAsset] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [cropScale, setCropScale] = useState(1);
  const [cropOffset, setCropOffset] = useState({ x: 0, y: 0 });
  const [isApplyingCrop, setIsApplyingCrop] = useState(false);

  const cropFrameWidth = Math.min(
    screenWidth - spacing.xl * 2,
    320,
    (screenHeight * 0.52) / CROP_FRAME_RATIO,
  );
  const cropFrameHeight = cropFrameWidth * CROP_FRAME_RATIO;
  const cropMetrics = cropAsset
    ? computeCropMetrics(cropAsset, cropFrameWidth, cropFrameHeight, cropScale)
    : null;

  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);

  useEffect(() => {
    if (!shouldSubscribe) {
      return;
    }

    return subscribeBootstrap();
  }, [shouldSubscribe]);

  useEffect(() => {
    if (!cropAsset) {
      cropScaleRef.current = 1;
      cropOffsetRef.current = { x: 0, y: 0 };
      setCropScale(1);
      setCropOffset({ x: 0, y: 0 });
    }
  }, [cropAsset]);

  const commitPhotos = (nextPhotos: Photo[]) => {
    photosRef.current = nextPhotos;
    updateUserProfile({ photos: nextPhotos });
    console.log(`[manage-photos] ui refresh -> committed ${nextPhotos.length} photos`);
  };

  const handleBack = () => {
    router.back();
  };

  const handleSelectAvatar = (photo: Photo) => {
    if (photo.uri !== userProfile.avatarUrl) {
      updateAvatar(photo.uri);
    }
  };

  const openAddPhotoSheet = () => {
    if (!canAddMorePhotos) {
      toast.warning(`You can add up to ${MAX_PHOTOS} photos.`);
      return;
    }

    setIsSourceSheetVisible(true);
  };

  const openCropEditor = (asset: ImagePicker.ImagePickerAsset) => {
    setCropAsset(asset);
    setCropScale(1);
    setCropOffset({ x: 0, y: 0 });
    cropScaleRef.current = 1;
    cropOffsetRef.current = { x: 0, y: 0 };
  };

  const resolvePhotoPermissionPrompt = (title: string, message: string, continueLabel = 'Not now') =>
    new Promise<boolean>((resolve) => {
      Alert.alert(title, message, [
        {
          text: continueLabel,
          style: 'cancel',
          onPress: () => resolve(false),
        },
        {
          text: 'Open Settings',
          onPress: () => {
            void Linking.openSettings();
            resolve(false);
          },
        },
      ]);
    });

  const promptForMoreIosPhotoAccess = async () => {
    try {
      const MediaLibrary = require('expo-media-library') as typeof import('expo-media-library');
      await MediaLibrary.presentPermissionsPickerAsync(['photo']);
    } catch {
      // The current binary may not include expo-media-library yet. Keep going and use the system picker.
    }
  };

  const ensureMediaLibraryAccess = async (): Promise<boolean> => {
    if (Platform.OS === 'ios') {
      try {
        const permission = await ImagePicker.getMediaLibraryPermissionsAsync();
        const accessPrivileges = (permission as any).accessPrivileges as string | undefined;

        if (permission.status === 'granted' && accessPrivileges === 'limited') {
          await promptForMoreIosPhotoAccess();
        }
      } catch {
        // If the permission lookup fails, still let the Apple photo picker open.
      }

      return true;
    }

    let permission = await ImagePicker.getMediaLibraryPermissionsAsync();

    if (permission.status !== 'granted') {
      if (permission.canAskAgain !== false) {
        permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      }

      if (permission.status !== 'granted') {
        if (permission.canAskAgain === false) {
          await resolvePhotoPermissionPrompt(
            'Allow photo access',
            'To add profile photos, enable Photos access for Vulu in Settings.',
          );
        } else {
          toast.error('Photo access is required to add images.');
        }
        return false;
      }
    }

    return true;
  };

  const ensureCameraAccess = async (): Promise<boolean> => {
    let permission = await ImagePicker.getCameraPermissionsAsync();

    if (permission.status !== 'granted') {
      if (permission.canAskAgain !== false) {
        permission = await ImagePicker.requestCameraPermissionsAsync();
      }

      if (permission.status !== 'granted') {
        if (permission.canAskAgain === false) {
          await resolvePhotoPermissionPrompt(
            'Allow camera access',
            'To take a selfie, enable Camera access for Vulu in Settings.',
          );
        } else {
          toast.error('Camera access is required to take a selfie.');
        }
        return false;
      }
    }

    return true;
  };

  const pickFromLibrary = async () => {
    if (!canAddMorePhotos) {
      toast.warning(`You can add up to ${MAX_PHOTOS} photos.`);
      return;
    }

    try {
      console.log('[manage-photos] opening photo library');
      const hasAccess = await ensureMediaLibraryAccess();
      if (!hasAccess) {
        console.log('[manage-photos] photo library access not granted');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 1,
        selectionLimit: 1,
      });

      if (result.canceled || !result.assets.length) {
        console.log('[manage-photos] photo library selection canceled');
        return;
      }
      console.log('[manage-photos] photo selected from library');
      openCropEditor(result.assets[0]);
    } catch (error) {
      console.error('[manage-photos] could not open photo library', error);
      toast.error('Could not add photo. Please try again.');
    }
  };

  const takeSelfie = async () => {
    if (!canAddMorePhotos) {
      toast.warning(`You can add up to ${MAX_PHOTOS} photos.`);
      return;
    }

    try {
      console.log('[manage-photos] opening selfie camera');
      const hasAccess = await ensureCameraAccess();
      if (!hasAccess) {
        console.log('[manage-photos] camera access not granted');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 1,
        cameraType: ImagePicker.CameraType.front,
      });

      if (result.canceled || !result.assets.length) {
        console.log('[manage-photos] selfie capture canceled');
        return;
      }
      console.log('[manage-photos] selfie captured');
      openCropEditor(result.assets[0]);
    } catch (error) {
      console.error('[manage-photos] could not open camera', error);
      toast.error('Could not open the camera. Please try again.');
    }
  };

  const updateCropOffset = (nextOffset: { x: number; y: number }, scale = cropScaleRef.current) => {
    if (!cropAsset) {
      return;
    }

    const metrics = computeCropMetrics(cropAsset, cropFrameWidth, cropFrameHeight, scale);
    const clampedOffset = clampCropOffset(
      nextOffset,
      metrics.displayWidth,
      metrics.displayHeight,
      cropFrameWidth,
      cropFrameHeight,
    );
    cropOffsetRef.current = clampedOffset;
    setCropOffset(clampedOffset);
  };

  const handleCropZoomChange = (nextScale: number) => {
    const normalized = clamp(nextScale, 1, CROP_MAX_SCALE);
    cropScaleRef.current = normalized;
    setCropScale(normalized);
    updateCropOffset(cropOffsetRef.current, normalized);
  };

  const cancelCrop = () => {
    if (isApplyingCrop) {
      return;
    }
    setCropAsset(null);
  };

  const applyCrop = async () => {
    if (!cropAsset || !cropMetrics || isApplyingCrop) {
      return;
    }

    setIsApplyingCrop(true);
    try {
      const { sourceWidth, sourceHeight, displayWidth, displayHeight } = cropMetrics;
      const cropWidth = cropFrameWidth * (sourceWidth / displayWidth);
      const cropHeight = cropFrameHeight * (sourceHeight / displayHeight);
      const originX =
        ((displayWidth - cropFrameWidth) / 2 - cropOffset.x) * (sourceWidth / displayWidth);
      const originY =
        ((displayHeight - cropFrameHeight) / 2 - cropOffset.y) * (sourceHeight / displayHeight);
      const outputWidth = 1200;
      const outputHeight = Math.round(outputWidth * (cropFrameHeight / cropFrameWidth));

      const cropped = await ImageManipulator.manipulateAsync(
        cropAsset.uri,
        [
          {
            crop: {
              originX: Math.round(clamp(originX, 0, Math.max(0, sourceWidth - cropWidth))),
              originY: Math.round(clamp(originY, 0, Math.max(0, sourceHeight - cropHeight))),
              width: Math.round(Math.min(cropWidth, sourceWidth)),
              height: Math.round(Math.min(cropHeight, sourceHeight)),
            },
          },
          {
            resize: {
              width: outputWidth,
              height: outputHeight,
            },
          },
        ],
        {
          compress: 0.9,
          format: ImageManipulator.SaveFormat.JPEG,
        },
      );

      console.log('[manage-photos] upload flow -> cropped asset ready');
      const uploadedPhoto = await uploadMediaAsset({
        getToken,
        uri: cropped.uri,
        contentType: 'image/jpeg',
        mediaType: 'profile',
      });
      console.log('[manage-photos] upload flow -> r2 upload complete');

      const nextPhotos: Photo[] = [
        ...photos,
        {
          id: `photo-${Date.now()}`,
          uri: uploadedPhoto.publicUrl,
        },
      ];
      commitPhotos(nextPhotos);
      setCropAsset(null);
      console.log('[manage-photos] upload flow -> photo available in UI');
      toast.success('Photo added');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not save that photo. Please try again.';
      toast.error(message);
      if (__DEV__) {
        console.warn('[manage-photos] Failed to save cropped photo', error);
      }
    } finally {
      setIsApplyingCrop(false);
    }
  };

  const cropPanResponder = useMemo(
    () => PanResponder.create({
      onStartShouldSetPanResponder: () => !!cropAsset,
      onMoveShouldSetPanResponder: () => !!cropAsset,
      onPanResponderGrant: () => {
        cropDragStartRef.current = cropOffsetRef.current;
      },
      onPanResponderMove: (_evt, gestureState) => {
        if (!cropAsset) {
          return;
        }

        updateCropOffset({
          x: cropDragStartRef.current.x + gestureState.dx,
          y: cropDragStartRef.current.y + gestureState.dy,
        });
      },
      onPanResponderRelease: () => {
        cropDragStartRef.current = cropOffsetRef.current;
      },
      onPanResponderTerminate: () => {
        cropDragStartRef.current = cropOffsetRef.current;
      },
    }),
    [cropAsset, cropFrameHeight, cropFrameWidth],
  );

  const runPendingAddSource = () => {
    const nextSource = pendingAddSourceRef.current;
    if (!nextSource) {
      return;
    }

    pendingAddSourceRef.current = null;
    console.log(`[manage-photos] source sheet dismissed, launching ${nextSource}`);

    if (nextSource === 'library') {
      void pickFromLibrary();
    } else {
      void takeSelfie();
    }
  };

  const requestLibraryPhoto = () => {
    console.log('[manage-photos] photo from gallery tapped');
    pendingAddSourceRef.current = 'library';
    setIsSourceSheetVisible(false);

    if (Platform.OS !== 'ios') {
      runPendingAddSource();
    }
  };

  const requestSelfie = () => {
    console.log('[manage-photos] take a selfie tapped');
    pendingAddSourceRef.current = 'camera';
    setIsSourceSheetVisible(false);

    if (Platform.OS !== 'ios') {
      runPendingAddSource();
    }
  };

  const handleDeletePhoto = (id: string) => {
    const nextPhotos = photos.filter(p => p.id !== id);
    commitPhotos(nextPhotos);
  };

  const getSlotPosition = (index: number) => {
    const col = index % GRID_COLUMNS;
    const row = Math.floor(index / GRID_COLUMNS);
    return {
      x: col * (PHOTO_SIZE + spacing.sm),
      y: row * (PHOTO_HEIGHT + spacing.sm),
    };
  };

  // Derive actual grid geometry (column count, cell size) from measured positions
  const deriveGridGeometry = () => {
    const positions = Object.values(tileLayoutsRef.current);
    if (positions.length < 2) return;

    const uniqueXs: number[] = [];
    positions.forEach(p => {
      if (!uniqueXs.some(ux => Math.abs(ux - p.x) < 5)) uniqueXs.push(p.x);
    });
    uniqueXs.sort((a, b) => a - b);

    const uniqueYs: number[] = [];
    positions.forEach(p => {
      if (!uniqueYs.some(uy => Math.abs(uy - p.y) < 5)) uniqueYs.push(p.y);
    });
    uniqueYs.sort((a, b) => a - b);

    const cols = uniqueXs.length;
    const cellW = cols > 1 ? uniqueXs[1] - uniqueXs[0] : PHOTO_SIZE + spacing.sm;
    const cellH = uniqueYs.length > 1 ? uniqueYs[1] - uniqueYs[0] : PHOTO_HEIGHT + spacing.sm;

    gridGeoRef.current = { cols, cellW, cellH, startX: uniqueXs[0], startY: uniqueYs[0] };
  };

  // Position for a grid index using real measured geometry
  const getGridPosition = (index: number) => {
    const geo = gridGeoRef.current;
    if (!geo) return getSlotPosition(index);
    const col = index % geo.cols;
    const row = Math.floor(index / geo.cols);
    return { x: geo.startX + col * geo.cellW, y: geo.startY + row * geo.cellH };
  };

  const moveItem = (list: Photo[], from: number, to: number) => {
    if (from === to) return list;
    const next = [...list];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    return next;
  };

  const updateDragPosition = (gesture: Pick<PanResponderGestureState, 'dx' | 'dy' | 'moveX' | 'moveY'>) => {
    // Use absolute screen coords (moveX/moveY) instead of dx/dy to avoid
    // stale PanResponder x0/y0 from cached instances causing teleport.
    const screenDX = gesture.moveX - dragAnchorRef.current.x;
    const screenDY = gesture.moveY - dragAnchorRef.current.y;
    const scrollDelta = scrollOffsetRef.current - dragAnchorScrollRef.current;

    const newX = dragStartSlotRef.current.x + screenDX;
    const newY = dragStartSlotRef.current.y + screenDY + scrollDelta;
    pan.setValue({ x: newX, y: newY });

    // Find closest tile using measured positions (layout-agnostic)
    const centerX = newX + PHOTO_SIZE / 2;
    const centerY = newY + PHOTO_HEIGHT / 2;
    const fromIndex = dragStartIndexRef.current;
    let targetIndex = fromIndex;
    let minDist = Infinity;
    photosRef.current.forEach((p, i) => {
      const pos = tileLayoutsRef.current[p.id];
      if (!pos) return;
      const cx = pos.x + PHOTO_SIZE / 2;
      const cy = pos.y + PHOTO_HEIGHT / 2;
      const dist = Math.hypot(centerX - cx, centerY - cy);
      if (dist < minDist) {
        minDist = dist;
        targetIndex = i;
      }
    });

    if (fromIndex !== targetIndex && fromIndex >= 0) {
      LayoutAnimation.configureNext(REORDER_LAYOUT_ANIM);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const nextPhotos = moveItem(photosRef.current, fromIndex, targetIndex);
      commitPhotos(nextPhotos);
      dragStartIndexRef.current = targetIndex;

      // Immediately predict new positions so next frame has correct data
      nextPhotos.forEach((p, i) => {
        tileLayoutsRef.current[p.id] = getGridPosition(i);
      });
    }
  };

  const startAutoScroll = () => {
    if (autoScrollFrameRef.current) return;

    const loop = () => {
      const { moveY } = lastGestureRef.current;
      if (draggingIdRef.current && moveY > 0) {
        let scrollAmount = 0;
        if (moveY < SCROLL_ZONE_HEIGHT + 50) { // Top zone
          // Scale speed by closeness to edge
          const intensity = Math.max(0, 1 - moveY / (SCROLL_ZONE_HEIGHT + 50));
          scrollAmount = -SCROLL_SPEED * intensity * 1.5;
        } else if (moveY > WINDOW_HEIGHT - SCROLL_ZONE_HEIGHT) { // Bottom zone
          const intensity = Math.max(0, (moveY - (WINDOW_HEIGHT - SCROLL_ZONE_HEIGHT)) / SCROLL_ZONE_HEIGHT);
          scrollAmount = SCROLL_SPEED * intensity * 1.5;
        }

        if (scrollAmount !== 0) {
          const maxOffset = 10000; // Ideally measure content height
          const nextOffset = Math.max(0, Math.min(maxOffset, scrollOffsetRef.current + scrollAmount));

          if (nextOffset !== scrollOffsetRef.current) {
            scrollViewRef.current?.scrollTo({ y: nextOffset, animated: false });
            // Manually update ref since onScroll might be async/throttled
            scrollOffsetRef.current = nextOffset;
            updateDragPosition(lastGestureRef.current);
          }
        }
      }
      autoScrollFrameRef.current = requestAnimationFrame(loop);
    };

    autoScrollFrameRef.current = requestAnimationFrame(loop);
  };

  const stopAutoScroll = () => {
    if (autoScrollFrameRef.current) {
      cancelAnimationFrame(autoScrollFrameRef.current);
      autoScrollFrameRef.current = null;
    }
  };

  const startDrag = (id: string) => {
    if (draggingIdRef.current) return;

    const index = photosRef.current.findIndex(p => p.id === id);
    if (index < 0) return;

    // Stop any lingering animations from a previous drag
    pan.stopAnimation();
    dragScale.stopAnimation();

    draggingIdRef.current = id;
    dragStartIndexRef.current = index;
    isDraggingRef.current = true;
    setDraggingId(id);

    // Derive real grid geometry from current measured positions
    deriveGridGeometry();

    const measured = tileLayoutsRef.current[id];
    const slot = measured || getGridPosition(index);
    dragStartSlotRef.current = slot;
    pan.setValue(slot);

    // Reset gesture ref so auto-scroll doesn't use stale values
    lastGestureRef.current = { dx: 0, dy: 0, moveX: 0, moveY: 0 };

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    dragScale.setValue(1);
    Animated.spring(dragScale, {
      toValue: 1.04,
      useNativeDriver: false,
      tension: 80,
      friction: 8,
    }).start();
    // Auto-scroll deferred to onPanResponderGrant (need valid anchor first)
  };

  const handleDragMove = (
    gesture: Pick<PanResponderGestureState, 'dx' | 'dy' | 'moveX' | 'moveY'>
  ) => {
    lastGestureRef.current = gesture;
    if (!draggingIdRef.current) return;
    updateDragPosition(gesture);
  };

  const endDrag = () => {
    stopAutoScroll();
    if (!draggingIdRef.current) return;

    const dragId = draggingIdRef.current;
    // Clear ref immediately to prevent double-call
    draggingIdRef.current = null;

    const measured = dragId ? tileLayoutsRef.current[dragId] : null;
    const finalSlot = measured || getGridPosition(dragStartIndexRef.current);
    Animated.parallel([
      Animated.spring(pan, {
        toValue: finalSlot,
        useNativeDriver: false,
        tension: 60,
        friction: 12,
      }),
      Animated.spring(dragScale, {
        toValue: 1,
        useNativeDriver: false,
        tension: 60,
        friction: 12,
      }),
    ]).start(() => {
      dragStartIndexRef.current = -1;
      isDraggingRef.current = false;
      setDraggingId(null);
    });
  };

  const getTileResponder = (id: string) => {
    if (tileRespondersRef.current[id]) return tileRespondersRef.current[id];

    tileRespondersRef.current[id] = PanResponder.create({
      onStartShouldSetPanResponder: () => {
        // Don't reset state if a drag is already active (e.g. accidental second touch)
        if (isDraggingRef.current) return false;
        if (longPressTimeoutRef.current) clearTimeout(longPressTimeoutRef.current);
        longPressTimeoutRef.current = setTimeout(() => {
          startDrag(id);
        }, LONG_PRESS_MS);
        return false;
      },
      onMoveShouldSetPanResponder: (evt, gestureState) => {
        if (isDraggingRef.current) return true;
        if (Math.hypot(gestureState.dx, gestureState.dy) > SCROLL_CANCEL_DIST) {
          if (longPressTimeoutRef.current) {
            clearTimeout(longPressTimeoutRef.current);
            longPressTimeoutRef.current = null;
          }
        }
        return false;
      },
      onPanResponderTerminationRequest: () => !isDraggingRef.current,
      onPanResponderGrant: (evt, gestureState) => {
        lastGestureRef.current = gestureState;
        if (isDraggingRef.current) {
          // Record finger screen position as anchor for reliable tracking
          dragAnchorRef.current = { x: gestureState.moveX, y: gestureState.moveY };
          dragAnchorScrollRef.current = scrollOffsetRef.current;
          startAutoScroll();
          handleDragMove(gestureState);
        }
      },
      onPanResponderMove: (evt, gestureState) => {
        lastGestureRef.current = gestureState;
        if (isDraggingRef.current) {
          handleDragMove(gestureState);
        }
      },
      onPanResponderRelease: () => {
        if (longPressTimeoutRef.current) clearTimeout(longPressTimeoutRef.current);
        if (isDraggingRef.current) endDrag();
      },
      onPanResponderTerminate: () => {
        if (longPressTimeoutRef.current) clearTimeout(longPressTimeoutRef.current);
        if (isDraggingRef.current) endDrag();
      },
    });

    return tileRespondersRef.current[id];
  };

  const draggingPhoto = draggingId ? photos.find(p => p.id === draggingId) : null;

  return (
    <AppScreen>
      <View style={styles.header}>
        <Pressable onPress={handleBack} style={styles.backButton}>
          <Ionicons name="chevron-back" size={28} color={colors.textPrimary} />
        </Pressable>

        <AppText variant="h3" style={styles.headerTitle}>
          Your photos ({photos.length})
        </AppText>

        <Pressable
          onPress={() => {
            openAddPhotoSheet();
          }}
          style={[styles.addButton, !canAddMorePhotos && styles.addButtonDisabled]}
          disabled={!canAddMorePhotos}
        >
          <AppText style={[styles.addButtonText, !canAddMorePhotos && styles.addButtonTextDisabled]}>
            Add
          </AppText>
        </Pressable>
      </View>

      <ScrollView
        ref={scrollViewRef}
        style={styles.scrollView}
        scrollEnabled={!draggingId}
        contentContainerStyle={styles.scrollContent}
        onScroll={(e) => {
          scrollOffsetRef.current = e.nativeEvent.contentOffset.y;
        }}
        scrollEventThrottle={16}
      >
        <View
          ref={gridRef}
          collapsable={false}
          style={styles.grid}
          onLayout={() => {
            if (gridRef.current) {
              gridRef.current.measureInWindow((x, y, w, h) => {
                gridWindowRef.current = { x, y, width: w, height: h };
              });
            }
          }}
        >
          {photos.map((photo, index) => {
            const isAvatar = userProfile.avatarUrl === photo.uri;
            return (
              <View key={photo.id} style={[styles.photoContainer, isAvatar && styles.photoContainerActive]}
                onLayout={(e) => {
                  const { x, y } = e.nativeEvent.layout;
                  tileLayoutsRef.current[photo.id] = { x, y };
                }}
              >
                {draggingId === photo.id && <View style={styles.dragPlaceholder} />}

                {draggingId !== photo.id && (
                  <Image source={{ uri: photo.uri }} style={styles.photo} />
                )}

                <View style={styles.numberContainer} pointerEvents="none">
                  <AppText style={styles.numberText}>{index + 1}</AppText>
                </View>

                {photo.isVideo && (
                  <View style={styles.videoIndicator} pointerEvents="none">
                    <Ionicons name="videocam" size={16} color="#fff" />
                  </View>
                )}

                {photo.isVerified && (
                  <View style={styles.verifiedBadge} pointerEvents="none">
                    <Ionicons name="checkmark-circle" size={24} color="#FFD700" />
                  </View>
                )}

                {/* Plain View — Pressable's internal responder blocks PanResponder */}
                <View
                  collapsable={false}
                  style={styles.dragTouchOverlay}
                  {...getTileResponder(photo.id).panHandlers}
                  onTouchEnd={() => {
                    if (longPressTimeoutRef.current) {
                      clearTimeout(longPressTimeoutRef.current);
                      longPressTimeoutRef.current = null;
                    }
                    if (isDraggingRef.current && draggingIdRef.current) {
                      endDrag();
                    }
                  }}
                  onTouchCancel={() => {
                    if (longPressTimeoutRef.current) {
                      clearTimeout(longPressTimeoutRef.current);
                      longPressTimeoutRef.current = null;
                    }
                    if (isDraggingRef.current && draggingIdRef.current) {
                      endDrag();
                    }
                  }}
                />

                {/* Delete button rendered AFTER overlay for touch priority */}
                <Pressable
                  onPress={() => handleDeletePhoto(photo.id)}
                  disabled={!!draggingId}
                  style={styles.deleteButton}
                  hitSlop={8}
                >
                  <View style={styles.deleteIconBg}>
                    <Ionicons name="close" size={14} color="#FF0000" />
                  </View>
                </Pressable>
              </View>
            );
          })}

          {canAddMorePhotos ? (
            <Pressable
              onPress={() => {
                openAddPhotoSheet();
              }}
              style={styles.addPhotoCard}
            >
              <View style={styles.addPhotoIcon}>
                <Ionicons name="add" size={32} color={colors.accentPrimary} />
              </View>
            </Pressable>
          ) : null}

          {draggingPhoto && (
            <Animated.View pointerEvents="none" style={[
              styles.dragOverlay,
              pan.getLayout(),
              { transform: [{ scale: dragScale }] },
              userProfile.avatarUrl === draggingPhoto.uri && styles.photoContainerActive,
            ]}>
              <Image source={{ uri: draggingPhoto.uri }} style={styles.dragOverlayPhoto} />
              <View style={styles.numberContainer} pointerEvents="none">
                <AppText style={styles.numberText}>{dragStartIndexRef.current + 1}</AppText>
              </View>
            </Animated.View>
          )}
        </View>

        <AppText style={styles.hintText}>
          Hold and drag to reorganize photos · {photos.length}/{MAX_PHOTOS}
        </AppText>
      </ScrollView>

      <Modal
        visible={isSourceSheetVisible}
        transparent
        animationType="fade"
        onDismiss={runPendingAddSource}
        onRequestClose={() => setIsSourceSheetVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setIsSourceSheetVisible(false)} />
          <View style={styles.sourceSheet}>
            <AppText variant="h3" style={styles.sourceSheetTitle}>
              Add a photo
            </AppText>
            <AppText style={styles.sourceSheetSubtitle}>
              Choose how you want to add your next profile photo.
            </AppText>

            <Pressable
              style={styles.sourceAction}
              onPress={requestLibraryPhoto}
            >
              <View style={styles.sourceIconWrap}>
                <Ionicons name="images-outline" size={22} color={colors.textPrimary} />
              </View>
              <AppText style={styles.sourceActionText}>Photo from gallery</AppText>
            </Pressable>

            <Pressable
              style={styles.sourceAction}
              onPress={requestSelfie}
            >
              <View style={styles.sourceIconWrap}>
                <Ionicons name="camera-outline" size={22} color={colors.textPrimary} />
              </View>
              <AppText style={styles.sourceActionText}>Take a selfie</AppText>
            </Pressable>

            <Pressable style={styles.cancelSheetButton} onPress={() => setIsSourceSheetVisible(false)}>
              <AppText style={styles.cancelSheetButtonText}>Cancel</AppText>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={!!cropAsset} animationType="fade" presentationStyle="overFullScreen" onRequestClose={cancelCrop}>
        <View
          style={[
            styles.cropModal,
            {
              paddingTop: Math.max(insets.top, spacing.md) + spacing.xs,
              paddingBottom: Math.max(insets.bottom, spacing.lg),
            },
          ]}
        >
          <View style={styles.cropHeader}>
            <View style={styles.cropHeaderSide}>
              <Pressable onPress={cancelCrop} disabled={isApplyingCrop} style={styles.cropHeaderButton}>
                <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
              </Pressable>
            </View>
            <AppText variant="h3" style={styles.cropTitle}>
              Crop photo
            </AppText>
            <View style={[styles.cropHeaderSide, styles.cropHeaderSideRight]} />
          </View>

          <View style={styles.cropBody}>
            <AppText style={styles.cropHint}>Drag to reframe. Use the slider to zoom.</AppText>
            <View
              style={[styles.cropFrame, { width: cropFrameWidth, height: cropFrameHeight }]}
              {...cropPanResponder.panHandlers}
            >
              {cropMetrics && cropAsset ? (
                <Image
                  source={{ uri: cropAsset.uri }}
                  style={[
                    styles.cropImage,
                    {
                      width: cropMetrics.displayWidth,
                      height: cropMetrics.displayHeight,
                      transform: [
                        { translateX: cropOffset.x },
                        { translateY: cropOffset.y },
                      ],
                    },
                  ]}
                />
              ) : null}
              <View pointerEvents="none" style={styles.cropFrameBorder} />
            </View>
          </View>

          <View style={styles.cropControls}>
            <View style={styles.cropZoomRow}>
              <Ionicons name="search-outline" size={18} color={colors.textMuted} />
              <Slider
                style={styles.cropSlider}
                minimumValue={1}
                maximumValue={CROP_MAX_SCALE}
                minimumTrackTintColor={colors.accentPrimary}
                maximumTrackTintColor={colors.surfaceAlt}
                thumbTintColor={colors.accentPrimary}
                step={0.01}
                value={cropScale}
                onValueChange={handleCropZoomChange}
              />
              <Ionicons name="add" size={18} color={colors.textMuted} />
            </View>
            <AppText style={styles.cropScaleText}>
              {cropScale.toFixed(2)}x
            </AppText>
            <Pressable
              onPress={() => {
                void applyCrop();
              }}
              disabled={isApplyingCrop}
              style={[
                styles.cropDoneButton,
                styles.cropDoneButtonFullWidth,
                isApplyingCrop && styles.cropDoneButtonDisabled,
              ]}
            >
              <AppText style={styles.cropDoneButtonText}>
                {isApplyingCrop ? 'Saving...' : 'Use Photo'}
              </AppText>
            </Pressable>
          </View>
        </View>
      </Modal>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    color: colors.textPrimary,
    fontWeight: '700',
    fontSize: 18,
  },
  addButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  addButtonDisabled: {
    opacity: 0.5,
  },
  addButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  addButtonTextDisabled: {
    color: colors.textMuted,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: spacing.xxl,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  photoContainer: {
    width: PHOTO_SIZE,
    height: PHOTO_HEIGHT,
    borderRadius: radius.xl,
    overflow: 'hidden',
    backgroundColor: '#000',
    position: 'relative',
  },
  photoContainerActive: {
    borderWidth: 2,
    borderColor: colors.accentPrimary,
  },
  dragTouchOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10,
    backgroundColor: 'transparent',
  },
  photo: {
    width: '100%',
    height: '100%',
    backgroundColor: colors.surfaceAlt,
    zIndex: 1,
  },
  dragPlaceholder: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: radius.xl,
    zIndex: 0,
  },
  numberContainer: {
    position: 'absolute',
    top: 8,
    left: 8,
    zIndex: 30,
    elevation: 30,
  },
  numberText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#fff',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  deleteButton: {
    position: 'absolute',
    top: 6,
    right: 6,
    zIndex: 40,
    elevation: 40,
  },
  deleteIconBg: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoIndicator: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    zIndex: 20,
  },
  verifiedBadge: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    zIndex: 20,
  },
  addPhotoCard: {
    width: PHOTO_SIZE,
    height: PHOTO_HEIGHT,
    borderRadius: radius.xl,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addPhotoIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.accentPrimarySubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hintText: {
    textAlign: 'center',
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: '500',
    letterSpacing: 0.3,
    marginTop: spacing.xl,
    marginBottom: spacing.xl,
  },
  dragOverlay: {
    position: 'absolute',
    width: PHOTO_SIZE,
    height: PHOTO_HEIGHT,
    borderRadius: radius.xl,
    overflow: 'hidden',
    zIndex: 100,
    elevation: 100,
    backgroundColor: '#000',
    shadowColor: colors.accentPrimary,
    shadowOpacity: 0.5,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: 8 },
  },
  dragOverlayPhoto: {
    width: '100%',
    height: '100%',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
    padding: spacing.lg,
    position: 'relative',
  },
  sourceSheet: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.md,
    zIndex: 2,
    elevation: 2,
  },
  sourceSheetTitle: {
    color: colors.textPrimary,
    fontWeight: '700',
  },
  sourceSheetSubtitle: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  sourceAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle,
  },
  sourceIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sourceActionText: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '600',
  },
  cancelSheetButton: {
    marginTop: spacing.sm,
    borderRadius: radius.xl,
    backgroundColor: colors.surfaceAlt,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelSheetButtonText: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '700',
  },
  cropModal: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.lg,
  },
  cropHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 56,
    marginBottom: spacing.md,
  },
  cropHeaderSide: {
    width: 92,
  },
  cropHeaderSideRight: {
    alignItems: 'flex-end',
  },
  cropHeaderButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cropTitle: {
    color: colors.textPrimary,
    fontWeight: '700',
    flex: 1,
    textAlign: 'center',
  },
  cropDoneButton: {
    minWidth: 88,
    borderRadius: radius.full,
    backgroundColor: colors.accentPrimary,
    paddingHorizontal: spacing.lg,
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cropDoneButtonFullWidth: {
    marginTop: spacing.xs,
    width: '100%',
  },
  cropDoneButtonDisabled: {
    opacity: 0.6,
  },
  cropDoneButtonText: {
    color: colors.background,
    fontSize: 15,
    fontWeight: '800',
  },
  cropBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  cropHint: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    maxWidth: 280,
  },
  cropFrame: {
    borderRadius: radius.xl,
    overflow: 'hidden',
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cropImage: {
    position: 'absolute',
  },
  cropFrameBorder: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 3,
    borderColor: colors.accentPrimary,
    borderRadius: radius.xl,
  },
  cropControls: {
    gap: spacing.sm,
    marginTop: spacing.md,
    borderRadius: radius.xl,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  cropZoomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  cropSlider: {
    flex: 1,
    height: 40,
  },
  cropScaleText: {
    color: colors.textMuted,
    fontSize: 13,
    textAlign: 'center',
    fontWeight: '600',
  },
});
