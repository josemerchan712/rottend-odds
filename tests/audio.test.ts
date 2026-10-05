import { describe, expect, it } from 'vitest';
import { audioState, isMuted, outcomeSound, setAmbient, setMuted, setVolume, sfx } from '../src/audio';

describe('sonido sintetizado', () => {
  it('sin AudioContext (o antes del primer gesto) no hace nada y no falla', () => {
    expect(() => {
      sfx('roulette');
      sfx('whisper');
      setAmbient(3);
      setAmbient(null);
      outcomeSound('jugador', 'pierde', 100, 100);
    }).not.toThrow();
  });

  it('volumen acotado y silencio con la tecla N (conmutable)', () => {
    setVolume(2);
    expect(audioState().volume).toBe(1);
    setMuted(true);
    expect(isMuted()).toBe(true);
    setMuted(false);
    expect(isMuted()).toBe(false);
  });
});
