import React, { useCallback } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';

import { AppScreen } from '../../components';
import { useWallet } from '../../context';
import { spacing } from '../../theme';
import { AD_WALL_REWARD } from './constants';
import {
  AdWallCard,
  EarnHeader,
  EarnInfoBanner,
  EarnSectionBadge,
  EarnSectionHeader,
  RewardStreakCard,
} from './components';

export function EarnScreen() {
  const router = useRouter();
  const { cash, gems, addCash } = useWallet();

  const handleBack = useCallback(() => router.back(), [router]);

  const handleAdWallReward = useCallback(() => {
    addCash(AD_WALL_REWARD);
  }, [addCash]);

  const handleStreakReward = useCallback(
    (amount: number) => {
      addCash(amount);
    },
    [addCash],
  );

  return (
    <AppScreen noPadding edges={[]} style={styles.container}>
      <EarnHeader gems={gems} cash={cash} onBack={handleBack} />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="always"
      >
        <EarnInfoBanner />

        <View style={styles.section}>
          <EarnSectionHeader
            title="Ad Wall (AFK)"
            subtitle="Keep this screen open to earn cash passively."
          />
          <AdWallCard onReward={handleAdWallReward} />
        </View>

        <View style={styles.section}>
          <EarnSectionHeader
            title="Watching Streak"
            subtitle="Rewards increase for every video!"
            badge={<EarnSectionBadge />}
          />
          <RewardStreakCard onReward={handleStreakReward} />
        </View>
      </ScrollView>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: spacing.screenBottom,
  },
  section: {
    marginBottom: spacing.xl,
  },
});
