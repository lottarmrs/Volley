import { Download, Upload, UserCheck } from 'lucide-react';

interface SettingsModuleProps {
  onExportBackup: () => void;
  onImportBackup: (file: File) => void;
  onRestoreDemoPlayers: () => void;
}

export function SettingsModule({
  onExportBackup,
  onImportBackup,
  onRestoreDemoPlayers,
}: SettingsModuleProps) {
  return (
    <div className="space-y-6">
      <div className="card card-border bg-base-200 p-6 rounded-2xl">
        <h3 className="text-base font-bold uppercase text-base-content tracking-wider mb-4">
          Dados & Backup
        </h3>
        <p className="text-xs text-text-muted leading-relaxed mb-6">
          Exporte ou importe a base de dados de atletas, partidas, sessões e históricos para
          compartilhar ou salvar como backup.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <button
            onClick={onExportBackup}
            className="flex items-center justify-center gap-3 p-4 bg-primary/10 border border-primary/20 rounded-xl text-xs font-bold uppercase text-primary hover:bg-primary/20 transition-all cursor-pointer"
          >
            <Download className="w-5 h-5" /> Exportar Backup (JSON)
          </button>

          <div className="relative">
            <input
              type="file"
              accept=".json"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onImportBackup(file);
              }}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
            />
            <div className="flex items-center justify-center gap-3 p-4 bg-surface-strong border border-border rounded-xl text-xs font-bold uppercase text-base-content hover:bg-surface-strong/80 transition-all">
              <Upload className="w-5 h-5 text-accent" /> Importar Backup (JSON)
            </div>
          </div>
        </div>
      </div>

      <div className="card card-border border-border bg-surface-strong/40 p-6 rounded-2xl">
        <h3 className="text-base font-bold uppercase text-base-content tracking-wider mb-4">
          Dados de Exemplo
        </h3>
        <p className="text-xs text-text-muted leading-relaxed mb-6">
          Carregue o elenco original de atletas de exemplo. Esta ação é aditiva e preserva seus
          dados atuais. (A redefinição completa do banco foi removida do aplicativo — use o painel
          do Supabase, se necessário.)
        </p>

        <div className="flex flex-col sm:flex-row gap-4">
          <button
            onClick={() => {
              if (
                window.confirm(
                  'Deseja carregar a lista de atletas de exemplo? Isto preservará seus dados atuais, mas adicionará novos atletas se não existirem.',
                )
              ) {
                onRestoreDemoPlayers();
                window.alert('Atletas de exemplo restaurados!');
              }
            }}
            className="btn btn-secondary rounded-full uppercase tracking-wider text-xs"
          >
            <UserCheck className="w-4 h-4" /> Restaurar Atletas de Exemplo
          </button>
        </div>
      </div>
    </div>
  );
}
