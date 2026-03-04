import React, { useState, useEffect } from 'react';
import {
    View,
    StyleSheet,
    Text,
    TextInput,
    Pressable,
    KeyboardAvoidingView,
    Platform,
    ActivityIndicator,
    ScrollView,
    Keyboard,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as SecureStore from 'expo-secure-store';
import QRCode from 'react-native-qrcode-svg';

import * as TOTP from '../../../utils/totp';

import { adminTokens } from '../ui/adminTokens';
import { useAdminAuth } from '../hooks/useAdminAuth';
import { auditLogger } from '../utils/auditLogger';
import { AdminSessionWarningModal } from './AdminSessionWarningModal';

const TOTP_SECRET_KEY = 'vulu_admin_totp_secret';

interface AdminGateProps {
    children: React.ReactNode;
}

export function AdminGate({ children }: AdminGateProps) {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const {
        isAdmin,
        isAuthedForAdmin,
        setAuthedForAdmin,
        markAdminActivity,
        authChallengeReason,
    } = useAdminAuth();

    const [totpCode, setTotpCode] = useState('');
    const [errorMessage, setErrorMessage] = useState('');
    const [isSettingUp, setIsSettingUp] = useState(false);
    const [loading, setLoading] = useState(true);
    const [attempts, setAttempts] = useState(0);

    // Setup state
    const [setupSecret, setSetupSecret] = useState('');
    const [setupUri, setSetupUri] = useState('');

    const MAX_ATTEMPTS = 5;

    useEffect(() => {
        (async () => {
            try {
                const storedSecret = await SecureStore.getItemAsync(TOTP_SECRET_KEY);
                if (!storedSecret) {
                    // Generate new secret for first-time setup
                    const newSecret = TOTP.generateSecret();
                    setSetupSecret(newSecret);

                    // Build the uri to embed in a QR Code (e.g. otpauth://totp/Vulu:username?secret=...&issuer=Vulu)
                    // We attempt to get the username from userProfile, fallback to "Admin"
                    // *Note: The type of `userProfile` might not strictly have `.username` depending on context typing, 
                    // so we cast or fallback gracefully.
                    const username = 'Admin';
                    const uri = TOTP.keyuri(username, 'Vulu', newSecret);
                    setSetupUri(uri);

                    setIsSettingUp(true);
                } else {
                    setIsSettingUp(false);
                }
            } catch (error) {
                console.error('Error fetching TOTP secret:', error);
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    const handleVerifySetup = async () => {
        if (!totpCode || totpCode.length !== 6) {
            setErrorMessage('Please enter the 6-digit code from your app.');
            return;
        }

        const isValid = TOTP.verifyTOTP(totpCode, setupSecret);

        if (isValid) {
            await SecureStore.setItemAsync(TOTP_SECRET_KEY, setupSecret);

            auditLogger.log({
                adminId: 'current-admin',
                actionType: 'ADMIN_TOTP_SETUP',
                targetType: 'system',
                targetId: 'admin-gate',
                reason: 'Admin TOTP 2FA was set up for the first time',
            });

            setErrorMessage('');
            setTotpCode('');
            setIsSettingUp(false);
            setAuthedForAdmin(true);
        } else {
            setErrorMessage('Invalid code. Please try again.');
            setTotpCode('');
        }
    };

    const handleVerifyLogin = async () => {
        if (attempts >= MAX_ATTEMPTS) {
            setErrorMessage('Too many attempts. Please restart the app.');
            return;
        }

        if (!totpCode || totpCode.length !== 6) {
            setErrorMessage('Enter the 6-digit code.');
            return;
        }

        try {
            const storedSecret = await SecureStore.getItemAsync(TOTP_SECRET_KEY);
            if (!storedSecret) {
                setErrorMessage('Configuration error. Please restart the app.');
                return;
            }

            const isValid = TOTP.verifyTOTP(totpCode, storedSecret);

            if (isValid) {
                auditLogger.log({
                    adminId: 'current-admin',
                    actionType: 'ADMIN_AUTH_TOTP',
                    targetType: 'system',
                    targetId: 'admin-gate',
                    reason: 'Authenticated via TOTP',
                });
                setErrorMessage('');
                setAttempts(0);
                setTotpCode('');
                setAuthedForAdmin(true);
            } else {
                const newAttempts = attempts + 1;
                setAttempts(newAttempts);
                setErrorMessage(`Invalid code. ${MAX_ATTEMPTS - newAttempts} attempts remaining.`);
                setTotpCode('');

                auditLogger.log({
                    adminId: 'current-admin',
                    actionType: 'ADMIN_AUTH_FAILED',
                    targetType: 'system',
                    targetId: 'admin-gate',
                    reason: `Failed TOTP attempt (${newAttempts}/${MAX_ATTEMPTS})`,
                });
            }
        } catch (error) {
            console.error('Error verifying TOTP:', error);
            setErrorMessage('An error occurred during verification.');
        }
    };

    const handleResetSetup = async () => {
        await SecureStore.deleteItemAsync(TOTP_SECRET_KEY);
        setSetupSecret('');
        setSetupUri('');
        setIsSettingUp(true);
        setErrorMessage('');
        setTotpCode('');

        // Generate new immediately
        const newSecret = TOTP.generateSecret();
        setSetupSecret(newSecret);
        const username = 'Admin';
        const uri = TOTP.keyuri(username, 'Vulu', newSecret);
        setSetupUri(uri);
    };

    // ─── Non-Admin Block ───
    if (!isAdmin) {
        return (
            <View style={styles.container}>
                <View style={styles.unauthorizedContent}>
                    <Ionicons name="shield-half" size={64} color={adminTokens.colors.danger} />
                    <Text style={styles.title}>Access Denied</Text>
                    <Text style={styles.subtitle}>You do not have administrative privileges.</Text>
                    <Pressable style={styles.backBtn} onPress={() => router.replace('/' as any)}>
                        <Text style={styles.backBtnText}>Return to Home</Text>
                    </Pressable>
                </View>
            </View>
        );
    }

    // ─── Already Authenticated ───
    if (isAuthedForAdmin) {
        return (
            <View
                style={styles.authedContainer}
                onStartShouldSetResponderCapture={() => {
                    markAdminActivity();
                    return false;
                }}
            >
                {children}
                <AdminSessionWarningModal />
            </View>
        );
    }

    // ─── Loading State ───
    if (loading) {
        return (
            <View style={[styles.container, styles.centeredContent]}>
                <ActivityIndicator size="large" color={adminTokens.colors.primary} />
            </View>
        );
    }

    // ─── First-Time TOTP Setup ───
    if (isSettingUp) {
        return (
            <KeyboardAvoidingView
                style={styles.container}
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            >
                <Pressable onPress={Keyboard.dismiss} style={styles.dismissKeyboardLayer}>
                    <ScrollView
                        contentContainerStyle={[styles.authContent, { paddingTop: insets.top + 20 }]}
                        keyboardShouldPersistTaps="handled"
                    >
                        <Ionicons name="qr-code" size={48} color={adminTokens.colors.primary} />
                        <Text style={styles.title}>Authenticator Setup</Text>
                        <Text style={styles.subtitle}>
                            Scan this QR code with Google Authenticator or Authy to enable 2FA on this device.
                        </Text>

                        {setupUri ? (
                            <View style={styles.qrContainer}>
                                <QRCode
                                    value={setupUri}
                                    size={160}
                                    backgroundColor="#fff"
                                    color="#000"
                                />
                            </View>
                        ) : (
                            <ActivityIndicator size="small" color={adminTokens.colors.primary} style={{ marginVertical: 32 }} />
                        )}

                        <Text style={styles.instructionText}>
                            After scanning, enter the 6-digit code below to confirm setup.
                        </Text>

                        <View style={styles.inputContainer}>
                            <TextInput
                                style={styles.input}
                                placeholder="000 000"
                                placeholderTextColor={adminTokens.colors.textMuted}
                                value={totpCode}
                                onChangeText={(t) => { setTotpCode(t); setErrorMessage(''); }}
                                keyboardType="number-pad"
                                maxLength={6}
                                returnKeyType="done"
                                onSubmitEditing={handleVerifySetup}
                            />
                        </View>

                        {!!errorMessage && <Text style={styles.errorText}>{errorMessage}</Text>}

                        <Pressable style={styles.submitBtn} onPress={handleVerifySetup}>
                            <Text style={styles.submitBtnText}>Verify & Save</Text>
                        </Pressable>

                        <Pressable onPress={() => router.replace('/' as any)} style={styles.cancelLink}>
                            <Text style={styles.cancelText}>Cancel & Go Back</Text>
                        </Pressable>
                    </ScrollView>
                </Pressable>
            </KeyboardAvoidingView>
        );
    }

    // ─── TOTP Verification (Subsequent visits) ───
    return (
        <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
            <Pressable onPress={Keyboard.dismiss} style={styles.dismissKeyboardLayer}>
                <ScrollView
                    contentContainerStyle={[styles.authContent, { paddingTop: insets.top + 40 }]}
                    keyboardShouldPersistTaps="handled"
                >
                    <Ionicons name="shield-checkmark" size={56} color={adminTokens.colors.primary} />
                    <Text style={styles.title}>Admin Access</Text>
                    <Text style={styles.subtitle}>
                        {authChallengeReason === 'expired'
                            ? 'Your admin session expired. Re-enter the 6-digit code to continue.'
                            : authChallengeReason === 'background'
                                ? 'Admin access was locked when the app left the foreground. Re-enter the 6-digit code to continue.'
                                : authChallengeReason === 'locked'
                                    ? 'Admin access was locked. Re-enter the 6-digit code to continue.'
                                    : 'Enter the 6-digit code from your Authenticator App.'}
                    </Text>

                    <View style={styles.inputContainer}>
                        <TextInput
                            style={styles.input}
                            placeholder="000 000"
                            placeholderTextColor={adminTokens.colors.textMuted}
                            value={totpCode}
                            onChangeText={(t) => { setTotpCode(t); setErrorMessage(''); }}
                            keyboardType="number-pad"
                            autoFocus
                            maxLength={6}
                            returnKeyType="done"
                            onSubmitEditing={handleVerifyLogin}
                        />
                    </View>

                    {!!errorMessage && <Text style={styles.errorText}>{errorMessage}</Text>}

                    <Pressable
                        style={[styles.submitBtn, attempts >= MAX_ATTEMPTS && styles.submitBtnDisabled]}
                        onPress={handleVerifyLogin}
                        disabled={attempts >= MAX_ATTEMPTS}
                    >
                        <Text style={styles.submitBtnText}>Unlock 2FA</Text>
                    </Pressable>

                    <Pressable onPress={() => router.replace('/' as any)} style={styles.cancelLink}>
                        <Text style={styles.cancelText}>Cancel & Go Back</Text>
                    </Pressable>

                    {/* Developer / Reset trigger if stuck */}
                    <Pressable onPress={handleResetSetup} style={styles.resetLink}>
                        <Text style={styles.resetText}>Reset 2FA Setup (Dev)</Text>
                    </Pressable>
                </ScrollView>
            </Pressable>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: adminTokens.colors.pageBg,
    },
    authedContainer: {
        flex: 1,
    },
    dismissKeyboardLayer: {
        flex: 1,
    },
    centeredContent: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    unauthorizedContent: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
    },
    authContent: {
        flex: 1,
        alignItems: 'center',
        padding: 24,
    },
    title: {
        fontSize: 24,
        fontWeight: 'bold',
        color: adminTokens.colors.textPrimary,
        marginTop: 16,
        marginBottom: 8,
    },
    subtitle: {
        fontSize: 16,
        color: adminTokens.colors.textSecondary,
        textAlign: 'center',
        marginBottom: 24,
        lineHeight: 22,
    },
    qrContainer: {
        backgroundColor: '#fff',
        padding: 16,
        borderRadius: 16,
        marginBottom: 24,
        alignItems: 'center',
        justifyContent: 'center',
    },
    instructionText: {
        fontSize: 14,
        color: adminTokens.colors.textPrimary,
        textAlign: 'center',
        marginBottom: 16,
        paddingHorizontal: 16,
    },
    inputContainer: {
        width: '100%',
        maxWidth: 240,
        marginBottom: 12,
    },
    input: {
        backgroundColor: adminTokens.colors.surface,
        borderWidth: 1,
        borderColor: adminTokens.colors.border,
        borderRadius: 12,
        color: adminTokens.colors.textPrimary,
        fontSize: 32,
        padding: 14,
        textAlign: 'center',
        letterSpacing: 8,
        fontWeight: 'bold',
    },
    errorText: {
        color: adminTokens.colors.danger,
        fontSize: 14,
        marginBottom: 16,
        textAlign: 'center',
    },
    submitBtn: {
        backgroundColor: adminTokens.colors.primary,
        paddingVertical: 14,
        paddingHorizontal: 32,
        borderRadius: 12,
        width: '100%',
        maxWidth: 240,
        alignItems: 'center',
        marginTop: 8,
    },
    submitBtnDisabled: {
        opacity: 0.4,
    },
    submitBtnText: {
        color: adminTokens.colors.textPrimary,
        fontSize: 16,
        fontWeight: 'bold',
    },
    backBtn: {
        marginTop: 24,
        backgroundColor: adminTokens.colors.surfaceAlt,
        borderWidth: 1,
        borderColor: adminTokens.colors.border,
        paddingVertical: 12,
        paddingHorizontal: 24,
        borderRadius: 8,
    },
    backBtnText: {
        color: adminTokens.colors.textPrimary,
        fontSize: 16,
    },
    cancelLink: {
        marginTop: 24,
        padding: 8,
    },
    cancelText: {
        color: adminTokens.colors.textSecondary,
        fontSize: 14,
    },
    resetLink: {
        marginTop: 32,
        padding: 8,
    },
    resetText: {
        color: adminTokens.colors.warning,
        fontSize: 12,
        textDecorationLine: 'underline',
    },
});
