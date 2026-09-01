/**
 * Sound and vibration.
 *
 * Both default on because they are what makes a tap feel like it landed, but
 * both are one switch away — an app that insists on making noise is an app
 * people mute at the OS level and then never hear from again.
 */

import { useEffect, useState, type ReactElement } from 'react';
import { useApp, useFeedback, useStoreVersion } from '../../app/providers/appContext';
import { Card, SectionHeader } from '../../ui/primitives';
import { Rows } from '../../ui/data';
import { Switch } from '../../ui/Switch';

export function FeedbackSection(): ReactElement {
  const { repos } = useApp();
  const feedback = useFeedback();
  useStoreVersion();

  const settings = repos.settings.get().feedback;

  /**
   * iOS has no Vibration API at all — Safari has never shipped it, installed to
   * the home screen or not. Saying so beats a switch that does nothing.
   */
  const [canVibrate, setCanVibrate] = useState(true);
  useEffect(() => { setCanVibrate('vibrate' in navigator); }, []);

  return (
    <section>
      <SectionHeader title="Som e vibração" />
      <Card variant="flush">
        <Rows>
          <Switch
            checked={settings.sound}
            title="Som"
            subtitle="Confirmações curtas ao concluir algo. Toca uma vez para ouvires."
            onChange={(sound) => {
              repos.settings.updateFeedback({ sound });
              feedback.setPreferences(sound, settings.haptics);
              // Play the cue as it is switched on, so the choice is audible.
              if (sound) feedback.play('complete');
            }}
          />
          <Switch
            checked={settings.haptics && canVibrate}
            disabled={!canVibrate}
            title="Vibração"
            subtitle={
              canVibrate
                ? 'Resposta tátil nos toques.'
                : 'O iPhone não permite vibração a aplicações web. Fica ativa na versão nativa.'
            }
            onChange={(haptics) => {
              repos.settings.updateFeedback({ haptics });
              feedback.setPreferences(settings.sound, haptics);
            }}
          />
        </Rows>
      </Card>
    </section>
  );
}
