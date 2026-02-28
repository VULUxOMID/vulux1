import { useEffect, useState } from 'react';

import { ModerationService } from '../services/ModerationService';
import type { AdminUserDetail } from '../types';
import { useAdminBackend } from './useAdminBackend';

type UseAdminUserDetailParams = {
    enabled: boolean;
    userId: string | null;
};

export function useAdminUserDetail({ enabled, userId }: UseAdminUserDetailParams) {
    const { get, post } = useAdminBackend();
    const [detail, setDetail] = useState<AdminUserDetail | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function refetch() {
        if (!enabled || !userId) {
            return null;
        }

        setLoading(true);
        setError(null);

        try {
            const response = await ModerationService.getUserDetail(userId, { get, post });
            setDetail(response.userDetail);
            return response.userDetail;
        } catch (nextError) {
            const message =
                nextError instanceof Error ? nextError.message : 'Failed to load user details.';
            setError(message);
            return null;
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        let cancelled = false;

        if (!enabled || !userId) {
            setDetail(null);
            setError(null);
            setLoading(false);
            return;
        }

        setLoading(true);
        setError(null);

        void ModerationService.getUserDetail(userId, { get, post })
            .then((response) => {
                if (cancelled) {
                    return;
                }
                setDetail(response.userDetail);
            })
            .catch((nextError) => {
                if (cancelled) {
                    return;
                }
                const message =
                    nextError instanceof Error ? nextError.message : 'Failed to load user details.';
                setError(message);
            })
            .finally(() => {
                if (cancelled) {
                    return;
                }
                setLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [enabled, get, post, userId]);

    return {
        detail,
        error,
        loading,
        refetch,
    };
}
