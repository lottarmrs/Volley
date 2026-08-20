import { Link } from 'react-router';
import { ArrowLeft, HardDrive, Lock } from 'lucide-react';
import { describeAccountOnlyArea } from '@app/guestAccess';
import { paths } from '@app/appRoutes';

interface AccountRequiredViewProps {
  pathname: string;
}

export function AccountRequiredView({ pathname }: AccountRequiredViewProps) {
  const area = describeAccountOnlyArea(pathname);

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-8 py-10">
      <div className="space-y-4">
        <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-primary/25 bg-primary/10 text-primary">
          <Lock className="h-5 w-5" />
        </span>
        <h2 className="text-2xl font-black uppercase tracking-tight text-white sm:text-3xl">
          {area.title}
        </h2>
        <p className="text-sm leading-relaxed text-base-content/70">{area.reason}</p>
      </div>

      <div className="flex gap-3 rounded-2xl border border-base-300 bg-base-200 p-4 shadow-card">
        <HardDrive className="mt-0.5 h-4 w-4 shrink-0 text-success" />
        <p className="text-xs leading-relaxed text-base-content/70">
          Sua pelada continua salva neste aparelho. Ao criar a conta, os atletas, as sessões e o
          histórico que você já montou aqui sobem junto — você não recomeça nada.
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Link
          to="/cadastro"
          className="btn btn-primary min-h-[48px] flex-1 gap-2 px-6 font-black uppercase tracking-wider"
        >
          Criar conta grátis
        </Link>
        <Link
          to="/entrar"
          className="btn btn-outline min-h-[48px] flex-1 px-6 font-bold uppercase tracking-wider"
        >
          Já tenho conta
        </Link>
      </div>

      <Link
        to={paths.painel}
        className="btn btn-ghost min-h-[44px] w-fit gap-2 px-3 text-xs font-bold uppercase tracking-wider text-base-content/60 hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" />
        Voltar para a pelada
      </Link>
    </div>
  );
}
