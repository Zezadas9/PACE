/**
 * Theme.
 *
 * Three states, not two: "sistema" follows the phone, which is what most people
 * want and what the app defaults to. The explicit choices exist for everyone
 * else — and because a setting that only follows something else does not feel
 * like a setting.
 */

import type { ReactElement } from 'react';
import type { ThemePreference } from '../../core/types';
import { updatePreferences } from '../../services/profile';
import { useApp, useFeedback, usePreferences } from '../../app/providers/appContext';
import { Card, SectionHeader } from '../../ui/primitives';
import { Field, Segmented } from '../../ui/form';

const OPTIONS: ReadonlyArray<{ id: ThemePreference; label: string }> = [
  { id: 'light', label: 'Claro' },
  { id: 'system', label: 'Sistema' },
  { id: 'dark', label: 'Escuro' },
];

export function AppearanceSection(): ReactElement {
  const { repos } = useApp();
  const feedback = useFeedback();
  const preferences = usePreferences();

  return (
    <section>
      <SectionHeader title="Aspeto" />
      <Card>
        <Field label="Tema">
          <Segmented
            ariaLabel="Tema"
            value={preferences.theme}
            options={OPTIONS}
            onChange={(theme) => {
              updatePreferences(repos, { theme });
              feedback.touch();
            }}
          />
        </Field>
      </Card>
    </section>
  );
}
