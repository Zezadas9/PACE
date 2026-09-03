/**
 * A cópia das fontes tem de bater certo com o original.
 *
 * O Worker é um pacote à parte e não importa do frontend, por isso a lista está
 * escrita duas vezes. Este teste lê o ficheiro do domínio e falha se as duas
 * listas se afastarem — sem ele, a cópia envelhecia em silêncio e o backend
 * começava a deixar passar identificadores que a aplicação já não conhece.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { REFERENCES } from '../src/references';

const here = path.dirname(fileURLToPath(import.meta.url));
const domainFile = path.resolve(here, '..', '..', 'src', 'domain', 'coach', 'references.ts');

function idsFromDomain(): string[] {
  const source = readFileSync(domainFile, 'utf8');
  return [...source.matchAll(/^\s*id: '([^']+)',$/gm)].map((match) => match[1] ?? '');
}

describe('catálogo de fontes', () => {
  it('tem exatamente os mesmos identificadores do domínio', () => {
    expect([...REFERENCES.map((reference) => reference.id)].sort())
      .toEqual([...idsFromDomain()].sort());
  });

  it('descreve o que cada fonte sustenta', () => {
    for (const reference of REFERENCES) {
      expect(reference.supports.length).toBeGreaterThan(20);
    }
  });
});
