'use client';

import { Block, Flexbox, Grid, Icon, Segmented } from '@lobehub/ui';
import { ProviderIcon } from '@lobehub/ui/icons';
import { DatePicker, type DatePickerProps, Divider } from 'antd';
import dayjs from 'dayjs';
import { Brain } from 'lucide-react';
import { memo, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useClientDataSWR } from '@/libs/swr';
import { usageService } from '@/services/usage';

import StatsFormGroup from './features/components/StatsFormGroup';
import {
  ShareButton,
  TotalAssistants,
  TotalMessages,
  TotalTopics,
  TotalWords,
  Welcome,
} from './features/overview';
import { AssistantsRank, ModelsRank, TopicsRank } from './features/rankings';
import { UsageCards, UsageTable, UsageTrends } from './features/usage';
import { AiHeatmaps } from './features/visualization';
import { GroupBy } from './types';

const StatsSetting = memo<{ mobile?: boolean }>(({ mobile }) => {
  const { t, i18n } = useTranslation('auth');
  dayjs.locale(i18n.language);

  const [groupBy, setGroupBy] = useState<GroupBy>(GroupBy.Model);
  const [dateRange, setDateRange] = useState<dayjs.Dayjs>(dayjs(new Date()));
  const [dateStrings, setDateStrings] = useState<string>();

  const { data, isLoading, mutate } = useClientDataSWR('usage-stat', async () =>
    usageService.findAndGroupByDay(dateStrings),
  );

  useEffect(() => {
    if (dateStrings) {
      mutate();
    }
  }, [dateStrings]);

  const handleDateChange: DatePickerProps['onChange'] = (dates, dateStrings) => {
    // Handle both single date and array
    const actualDate = Array.isArray(dates) ? dates[0] : dates;
    if (actualDate) {
      setDateRange(actualDate);
    }
    if (typeof dateStrings === 'string') {
      setDateStrings(dateStrings);
    }
  };

  return (
    <Flexbox gap={16}>
      {/* ========== Header Section ========== */}
      {/* Welcome + Share Button */}
      {mobile ? (
        <Welcome mobile />
      ) : (
        <Flexbox align={'flex-start'} gap={16} horizontal justify={'space-between'}>
          <Welcome />
          <ShareButton />
        </Flexbox>
      )}
      <Divider />
      <Grid maxItemWidth={150} rows={4}>
        <TotalAssistants mobile={mobile} />
        <TotalTopics mobile={mobile} />
        <TotalMessages mobile={mobile} />
        <TotalWords />
      </Grid>
      <Block padding={16} variant={'outlined'}>
        <AiHeatmaps mobile={mobile} />
        <Divider dashed />
        <Grid gap={16} rows={3}>
          <ModelsRank />
          <AssistantsRank mobile={mobile} />
          <TopicsRank mobile={mobile} />
        </Grid>
      </Block>

      <StatsFormGroup
        extra={
          <>
            <Segmented
              onChange={(v) => setGroupBy(v as GroupBy)}
              options={[
                {
                  icon: <Icon icon={Brain} />,
                  label: t('usage.welcome.model'),
                  value: GroupBy.Model,
                },
                {
                  icon: <Icon icon={ProviderIcon} />,
                  label: t('usage.welcome.provider'),
                  value: GroupBy.Provider,
                },
              ]}
              value={groupBy}
            />
            <DatePicker onChange={handleDateChange} picker="month" value={dateRange} />
          </>
        }
        title={t('tab.usage')}
      >
        <UsageCards data={data} groupBy={groupBy} isLoading={isLoading} />
      </StatsFormGroup>
      <Block padding={16} variant={'outlined'}>
        <UsageTrends data={data} groupBy={groupBy} isLoading={isLoading} />
        <Divider />
        <UsageTable dateStrings={dateStrings} />
      </Block>
    </Flexbox>
  );
});

export default StatsSetting;
