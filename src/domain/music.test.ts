import { describe, expect, it } from 'vitest';
import { appOfLink, cleanMusicLink, normalizeTracks, trackSearchLink } from './music';

describe('links de playlist', () => {
  it('aceita o que as apps de música dão ao partilhar', () => {
    expect(cleanMusicLink('https://open.spotify.com/playlist/37i9dQZF1DX76Wlfdnj7AP?si=abc'))
      .toBe('https://open.spotify.com/playlist/37i9dQZF1DX76Wlfdnj7AP?si=abc');
    expect(cleanMusicLink('https://music.apple.com/pt/playlist/treino/pl.123')).not.toBeNull();
    expect(cleanMusicLink('https://music.youtube.com/playlist?list=PL1')).not.toBeNull();
    expect(cleanMusicLink('https://www.deezer.com/pt/playlist/1')).not.toBeNull();
  });

  it('aceita sem "https://" e passa um http a https', () => {
    expect(cleanMusicLink('open.spotify.com/playlist/1')).toBe('https://open.spotify.com/playlist/1');
    expect(cleanMusicLink('http://open.spotify.com/playlist/1')).toBe('https://open.spotify.com/playlist/1');
  });

  it('recusa o que não é de música, mesmo parecido', () => {
    expect(cleanMusicLink('https://example.com/playlist')).toBeNull();
    expect(cleanMusicLink('https://open.spotify.com.phishing.io/x')).toBeNull();
    expect(cleanMusicLink('javascript:alert(1)')).toBeNull();
    expect(cleanMusicLink('')).toBeNull();
  });

  it('diz de que app é', () => {
    expect(appOfLink('https://open.spotify.com/playlist/1')).toBe('Spotify');
    expect(appOfLink('https://music.apple.com/x')).toBe('Apple Music');
    expect(appOfLink('lixo')).toBe('Música');
  });
});

describe('as músicas', () => {
  it('abrem na app de quem ouve, com o nome e o artista', () => {
    const faixa = { title: 'Eye of the Tiger', artist: 'Survivor' };
    expect(trackSearchLink('spotify', faixa))
      .toBe('https://open.spotify.com/search/Eye%20of%20the%20Tiger%20Survivor');
    expect(trackSearchLink('apple', faixa)).toContain('music.apple.com/search?term=Eye%20of');
    expect(trackSearchLink('youtube', faixa)).toContain('music.youtube.com/search?q=');
  });

  it('ficam sem repetidas e sem vazias', () => {
    expect(normalizeTracks([
      { title: 'Eye of the Tiger', artist: 'Survivor' },
      { title: ' Eye Of The Tiger ', artist: 'survivor' },
      { title: '', artist: 'Ninguém' },
      { title: 'Lose Yourself', artist: 'Eminem' },
    ])).toEqual([
      { title: 'Eye of the Tiger', artist: 'Survivor' },
      { title: 'Lose Yourself', artist: 'Eminem' },
    ]);
  });

  it('no máximo cinquenta', () => {
    const muitas = Array.from({ length: 80 }, (_, index) => ({ title: `Música ${index}`, artist: 'X' }));
    expect(normalizeTracks(muitas)).toHaveLength(50);
  });
});
