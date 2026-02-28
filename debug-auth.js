// Debug script to check AsyncStorage auth state
import AsyncStorage from '@react-native-async-storage/async-storage';

const SPACETIME_AUTH_TOKEN_STORAGE_KEY = 'spacetimedb.auth_token';
const SPACETIME_AUTH_REFRESH_TOKEN_STORAGE_KEY = 'spacetimedb.auth_refresh_token';

async function debugAuthState() {
  try {
    const authToken = await AsyncStorage.getItem(SPACETIME_AUTH_TOKEN_STORAGE_KEY);
    const refreshToken = await AsyncStorage.getItem(SPACETIME_AUTH_REFRESH_TOKEN_STORAGE_KEY);
    
    console.log('=== SpacetimeDB Auth Debug ===');
    console.log('Auth Token:', authToken ? `${authToken.substring(0, 50)}...` : 'NULL');
    console.log('Refresh Token:', refreshToken ? `${refreshToken.substring(0, 50)}...` : 'NULL');
    
    if (authToken) {
      try {
        const payload = JSON.parse(atob(authToken.split('.')[1]));
        console.log('Token Expires At:', new Date(payload.exp * 1000).toISOString());
        console.log('Token Is Expired:', Date.now() > payload.exp * 1000);
      } catch (e) {
        console.log('Token Parse Failed:', e.message);
      }
    }
  } catch (error) {
    console.error('Debug failed:', error);
  }
}

// Run in Expo console: debugAuthState()
