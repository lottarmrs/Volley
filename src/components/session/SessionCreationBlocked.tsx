interface SessionCreationBlockedProps {
  onBack: () => void;
}

export function SessionCreationBlocked({ onBack }: SessionCreationBlockedProps) {
  return (
    <section className="mx-auto max-w-md space-y-4 rounded-xl border border-base-300 bg-base-200 p-6 text-center">
      <h2 className="text-lg font-semibold">Nova sessão indisponível</h2>
      <p role="alert" className="text-sm">
        Só dono, admin, moderador ou Organizador criam sessões nesta comunidade.
      </p>
      <button type="button" className="btn btn-primary btn-sm" onClick={onBack}>
        Voltar à comunidade
      </button>
    </section>
  );
}
