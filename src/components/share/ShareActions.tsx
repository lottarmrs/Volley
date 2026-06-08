import React, { useState } from 'react';
import { Copy, Share2, MoreVertical } from 'lucide-react';
import { ShareBlock } from '../../types';
import { copyToClipboard, shareText } from '../../logic/share';

interface ShareActionsProps {
  title: string;
  text: string;
  copyLabel?: string;
  shareLabel?: string;
  variant?: 'buttons' | 'icon' | 'menu';
  blocks?: ShareBlock[];
}

export function ShareActions({
  title,
  text,
  copyLabel = 'Copiar',
  shareLabel = 'Compartilhar',
  variant = 'buttons',
  blocks = [],
}: ShareActionsProps) {
  const [message, setMessage] = useState('');

  const showToast = (next: string) => {
    setMessage(next);
    window.setTimeout(() => setMessage(''), 2200);
  };

  const handleCopy = async (value: string = text) => {
    await copyToClipboard(value);
    showToast('Texto copiado. Agora e so colar no WhatsApp.');
  };

  const handleShare = async () => {
    const result = await shareText({ title, text });
    showToast(result === 'shared' ? 'Compartilhamento aberto.' : 'Compartilhamento indisponivel. O texto foi copiado.');
  };

  const blockMenu = blocks.length > 0 && (
    <div className="dropdown dropdown-end">
      <button type="button" className="btn btn-ghost btn-sm" aria-label="Copiar blocos">
        <MoreVertical className="w-4 h-4" />
      </button>
      <ul className="menu dropdown-content bg-base-200 rounded-box z-20 mt-2 w-56 p-2 shadow-xl border border-base-300">
        {blocks.map(block => (
          <li key={block.id}>
            <button type="button" onClick={() => handleCopy(block.text)}>{block.label}</button>
          </li>
        ))}
      </ul>
    </div>
  );

  return (
    <div className="inline-flex items-center gap-2">
      {variant === 'menu' ? (
        <div className="dropdown dropdown-end">
          <button type="button" className="btn btn-outline btn-sm">
            <Share2 className="w-4 h-4" /> Acoes
          </button>
          <ul className="menu dropdown-content bg-base-200 rounded-box z-20 mt-2 w-56 p-2 shadow-xl border border-base-300">
            <li><button type="button" onClick={() => handleCopy()}>{copyLabel}</button></li>
            <li><button type="button" onClick={handleShare}>{shareLabel}</button></li>
            {blocks.map(block => (
              <li key={block.id}><button type="button" onClick={() => handleCopy(block.text)}>{block.label}</button></li>
            ))}
          </ul>
        </div>
      ) : variant === 'icon' ? (
        <>
          <button type="button" className="btn btn-ghost btn-sm btn-square" onClick={() => handleCopy()} aria-label={copyLabel}>
            <Copy className="w-4 h-4" />
          </button>
          <button type="button" className="btn btn-ghost btn-sm btn-square" onClick={handleShare} aria-label={shareLabel}>
            <Share2 className="w-4 h-4" />
          </button>
          {blockMenu}
        </>
      ) : (
        <>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => handleCopy()}>
            <Copy className="w-4 h-4" /> {copyLabel}
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={handleShare}>
            <Share2 className="w-4 h-4" /> {shareLabel}
          </button>
          {blockMenu}
        </>
      )}

      {message && (
        <div className="toast toast-bottom toast-end z-50">
          <div className="alert alert-success shadow-lg">
            <span className="text-xs font-bold">{message}</span>
          </div>
        </div>
      )}
    </div>
  );
}
