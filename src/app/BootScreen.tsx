import { PaceMark } from '../ui/Logo';

/** Shown while the store loads, and when boot fails. */

export function BootScreen({ error }: { error?: Error }): React.ReactElement {
  if (error) {
    return (
      <div className="boot" role="alert">
        <h1 className="t-h1">A PACE não arrancou</h1>
        <p className="t-sm muted">{error.message}</p>
      </div>
    );
  }
  return (
    <div className="boot" aria-busy="true">
      <PaceMark size={72} animated />
      <span className="visually-hidden">A carregar</span>
    </div>
  );
}
