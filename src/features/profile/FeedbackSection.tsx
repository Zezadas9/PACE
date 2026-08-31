/**
 * Sound and vibration.
 *
 * Both default on because they are what makes a tap feel like it landed, but
 * both are one switch away — an app that insists on making noise is an app
 * people mute at the OS level and then never hear from again.
 */

import type { ReactElement } from 'react';
import { useApp, useFeedback, useStoreVersion } from '../../app/providers/appContext';
import { Card, SectionHeader } from '../../ui/primitives';
import { Rows } from '../../ui/data';
import { Switch } from '../../ui/Switch';

export function FeedbackSection(): ReactElement {
  const { repos } = useApp();
  const feedback = useFeedback();
  useStoreVersion();

  const settings = repos.settings.get().feedback;

  return (
    <section>
      <SectionHeader title="Som e vibração" />
      <Card variant="flush">
        <Rows>
          <Switch
            checked={settings.sound}
            title="Som"
            subtitle="Confirmações curtas ao concluir algo."
            onChange={(sound) => {
              repos.settings.updateFeedback({ sound });
              feedback.setPreferences(sound, settings.haptics);
              // Play the cue as it is switched on, so the choice is audible.
              if (sound) feedback.play('complete');
            }}
          />
          <Switch
            checked={settings.haptics}
            title="Vibração"
            subtitle="Resposta tátil nos toques. Ignorada onde não existir."
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
