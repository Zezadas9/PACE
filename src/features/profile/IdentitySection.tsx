/**
 * Name, birth date and gender, editable after onboarding.
 *
 * Exists because a wrong birth date used to mean resetting the whole app: the
 * age feeds the metrics, so it has to be fixable in place.
 */

import { useState, type ReactElement } from 'react';
import { GENDER_OPTIONS, MAX_AGE, MIN_AGE } from '../../core/constants';
import type { DayKey, User } from '../../core/types';
import { ageFromBirthDate, todayKey } from '../../core/utils/date';
import { useApp } from '../../app/providers/appContext';
import { useUi } from '../../app/providers/uiContext';
import { Card, Chip, SectionHeader } from '../../ui/primitives';
import { DateField } from '../../ui/DateField';
import { Field, Input } from '../../ui/form';

export function IdentitySection({ user }: { user: User }): ReactElement {
  const { repos } = useApp();
  const { toast } = useUi();
  const [error, setError] = useState<string | null>(null);

  const age = ageFromBirthDate(user.birthDate);

  const commitBirthDate = (value: DayKey | null): void => {
    if (value === null) {
      setError('Indica o dia, o mês e o ano.');
      return;
    }
    if (value > todayKey()) {
      setError('A data de nascimento está no futuro.');
      return;
    }
    const next = ageFromBirthDate(value);
    if (next == null || next < MIN_AGE || next > MAX_AGE) {
      setError(`A idade tem de estar entre ${MIN_AGE} e ${MAX_AGE} anos.`);
      return;
    }
    setError(null);
    repos.user.update({ birthDate: value });
    toast(`Idade atualizada: ${next} anos.`);
  };

  return (
    <section>
      <SectionHeader title="Identidade" />
      <Card>
        <div className="stack stack-5">
          <Field label="Nome">
            <Input
              key={`name-${user.id}`}
              defaultValue={user.name}
              maxLength={60}
              onBlur={(value) => {
                const name = value.trim();
                if (name && name !== user.name) repos.user.update({ name });
              }}
            />
          </Field>

          <Field
            label="Data de nascimento"
            error={error ?? undefined}
            hint={!error && age != null ? `${age} anos` : undefined}
          >
            <DateField
              idPrefix="profile-birth"
              value={user.birthDate}
              invalid={!!error}
              onChange={commitBirthDate}
            />
          </Field>

          <Field label="Género">
            <div className="chips">
              {GENDER_OPTIONS.map((option) => (
                <Chip
                  key={option.id}
                  label={option.label}
                  pressed={user.gender === option.id}
                  onClick={() => repos.user.update({ gender: option.id })}
                />
              ))}
            </div>
          </Field>
        </div>
      </Card>
    </section>
  );
}
