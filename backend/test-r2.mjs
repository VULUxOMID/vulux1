#!/usr/bin/env node

// Set environment variables first
process.env.R2_ACCOUNT_ID = 'test1234567890abcdef';
process.env.R2_ACCESS_KEY_ID = 'test1234567890abcdef';
process.env.R2_SECRET_ACCESS_KEY = 'test1234567890abcdef1234567890abcdef1234567890abcdef';
process.env.R2_BUCKET_NAME = 'vulu-media-test';
process.env.R2_PUBLIC_BASE_URL = 'https://test1234567890abcdef.r2.dev';

// Now import after env vars are set
const { generatePresignedUrl, isR2Configured } = await import('./src/r2.js');

console.log('Testing R2 configuration...');
console.log('R2 configured:', isR2Configured);

if (isR2Configured) {
  try {
    const objectKey = 'test/sample.txt';
    const url = await generatePresignedUrl(objectKey);
    console.log('✅ Presigned URL generated successfully');
    console.log('URL length:', url.length);
    console.log('URL starts with:', url.substring(0, 50) + '...');
    
    // Check if URL contains problematic headers
    if (url.includes('x-amz-content-sha256')) {
      console.log('❌ URL contains checksum header (may cause 401)');
    } else {
      console.log('✅ URL does not contain checksum headers');
    }
  } catch (error) {
    console.log('❌ Failed to generate presigned URL:', error.message);
  }
} else {
  console.log('❌ R2 not configured');
}
