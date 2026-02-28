#!/usr/bin/env node

import express from 'express';
import cors from 'cors';

// Set environment variables BEFORE importing R2 module
process.env.R2_ACCOUNT_ID = 'test1234567890abcdef';
process.env.R2_ACCESS_KEY_ID = 'test1234567890abcdef';
process.env.R2_SECRET_ACCESS_KEY = 'test1234567890abcdef1234567890abcdef1234567890abcdef';
process.env.R2_BUCKET_NAME = 'vulu-media-test';
process.env.R2_PUBLIC_BASE_URL = 'https://test1234567890abcdef.r2.dev';

// Now import after env vars are set
const { generatePresignedUrl, getPublicUrlForObjectKey, isR2Configured } = await import('./src/r2.js');

const app = express();
app.use(cors());
app.use(express.json());

// Mock auth middleware
const requireAuth = (req, res, next) => {
  req.viewerUserId = 'test-user-id';
  next();
};

// Video upload URL endpoint
app.post('/video/upload/url', requireAuth, async (req, res) => {
  try {
    const contentType = req.body?.contentType;
    if (!contentType) {
      return res.status(400).json({ error: 'contentType is required' });
    }

    const extension = contentType.split('/')[1]?.split(';')[0] || 'mp4';
    const objectKey = `video/${req.viewerUserId}/${Date.now()}-${Math.random().toString(36).substring(7)}.${extension}`;
    
    const url = await generatePresignedUrl(objectKey);
    const publicUrl = getPublicUrlForObjectKey(objectKey);
    
    res.json({ url, objectKey, publicUrl });
  } catch (error) {
    console.error('Video upload URL error:', error);
    res.status(500).json({ error: 'Failed to generate upload URL' });
  }
});

// Music upload URL endpoint
app.post('/music/upload/url', requireAuth, async (req, res) => {
  try {
    const contentType = req.body?.contentType;
    if (!contentType) {
      return res.status(400).json({ error: 'contentType is required' });
    }

    const extension = contentType.split('/')[1]?.split(';')[0] || 'mp3';
    const objectKey = `music/${req.viewerUserId}/${Date.now()}-${Math.random().toString(36).substring(7)}.${extension}`;
    
    const url = await generatePresignedUrl(objectKey);
    const publicUrl = getPublicUrlForObjectKey(objectKey);
    
    res.json({ url, objectKey, publicUrl });
  } catch (error) {
    console.error('Music upload URL error:', error);
    res.status(500).json({ error: 'Failed to generate upload URL' });
  }
});

const PORT = 3002;
app.listen(PORT, () => {
  console.log(`🚀 Test R2 proxy running on http://localhost:${PORT}`);
  console.log(`R2 configured: ${isR2Configured}`);
  console.log('\nTest endpoints:');
  console.log('POST /video/upload/url');
  console.log('POST /music/upload/url');
});
