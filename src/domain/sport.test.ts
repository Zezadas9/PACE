import { describe, expect, it } from 'vitest';
import { plain, sportOf } from './sport';

const sport = (title: string, type: Parameters<typeof sportOf>[0]['type'] = 'sport') =>
  sportOf({ title, type });

describe('plain', () => {
  it('tira acentos e maiúsculas', () => {
    expect(plain('Ténis — Técnica')).toBe(' tenis tecnica ');
  });

  it('deixa espaço à volta, para as palavras não colarem', () => {
    expect(plain('Futebol')).toBe(' futebol ');
  });
});

describe('sportOf', () => {
  it('lê o desporto do título', () => {
    expect(sport('Basquetebol — Técnica + Físico')).toBe('basketball');
    expect(sport('Treino de futebol')).toBe('football');
    expect(sport('Ténis de meia hora')).toBe('tennis');
    expect(sport('Aula de dança')).toBe('dance');
    expect(sport('Natação — série longa')).toBe('swimming');
  });

  it('não confunde ténis de mesa com ténis', () => {
    expect(sport('Ténis de mesa ao sábado')).toBe('tabletennis');
    expect(sport('Ping pong')).toBe('tabletennis');
  });

  it('hóquei em patins é hóquei, não patinagem', () => {
    expect(sport('Hóquei em patins')).toBe('hockey');
  });

  it('apanha a palavra dentro de uma maior', () => {
    expect(sport('BASQUETE com os amigos')).toBe('basketball');
    expect(sport('Ciclismo de estrada')).toBe('cycling');
  });

  it('cai no tipo do treino quando o título não diz nada', () => {
    expect(sport('Força A', 'strength')).toBe('strength');
    expect(sport('Terça-feira', 'hiit')).toBe('hiit');
    expect(sport('Sessão leve', 'pilates')).toBe('pilates');
    expect(sport('Segunda de manhã', 'mobility')).toBe('mobility');
  });

  it('um treino desportivo sem desporto reconhecido fica genérico', () => {
    expect(sport('Treino do clube')).toBe('generic');
    expect(sport('Sessão livre', 'other')).toBe('generic');
  });

  it('lê também as etiquetas', () => {
    expect(sportOf({ title: 'Quarta', type: 'sport', tags: ['Voleibol'] })).toBe('volleyball');
  });

  it('o título ganha ao tipo, porque é o que a pessoa lê', () => {
    expect(sport('Preparação para o surf', 'functional')).toBe('surf');
  });
});
