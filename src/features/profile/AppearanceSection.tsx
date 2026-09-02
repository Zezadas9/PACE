/**
 * Tema.
 *
 * Duas opções, e só duas. "Seguir o sistema" foi retirado: a escolha é feita no
 * primeiro arranque e vive aqui a partir daí.
 */

import type { ReactElement } from 'react';
import { THEME_OPTIONS } from '../../core/constants';
import { updatePreferences } from '../../services/profile';
import { useApp, useFeedback, usePreferences } from '../../app/providers/appContext';
import { Card, SectionHeader } from '../../ui/primitives';
import { Field, Segmented } from '../../ui/form';

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
            options={THEME_OPTIONS}
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
