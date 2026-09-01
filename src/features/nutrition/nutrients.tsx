/**
 * How a nutrient is written down.
 *
 * One place, because the rule is easy to break by accident: a value the app
 * does not know is written "—", never 0. Where part of a meal could not be
 * resolved, the number is shown with a note saying how much is missing, so a
 * total is never mistaken for a complete one.
 */

import type { ReactElement } from 'react';
import * as format from '../../core/utils/format';
import type { Nutrient, NutritionTotals } from '../../domain/nutrition';
import { NUTRIENTS } from '../../domain/nutrition';

export const NUTRIENT_LABELS: Record<Nutrient, string> = {
  kcal: 'Energia',
  protein: 'Proteína',
  carbs: 'Hidratos',
  fat: 'Gordura',
  fiber: 'Fibra',
};

export const NUTRIENT_UNITS: Record<Nutrient, string> = {
  kcal: 'kcal', protein: 'g', carbs: 'g', fat: 'g', fiber: 'g',
};

/** A number, or an em dash when the value is unknown. */
export function nutrientText(value: number | null, nutrient: Nutrient): string {
  if (value == null) return '—';
  return `${format.number(Math.round(value), 0)} ${NUTRIENT_UNITS[nutrient]}`;
}

export function unknownNote(count: number): string | null {
  if (count <= 0) return null;
  return count === 1 ? '1 alimento sem dados' : `${count} alimentos sem dados`;
}

/**
 * The five nutrients as a grid.
 *
 * An incomplete total is marked with an asterisk and explained once underneath,
 * rather than crowding every tile — the tiles stay readable and the number is
 * never left looking whole when it is not.
 */
export function NutrientGrid({ totals }: { totals: NutritionTotals }): ReactElement {
  const partial = NUTRIENTS.some(
    (nutrient) => totals.values[nutrient] != null && totals.unknown[nutrient] > 0,
  );

  return (
    <>
      <div className="nutrient-grid">
        {NUTRIENTS.map((nutrient) => {
          const value = totals.values[nutrient];
          const missing = totals.unknown[nutrient];
          return (
            <div className="nutrient" key={nutrient} data-unknown={String(value == null)}>
              <span className="value">
                {value == null ? '—' : format.number(Math.round(value), 0)}
                {value != null && missing > 0 ? <i className="partial">*</i> : null}
              </span>
              <span className="label">{NUTRIENT_LABELS[nutrient]}</span>
              <span className="unit">
                {value == null ? 'sem dados' : NUTRIENT_UNITS[nutrient]}
              </span>
            </div>
          );
        })}
      </div>
      {partial ? (
        /* No count here on purpose: each nutrient may be missing a different
           number of foods, and one number under all five would be wrong. */
        <p className="nutrient-note t-sm muted-2">
          * Alguns alimentos não têm este valor; não entram no total.
        </p>
      ) : null}
    </>
  );
}
