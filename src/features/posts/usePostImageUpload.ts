import * as ImagePicker from 'expo-image-picker';
import { useCallback, useState } from 'react';

import { useAuth } from '../../auth/clerkSession';
import { uploadMediaAsset } from '../../utils/mediaUpload';

export function usePostImageUpload() {
  const { getToken } = useAuth();
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  const pickAndUploadImage = useCallback(async (): Promise<string | null> => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      throw new Error('Allow photo access to upload an image.');
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.85,
      selectionLimit: 1,
    });

    if (result.canceled || result.assets.length === 0) {
      return null;
    }

    const asset = result.assets[0];
    setIsUploadingImage(true);
    try {
      const uploadedImage = await uploadMediaAsset({
        getToken,
        uri: asset.uri,
        contentType:
          typeof asset.mimeType === 'string' && asset.mimeType.startsWith('image/')
            ? asset.mimeType
            : 'image/jpeg',
        mediaType: 'image',
      });

      return uploadedImage.publicUrl;
    } finally {
      setIsUploadingImage(false);
    }
  }, [getToken]);

  return {
    isUploadingImage,
    pickAndUploadImage,
  };
}
